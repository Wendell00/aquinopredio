import { Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  type CepLookup,
  cepSchema,
  type GeocodeInput,
  type GeocodeResult,
  geocodeInputSchema,
} from "@repo/shared";
import { AllowOnboarding } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { GeoService } from "./geo.service";

@Controller("geo")
@AllowOnboarding()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get("cep/:cep")
  async cep(@Param("cep", new ZodValidationPipe(cepSchema)) cep: string): Promise<CepLookup> {
    const result = await this.geo.lookupCep(cep);
    if (!result) throw new NotFoundException("CEP não encontrado");
    return result;
  }

  @Post("geocode")
  async geocode(
    @Body(new ZodValidationPipe(geocodeInputSchema)) input: GeocodeInput,
  ): Promise<GeocodeResult> {
    const result = await this.geo.geocode(input);
    if (!result)
      throw new NotFoundException(
        "Não encontramos este endereço no mapa. Marque o local manualmente.",
      );
    return result;
  }
}
