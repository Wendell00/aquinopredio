import { usernameSchema } from "@repo/shared";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { checkUsername } from "../api/me-api";

export const usernameAvailabilityQueryOptions = (username: string) =>
  queryOptions({
    queryKey: ["me", "username-availability", { username }],
    queryFn: () => checkUsername(username),
    staleTime: 30_000,
  });

/**
 * Confere no servidor se o nome está livre enquanto a pessoa digita.
 * Só consulta nomes com formato válido e diferentes do atual (o formato o zod já avisa).
 */
export function useUsernameAvailability(raw: string, current: string | null) {
  const parsed = usernameSchema.safeParse(useDebouncedValue(raw, 400));
  const username = parsed.success ? parsed.data : "";
  const query = useQuery({
    ...usernameAvailabilityQueryOptions(username),
    enabled: Boolean(username) && username !== current,
  });
  return { username, ...query };
}
