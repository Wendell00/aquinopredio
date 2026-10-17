import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

/** Selo do anúncio em destaque do plano Pro (RN-144). */
export function FeaturedBadge({ className }: { className?: string }): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-0.5 text-[0.72rem] font-bold text-warn ring-1 ring-warn/25",
        className,
      )}
    >
      <Sparkles className="size-3" aria-hidden />
      Destaque
    </span>
  );
}
