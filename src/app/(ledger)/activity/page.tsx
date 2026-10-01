import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { ActivityFilters } from "@/components/activity/activity-filters";
import { ActivityList } from "@/components/activity/activity-list";
import { ActivityScope } from "@/components/activity/activity-scope";
import { PAGE_SIZE, Pagination } from "@/components/activity/pagination";
import { cashFlowHref, cashFlowMonthOf } from "@/components/activity/links";
import { TransactionPanel } from "@/components/activity/transaction-panel";
import { monthLabel, rangeLabel } from "@/components/format";
import { EmptyState } from "@/components/ui/panel";
import { ACTIVITY_AREA, AreaSwitch } from "@/components/shell/area-switch";
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
  // What the list and its totals cover (the workspace's heading).
  const scope = [
    accounts.find((a) => a.id === account)?.name,
    categories.find((c) => c.id === category)?.name,
    range ? rangeLabel(range) : month ? monthLabel(month) : "all time",
  ].filter((part): part is string => Boolean(part));
  // The page: untrusted too, so a whole number within the view's pages, else the first.
  const total = activity.items.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const asked = Number(text(params.page));
  const page = Number.isInteger(asked) && asked >= 1 && asked <= pages ? asked : 1;
  const shown = activity.items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /** This view's URL, with a page and an open transaction when given. */
  const viewHref = (extra: { readonly page?: number; readonly tx?: string }) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, account, category, type, month, from, to })) {
      if (value) next.set(key, value);
    }
    if (extra.page && extra.page > 1) next.set("page", String(extra.page));
    if (extra.tx) next.set("tx", extra.tx);
    const query = next.toString();
    return query ? `/activity?${query}` : "/activity";
  };
  // A transaction opens over the page it is on, which stays where it was.
  const hrefFor = (id: string) => viewHref({ page, tx: id });

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <header className="min-w-0">
          <h1 className="text-title font-bold text-navy">Activity</h1>
          <p className="mt-1 text-body text-ink-2">Every transaction, newest first.</p>
        </header>
        <AreaSwitch area={ACTIVITY_AREA} current="/activity" />
      </div>

      {/* One workspace in three cards, apart: the filters, what they select, then the rows. */}
      <section aria-labelledby="activity-scope" className="flex flex-col gap-4">
        <div className="rounded-panel border border-line-soft bg-surface shadow-card">
          <ActivityFilters
            options={{
              accounts: accounts
                .filter((a) => a.archivedAt === null || a.id === account)
                .map((a) => ({ id: a.id, name: a.name })),
              categories: categories
                .filter((c) => c.archivedAt === null || c.id === category)
                .map((c) => ({
                  id: c.id,
                  name: c.name,
                  kind: c.kind,
                  archived: c.archivedAt !== null,
                })),
              months,
            }}
            values={{ q, account, category, type, month, from, to }}
          />
        </div>

        <div className="overflow-clip rounded-panel border border-line-soft bg-surface shadow-card">
          <ActivityScope
            id="activity-scope"
            scope={scope}
            count={total}
            filtering={filtering}
            spending={activity.summary.spending}
            income={activity.summary.income}
            cashFlow={
              cashFlowMonth
                ? {
                    href: cashFlowHref(cashFlowMonth, yearMonthOf(today)),
                    label: monthLabel(cashFlowMonth),
                  }
                : null
            }
          />
        </div>

        {/* overflow-clip, not overflow-hidden: a hidden overflow makes the card the
            scroll container of the sticky day headers, so they neither stick nor sit
            in place. */}
        <div className="overflow-clip rounded-panel border border-line-soft bg-surface shadow-card">
          {activity.items.length === 0 ? (
            <div>
              <EmptyState
                title={filtering ? "Nothing matches these filters" : "No transactions yet"}
              >
                {filtering
                  ? "Try a different period, account or category."
                  : "Add your first one with the Add button, or press N."}
              </EmptyState>
            </div>
          ) : (
            <>
              <ActivityList
                items={shown}
                today={today}
                hrefFor={hrefFor}
                perspectiveAccountId={account || undefined}
                openId={selected?.primary.id}
              />
              <Pagination
                page={page}
                pages={pages}
                total={total}
                hrefFor={(p) => viewHref({ page: p })}
              />
            </>
          )}
        </div>
      </section>

      <TransactionPanel
        item={selected}
        today={today}
        accounts={accounts
          .filter((a) => a.archivedAt === null || a.id === selected?.primary.account.id)
          .map((a) => ({ id: a.id, name: a.name, type: a.type }))}
        categories={categories
          .filter((c) => c.archivedAt === null || c.id === selected?.primary.category?.id)
          .map((c) => ({ id: c.id, name: c.name, kind: c.kind, archived: c.archivedAt !== null }))}
      />
    </div>
  );
}
