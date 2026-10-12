import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { HealthResponse } from "@repo/shared";
import { Public } from "../../common/decorators/auth.decorators";
import { HealthService } from "./health.service";

@Controller("health")
@Public()
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): Promise<HealthResponse> {
    return this.healthService.check();
  }
}
