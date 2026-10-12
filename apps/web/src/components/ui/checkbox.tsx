import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  error?: string;
};

export function Checkbox({
  label,
  error,
  className,
  id,
  ...props
}: CheckboxProps): React.JSX.Element {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        htmlFor={id}
        className="flex cursor-pointer items-start gap-3 text-[0.95rem] text-ink-soft"
      >
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 cursor-pointer rounded accent-brand"
          aria-invalid={error ? true : undefined}
          {...props}
        />
        <span>{label}</span>
      </label>
      {error && (
        <p role="alert" className="pl-8 text-[0.82rem] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
