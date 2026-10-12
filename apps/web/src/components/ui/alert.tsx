import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  error: { icon: CircleAlert, className: "border-danger-line bg-danger-soft text-danger-dark" },
  success: { icon: CircleCheck, className: "border-leaf/20 bg-leaf-soft text-leaf" },
  info: { icon: Info, className: "border-warn/15 bg-warn-soft text-warn" },
} as const;

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  const { icon: Icon, className: toneClass } = tones[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 text-[0.92rem] leading-snug",
        toneClass,
        className,
      )}
    >
      <Icon className="mt-0.5 size-4.5 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
