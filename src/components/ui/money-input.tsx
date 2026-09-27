"use client";

import type { InputHTMLAttributes, Ref } from "react";

import { groupSouthAsian, parseMoney } from "@/domain/money";

import { cn } from "./cn";

/**
 * An amount as a person types it: digits with optional decimals. On blur it is
 * regrouped South Asian style (1,50,000); parsing happens on the server with
 * the same domain parser, so nothing is rounded silently here.
 */
export function formatTypedAmount(raw: string): string {
  const parsed = parseMoney(raw);
  if (!parsed.ok || parsed.value < 0) return raw;
  const minor = parsed.value % 100;
  const major = (parsed.value - minor) / 100;
  return groupSouthAsian(String(major)) + (minor ? `.${String(minor).padStart(2, "0")}` : "");
}

export function MoneyInput({
  value,
  onValueChange,
  size = "md",
  className,
  ref,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size"> & {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly size?: "md" | "lg";
  readonly ref?: Ref<HTMLInputElement>;
}) {
  const large = size === "lg";
  return (
    <div
      className={cn(
        "flex items-baseline gap-1.5 border-line-strong transition-colors focus-within:border-ocean",
        large
          ? "border-b-2 pb-1"
          : "h-10 rounded-control border bg-surface px-3 focus-within:ring-1 focus-within:ring-ocean",
        rest["aria-invalid"] && "border-negative",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("font-medium text-ink-2", large ? "text-title" : "text-body")}
      >
        ৳
      </span>
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        className={cn(
          "w-full min-w-0 bg-transparent tabular-nums outline-none placeholder:text-ink-3",
          large ? "text-display font-semibold" : "h-full text-body",
        )}
        value={value}
        onChange={(e) => onValueChange(e.target.value.replace(/[^\d.,]/g, ""))}
        onBlur={(e) => onValueChange(formatTypedAmount(e.target.value))}
        {...rest}
      />
    </div>
  );
}
