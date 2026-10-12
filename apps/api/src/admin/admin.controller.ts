import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  type AdDecision,
  type AdminAd,
  type AdminBuilding,
  type AdminMetrics,
  type AdminReport,
  type AdminSetting,
  type AdminUser,
  adDecisionSchema,
  adStatusSchema,
  type BuildingDecision,
  buildingDecisionSchema,
  buildingStatusSchema,
  type ResolveReport,
  resolveReportSchema,
  type SanctionInput,
  type SanctionType,
  sanctionInputSchema,
} from "@repo/shared";
import { z } from "zod";
import { CurrentUser, Roles } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { User } from "../users/user.entity";
import { AdminService } from "./admin.service";

@Controller("admin")
@Roles("platform_admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("metrics")
  metrics(): Promise<AdminMetrics> {
    return this.admin.metrics();
  }

  @Get("buildings")
  buildings(
    @Query("status", new ZodValidationPipe(buildingStatusSchema.default("pendente_revisao")))
    status: string,
  ): Promise<AdminBuilding[]> {
    return this.admin.buildings(status);
  }

  @Post("buildings/:id/decision")
  @HttpCode(204)
  async decideBuilding(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(buildingDecisionSchema)) input: BuildingDecision,
  ): Promise<void> {
    await this.admin.decideBuilding(user, id, input.decision, input.reason);
  }

  @Get("ads")
  ads(
    @Query("status", new ZodValidationPipe(adStatusSchema.default("em_moderacao"))) status: string,
  ): Promise<AdminAd[]> {
    return this.admin.ads(status);
  }

  @Post("ads/:id/decision")
  @HttpCode(204)
  async decideAd(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(adDecisionSchema)) input: AdDecision,
  ): Promise<void> {
    await this.admin.decideAd(user, id, input.decision, input.reason);
  }

  @Get("reports")
  reports(): Promise<AdminReport[]> {
    return this.admin.reports();
  }

  @Post("reports/:id/resolve")
  @HttpCode(204)
  async resolve(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolveReportSchema)) input: ResolveReport,
  ): Promise<void> {
    await this.admin.resolveReport(user, id, input);
  }

  @Get("users")
  users(
    @Query("q", new ZodValidationPipe(z.string().max(80).optional())) q?: string,
  ): Promise<AdminUser[]> {
    return this.admin.users(q);
  }

  @Post("users/:id/sanctions")
  async sanction(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sanctionInputSchema)) input: SanctionInput,
  ): Promise<{ type: SanctionType }> {
    return { type: await this.admin.sanction(user, id, input) };
  }

  @Get("settings")
  settings(): Promise<AdminSetting[]> {
    return this.admin.listSettings();
  }

  @Put("settings/:key")
  @HttpCode(204)
  async updateSetting(
    @CurrentUser() user: User,
    @Param("key") key: string,
    @Body(new ZodValidationPipe(z.object({ value: z.unknown() }))) input: { value: unknown },
  ): Promise<void> {
    await this.admin.updateSetting(user, key, input.value);
  }
}
