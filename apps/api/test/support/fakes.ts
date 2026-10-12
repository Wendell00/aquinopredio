import type { GeoService } from "../../src/geo/geo.service";

/** Geo sem rede: os e2e não dependem do OpenStreetMap. */
export const fakeGeo: Pick<GeoService, "lookupCep" | "geocode" | "reverse" | "nearbyPlaces"> = {
  lookupCep: async (cep) => ({
    cep,
    street: "Rua das Flores",
    district: "Centro",
    city: "São Paulo",
    state: "SP",
  }),
  geocode: async () => ({ lat: -23.55, lng: -46.63, precision: "exato" }),
  reverse: async () => null,
  nearbyPlaces: async () => [],
};

let seq = 0;
/** Coordenadas únicas por teste (prédios distantes > 1 km entre si para não virarem duplicados). */
export function uniqueSpot(): { lat: number; lng: number } {
  seq += 1;
  const jitter = (Date.now() % 1000) / 1000;
  return {
    lat: -23.4 - seq * 0.02 - jitter * 0.01,
    lng: -46.4 - (process.pid % 50) * 0.02 - seq * 0.01,
  };
}

export function buildingInput(overrides: Record<string, unknown> = {}) {
  const spot = uniqueSpot();
  return {
    name: "Edifício Jardim das Acácias",
    type: "edificio",
    cep: `0${Math.floor(1000000 + Math.random() * 8999999)}`.slice(0, 8),
    street: "Rua das Flores",
    number: String(Math.floor(Math.random() * 9000) + 100),
    district: "Centro",
    city: "São Paulo",
    state: "SP",
    lat: spot.lat,
    lng: spot.lng,
    unit: "Apto 42",
    ...overrides,
  };
}
