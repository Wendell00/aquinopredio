import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import {
  type BuildingAd,
  type BuildingAdminView,
  type MemberAction,
  memberActionSchema,
  updateBuildingSettingsSchema,
} from "@repo/shared";
import { z } from "zod";
import { CurrentUser } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { User } from "../users/user.entity";
import { BuildingAdminService } from "./building-admin.service";

@Controller("buildings/:buildingId/admin")
export class BuildingAdminController {
  constructor(private readonly admin: BuildingAdminService) {}

  @Get()
  view(
    @CurrentUser() user: User,
    @Param("buildingId", ParseUUIDPipe) buildingId: string,
  ): Promise<BuildingAdminView> {
    return this.admin.view(user, buildingId);
  }

  @Patch()
  @HttpCode(204)
  async settings(
    @CurrentUser() user: User,
    @Param("buildingId", ParseUUIDPipe) buildingId: string,
    @Body(new ZodValidationPipe(updateBuildingSettingsSchema)) input: z.infer<
      typeof updateBuildingSettingsSchema
    >,
  ): Promise<void> {
    await this.admin.updateSettings(user, buildingId, input.joinPolicy);
  }

  @Post("members/:membershipId")
  @HttpCode(204)
  async member(
    @CurrentUser() user: User,
    @Param("buildingId", ParseUUIDPipe) buildingId: string,
    @Param("membershipId", ParseUUIDPipe) membershipId: string,
    @Body(new ZodValidationPipe(z.object({ action: memberActionSchema }))) input: {
      action: MemberAction;
    },
  ): Promise<void> {
    await this.admin.memberAction(user, buildingId, membershipId, input.action);
  }

  @Post("resign")
  @HttpCode(204)
  async resign(
    @CurrentUser() user: User,
    @Param("buildingId", ParseUUIDPipe) buildingId: string,
  ): Promise<void> {
    await this.admin.resign(user, buildingId);
  }

  @Get("ads")
  ads(
    @CurrentUser() user: User,
    @Param("buildingId", ParseUUIDPipe) buildingId: string,
  ): Promise<BuildingAd[]> {
    return this.admin.ads(user, buildingId);
  }

  @Post("ads/:adId/hide")
  @HttpCode(204)
  async hide(
    @CurrentUser() user: User,
    @Param("buildingId", ParseUUIDPipe) buildingId: string,
    @Param("adId", ParseUUIDPipe) adId: string,
  ): Promise<void> {
    await this.admin.hideAd(user, buildingId, adId);
  }
}
