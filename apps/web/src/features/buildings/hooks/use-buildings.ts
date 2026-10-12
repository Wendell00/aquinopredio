import type { BuildingSearchQuery, MyBuilding } from "@repo/shared";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { getMyBuildings, searchBuildings } from "../api/buildings-api";

export const buildingKeys = {
  all: ["buildings"] as const,
  search: (query: BuildingSearchQuery) => ["buildings", "search", query] as const,
  mine: ["buildings", "mine"] as const,
};

export const myBuildingsQueryOptions = queryOptions({
  queryKey: buildingKeys.mine,
  queryFn: getMyBuildings,
});

export function useMyBuildings(initialData?: MyBuilding[]) {
  return useQuery({ ...myBuildingsQueryOptions, initialData });
}

export function useBuildingSearch(query: BuildingSearchQuery | null) {
  return useQuery({
    queryKey: buildingKeys.search(query ?? {}),
    queryFn: () => searchBuildings(query ?? {}),
    enabled: query !== null,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
