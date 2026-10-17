import type { MigrationInterface } from "typeorm";
import { AuthAndUsers1760300000000 } from "./1760300000000-auth-and-users";
import { Buildings1760400000000 } from "./1760400000000-buildings";
import { Ads1760500000000 } from "./1760500000000-ads";
import { FeedInteractions1760600000000 } from "./1760600000000-feed-interactions";
import { ChatNotifications1760700000000 } from "./1760700000000-chat-notifications";
import { AdminSanctions1760800000000 } from "./1760800000000-admin-sanctions";
import { AiCalls1760900000000 } from "./1760900000000-ai-calls";
import { AdReviewFlags1761000000000 } from "./1761000000000-ad-review-flags";
import { AdAvailabilityOptions1761100000000 } from "./1761100000000-ad-availability-options";
import { Usernames1761200000000 } from "./1761200000000-usernames";
import { RemoveBuildingAdmin1761300000000 } from "./1761300000000-remove-building-admin";
import { Plans1761400000000 } from "./1761400000000-plans";
import { Reviews1761500000000 } from "./1761500000000-reviews";

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
  AdReviewFlags1761000000000,
  AdAvailabilityOptions1761100000000,
  Usernames1761200000000,
  RemoveBuildingAdmin1761300000000,
  Plans1761400000000,
  Reviews1761500000000,
];
