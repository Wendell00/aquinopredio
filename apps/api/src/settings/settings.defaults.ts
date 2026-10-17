/** Valores `[configurável]` dos docs. O admin pode sobrescrever qualquer um na tabela `settings`. */
export const SETTINGS_DEFAULTS = {
  /** RN-025 */
  "buildings.duplicateRadiusM": 100,
  /** RN-030 */
  "buildings.maxCreatedPer30Days": 2,
  /** RN-035: 1 principal + 2 adicionais */
  "buildings.maxPerUser": 3,
  /** RN-027 */
  "buildings.verifyThreshold": 0.8,
  "buildings.reviewThreshold": 0.5,
  /** RN-029 */
  "buildings.maxResubmissions": 1,
  /** RN-033 */
  "buildings.archiveAfterDays": 180,
  /** RN-057 */
  "ads.radiiKm": [0, 0.5, 1, 2, 3, 5, 10],
  /** RN-141: raio máximo do plano Free */
  "plans.freeMaxRadiusKm": 1,
  /** RN-142: raio máximo do plano Pro */
  "plans.proMaxRadiusKm": 10,
  /** RN-144: anúncios em destaque ao mesmo tempo no Pro */
  "plans.proFeaturedAds": 1,
  /** RN-140: preço exibido (o valor cobrado é o do preço no Stripe) */
  "plans.proPriceCents": 5000,
  /** RN-063 */
  "ads.activeDays": 30,
  "ads.expiryWarningDays": 3,
  /** RN-065 */
  "ads.maxActiveResident": 5,
  "ads.maxActiveVerified": 10,
  /** RN-067 */
  "ads.bumpIntervalHours": 72,
  /** RN-110 */
  "ai.dailyAdGenerations": 10,
  /** RN-093 */
  "reports.autoHideThreshold": 3,
  /** RN-084 */
  "chat.newConversationsPerDay": 20,
} as const;

export type SettingKey = keyof typeof SETTINGS_DEFAULTS;
export type SettingValue<K extends SettingKey> =
  (typeof SETTINGS_DEFAULTS)[K] extends readonly number[]
    ? number[]
    : (typeof SETTINGS_DEFAULTS)[K] extends number
      ? number
      : (typeof SETTINGS_DEFAULTS)[K];
