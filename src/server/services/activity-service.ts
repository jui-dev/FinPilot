import { addDays, monthRange, type CalendarDate, type YearMonth } from "@/domain/calendar-date";
import type { AccountType } from "@/domain/ledger/accounts";
import type { TransactionType } from "@/domain/ledger/transactions";
import { add, money, negate, parseMoney, ZERO, type Money } from "@/domain/money";
import type { ServiceContext } from "@/server/context";
import * as q from "@/server/repositories/activity-queries";

/**
 * The Activity read model: the searchable list of ledger events. A group (a
 * transfer plus its fee) is one event; everything shown is derived from active
 * rows in explicit business order — (occurred_on, sequence), newest first.
 */

export interface AccountRef {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
}

export interface ActivityRow {
  readonly id: string;
  readonly sequence: number;
  readonly type: TransactionType;
  readonly occurredOn: CalendarDate;
  /** Signed effect on `account` in minor units (as stored). */
  readonly amount: Money;
  readonly account: AccountRef;
  readonly counterAccount: AccountRef | null;
  readonly category: { readonly id: string; readonly name: string } | null;
  readonly refundOfId: string | null;
  readonly groupId: string | null;
  readonly description: string | null;
  readonly note: string | null;
}

export interface ActivityItem {
  /** Stable key: the group id, or the row id for a single row. */
  readonly key: string;
  readonly occurredOn: CalendarDate;
  readonly primary: ActivityRow;
  /** The fee recorded together with a transfer. */
  readonly fee: ActivityRow | null;
  /** For a linked refund: the expense it refunds. */
  readonly refundOf: ActivityRow | null;
}

export const ACTIVITY_TYPE_FILTERS = ["expense", "income", "transfer", "refund"] as const;
export type ActivityTypeFilter = (typeof ACTIVITY_TYPE_FILTERS)[number];

export interface ActivityFilters {
  readonly text?: string;
  readonly accountId?: string;
  readonly categoryId?: string;
  readonly type?: ActivityTypeFilter;
  readonly month?: YearMonth;
}

export interface Activity {
  readonly items: ActivityItem[];
  /** Totals over the rows shown: spending (expenses net of refunds) and income. */
  readonly summary: { readonly spending: Money; readonly income: Money };
}

function toRow(r: q.ActivityRecord): ActivityRow {
  return {
    id: r.id,
    sequence: r.sequence,
    type: r.type,
    occurredOn: r.occurredOn as CalendarDate,
    amount: money(r.amountMinor),
    account: { id: r.accountId, name: r.accountName, type: r.accountType },
    counterAccount:
      r.counterAccountId && r.counterAccountName && r.counterAccountType
        ? { id: r.counterAccountId, name: r.counterAccountName, type: r.counterAccountType }
        : null,
    category: r.categoryId && r.categoryName ? { id: r.categoryId, name: r.categoryName } : null,
    refundOfId: r.refundOfId,
    groupId: r.groupId,
    description: r.description,
    note: r.note,
  };
}

const newestFirst = (a: ActivityItem, b: ActivityItem) =>
  a.occurredOn !== b.occurredOn
    ? a.occurredOn < b.occurredOn
      ? 1
      : -1
    : b.primary.sequence - a.primary.sequence;

/** Turns rows into events: group members fold into one item (the transfer leads, the fee follows). */
function toItems(ctx: ServiceContext, rows: ActivityRow[]): ActivityItem[] {
  const groupIds = [...new Set(rows.map((r) => r.groupId).filter((g): g is string => g !== null))];
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const member of q.groupMembers(ctx.db, ctx.ownerId, groupIds)) {
    if (!byId.has(member.id)) byId.set(member.id, toRow(member));
  }

  const events = new Map<string, ActivityRow[]>();
  for (const row of byId.values()) {
    const key = row.groupId ?? row.id;
    events.set(key, [...(events.get(key) ?? []), row]);
  }

  const refundTargets = new Map(
    q
      .recordsById(
        ctx.db,
        ctx.ownerId,
        [...byId.values()].map((r) => r.refundOfId).filter((id): id is string => id !== null),
      )
      .map((r) => [r.id, toRow(r)]),
  );

  const items: ActivityItem[] = [];
  for (const [key, members] of events) {
    members.sort((a, b) => a.sequence - b.sequence);
    const primary = members.find((m) => m.type === "transfer") ?? members[0]!;
    const fee = members.find((m) => m !== primary) ?? null;
    items.push({
      key,
      occurredOn: primary.occurredOn,
      primary,
      fee,
      refundOf: primary.refundOfId ? (refundTargets.get(primary.refundOfId) ?? null) : null,
    });
  }
  return items.sort(newestFirst);
}

