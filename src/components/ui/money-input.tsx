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
  /** "hero": Quick Add's centred amount, the dialog's one large figure. */
  readonly size?: "md" | "lg" | "hero";
  readonly ref?: Ref<HTMLInputElement>;
}) {
  if (size === "hero") {
    return (
      // The underline appears only while the amount has focus (or is wrong), under the figure alone.
      <div className={cn("flex justify-center", className)}>
        <div
          className={cn(
            "inline-flex items-baseline gap-1.5 border-b-2 px-1 pb-0.5 transition-colors",
            rest["aria-invalid"]
              ? "border-negative"
              : "border-transparent focus-within:border-ocean",
          )}
        >
          <span aria-hidden className="text-title font-semibold text-ocean">
            ৳
          </span>
          <input
            ref={ref}
            inputMode="decimal"
            autoComplete="off"
            // As wide as what is typed, so the figure stays centred.
            style={{
              width: `${Math.max(1, (value || String(rest.placeholder ?? "")).length) + 0.4}ch`,
            }}
            className="min-w-[1.4ch] bg-transparent text-hero font-bold text-navy tabular-nums outline-none placeholder:text-line focus-visible:outline-none"
            value={value}
            onChange={(e) => onValueChange(e.target.value.replace(/[^\d.,]/g, ""))}
            onBlur={(e) => onValueChange(formatTypedAmount(e.target.value))}
            {...rest}
          />
        </div>
      </div>
    );
  }
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
