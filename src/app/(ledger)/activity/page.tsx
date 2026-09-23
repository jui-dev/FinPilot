import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { ActivityFilters } from "@/components/activity/activity-filters";
import { ActivityList } from "@/components/activity/activity-list";
import { TransactionPanel } from "@/components/activity/transaction-panel";
import { Money } from "@/components/ui/money";
import { EmptyState, PageHeader, Panel } from "@/components/ui/panel";
import type { YearMonth } from "@/domain/calendar-date";
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
  const month = (months as readonly string[]).includes(text(params.month))
    ? text(params.month)
    : "";

  const [activity, selected] = await Promise.all([
    getActivity(ctx, {
      text: q || undefined,
      accountId: account || undefined,
      categoryId: category || undefined,
      type: type || undefined,
      month: (month as YearMonth) || undefined,
    }),
    params.tx ? getActivityItem(ctx, text(params.tx)) : Promise.resolve(null),
  ]);

  const filtering = Boolean(q || account || category || type || month);
  const hrefFor = (id: string) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, account, category, type, month })) {
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
        values={{ q, account, category, type, month }}
      />

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3 text-[13px] text-ink-2 md:px-5">
          <span>
            {activity.items.length} {activity.items.length === 1 ? "entry" : "entries"}
            {filtering ? " in this view" : ""}
          </span>
          <span className="flex flex-wrap items-baseline gap-x-5">
            <span>
              Spent{" "}
              <Money
                amount={activity.summary.spending}
                sign="none"
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
