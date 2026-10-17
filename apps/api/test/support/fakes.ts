import { randomBytes } from "node:crypto";
import {
  type BillingEvent,
  InvalidWebhookError,
  type StripeGateway,
  type SubscriptionSnapshot,
} from "../../src/billing/stripe.gateway";
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

/** Coordenadas aleatórias numa área grande, para prédios de testes diferentes não virarem "duplicados". */
export function uniqueSpot(): { lat: number; lng: number } {
  const random = () => Number.parseInt(randomBytes(4).toString("hex"), 16) / 0xffffffff;
  return { lat: -22.5 - random() * 2, lng: -45.5 - random() * 2 };
}

export function buildingInput(overrides: Record<string, unknown> = {}) {
  const spot = uniqueSpot();
  return {
    name: "Edifício Jardim das Acácias",
    type: "edificio",
    cep: `0${randomBytes(4).readUInt32BE() % 10_000_000}`.padEnd(8, "0").slice(0, 8),
    street: "Rua das Flores",
    number: String(randomBytes(2).readUInt16BE() + 100),
    district: "Centro",
    city: "São Paulo",
    state: "SP",
    lat: spot.lat,
    lng: spot.lng,
    unit: "Apto 42",
    ...overrides,
  };
}

/** Storage em memória (os e2e não dependem do S3/SeaweedFS). */
export function createFakeStorage() {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    onModuleInit: async () => undefined,
    put: async (key: string, body: Buffer) => {
      objects.set(key, body);
    },
    get: async (key: string) => {
      const body = objects.get(key);
      if (!body) throw new Error(`não existe: ${key}`);
      return body;
    },
    deleteMany: async (keys: string[]) => {
      for (const key of keys) objects.delete(key);
    },
    url: (key: string) => `http://storage.test/${key}`,
  };
}

/** IA falsa e determinística: responde conforme o schema pedido. */
export function createFakeAi() {
  const calls: { task: string; userText: string; images: number }[] = [];
  return {
    calls,
    enabled: true,
    countToday: async () => 0,
    structured: async (request: {
      task: string;
      schemaName: string;
      userText: string;
      imageUrls?: string[];
    }) => {
      calls.push({
        task: request.task,
        userText: request.userText,
        images: request.imageUrls?.length ?? 0,
      });
      const data =
        request.schemaName === "rascunho_anuncio"
          ? {
              titulo: "Bolo de pote caseiro de chocolate e ninho",
              descricao: "Bolos de pote feitos em casa nos sabores chocolate e ninho.",
              tipo: "produto",
              categoria: "Alimentação",
              preco: { modo: "fixo", valor: 10 },
              tags: ["Bolo", "doce"],
              disponibilidade: null,
              campos_a_confirmar: ["disponibilidade"],
              alertas: [],
              imagem_principal_sugerida: 0,
            }
          : request.schemaName === "texto_melhorado"
            ? {
                titulo: "Aulas de violão para iniciantes",
                descricao: "Aulas de violão para iniciantes, no seu ritmo.",
              }
            : request.schemaName === "moderacao"
              ? request.userText.includes("arma de fogo")
                ? {
                    decisao: "proibido",
                    categorias_violadas: ["armas"],
                    motivo: "Venda de armas não é permitida",
                    confianca: 0.97,
                  }
                : { decisao: "aprovado", categorias_violadas: [], motivo: "", confianca: 0.95 }
              : {
                  score: 0.9,
                  decisao_sugerida: "verificado",
                  endereco_consistente: true,
                  tipo_identificado: "edificio",
                  nome_confere: "sim",
                  evidencias: [],
                  sinais_de_risco: [],
                  nome_sugerido: null,
                  motivo_para_usuario: null,
                };
      return { data, model: "fake/model", tokensIn: 10, tokensOut: 20 };
    },
  };
}

/** JPEG mínimo válido gerado pelo sharp. */
export async function sampleJpeg(): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width: 800, height: 600, channels: 3, background: "#1e7f5c" } })
    .jpeg()
    .toBuffer();
}

/** Stripe sem rede: assinaturas ficam num mapa e o webhook aceita só a assinatura de teste. */
export const FAKE_STRIPE_SIGNATURE = "assinatura-de-teste";

export function createFakeStripe() {
  const subscriptions = new Map<string, SubscriptionSnapshot>();
  const gateway: Omit<StripeGateway, "enabled"> & { enabled: boolean } = {
    enabled: true,
    createCustomer: async ({ userId }) => `cus_${userId.replaceAll("-", "")}`,
    createCheckout: async ({ userId }) => `https://checkout.stripe.test/c/${userId}`,
    createPortal: async ({ customerId }) => `https://billing.stripe.test/p/${customerId}`,
    parseWebhook: (rawBody, signature) => {
      if (signature !== FAKE_STRIPE_SIGNATURE) throw new InvalidWebhookError("assinatura");
      return JSON.parse(rawBody.toString("utf8")) as BillingEvent;
    },
    retrieveSubscription: async (id) => {
      const found = subscriptions.get(id);
      if (!found) throw new Error(`assinatura ${id} não existe no fake`);
      return found;
    },
    cancelSubscription: async (id) => {
      const found = subscriptions.get(id);
      if (found) subscriptions.set(id, { ...found, status: "canceled" });
    },
  };
  return { gateway, subscriptions };
}
