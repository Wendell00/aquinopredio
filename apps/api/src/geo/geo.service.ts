import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CepLookup, GeocodeInput, GeocodeResult } from "@repo/shared";
import type { Env } from "../config/env";

export interface NearbyPlace {
  name: string | null;
  kind: string;
  distanceM: number;
}

export interface ReverseResult {
  category: string;
  type: string;
  addressType: string | null;
  houseNumber: string | null;
  road: string | null;
  postcode: string | null;
  displayName: string;
}

interface NominatimItem {
  lat: string;
  lon: string;
  category?: string;
  type?: string;
  addresstype?: string;
  display_name: string;
  address?: Record<string, string | undefined>;
}

/**
 * ViaCEP (CEP → endereço) e OpenStreetMap: Nominatim (geocodificação) e Overpass (lugares próximos).
 * Respeita a política de uso do Nominatim: User-Agent identificado e no máximo 1 requisição/s
 * por processo.
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private nominatimQueue: Promise<unknown> = Promise.resolve();
  private lastNominatimAt = 0;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async lookupCep(cep: string): Promise<CepLookup | null> {
    const url = `${this.config.get("VIACEP_URL", { infer: true })}/${cep}/json/`;
    const data = await this.fetchJson<Record<string, string | boolean>>(url);
    if (!data || data.erro) return null;
    return {
      cep,
      street: String(data.logradouro ?? ""),
      district: String(data.bairro ?? ""),
      city: String(data.localidade ?? ""),
      state: String(data.uf ?? ""),
    };
  }

  /** Geocodifica com precisão decrescente: endereço com número → rua → CEP (RN-024). */
  async geocode(input: GeocodeInput): Promise<GeocodeResult | null> {
    const base = { city: input.city, state: input.state, country: "Brasil" };
    const exact = await this.nominatimSearch({
      ...base,
      street: `${input.number} ${input.street}`,
    });
    if (exact) {
      const hasNumber = Boolean(exact.address?.house_number);
      return {
        lat: Number(exact.lat),
        lng: Number(exact.lon),
        precision: hasNumber ? "exato" : "rua",
      };
    }
    const street = await this.nominatimSearch({ ...base, street: input.street });
    if (street) return { lat: Number(street.lat), lng: Number(street.lon), precision: "rua" };
    const byCep = await this.nominatimSearch({ ...base, postalcode: input.cep });
    if (byCep) return { lat: Number(byCep.lat), lng: Number(byCep.lon), precision: "cep" };
    return null;
  }

  async reverse(lat: number, lng: number): Promise<ReverseResult | null> {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "jsonv2",
      addressdetails: "1",
      zoom: "18",
    });
    const item = await this.nominatim<NominatimItem>(`/reverse?${params}`);
    if (!item) return null;
    return {
      category: item.category ?? "",
      type: item.type ?? "",
      addressType: item.addresstype ?? null,
      houseNumber: item.address?.house_number ?? null,
      road: item.address?.road ?? null,
      postcode: item.address?.postcode?.replace(/\D/g, "") ?? null,
      displayName: item.display_name,
    };
  }

  /** Construções e áreas residenciais num raio (evidência objetiva para a validação de prédio). */
  async nearbyPlaces(lat: number, lng: number, radiusM = 80): Promise<NearbyPlace[]> {
    const around = `(around:${radiusM},${lat},${lng})`;
    // Consulta enxuta: o servidor público do Overpass costuma recusar (504) consultas pesadas.
    const query = `[out:json][timeout:20];(way["building"]${around};way["landuse"="residential"]${around};nwr["name"]["building"]${around};);out center tags 30;`;
    const response = await this.fetchJson<{
      elements: {
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
        tags?: Record<string, string>;
      }[];
    }>(this.config.get("OVERPASS_URL", { infer: true }), {
      method: "POST",
      body: new URLSearchParams({ data: query }),
    });
    return (response?.elements ?? []).map((element) => {
      const point = element.center ?? { lat: element.lat ?? lat, lon: element.lon ?? lng };
      const tags = element.tags ?? {};
      return {
        name: tags.name ?? null,
        kind: tags.building
          ? `building=${tags.building}`
          : tags.landuse
            ? `landuse=${tags.landuse}`
            : (tags.amenity ?? tags.shop ?? "outro"),
        distanceM: Math.round(haversineM(lat, lng, point.lat, point.lon)),
      };
    });
  }

  private nominatimSearch(params: Record<string, string>): Promise<NominatimItem | null> {
    const query = new URLSearchParams({
      ...params,
      format: "jsonv2",
      addressdetails: "1",
      limit: "1",
      countrycodes: "br",
    });
    return this.nominatim<NominatimItem[]>(`/search?${query}`).then((items) => items?.[0] ?? null);
  }

  /** Serializa as chamadas ao Nominatim com intervalo mínimo de 1,1 s. */
  private nominatim<T>(path: string): Promise<T | null> {
    const run = async (): Promise<T | null> => {
      const wait = this.lastNominatimAt + 1100 - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastNominatimAt = Date.now();
      return this.fetchJson<T>(`${this.config.get("NOMINATIM_URL", { infer: true })}${path}`);
    };
    const next = this.nominatimQueue.then(run, run);
    this.nominatimQueue = next.catch(() => undefined);
    return next;
  }

  private async fetchJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          "user-agent": this.config.get("GEO_USER_AGENT", { infer: true }),
          accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      this.logger.warn(`Falha ao consultar ${new URL(url).host}: ${(error as Error).message}`);
      throw new ServiceUnavailableException(
        "Serviço de endereços indisponível. Tente de novo em instantes.",
      );
    }
  }
}

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}
