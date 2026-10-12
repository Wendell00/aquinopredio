import type { Me } from "@repo/shared";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { getMe } from "../api/me-api";

export const meQueryOptions = queryOptions({ queryKey: ["me"], queryFn: getMe });

/** Usuário logado. `initialData` vem do Server Component para não piscar na primeira renderização. */
export function useMe(initialData?: Me) {
  return useQuery({ ...meQueryOptions, initialData });
}
