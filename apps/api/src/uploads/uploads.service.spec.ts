import type { EntityManager } from "typeorm";
import type { Upload } from "./upload.entity";
import { lockClaimable } from "./uploads.service";

const owner = "1f0a2b3c-4d5e-4f60-8a71-9b2c3d4e5f60";
const x = "aa000000-0000-4000-8000-000000000001";
const y = "bb000000-0000-4000-8000-000000000002";

/** Uploads travados (P00-B4.1): a borda é o banco; a ordem do lock e a regra são o que importa. */
function managerWith(found: Pick<Upload, "id" | "attachedAt">[], associated: string[] = []) {
  const calls: string[] = [];
  const chain = {
    where: (sql: string) => {
      calls.push(`where ${sql}`);
      return chain;
    },
    andWhere: (sql: string) => {
      calls.push(`andWhere ${sql}`);
      return chain;
    },
    orderBy: (column: string) => {
      calls.push(`orderBy ${column}`);
      return chain;
    },
    setLock: (mode: string) => {
      calls.push(`lock ${mode}`);
      return chain;
    },
    getMany: async () => found,
  };
  const manager = {
    getRepository: () => ({ createQueryBuilder: () => chain }),
    // Associação atual em `ad_images`: `associated` são os uploads já ligados a algum anúncio.
    query: jest.fn(async (_sql: string, [checked]: [string[]]) =>
      associated.filter((id) => checked.includes(id)).map((id) => ({ upload_id: id })),
    ),
  };
  return { manager: manager as unknown as EntityManager, calls, query: manager.query };
}

describe("lockClaimable", () => {
  it("trava os uploads do dono em ordem de id e devolve na ordem pedida", async () => {
    const { manager, calls } = managerWith([
      { id: x, attachedAt: null },
      { id: y, attachedAt: null },
    ]);
    const result = await lockClaimable(manager, owner, [y, x], []);
    expect(result.map((upload) => upload.id)).toEqual([y, x]);
    expect(calls).toEqual([
      "where upload.id IN (:...ids)",
      "andWhere upload.ownerId = :ownerId",
      "orderBy upload.id",
      "lock pessimistic_write",
    ]);
  });

  it("recusa upload já usado fora da lista permitida e aceita o do próprio anúncio", async () => {
    const used = [{ id: x, attachedAt: new Date() }];
    await expect(lockClaimable(managerWith(used).manager, owner, [x], [])).rejects.toThrow(
      "Uma das fotos não pode ser usada",
    );
    await expect(lockClaimable(managerWith(used).manager, owner, [x], [x])).resolves.toHaveLength(
      1,
    );
  });

  it("sem fotos não consulta nem trava nada", async () => {
    const { manager, calls } = managerWith([]);
    expect(await lockClaimable(manager, owner, [], [])).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("recusa upload associado a outro anúncio mesmo sem marca; aceita o do próprio anúncio", async () => {
    const unmarked = [{ id: x, attachedAt: null }];
    await expect(lockClaimable(managerWith(unmarked, [x]).manager, owner, [x], [])).rejects.toThrow(
      "Uma das fotos não pode ser usada",
    );
    const own = managerWith(unmarked, [x]);
    await expect(lockClaimable(own.manager, owner, [x], [x])).resolves.toHaveLength(1);
    // As do próprio anúncio nem entram na consulta de associação.
    expect(own.query).not.toHaveBeenCalled();
  });
});
