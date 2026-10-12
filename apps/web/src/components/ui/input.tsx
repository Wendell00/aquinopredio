import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const base =
  "w-full rounded-xl border border-edge bg-white px-4 text-[1rem] text-ink placeholder:text-muted transition-colors focus:border-brand focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand/30 aria-invalid:border-danger disabled:bg-sand disabled:text-muted";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input className={cn(base, "min-h-12", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return (
    <textarea
      className={cn(base, "min-h-28 resize-y py-3 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return (
    <select className={cn(base, "min-h-12 appearance-none bg-white pr-10", className)} {...props} />
  );
}
