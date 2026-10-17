import { type Me, notificationPrefsSchema, type OnboardingStep } from "@repo/shared";
import type { User } from "./user.entity";

export function onboardingStep(
  user: Pick<User, "termsAcceptedAt" | "status" | "username">,
): OnboardingStep {
  if (!user.termsAcceptedAt || !user.username) return "perfil";
  if (user.status === "onboarding_pendente") return "predio";
  return "concluido";
}

export function toMe(user: User): Me {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    phone: user.phone,
    status: user.status,
    role: user.role,
    primaryBuildingId: user.primaryBuildingId,
    termsAcceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
    suspendedUntil: user.suspendedUntil?.toISOString() ?? null,
    notificationPrefs: notificationPrefsSchema.parse(user.notificationPrefs ?? {}),
    onboardingStep: onboardingStep(user),
    createdAt: user.createdAt.toISOString(),
  };
}
