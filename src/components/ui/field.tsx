import { ChevronDown } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

import { cn } from "./cn";

export type ControlSize = "md" | "sm" | "xs";

const controlSizes: Record<ControlSize, string> = {
  md: "h-10 text-body",
  sm: "h-9 text-meta",
  xs: "h-8 text-meta",
};

/**
 * Class names for a text input or select. Size and selection are options, not
 * overrides: class order does not decide which of two utilities wins, so each
 * property is emitted once.
 */
export function controlClass({
  size = "md",
  selected = false,
}: { readonly size?: ControlSize; readonly selected?: boolean } = {}): string {
  return cn(
    "w-full rounded-control border px-3 placeholder:text-ink-3 transition-colors hover:border-ink-2",
    "focus-visible:border-ocean focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ocean",
    "aria-[invalid=true]:border-negative disabled:opacity-45",
    controlSizes[size],
    selected
      ? "border-ocean bg-mist font-medium text-ocean"
      : "border-line-strong bg-surface text-ink",
  );
}

interface ControlOptions {
  readonly controlSize?: ControlSize;
  readonly selected?: boolean;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  readonly label: ReactNode;
  readonly htmlFor: string;
  readonly error?: string | undefined;
  readonly hint?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-meta font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-meta text-negative">
          {error}
        </p>
      ) : hint ? (
        <p className="text-meta text-ink-2">{hint}</p>
      ) : null}
    </div>
  );
}

/** Wires a control to its Field's error message. */
export const errorProps = (id: string, error: string | undefined) =>
  error ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};

export function Input({
  className,
  controlSize,
  selected,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & ControlOptions) {
  return (
    <input className={cn(controlClass({ size: controlSize, selected }), className)} {...rest} />
  );
}

export function Select({
  className,
  controlSize,
  selected,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & ControlOptions) {
  return (
    <div className="relative">
      <select
        className={cn(
          controlClass({ size: controlSize, selected }),
          "appearance-none pr-9",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3"
      />
    </div>
  );
}

/** A form-level message (e.g. a rule the ledger rejected), shown above the actions. */
export function FormMessage({ children }: { readonly children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-control bg-negative-soft px-3 py-2 text-meta text-negative">
      {children}
    </p>
  );
}
