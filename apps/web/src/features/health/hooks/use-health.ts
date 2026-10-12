import { queryOptions, useQuery } from "@tanstack/react-query";
import { getHealth } from "../api/get-health";

export const healthQueryOptions = queryOptions({
  queryKey: ["health"],
  queryFn: getHealth,
  refetchInterval: 30_000,
});

export function useHealth() {
  return useQuery(healthQueryOptions);
}
