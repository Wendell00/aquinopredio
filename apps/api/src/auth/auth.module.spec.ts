import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { MailService } from "../mail/mail.service";
import { createAuth } from "./auth";
import { AUTH } from "./auth.constants";
import { AuthModule } from "./auth.module";

// Bordas: nada de Better Auth real, conexão Postgres ou envio de e-mail.
jest.mock("./auth", () => ({ createAuth: jest.fn() }));
jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({ end: jest.fn().mockResolvedValue(undefined) })),
}));

const createAuthMock = jest.mocked(createAuth);

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// A resolução de providers do Nest só encadeia promises; um setImmediate roda depois de
// esvaziar todas as microtasks pendentes, então qualquer factory que pudesse rodar já rodou.
const drainMicrotasks = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Substitui o `TypeOrmModule.forRootAsync`: o DataSource só resolve quando o teste liberar,
 * como o real só resolve depois de `initialize()` rodar as migrations.
 */
function setup() {
  const requested = deferred<void>();
  const migrations = deferred<void>();
  const dataSource = {
    entityMetadatas: [],
    options: { type: "postgres" },
    getRepository: () => ({}),
  };

  @Global()
  @Module({
    providers: [
      { provide: ConfigService, useValue: { get: () => undefined } },
      { provide: MailService, useValue: { send: jest.fn() } },
      {
        provide: DataSource,
        useFactory: async () => {
          requested.resolve();
          await migrations.promise;
          return dataSource;
        },
      },
    ],
    exports: [ConfigService, MailService, DataSource],
  })
  class EdgesModule {}

  const compiling = Test.createTestingModule({ imports: [EdgesModule, AuthModule] }).compile();
  return { compiling, requested: requested.promise, migrations };
}

describe("AuthModule — ordem entre migrations e Better Auth (spec 5.16, aceite 6.12)", () => {
  let current: ReturnType<typeof setup> | undefined;

  beforeEach(() => {
    createAuthMock.mockReset();
    createAuthMock.mockReturnValue({} as ReturnType<typeof createAuth>);
  });

  // Libera a barreira mesmo se uma asserção falhar no meio, para não deixar a compilação pendente.
  afterEach(async () => {
    if (!current) return;
    current.migrations.resolve();
    const moduleRef = await current.compiling.catch(() => undefined);
    await moduleRef?.close();
    current = undefined;
  });

  it("não cria o Better Auth enquanto as migrations não terminaram", async () => {
    current = setup();

    await current.requested;
    await drainMicrotasks();
    expect(createAuthMock).not.toHaveBeenCalled();

    current.migrations.resolve();
    const moduleRef: TestingModule = await current.compiling;
    expect(createAuthMock).toHaveBeenCalledTimes(1);
    expect(moduleRef.get(AUTH)).toBe(createAuthMock.mock.results[0]?.value);
  });

  it("falha a inicialização sem criar o Better Auth quando as migrations falham", async () => {
    current = setup();

    await current.requested;
    await drainMicrotasks();
    current.migrations.reject(new Error("migration falhou"));

    await expect(current.compiling).rejects.toThrow("migration falhou");
    expect(createAuthMock).not.toHaveBeenCalled();
  });
});
