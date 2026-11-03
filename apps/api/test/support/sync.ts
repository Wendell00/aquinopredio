import { Client } from "pg";

/**
 * Sincronização dos testes de corrida: só por promessas e por estado observável no banco.
 * Esperas por tempo servem apenas de limite de diagnóstico, nunca de prova de ordem.
 */

const DIAGNOSTIC_TIMEOUT_MS = 10_000;

/** Falha com a etapa que não aconteceu, em vez de deixar o teste pendurado até o timeout do Jest. */
export async function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  ms = DIAGNOSTIC_TIMEOUT_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Tempo esgotado esperando: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Lista que avisa quem espera por um item que ainda não chegou. */
export function observableList<T>() {
  const items: T[] = [];
  const listeners = new Set<() => void>();
  return {
    items,
    push(item: T) {
      items.push(item);
      for (const listener of [...listeners]) listener();
    },
    async at(index: number, label: string): Promise<T> {
      const found = items[index];
      if (found !== undefined) return found;
      let listener: (() => void) | undefined;
      try {
        return await withTimeout(
          new Promise<T>((resolve) => {
            listener = () => {
              const item = items[index];
              if (item !== undefined) resolve(item);
            };
            listeners.add(listener);
          }),
          label,
        );
      } finally {
        if (listener) listeners.delete(listener);
      }
    },
  };
}

export interface Gate {
  /** Resolve quando a operação alcança a barreira (ainda sem executar o método). */
  reached: () => Promise<void>;
  release: () => void;
  restore: () => void;
}

/**
 * Pausa a primeira chamada de `target[method]` que satisfaz `match`, depois de armar. As demais
 * passam direto. O método original roda após `release()`. Use só em pontos sem lock aberto.
 */
export function armGate<T extends object>(
  target: T,
  method: keyof T & string,
  options: { label: string; match?: (...args: unknown[]) => boolean },
): Gate {
  const original = target[method];
  if (typeof original !== "function") throw new Error(`${method} não é método`);
  let armed = true;
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  let arrive: () => void = () => undefined;
  const arrived = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const host = target as Record<string, unknown>;
  const hadOwn = Object.hasOwn(host, method);
  host[method] = async function gated(this: unknown, ...args: unknown[]) {
    if (armed && (!options.match || options.match(...args))) {
      armed = false;
      arrive();
      await opened;
    }
    return (original as (...a: unknown[]) => unknown).apply(this, args);
  };
  return {
    reached: () => withTimeout(arrived, `barreira ${options.label}`),
    release: open,
    restore: () => {
      open();
      if (hadOwn) host[method] = original;
      else delete host[method];
    },
  };
}

/**
 * Como `armGate`, mas pausa depois de o método original devolver: a operação já leu e ainda não
 * agiu sobre a leitura. Use para a janela entre uma leitura sem lock e a escrita que depende dela.
 */
export function armGateAfter<T extends object>(
  target: T,
  method: keyof T & string,
  options: { label: string; match?: (...args: unknown[]) => boolean },
): Gate {
  const original = target[method];
  if (typeof original !== "function") throw new Error(`${method} não é método`);
  let armed = true;
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  let arrive: () => void = () => undefined;
  const arrived = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const host = target as Record<string, unknown>;
  const hadOwn = Object.hasOwn(host, method);
  host[method] = async function gated(this: unknown, ...args: unknown[]) {
    const result = await (original as (...a: unknown[]) => unknown).apply(this, args);
    if (armed && (!options.match || options.match(...args))) {
      armed = false;
      arrive();
      await opened;
    }
    return result;
  };
  return {
    reached: () => withTimeout(arrived, `barreira ${options.label}`),
    release: open,
    restore: () => {
      open();
      if (hadOwn) host[method] = original;
      else delete host[method];
    },
  };
}

/** Segunda conexão que segura um lock de linha até `commit`/`rollback`. */
export interface HeldLock {
  client: Client;
  pid: number;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  end: () => Promise<void>;
}

async function holdRowLock(sql: string, params: unknown[]): Promise<HeldLock> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
  if (pid === undefined) throw new Error("pg_backend_pid indisponível");
  await client.query("BEGIN");
  await client.query(sql, params);
  let finished = false;
  return {
    client,
    pid,
    commit: async () => {
      finished = true;
      await client.query("COMMIT");
    },
    rollback: async () => {
      if (finished) return;
      finished = true;
      await client.query("ROLLBACK");
    },
    end: async () => {
      if (!finished) await client.query("ROLLBACK").catch(() => undefined);
      await client.end().catch(() => undefined);
    },
  };
}

/** Segura o lock da linha do anúncio. */
export function holdAdLock(adId: string): Promise<HeldLock> {
  return holdRowLock("SELECT id FROM ads WHERE id = $1 FOR UPDATE", [adId]);
}

/**
 * Segura a linha do usuário em `FOR UPDATE`: um INSERT que referencie o usuário (checagem de FK
 * em `KEY SHARE`) espera até a liberação.
 */
export function holdUserLock(userId: string): Promise<HeldLock> {
  return holdRowLock("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
}

/**
 * Segura as linhas dos uploads (ordem por id): um INSERT em `ad_images`/`messages` que os
 * referencie espera pela FK, e quem trava uploads com `FOR UPDATE` também.
 */
export function holdUploadLocks(uploadIds: string[]): Promise<HeldLock> {
  return holdRowLock("SELECT id FROM uploads WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE", [
    uploadIds,
  ]);
}

/**
 * Espera até `count` sessões estarem bloqueadas, direta ou indiretamente, pela conexão `pid`.
 * Consulta estado real do banco em tentativas limitadas.
 */
export async function waitBlockedBy(
  observer: Client,
  pid: number,
  count: number,
  label: string,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    // O observador costuma estar dentro de uma transação (ex.: `holdAdLock`), e o PostgreSQL
    // congela `pg_stat_activity` no primeiro acesso da transação: sem limpar, uma conexão aberta
    // depois desse acesso nunca apareceria.
    await observer.query("SELECT pg_stat_clear_snapshot()");
    // Transitivo: o segundo da fila espera o lock de tupla do primeiro, não a conexão `pid`.
    const { rows } = await observer.query<{ blocked: number }>(
      `WITH RECURSIVE chain AS (
         SELECT pid FROM pg_stat_activity WHERE $1 = ANY (pg_blocking_pids(pid))
         UNION
         SELECT a.pid FROM pg_stat_activity a JOIN chain c ON c.pid = ANY (pg_blocking_pids(a.pid))
       )
       SELECT count(*)::int AS blocked FROM chain`,
      [pid],
    );
    if ((rows[0]?.blocked ?? 0) >= count) return;
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await observer.query("SELECT pg_stat_clear_snapshot()");
  const { rows } = await observer.query<{
    pid: number;
    state: string;
    wait: string;
    query: string;
  }>(
    `SELECT pid, state, coalesce(wait_event_type || ':' || wait_event, '-') AS wait, left(query, 80) AS query
     FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`,
  );
  const sessions = rows.map((row) => `${row.pid} ${row.state} ${row.wait} ${row.query}`).join("\n");
  throw new Error(
    `Tempo esgotado esperando ${count} sessão(ões) bloqueada(s): ${label}\n${sessions}`,
  );
}
