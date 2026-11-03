import { randomBytes } from "node:crypto";
import { AiUnavailableError } from "../../src/ai/ai.service";
import {
  type BillingEvent,
  InvalidWebhookError,
  type StripeGateway,
  type SubscriptionSnapshot,
} from "../../src/billing/stripe.gateway";
import type { GeoService } from "../../src/geo/geo.service";
import { observableList } from "./sync";

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

/**
 * Geo falso por instância (P00-B5.1): o spec pode prender `reverse` numa barreira ou simular o
 * mapa fora do ar (`failing`) sem mexer no `fakeGeo` compartilhado.
 */
export function createFakeGeo() {
  const geo = {
    failing: false,
    lookupCep: fakeGeo.lookupCep,
    geocode: fakeGeo.geocode,
    reverse: async (lat: number, lng: number) => {
      if (geo.failing) throw new Error("mapa de teste fora do ar");
      return fakeGeo.reverse(lat, lng);
    },
    nearbyPlaces: async (lat: number, lng: number) => {
      if (geo.failing) throw new Error("mapa de teste fora do ar");
      return fakeGeo.nearbyPlaces(lat, lng);
    },
  };
  return geo;
}

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
  const ai = {
    calls,
    enabled: true,
    /** Validação de prédio: `aprovar` (score 0,9) ou `indisponivel` (RN-113). */
    buildingValidation: "aprovar" as "aprovar" | "indisponivel",
    countToday: async () => 0,
    structured: async (request: {
      task: string;
      schemaName: string;
      userText: string;
      imageUrls?: string[];
    }) => {
      if (request.schemaName === "validacao_predio" && ai.buildingValidation === "indisponivel")
        throw new AiUnavailableError("IA de teste indisponível");
      calls.push({
        task: request.task,
        userText: request.userText,
        images: request.imageUrls?.length ?? 0,
      });
      const data = fakeAiData(request.schemaName, request.userText);
      return { data, model: "fake/model", tokensIn: 10, tokensOut: 20 };
    },
  };
  return ai;
}

/** Resposta da IA falsa conforme o schema pedido. */
function fakeAiData(schemaName: string, userText: string) {
  return schemaName === "rascunho_anuncio"
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
    : schemaName === "texto_melhorado"
      ? {
          titulo: "Aulas de violão para iniciantes",
          descricao: "Aulas de violão para iniciantes, no seu ritmo.",
        }
      : schemaName === "moderacao"
        ? userText.includes("arma de fogo")
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
}

export const AI_APPROVED = {
  decisao: "aprovado",
  categorias_violadas: [],
  motivo: "",
  confianca: 0.95,
} as const;
export const AI_REVIEW = {
  decisao: "revisar",
  categorias_violadas: ["duvidoso"],
  motivo: "Precisa de revisão",
  confianca: 0.5,
} as const;
export const AI_PROHIBITED = {
  decisao: "proibido",
  categorias_violadas: ["armas"],
  motivo: "Venda de armas não é permitida",
  confianca: 0.97,
} as const;

export interface BarrierCall {
  request: { task: string; userText: string; correlationId?: string | null };
  release: (data: unknown) => void;
  /** Simula IA indisponível (sem chave, fora do ar): quem chama aplica o fallback (RN-113). */
  fail: (error?: Error) => void;
}

/**
 * IA com barreira: cada chamada fica pendente até o teste decidir a resposta. Permite montar
 * intercalamentos exatos entre a análise e outras operações, sem esperar por tempo.
 */
export function createBarrierAi() {
  const calls = observableList<BarrierCall>();
  const pending = new Set<BarrierCall>();
  // Só a moderação de anúncio passa pela barreira; o resto (ex.: validação de prédio) responde já.
  const others = createFakeAi();
  let auto: unknown = null;
  return {
    calls: calls.items,
    enabled: true,
    countToday: async () => 0,
    structured: (request: BarrierCall["request"] & { schemaName: string }) =>
      request.task !== "moderation"
        ? others.structured(request)
        : new Promise((resolve, reject) => {
            const call: BarrierCall = {
              request,
              release: (data) => {
                pending.delete(call);
                resolve({ data, model: "fake/barreira", tokensIn: 1, tokensOut: 1 });
              },
              fail: (error = new AiUnavailableError("IA de teste indisponível")) => {
                pending.delete(call);
                reject(error);
              },
            };
            pending.add(call);
            calls.push(call);
            if (auto !== null) call.release(auto);
          }),
    /** A chamada de índice `index` (já feita ou futura). */
    call: (index: number, label = `chamada de IA #${index}`) => calls.at(index, label),
    /** Libera tudo que ficou pendente (limpeza entre testes). */
    drain(data: unknown = AI_APPROVED) {
      for (const call of [...pending]) call.release(data);
    },
    /** Responde na hora as chamadas pendentes e as próximas com `data`; `null` volta à barreira. */
    autoRespond(data: unknown) {
      auto = data;
      if (data !== null) for (const call of [...pending]) call.release(data);
    },
    /** Chamadas cujo texto enviado contém `text` (ex.: o título do anúncio). */
    callsWith: (text: string) => calls.items.filter((call) => call.request.userText.includes(text)),
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
