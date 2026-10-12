import { z } from "zod";

/** Opções de raio de alcance de um anúncio, em km (RN-057). 0 = só o próprio prédio. */
export const AD_RADII_KM = [0, 0.5, 1, 2, 3, 5] as const;
export type AdRadiusKm = (typeof AD_RADII_KM)[number];

/** Raio máximo para quem ainda não tem selo de morador verificado (RN-059). */
export const UNVERIFIED_MAX_RADIUS_KM: AdRadiusKm = 1;

export const adTypeSchema = z.enum(["servico", "produto", "procura"]);
export type AdType = z.infer<typeof adTypeSchema>;

export const adStatusSchema = z.enum([
  "rascunho",
  "em_moderacao",
  "ativo",
  "pausado",
  "expirado",
  "removido",
  "excluido",
]);
export type AdStatus = z.infer<typeof adStatusSchema>;

export const priceModeSchema = z.enum(["fixo", "a_partir_de", "a_combinar", "gratuito"]);
export type PriceMode = z.infer<typeof priceModeSchema>;

export const adRadiusKmSchema = z.literal([...AD_RADII_KM]);

/** Raios permitidos para o anunciante, considerando prédio pendente (RN-028) e selo de verificado (RN-059). */
export function allowedRadii(options: {
  buildingVerified: boolean;
  residentVerified: boolean;
}): AdRadiusKm[] {
  if (!options.buildingVerified) return [0];
  if (options.residentVerified) return [...AD_RADII_KM];
  return AD_RADII_KM.filter((km) => km <= UNVERIFIED_MAX_RADIUS_KM);
}
