"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { inclusiveRange } from "@/domain/calendar-date";
import type { CategoryKind } from "@/domain/ledger/transactions";
import { ACTIVITY_TYPE_FILTERS } from "@/server/services/activity-service";

import { monthLabel, rangeLabel } from "../format";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { controlClass } from "../ui/field";

export interface FilterOptions {
  readonly accounts: ReadonlyArray<{ id: string; name: string }>;
  readonly categories: ReadonlyArray<{ id: string; name: string; kind: CategoryKind }>;
  readonly months: readonly string[];
}

export interface FilterValues {
  readonly q: string;
  readonly account: string;
  readonly category: string;
  readonly type: string;
  readonly month: string;
  /** An inclusive date range (from a Cash flow link); replaces `month` when set. */
  readonly from: string;
  readonly to: string;
}

const TYPE_LABELS: Record<string, string> = {
  expense: "Spending",
  income: "Income",
  transfer: "Transfers",
  refund: "Refunds",
};

/** The Period select's value while a date range is active. */
const RANGE = "range";

/** Filters live in the URL, so any view can be linked to, shared and reloaded. */
export function ActivityFilters({
  options,
  values,
}: {
  readonly options: FilterOptions;
  readonly values: FilterValues;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(values.q);
  const searchRef = useRef<HTMLInputElement>(null);
  const range = inclusiveRange(values.from, values.to);
  const active = Boolean(
    values.q || values.account || values.category || values.type || values.month || range,
  );

  const apply = (changes: Partial<FilterValues>) => {
    const next = { ...values, ...changes };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    const query = params.toString();
    startTransition(() =>
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }),
    );
  };

  // Typing filters as you go, without a request per keystroke.
  useEffect(() => setText(values.q), [values.q]);
  useEffect(() => {
    if (text === values.q) return;
    const timer = window.setTimeout(() => apply({ q: text }), 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // "/" focuses the search field, as in most list-heavy products.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const select = (
    name: keyof FilterValues,
    label: string,
    value: string,
    children: React.ReactNode,
  ) => (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) =>
          // A month (or all time) replaces any date range.
          apply(
            name === "month"
              ? { month: event.target.value, from: "", to: "" }
              : { [name]: event.target.value },
          )
        }
        className={cn(
          controlClass,
          "h-9 w-full min-w-0 appearance-none bg-[right_0.6rem_center] bg-no-repeat pr-8 text-[13px]",
          value && "border-ink-3 bg-surface-hover font-medium text-ink",
        )}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238f8d98' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
      >
        {children}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-3 shadow-panel md:flex-row md:items-center">
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
          strokeWidth={1.75}
        />
        <input
          ref={searchRef}
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search description, category, account or amount"
          aria-label="Search transactions"
          className={cn(controlClass, "h-9 pr-9 pl-9 text-[13px]")}
        />
        {pending && (
          <LoaderCircle
            aria-hidden
            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-ink-3"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
        {select(
          "month",
          "Period",
          range ? RANGE : values.month,
          <>
            {range && <option value={RANGE}>{rangeLabel(range)}</option>}
            <option value="">All time</option>
            {options.months.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </>,
        )}
        {select(
          "account",
          "Account",
          values.account,
          <>
            <option value="">All accounts</option>
            {options.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </>,
        )}
        {select(
          "category",
          "Category",
          values.category,
          <>
            <option value="">All categories</option>
            {options.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </>,
        )}
        {select(
          "type",
          "Type",
          values.type,
          <>
            <option value="">All types</option>
            {ACTIVITY_TYPE_FILTERS.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </>,
        )}
        {active && (
          <Button
            variant="ghost"
            size="sm"
            icon={<X className="size-3.5" />}
            onClick={() =>
              apply({ q: "", account: "", category: "", type: "", month: "", from: "", to: "" })
            }
            className="col-span-2"
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
