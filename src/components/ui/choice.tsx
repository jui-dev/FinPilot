"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "./cn";

export interface Option<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

/**
 * A single choice among a few options (transaction type, account type).
 * Radio-group semantics: one tab stop, arrow keys move the selection.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  size = "md",
}: {
  readonly label: string;
  readonly options: readonly Option<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly className?: string;
  readonly size?: "sm" | "md";
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.filter((o) => !o.disabled);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const index = enabled.findIndex((o) => o.value === value);
    const next = enabled[(index + step + enabled.length) % enabled.length]!;
    onChange(next.value);
    refs.current[options.indexOf(next)]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex rounded-control border border-line bg-surface-subtle p-0.5",
        className,
      )}
    >
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={onKeyDown}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-[6px] font-medium whitespace-nowrap transition-colors disabled:opacity-40",
              size === "sm" ? "h-7 px-2.5 text-[13px]" : "h-8 px-3 text-[13.5px]",
              selected
                ? "bg-mist text-ocean shadow-[0_0_0_1px_var(--color-ocean)]"
                : "text-ink-2 hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A selectable pill (e.g. a category). */
export function Chip({
  selected,
  onClick,
  children,
  className,
}: {
  readonly selected: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
        selected
          ? "border-ocean bg-mist text-ocean"
          : "border-line-strong bg-surface text-ink-2 hover:border-ink-2 hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}
