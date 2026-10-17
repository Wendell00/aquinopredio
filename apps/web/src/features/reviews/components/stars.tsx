import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

/** Estrelas só para leitura; o número vai no rótulo para leitores de tela. */
export function Stars({
  value,
  className,
}: {
  value: number;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      role="img"
      aria-label={`Nota ${value.toLocaleString("pt-BR")} de 5`}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {[1, 2, 3, 4, 5].map((position) => (
        <Star
          key={position}
          aria-hidden
          className={cn(
            "size-4",
            position <= Math.round(value) ? "fill-warn text-warn" : "fill-none text-edge",
          )}
        />
      ))}
    </span>
  );
}
