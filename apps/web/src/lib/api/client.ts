import ky, { isHTTPError } from "ky";
import { env } from "@/lib/env";

/** Erro normalizado da API, com o status HTTP e a mensagem do backend quando houver. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const api = ky.create({
  prefix: env.NEXT_PUBLIC_API_URL,
  credentials: "include",
  timeout: 10_000,
  retry: { limit: 2, methods: ["get"] },
  hooks: {
    beforeError: [
      ({ error }) => {
        if (!isHTTPError(error)) return error;
        const body: unknown = error.data;
        const message =
          typeof body === "object" &&
          body !== null &&
          "message" in body &&
          typeof body.message === "string"
            ? body.message
            : error.message;
        return new ApiError(message, error.response.status, body);
      },
    ],
  },
});
