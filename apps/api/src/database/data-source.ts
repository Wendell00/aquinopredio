import { DataSource } from "typeorm";
import { migrations } from "./migrations";
import { SnakeNamingStrategy } from "./snake-naming.strategy";

/** Usado pela CLI do TypeORM (sobre o build): `pnpm --filter api db:migrate` / `db:revert`. */
export default new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  namingStrategy: new SnakeNamingStrategy(),
  migrations,
  migrationsTransactionMode: "each",
});
