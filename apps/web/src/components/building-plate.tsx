import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Placa de prédio — o elemento de identidade do app. Lembra a placa de metal ao lado do
 * interfone: nome em destaque, detalhe embaixo, quatro "parafusos" nos cantos.
 */
export function BuildingPlate({
  name,
  detail,
  badge,
  size = "md",
  className,
}: {
  name: string;
  detail?: ReactNode;
  badge?: ReactNode;
  size?: "md" | "lg";
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "relative rounded-[10px] border border-plate-edge bg-linear-to-b from-plate-top to-plate-bottom text-ink shadow-[inset_0_1px_0_#fff,0_1px_2px_rgba(60,35,20,0.12)]",
        size === "lg" ? "px-7 py-5" : "px-5 py-3.5",
        className,
      )}
    >
      {["left-2 top-2", "right-2 top-2", "bottom-2 left-2", "bottom-2 right-2"].map((pos) => (
        <span
          key={pos}
          aria-hidden
          className={cn(
            "absolute size-1.5 rounded-full bg-plate-screw shadow-[inset_0_1px_0_rgba(0,0,0,0.25)]",
            pos,
          )}
        />
      ))}
      <div className="flex items-center gap-2.5">
        <p
          className={cn(
            "font-extrabold tracking-[-0.02em]",
            size === "lg" ? "text-[1.6rem] leading-tight" : "text-[1.05rem] leading-snug",
          )}
        >
          {name}
        </p>
        {badge}
      </div>
      {detail && (
        <p
          className={cn("text-ink-soft", size === "lg" ? "mt-1 text-[0.95rem]" : "text-[0.85rem]")}
        >
          {detail}
        </p>
      )}
    </div>
  );
}
