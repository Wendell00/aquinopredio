import { z } from "zod";

export const buildingTypeSchema = z.enum(["edificio", "condominio_horizontal"]);
export type BuildingType = z.infer<typeof buildingTypeSchema>;

export const buildingStatusSchema = z.enum([
  "pendente_validacao",
  "verificado",
  "pendente_revisao",
  "rejeitado",
  "arquivado",
]);
export type BuildingStatus = z.infer<typeof buildingStatusSchema>;

export const joinPolicySchema = z.enum(["automatica", "aprovacao_admin"]);
export type JoinPolicy = z.infer<typeof joinPolicySchema>;

export const membershipStatusSchema = z.enum(["pendente", "ativo", "recusado", "removido"]);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const membershipRoleSchema = z.enum(["morador", "admin"]);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const BRAZIL_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;
export const stateSchema = z.enum(BRAZIL_STATES, { error: "UF inválida" });

/** CEP só com dígitos (aceita "01310-100"). */
export const cepSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().length(8, "CEP deve ter 8 dígitos"));

export const latitudeSchema = z.coerce.number().min(-34).max(6);
export const longitudeSchema = z.coerce.number().min(-74).max(-28);

export const unitSchema = z
  .string()
  .trim()
  .min(1, "Informe a unidade (ex.: apto 42, bloco B)")
  .max(30, "Use no máximo 30 caracteres");

export const BUILDING_LABELS: Record<BuildingType, string> = {
  edificio: "Edifício",
  condominio_horizontal: "Condomínio de casas",
};

export const cepLookupSchema = z.object({
  cep: z.string(),
  street: z.string(),
  district: z.string(),
  city: z.string(),
  state: z.string(),
});
export type CepLookup = z.infer<typeof cepLookupSchema>;

export const geocodeInputSchema = z.object({
  cep: cepSchema,
  street: z.string().trim().min(2),
  number: z.string().trim().min(1).max(10),
  city: z.string().trim().min(2),
  state: stateSchema,
});
export type GeocodeInput = z.infer<typeof geocodeInputSchema>;

export const geocodeResultSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  /** `exato`: achou o número; `rua`/`cep`: só aproximado, o usuário deve ajustar o pino (RN-024). */
  precision: z.enum(["exato", "rua", "cep"]),
});
export type GeocodeResult = z.infer<typeof geocodeResultSchema>;

export const buildingSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(80).optional(),
    cep: cepSchema.optional(),
    lat: latitudeSchema.optional(),
    lng: longitudeSchema.optional(),
  })
  .refine((query) => query.q || query.cep || (query.lat !== undefined && query.lng !== undefined), {
    message: "Informe nome, CEP ou localização",
  });
export type BuildingSearchQuery = z.infer<typeof buildingSearchQuerySchema>;

/** Prédio em listas públicas: sem número do endereço (RN-034). */
export const buildingSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: buildingTypeSchema,
  street: z.string(),
  district: z.string(),
  city: z.string(),
  state: z.string(),
  status: buildingStatusSchema,
  distanceM: z.number().nullable(),
  residents: z.number().int(),
});
export type BuildingSummary = z.infer<typeof buildingSummarySchema>;

export const duplicateCheckInputSchema = z.object({
  cep: cepSchema,
  number: z.string().trim().min(1).max(10),
  lat: latitudeSchema,
  lng: longitudeSchema,
});
export type DuplicateCheckInput = z.infer<typeof duplicateCheckInputSchema>;

export const buildingNameSchema = z.string().trim().min(3, "Informe o nome do prédio").max(80);

export const createBuildingInputSchema = z.object({
  name: buildingNameSchema,
  type: buildingTypeSchema,
  cep: cepSchema,
  street: z.string().trim().min(2).max(120),
  number: z.string().trim().min(1, "Informe o número").max(10),
  district: z.string().trim().min(2, "Informe o bairro").max(80),
  city: z.string().trim().min(2).max(80),
  state: stateSchema,
  lat: latitudeSchema,
  lng: longitudeSchema,
  unitsEstimate: z.coerce.number().int().min(1).max(5000).nullable().optional(),
  /** Unidade de quem está criando (vira o primeiro vínculo). */
  unit: unitSchema,
  /** O usuário já viu os candidatos de duplicidade e disse que não é nenhum deles (RN-025). */
  ignoreDuplicates: z.boolean().default(false),
});
export type CreateBuildingInput = z.infer<typeof createBuildingInputSchema>;

export const resubmitBuildingInputSchema = createBuildingInputSchema.omit({
  unit: true,
  ignoreDuplicates: true,
});
export type ResubmitBuildingInput = z.infer<typeof resubmitBuildingInputSchema>;

export const joinBuildingInputSchema = z.object({ unit: unitSchema });
export type JoinBuildingInput = z.infer<typeof joinBuildingInputSchema>;

export const setPrimaryBuildingInputSchema = z.object({ buildingId: z.uuid() });

/** Prédio visto por quem mora nele (endereço completo, situação da validação). */
export const myBuildingSchema = z.object({
  membershipId: z.uuid(),
  unit: z.string(),
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  isPrimary: z.boolean(),
  verifiedResident: z.boolean(),
  building: z.object({
    id: z.uuid(),
    name: z.string(),
    type: buildingTypeSchema,
    street: z.string(),
    number: z.string(),
    district: z.string(),
    city: z.string(),
    state: z.string(),
    cep: z.string(),
    lat: z.number(),
    lng: z.number(),
    status: buildingStatusSchema,
    joinPolicy: joinPolicySchema,
    rejectionReason: z.string().nullable(),
    suggestedName: z.string().nullable(),
    canResubmit: z.boolean(),
    residents: z.number().int(),
  }),
});
export type MyBuilding = z.infer<typeof myBuildingSchema>;

export const createBuildingResponseSchema = z.discriminatedUnion("result", [
  z.object({ result: z.literal("created"), building: myBuildingSchema }),
  z.object({ result: z.literal("duplicates"), candidates: z.array(buildingSummarySchema) }),
]);
export type CreateBuildingResponse = z.infer<typeof createBuildingResponseSchema>;
