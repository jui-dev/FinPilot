import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors " +
  "disabled:pointer-events-none disabled:opacity-45 select-none";

const variants: Record<Variant, string> = {
  primary: "bg-wine text-white hover:bg-wine-hover",
  secondary:
    "border border-line-strong bg-surface text-ink hover:border-ink-3 hover:bg-surface-hover",
  ghost: "text-ink-2 hover:bg-surface-hover hover:text-ink",
  danger: "text-negative hover:bg-negative-soft",
  link: "font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink",
};

const sizes: Record<Size, string> = {
  sm: "h-8 rounded-control px-3 text-[13px]",
  md: "h-10 rounded-control px-4 text-sm",
  /** Icon-only: a 32px square with no horizontal padding, so a 16px icon keeps its size. */
  icon: "size-8 rounded-control",
};

/** Class names for a button-styled element (e.g. a Link). */
export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], variant === "link" ? "" : sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: Size;
  /** Keeps the button's width and shows a spinner while a server action runs. */
  readonly pending?: boolean;
  readonly icon?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  pending = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, cn("relative", className))}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...rest}
    >
      <span className={cn("inline-flex items-center gap-2", pending && "invisible")}>
        {icon}
        {children}
      </span>
      {pending && (
        <LoaderCircle aria-hidden className="absolute size-4 animate-spin" strokeWidth={2} />
      )}
    </button>
  );
}
