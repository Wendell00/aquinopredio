import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";

/**
 * Valida e tipa a entrada com um schema zod (preferencialmente de `@repo/shared`).
 * Campos desconhecidos são removidos pelo próprio schema (`z.object` descarta extras).
 *
 * @example
 * create(@Body(new ZodValidationPipe(createAdSchema)) body: CreateAdInput) {}
 */
@Injectable()
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.infer<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Dados inválidos",
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
