import type { MigrationInterface } from "typeorm";
import { AuthAndUsers1760300000000 } from "./1760300000000-auth-and-users";
import { Buildings1760400000000 } from "./1760400000000-buildings";
import { Ads1760500000000 } from "./1760500000000-ads";
import { FeedInteractions1760600000000 } from "./1760600000000-feed-interactions";
import { ChatNotifications1760700000000 } from "./1760700000000-chat-notifications";
import { AdminSanctions1760800000000 } from "./1760800000000-admin-sanctions";
import { AiCalls1760900000000 } from "./1760900000000-ai-calls";

type MigrationClass = new () => MigrationInterface;

/** Ordem de execução. Novas migrations entram no fim. */
export const migrations: MigrationClass[] = [
  AuthAndUsers1760300000000,
  Buildings1760400000000,
  Ads1760500000000,
  FeedInteractions1760600000000,
  ChatNotifications1760700000000,
  AdminSanctions1760800000000,
  AiCalls1760900000000,
];
