"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { inclusiveRange } from "@/domain/calendar-date";
import type { CategoryKind } from "@/domain/ledger/transactions";
import { ACTIVITY_TYPE_FILTERS } from "@/server/services/activity-service";

import { monthLabel, rangeLabel } from "../format";
import { cn } from "../ui/cn";
import { controlClass, Select } from "../ui/field";

export interface FilterOptions {
  readonly accounts: ReadonlyArray<{ id: string; name: string }>;
  readonly categories: ReadonlyArray<{
    id: string;
    name: string;
    kind: CategoryKind;
    /** Listed only while it is the chosen filter (e.g. a link from Cash flow). */
    archived?: boolean;
  }>;
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
  expense: "Expenses",
  income: "Income",
  transfer: "Transfers",
  refund: "Refunds",
};

const CATEGORY_GROUPS: ReadonlyArray<{ kind: CategoryKind; label: string }> = [
  { kind: "expense", label: "Expense Categories" },
  { kind: "income", label: "Income Categories" },
];

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
  // What the search field shows: the newest text typed, ahead of the URL.
  const [text, setText] = useState(values.q);
  const searchRef = useRef<HTMLInputElement>(null);
  const range = inclusiveRange(values.from, values.to);
  const active = Boolean(
    values.q || values.account || values.category || values.type || values.month || range,
  );

  // The filters most recently asked for. `values` (the URL) lags behind a
  // navigation still in flight, so every write builds on this instead: a
  // change made while another is pending, or a debounced search firing late,
  // composes with it rather than overwriting it. Once none of this bar's
  // navigations is pending, it follows the URL again, which also picks up
  // changes made elsewhere (Back, a link).
  const requested = useRef(values);
  useEffect(() => {
    if (pending) return;
    // The URL has caught up with everything this bar asked for. A search in it
    // that differs from the last one asked for came from elsewhere, and the
    // field follows it. One that matches is this bar's own request landing:
    // the field keeps whatever was typed since.
    if (values.q !== requested.current.q) setText(values.q);
    requested.current = values;
  }, [values, pending]);

  const apply = (changes: Partial<FilterValues>) => {
    const next = { ...requested.current, ...changes };
    requested.current = next;
    // A search set here (Clear) shows at once, not when its navigation lands.
    if (changes.q !== undefined) setText(changes.q);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    const query = params.toString();
    startTransition(() =>
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }),
    );
  };

  // Typing filters as you go, without a request per keystroke.
  useEffect(() => {
    if (text === requested.current.q) return;
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
    <label className="min-w-0 xl:w-40">
      <span className="sr-only">{label}</span>
      <Select
        value={value}
        onChange={(event) =>
          // A month (or all time) replaces any date range.
          apply(
            name === "month"
              ? { month: event.target.value, from: "", to: "" }
              : { [name]: event.target.value },
          )
        }
        controlSize="sm"
        selected={Boolean(value)}
        subtle
        className="min-w-0 max-md:h-10"
      >
        {children}
      </Select>
    </label>
  );

  return (
    // The workspace's toolbar band. Phones: search, then the filters two by
    // two. Tablets and small desktops: search on its own line, the four filters
    // in one row. Wide desktops: everything in one row, the search taking the
    // width the filters leave, so the controls read as one toolbar.
    <div className="flex flex-col gap-3 px-4 py-4 md:px-5 xl:flex-row xl:items-center xl:gap-2">
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
          className={cn(controlClass({ size: "sm", subtle: true }), "pr-9 pl-9 max-md:h-10")}
        />
        {pending && (
          <LoaderCircle
            aria-hidden
            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-ink-3"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-[repeat(4,minmax(0,1fr))_auto] xl:flex xl:items-center">
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
            {CATEGORY_GROUPS.map(({ kind, label }) => {
              const inKind = options.categories.filter((c) => c.kind === kind);
              return (
                inKind.length > 0 && (
                  <optgroup key={kind} label={label}>
                    {inKind.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.archived ? `${category.name} (archived)` : category.name}
                      </option>
                    ))}
                  </optgroup>
                )
              );
            })}
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
          // A ghost button at the controls' height (the shared small button is
          // 32px), so it sits on the same line as the selects beside it.
          <button
            type="button"
            onClick={() =>
              apply({ q: "", account: "", category: "", type: "", month: "", from: "", to: "" })
            }
            className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-control px-3 text-meta font-semibold whitespace-nowrap text-ink-2 transition-colors select-none hover:bg-surface-hover hover:text-ink md:col-span-1 md:h-9"
          >
            <X aria-hidden className="size-3.5" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
