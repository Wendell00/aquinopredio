import type { OnboardingStep } from "@repo/shared";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

const STEPS: { key: Exclude<OnboardingStep, "concluido">; label: string }[] = [
  { key: "perfil", label: "Seu perfil" },
  { key: "predio", label: "Seu prédio" },
];

/** Progresso do cadastro: é uma sequência de fato, por isso os passos são numerados. */
export function OnboardingSteps({ current }: { current: OnboardingStep }): React.JSX.Element {
  const currentIndex = STEPS.findIndex((step) => step.key === current);
  return (
    <ol className="flex items-center gap-3 text-sm" aria-label="Etapas do cadastro">
      {STEPS.map((step, index) => {
        const done = current === "concluido" || index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={step.key}
            className="flex items-center gap-3"
            aria-current={active ? "step" : undefined}
          >
            {index > 0 && <span aria-hidden className="h-px w-6 bg-line" />}
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full text-[0.8rem] font-bold",
                done && "bg-leaf text-white",
                active && "bg-brand text-white",
                !done && !active && "bg-sand text-muted",
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : index + 1}
            </span>
            <span className={cn("font-semibold", active ? "text-ink" : "text-muted")}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
