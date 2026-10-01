import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "./cn";

/**
 * An underlined text link: evidence amounts, "Review entries through …", "Open … in
 * Cash flow". The ocean underline marks something that opens the rows behind it.
 */
export const linkClass =
  "underline decoration-ocean/50 underline-offset-4 transition-colors hover:decoration-ocean";

type Variant =
  | "primary"
  | "accent"
  | "secondary"
  | "soft"
  | "quiet"
  | "ghost"
  | "danger"
  | "destructive"
  | "link";
type Size = "sm" | "md" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors " +
  "disabled:pointer-events-none disabled:opacity-45 select-none";

const variants: Record<Variant, string> = {
  primary: "bg-navy text-white hover:bg-navy-hover",
  /** The Add action: coral with ink text (5.3:1); white on coral would be 3.05:1. */
  accent: "bg-coral text-ink hover:bg-coral/85",
  secondary:
    "border border-line-strong bg-surface text-ink hover:border-ink-2 hover:bg-surface-hover",
  /** A row's main action on a quiet list: mist and ocean, the page's own blues. */
  soft: "bg-mist/70 text-ocean shadow-[inset_0_0_0_1px_rgb(70_103_141/0.22)] hover:bg-mist hover:text-navy",
  /** A row's secondary action: a neutral chip, present but never louder than the main one. */
  quiet: "bg-surface-hover/70 text-ink-2 hover:bg-surface-hover hover:text-ink",
  ghost: "text-ink-2 hover:bg-surface-hover hover:text-ink",
  /** An inline destructive action (e.g. a row's Delete). */
  danger: "text-negative hover:bg-negative-soft",
  /** The confirming button of a destructive dialog: filled, never the brand colour. */
  destructive: "bg-negative text-white hover:bg-negative-hover",
  link: `font-medium text-ink ${linkClass}`,
};

const sizes: Record<Size, string> = {
  sm: "h-8 rounded-control px-3 text-meta",
  md: "h-10 rounded-control px-4 text-body",
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
