import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "./zod-validation.pipe";

describe("ZodValidationPipe", () => {
  const pipe = new ZodValidationPipe(z.object({ title: z.string().min(5) }));

  it("retorna os dados válidos sem campos extras", () => {
    expect(pipe.transform({ title: "Bolo de pote", admin: true })).toEqual({
      title: "Bolo de pote",
    });
  });

  it("lança 400 com os campos inválidos", () => {
    const run = () => pipe.transform({ title: "abc" });
    expect(run).toThrow(BadRequestException);

    const error = (() => {
      try {
        run();
      } catch (caught) {
        return caught as BadRequestException;
      }
    })();
    const body = error?.getResponse() as { issues: { path: string }[] };
    expect(body.issues[0]?.path).toBe("title");
  });
});
