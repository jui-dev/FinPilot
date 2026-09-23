import { ChevronDown } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

import { cn } from "./cn";

export const controlClass =
  "h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink " +
  "placeholder:text-ink-3 transition-colors hover:border-ink-3 " +
  "focus-visible:border-wine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine-soft " +
  "aria-[invalid=true]:border-negative disabled:opacity-45";

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
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[13px] text-negative">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

/** Wires a control to its Field's error message. */
export const errorProps = (id: string, error: string | undefined) =>
  error ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(controlClass, "appearance-none pr-9", className)} {...rest}>
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
    <p
      role="alert"
      className="rounded-control bg-negative-soft px-3 py-2 text-[13px] text-negative"
    >
      {children}
    </p>
  );
}
