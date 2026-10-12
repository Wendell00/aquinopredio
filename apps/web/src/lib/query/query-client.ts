import { isServer, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Com SSR, evita refetch imediato no cliente logo após a hidratação.
        staleTime: 60_000,
        // Erros 4xx não melhoram tentando de novo.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/** No servidor cria um client por requisição; no navegador reutiliza um único client. */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
