import type { INestApplication } from "@nestjs/common";
import {
  BuildingVerificationService,
  type VerificationOutcome,
} from "../../src/buildings/verification/building-verification.service";
import { NotificationsService } from "../../src/notifications/notifications.service";
import { observableList, withTimeout } from "./sync";

/** Embrulho: guardar a promessa crua numa lista observável faria `await` desembrulhá-la. */
interface Task<T> {
  done: Promise<T>;
  /** O resultado (ou erro) já chegou ao teste: não é relatado de novo na limpeza. */
  reported: boolean;
}

/**
 * Registro de tarefas reais disparadas em segundo plano (fire-and-forget) por chave.
 * `settleAll` espera inclusive as que começam enquanto outras estão sendo esperadas e relata
 * rejeições que o teste não observou, em vez de engoli-las.
 */
function taskLog<T>(kind: string) {
  const all: Task<T>[] = [];
  const byKey = new Map<string, ReturnType<typeof observableList<Task<T>>>>();
  const of = (key: string) => {
    let found = byKey.get(key);
    if (!found) {
      found = observableList<Task<T>>();
      byKey.set(key, found);
    }
    return found;
  };

  return {
    push(key: string, done: Promise<T>) {
      const task: Task<T> = { done, reported: false };
      all.push(task);
      of(key).push(task);
    },
    count: (key: string) => of(key).items.length,
    /** A n-ésima tarefa da chave (0 = primeira), esperando ela começar e terminar. */
    async nth(key: string, index: number, label: string): Promise<T> {
      const task = await of(key).at(index, `${label} começar`);
      task.reported = true;
      return withTimeout(task.done, `${label} terminar`);
    },
    async settleAll(): Promise<unknown[]> {
      const errors: unknown[] = [];
      let seen = 0;
      while (seen < all.length) {
        const batch = all.slice(seen);
        seen = all.length;
        const results = await withTimeout(
          Promise.allSettled(batch.map((task) => task.done)),
          `${kind} pendentes`,
        );
        results.forEach((result, index) => {
          const task = batch[index];
          if (!task) return;
          if (result.status === "rejected" && !task.reported) errors.push(result.reason);
          task.reported = true;
        });
      }
      return errors;
    },
  };
}

/** Troca `target[method]` por um invólucro que registra a promessa real; devolve o desfazer. */
function wrap<A extends unknown[], R>(
  target: object,
  method: string,
  original: (...args: A) => Promise<R>,
  record: (args: A, done: Promise<R>) => void,
): () => void {
  const host = target as Record<string, unknown>;
  const hadOwn = Object.hasOwn(host, method);
  const previous = host[method];
  host[method] = (...args: A) => {
    const done = original(...args);
    record(args, done);
    return done;
  };
  return () => {
    if (hadOwn) host[method] = previous;
    else delete host[method];
  };
}

/**
 * Validações de prédio e notificações em segundo plano (P00-B5.1). As duas são disparadas com
 * `void` no código: a resposta HTTP (e a conclusão de `verify`) não esperam a notificação.
 * Invólucro simples (não `jest.spyOn`), para um spec que espione `notify` empilhar sobre ele.
 */
export function trackBackground(app: INestApplication) {
  const verification = app.get(BuildingVerificationService);
  const notifications = app.get(NotificationsService);
  const verifications = taskLog<VerificationOutcome | null>("validações de prédio");
  const notices = taskLog<void>("notificações");

  const undo = [
    wrap(verification, "verify", verification.verify.bind(verification), ([buildingId], done) =>
      verifications.push(buildingId, done),
    ),
    wrap(notifications, "notify", notifications.notify.bind(notifications), ([userId], done) =>
      notices.push(userId, done),
    ),
  ];

  return {
    verifications,
    notifications: notices,
    /**
     * Espera validações e depois notificações (a validação dispara a notificação antes de
     * terminar). Falha com as rejeições não observadas, depois de esperar todas.
     */
    async settleAll(): Promise<void> {
      const errors = [...(await verifications.settleAll()), ...(await notices.settleAll())];
      if (errors.length) {
        throw new AggregateError(
          errors,
          `${errors.length} tarefa(s) em segundo plano falharam: ${errors
            .map((error) => (error instanceof Error ? error.message : String(error)))
            .join("; ")}`,
        );
      }
    },
    restore: () => {
      for (const fn of undo) fn();
    },
  };
}

export type BackgroundTracker = ReturnType<typeof trackBackground>;
