import type { Metadata } from "next";
import Link from "next/link";

import { getRequestContext } from "@/app/_server/context";
import { ActivityFilters } from "@/components/activity/activity-filters";
import { ActivityList } from "@/components/activity/activity-list";
import { cashFlowHref, cashFlowMonthOf } from "@/components/activity/links";
import { TransactionPanel } from "@/components/activity/transaction-panel";
import { monthLabel, rangeLabel } from "@/components/format";
import { linkClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Money } from "@/components/ui/money";
import { EmptyState, PageHeader, Panel } from "@/components/ui/panel";
import { inclusiveRange, yearMonthOf, type YearMonth } from "@/domain/calendar-date";
import {
  ACTIVITY_TYPE_FILTERS,
  getActivity,
  getActivityItem,
  getActivityMonths,
  type ActivityTypeFilter,
} from "@/server/services/activity-service";
import { getAccounts, getCategories } from "@/server/services/setup-service";

export const metadata: Metadata = { title: "Activity" };

type SearchParams = Record<string, string | string[] | undefined>;

const text = (value: string | string[] | undefined): string =>
  typeof value === "string" ? value : "";

export default async function ActivityPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const request = await getRequestContext();
  if (!request.ok) return null;
  const { ctx, today } = request;
  const params = await searchParams;

  const [months, accounts, categories] = await Promise.all([
    getActivityMonths(ctx),
    getAccounts(ctx),
    getCategories(ctx),
  ]);

  // Everything from the URL is untrusted: keep only values that exist.
  const q = text(params.q);
  const account = accounts.some((a) => a.id === text(params.account)) ? text(params.account) : "";
  const category = categories.some((c) => c.id === text(params.category))
    ? text(params.category)
    : "";
  const type = (ACTIVITY_TYPE_FILTERS as readonly string[]).includes(text(params.type))
    ? (text(params.type) as ActivityTypeFilter)
    : "";
  // The period is either a range (from/to, both inclusive) or a month. A valid
  // range wins; an invalid or incomplete one falls back to the month, then to
  // all time.
  const range = inclusiveRange(params.from, params.to);
  const from = range ? text(params.from) : "";
  const to = range ? text(params.to) : "";
  const month =
    !range && (months as readonly string[]).includes(text(params.month)) ? text(params.month) : "";

  const [activity, selected] = await Promise.all([
    getActivity(ctx, {
      text: q || undefined,
      accountId: account || undefined,
      categoryId: category || undefined,
      type: type || undefined,
      month: (month as YearMonth) || undefined,
      range: range ?? undefined,
    }),
    params.tx ? getActivityItem(ctx, text(params.tx)) : Promise.resolve(null),
  ]);

  const filtering = Boolean(q || account || category || type || month || range);
  // A range with a Cash flow period's shape (and no account, which Cash flow
  // never filters by) can be opened there. Worded "Open", not "Back": where
  // the person came from is not tracked. Only months with activity qualify —
  // they always lie within Cash flow's selectable months, so the link never
  // lands on a different month than it names.
  const rangeMonth = range && !account ? cashFlowMonthOf(range) : null;
  const cashFlowMonth = rangeMonth && months.includes(rangeMonth) ? rangeMonth : null;
  const scope = range
    ? [
        accounts.find((a) => a.id === account)?.name,
        categories.find((c) => c.id === category)?.name,
        rangeLabel(range),
      ].filter(Boolean)
    : [];
  const hrefFor = (id: string) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, account, category, type, month, from, to })) {
      if (value) next.set(key, value);
    }
    next.set("tx", id);
    return `/activity?${next.toString()}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Activity"
        description="Every transaction, newest first. Filters stay in the address bar."
      />

      <ActivityFilters
        options={{
          accounts: accounts
            .filter((a) => a.archivedAt === null || a.id === account)
            .map((a) => ({ id: a.id, name: a.name })),
          categories: categories
            .filter((c) => c.archivedAt === null || c.id === category)
            .map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
          months,
        }}
        values={{ q, account, category, type, month, from, to }}
      />

      {range && (
        <p className="-mb-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-1 text-meta text-ink-2">
          <span>
            Showing <span className="font-medium text-ink">{scope.join(" · ")}</span>
          </span>
          {cashFlowMonth && (
            <Link
              href={cashFlowHref(cashFlowMonth, yearMonthOf(today))}
              className={cn("font-medium text-ink", linkClass)}
            >
              Open {monthLabel(cashFlowMonth)} in Cash flow
            </Link>
          )}
        </p>
      )}

      {/* overflow-clip, not overflow-hidden: a hidden overflow makes the panel the
          scroll container of the sticky day headers, so they neither stick nor sit
          in place. */}
      <Panel className="overflow-clip">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3 text-meta text-ink-2 md:px-5">
          <span>
            {activity.items.length} {activity.items.length === 1 ? "entry" : "entries"}
            {filtering ? " in this view" : ""}
          </span>
          <span className="flex flex-wrap items-baseline gap-x-5">
            <span>
              Spent{" "}
              <Money
                amount={activity.summary.spending}
                sign="negative"
                className="font-semibold text-ink"
              />
            </span>
            <span>
              Income{" "}
              <Money
                amount={activity.summary.income}
                sign="none"
                className="font-semibold text-ink"
              />
            </span>
          </span>
        </div>

        {activity.items.length === 0 ? (
          <EmptyState title={filtering ? "Nothing matches these filters" : "No transactions yet"}>
            {filtering
              ? "Try a different period, account or category."
              : "Add your first one with the Add button, or press N."}
          </EmptyState>
        ) : (
          <ActivityList
            items={activity.items}
            today={today}
            hrefFor={hrefFor}
            perspectiveAccountId={account || undefined}
          />
        )}
      </Panel>

      <TransactionPanel
        item={selected}
        today={today}
        accounts={accounts
          .filter((a) => a.archivedAt === null || a.id === selected?.primary.account.id)
          .map((a) => ({ id: a.id, name: a.name, type: a.type }))}
        categories={categories
          .filter((c) => c.archivedAt === null || c.id === selected?.primary.category?.id)
          .map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
      />
    </div>
  );
}
