import type { MigrationInterface } from "typeorm";
import { AuthAndUsers1760300000000 } from "./1760300000000-auth-and-users";
import { Buildings1760400000000 } from "./1760400000000-buildings";
import { Ads1760500000000 } from "./1760500000000-ads";

type MigrationClass = new () => MigrationInterface;

/** Ordem de execução. Novas migrations entram no fim. */
export const migrations: MigrationClass[] = [
  AuthAndUsers1760300000000,
  Buildings1760400000000,
  Ads1760500000000,
];