function summarize(items: readonly ActivityItem[]): Activity["summary"] {
  let spending = ZERO;
  let income = ZERO;
  for (const item of items) {
    for (const row of [item.primary, item.fee]) {
      if (!row) continue;
      if (row.type === "expense" || row.type === "refund")
        spending = add(spending, negate(row.amount));
      if (row.type === "income") income = add(income, row.amount);
    }
  }
  return { spending, income };
}

/** The Activity list for the given filters. Free text also matches a typed amount. */
export async function getActivity(
  ctx: ServiceContext,
  filters: ActivityFilters = {},
): Promise<Activity> {
  const text = filters.text?.trim() || undefined;
  const typedAmount = text ? parseMoney(text) : null;
  const rows = q
    .searchActivity(ctx.db, ctx.ownerId, {
      text,
      amountMinor:
        typedAmount?.ok && typedAmount.value > 0 ? (typedAmount.value as number) : undefined,
      accountId: filters.accountId,
      categoryId: filters.categoryId,
      types: filters.type ? [filters.type] : undefined,
      range: filters.month ? monthRange(filters.month) : undefined,
    })
    .map(toRow);
  const items = toItems(ctx, rows);
  return { items, summary: summarize(items) };
}

/** One event (with its group and refund target), for editing. */
export async function getActivityItem(
  ctx: ServiceContext,
  id: string,
): Promise<ActivityItem | null> {
  const rows = q.recordsById(ctx.db, ctx.ownerId, [id]).map(toRow);
  return toItems(ctx, rows)[0] ?? null;
}

/** Months that contain activity, newest first (for the period filter). */
export async function getActivityMonths(ctx: ServiceContext): Promise<YearMonth[]> {
  return q.activityMonths(ctx.db, ctx.ownerId) as YearMonth[];
}

// ---------------------------------------------------------------------------
// Quick Add defaults: remembered from the ledger itself (no extra state).
// ---------------------------------------------------------------------------

export interface EntryDefaults {
  readonly expense: { readonly accountId: string; readonly categoryId: string | null } | null;
  readonly income: { readonly accountId: string; readonly categoryId: string | null } | null;
  readonly transfer: {
    readonly accountId: string;
    readonly counterAccountId: string | null;
  } | null;
  /** Most used categories over the last 90 days, most used first. */
  readonly frequentCategoryIds: { readonly expense: string[]; readonly income: string[] };
}

export const FREQUENT_CATEGORY_WINDOW_DAYS = 90;

export async function getEntryDefaults(ctx: ServiceContext): Promise<EntryDefaults> {
  const since = addDays(ctx.clock.today(), -FREQUENT_CATEGORY_WINDOW_DAYS);
  const last = (type: TransactionType) => q.lastRecorded(ctx.db, ctx.ownerId, type) ?? null;
  const usage = (type: TransactionType) =>
    q
      .categoryUsage(ctx.db, ctx.ownerId, type, since)
      .map((r) => r.categoryId)
      .filter((id): id is string => id !== null);
  const expense = last("expense");
  const income = last("income");
  const transfer = last("transfer");
  return {
    expense: expense ? { accountId: expense.accountId, categoryId: expense.categoryId } : null,
    income: income ? { accountId: income.accountId, categoryId: income.categoryId } : null,
    transfer: transfer
      ? { accountId: transfer.accountId, counterAccountId: transfer.counterAccountId }
      : null,
    frequentCategoryIds: { expense: usage("expense"), income: usage("income") },
  };
}
