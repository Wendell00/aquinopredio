import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary:
    "bg-brand text-white shadow-brand hover:bg-brand-dark disabled:bg-brand/60 disabled:shadow-none",
  secondary: "border border-line bg-white text-ink hover:border-ink-soft/40 hover:bg-sand",
  ghost: "text-ink-soft hover:bg-sand hover:text-ink",
  danger: "bg-danger text-white hover:bg-danger-dark disabled:bg-danger/60",
} as const;

const sizes = {
  md: "min-h-12 px-6 text-[0.95rem]",
  sm: "min-h-10 px-4 text-sm",
  icon: "size-11 justify-center",
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
};

export const buttonClasses = (
  variant: keyof typeof variants = "primary",
  size: keyof typeof sizes = "md",
) =>
  cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-bold transition-colors disabled:cursor-not-allowed",
    variants[variant],
    sizes[size],
  );

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      className={cn(buttonClasses(variant, size), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
