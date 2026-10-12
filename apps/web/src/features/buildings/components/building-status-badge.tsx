import type { BuildingStatus } from "@repo/shared";
import { BadgeCheck, Clock3, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const STATUS: Partial<
  Record<BuildingStatus, { label: string; className: string; icon: typeof Clock3 }>
> = {
  verificado: { label: "Verificado", className: "bg-leaf-soft text-leaf", icon: BadgeCheck },
  pendente_revisao: { label: "Em verificação", className: "bg-warn-soft text-warn", icon: Clock3 },
  pendente_validacao: {
    label: "Em verificação",
    className: "bg-warn-soft text-warn",
    icon: Clock3,
  },
  rejeitado: { label: "Não aprovado", className: "bg-danger-soft text-danger-dark", icon: XCircle },
};

export function BuildingStatusBadge({
  status,
  className,
}: {
  status: BuildingStatus;
  className?: string;
}) {
  const config = STATUS[status];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.75rem] font-semibold",
        config.className,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {config.label}
    </span>
  );
}
