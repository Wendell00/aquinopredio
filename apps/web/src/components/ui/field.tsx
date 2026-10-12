import { type ReactNode, useId } from "react";
import { cn } from "@/lib/cn";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  className?: string;
  /** Recebe os ids para ligar label, dica e erro ao controle (acessibilidade). */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({ label, hint, error, className, children }: FieldProps): React.JSX.Element {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-[0.82rem] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-[0.82rem] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
