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
import { Throttle } from "@nestjs/throttler";
import {
  type BuildingSearchQuery,
  type BuildingSummary,
  buildingSearchQuerySchema,
  type CreateBuildingInput,
  type CreateBuildingResponse,
  createBuildingInputSchema,
  type DuplicateCheckInput,
  duplicateCheckInputSchema,
  type JoinBuildingInput,
  joinBuildingInputSchema,
  type MyBuilding,
  type ResubmitBuildingInput,
  resubmitBuildingInputSchema,
  setPrimaryBuildingInputSchema,
} from "@repo/shared";
import { AllowOnboarding, CurrentUser } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { User } from "../users/user.entity";
import { BuildingsService } from "./buildings.service";

@Controller("buildings")
@AllowOnboarding()
export class BuildingsController {
  constructor(private readonly buildings: BuildingsService) {}

  @Get("search")
  search(
    @Query(new ZodValidationPipe(buildingSearchQuerySchema)) query: BuildingSearchQuery,
  ): Promise<BuildingSummary[]> {
    return this.buildings.search(query);
  }

  @Post("duplicates")
  @HttpCode(200)
  duplicates(
    @Body(new ZodValidationPipe(duplicateCheckInputSchema)) input: DuplicateCheckInput,
  ): Promise<BuildingSummary[]> {
    return this.buildings.findDuplicates(input);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createBuildingInputSchema)) input: CreateBuildingInput,
  ): Promise<CreateBuildingResponse> {
    return this.buildings.create(user, input);
  }

  @Post(":id/join")
  @HttpCode(200)
  join(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(joinBuildingInputSchema)) input: JoinBuildingInput,
  ): Promise<MyBuilding> {
    return this.buildings.join(user, id, input.unit);
  }

  @Post(":id/resubmit")
  @HttpCode(200)
  resubmit(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resubmitBuildingInputSchema)) input: ResubmitBuildingInput,
  ): Promise<MyBuilding> {
    return this.buildings.resubmit(user, id, input);
  }
}

@Controller("me/buildings")
@AllowOnboarding()
export class MyBuildingsController {
  constructor(private readonly buildings: BuildingsService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<MyBuilding[]> {
    return this.buildings.myBuildings(user.id);
  }

  @Put("primary")
  @HttpCode(204)
  async setPrimary(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(setPrimaryBuildingInputSchema)) input: { buildingId: string },
  ): Promise<void> {
    await this.buildings.setPrimary(user, input.buildingId);
  }
}
