import {
  addDays,
  monthRange,
  yearMonthOf,
  type CalendarDate,
  type DateRange,
  type YearMonth,
} from "@/domain/calendar-date";
import { monthWeeks, type Weekday } from "@/domain/calendar-weeks";
import { materialisedThrough, type OccurrenceDisplayState } from "@/domain/commitments/occurrences";
import {
  calendarMonths,
  moneyOver,
  NO_MONEY,
  selectedDay,
  weekTotals,
  type DayMoney,
} from "@/domain/ledger/calendar";
import { cashFlowPeriod, summarizeCashFlow } from "@/domain/ledger/cash-flow";
import { money, sum, type Money } from "@/domain/money";
import type { ServiceContext } from "@/server/context";
import * as ledgerQueries from "@/server/repositories/ledger-queries";
import { checkpointsInRange } from "@/server/repositories/reconciliation-queries";
import { getActivity, type ActivityRow } from "@/server/services/activity-service";
import { getOccurrences, type OccurrenceView } from "@/server/services/commitment-service";
import { getAccounts } from "@/server/services/setup-service";

/**
 * The Calendar read model: when money moved, and when payments fall due, one
 * month at a time. Income and spending are the ledger's own (Cash flow's
 * meaning, derived on read); payments due are the commitment occurrences as
 * they exist, never invented beyond the materialisation horizon. Transfers,
 * adjustments, payment expectations and verifications are shown as evidence
 * and never enter a total.
 */

export interface CalendarDue {
  readonly occurrenceId: string;
  readonly commitmentId: string;
  readonly name: string;
  readonly dueOn: CalendarDate;
  readonly expectedAmount: Money;
  readonly display: OccurrenceDisplayState;
  /** The ledger payment and its own date, which need not be the due date. */
  readonly payment: {
    readonly amount: Money;
    readonly paidOn: CalendarDate;
    readonly transactionId: string;
  } | null;
}

export interface CalendarDay {
  readonly date: CalendarDate;
  /** Null after today: nothing can have happened yet. */
  readonly money: DayMoney | null;
  readonly dues: readonly CalendarDue[];
  /** How much evidence the day holds, for a quick read of it. */
  readonly counts: {
    /** Income, expense and refund rows (a transfer's fee is one). */
    readonly entries: number;
    readonly moved: number;
    readonly adjustments: number;
    readonly verifications: number;
  };
  /** False after the materialisation horizon: payments due there are not known yet. */
  readonly scheduled: boolean;
}

export interface CalendarWeekTotals extends DayMoney {
  /** Half-open, clipped to the month. */
  readonly range: DateRange;
}

export interface CalendarVerification {
  readonly accountId: string;
  readonly accountName: string;
  readonly statedBalance: Money;
  /** The adjustment it posted; null when the count matched. */
  readonly adjustment: { readonly transactionId: string; readonly amount: Money } | null;
  /** The account's entries from its opening through the counted day: what the count covered. */
  readonly reviewRange: DateRange;
}

export interface CalendarDayDetail {
  readonly date: CalendarDate;
  readonly money: DayMoney | null;
  /** Income, expenses (fees included) and refunds, in business order. */
  readonly entries: readonly ActivityRow[];
  /** Transfers between accounts, card payments among them: never income or spending. */
  readonly moved: readonly ActivityRow[];
  /** Reconciliation adjustments: never income or spending. */
  readonly adjustments: readonly ActivityRow[];
  readonly dues: readonly CalendarDue[];
  readonly verifications: readonly CalendarVerification[];
  readonly scheduled: boolean;
}

export interface MonthCalendar {
  readonly month: YearMonth;
  readonly today: CalendarDate;
  /** Payments due are known through this day, inclusive. */
  readonly horizon: CalendarDate;
  readonly weekStartsOn: Weekday;
  /** Every month that can be shown, newest first. */
  readonly months: readonly YearMonth[];
  readonly when: "past" | "current" | "future";
  /** The recorded money: Cash flow's figures for the month (to date); null for a future month. */
  readonly summary: {
    readonly range: DateRange;
    readonly income: Money;
    readonly spending: Money;
    readonly leftOver: Money;
  } | null;
  /** The payments due in the month and what is still pending of them. */
  readonly due: {
    readonly occurrences: readonly CalendarDue[];
    readonly pendingCount: number;
    readonly pendingTotal: Money;
  };
  readonly days: readonly CalendarDay[];
  readonly weeks: readonly CalendarWeekTotals[];
  readonly selected: CalendarDate | null;
  readonly detail: CalendarDayDetail | null;
}

const toDue = (o: OccurrenceView): CalendarDue => ({
  occurrenceId: o.id,
  commitmentId: o.commitmentId,
  name: o.name,
  dueOn: o.dueOn,
  expectedAmount: o.expectedAmount,
  display: o.display,
  payment:
    o.payment && o.transactionId
      ? { amount: o.payment.amount, paidOn: o.payment.paidOn, transactionId: o.transactionId }
      : null,
});

const MONEY_TYPES = new Set(["income", "expense", "refund"]);
const PENDING = new Set<OccurrenceDisplayState>(["upcoming", "due_today", "overdue"]);

/**
 * One month of the Calendar. `requestedMonth` ("YYYY-MM") and `requestedDay`
 * ("YYYY-MM-DD") are untrusted: a month that cannot be shown falls back to the
 * current one, and a day outside the month to the default (today in the
 * current month, none otherwise). `weekStartsOn` is the calendar convention
 * the weeks follow; it never changes a day's or the month's figures.
 */
export async function getMonthCalendar(
  ctx: ServiceContext,
  weekStartsOn: Weekday,
  requestedMonth?: string,
  requestedDay?: string,
): Promise<MonthCalendar> {
  const today = ctx.clock.today();
  const horizon = materialisedThrough(today);
  const accounts = await getAccounts(ctx);
  const openedOn = new Map(accounts.map((a) => [a.id, a.openedOn as CalendarDate]));
  const earliest = accounts.reduce<CalendarDate | null>(
    (min, a) => (min === null || a.openedOn < min ? (a.openedOn as CalendarDate) : min),
    null,
  );
  const months = calendarMonths(earliest, today, horizon);
  const current = yearMonthOf(today);
  const month = months.find((m) => m === requestedMonth) ?? current;
  const when = month < current ? "past" : month === current ? "current" : "future";
  const whole = monthRange(month);
  // Money only up to today, exactly as Cash flow reads the month.
  const recorded = when === "future" ? null : cashFlowPeriod(month, today).range;

  const [daily, rows, occurrences, checkpoints] = await Promise.all([
    recorded ? ledgerQueries.dailyIncomeAndSpending(ctx.db, ctx.ownerId, recorded) : [],
    recorded ? ledgerQueries.listTransactions(ctx.db, ctx.ownerId, recorded) : [],
    getOccurrences(ctx),
    checkpointsInRange(ctx.db, ctx.ownerId, whole),
  ]);

  const byDay = new Map<CalendarDate, DayMoney>(
    daily.map((d) => [
      d.occurredOn as CalendarDate,
      { income: money(d.incomeMinor), spending: money(d.spendingMinor) },
    ]),
  );
  const dues = occurrences.filter((o) => yearMonthOf(o.dueOn) === month).map(toDue);
  const count = (day: CalendarDate, test: (type: string) => boolean) =>
    rows.filter((r) => r.occurredOn === day && test(r.type)).length;

  const days: CalendarDay[] = [];
  for (let day = whole.start; day < whole.end; day = addDays(day, 1)) {
    days.push({
      date: day,
      money: day > today ? null : (byDay.get(day) ?? NO_MONEY),
      dues: dues.filter((d) => d.dueOn === day),
      counts: {
        entries: count(day, (t) => MONEY_TYPES.has(t)),
        moved: count(day, (t) => t === "transfer"),
        adjustments: count(day, (t) => t === "adjustment"),
        verifications: checkpoints.filter((c) => c.asOf === day).length,
      },
      scheduled: day <= horizon,
    });
  }

  const pending = dues.filter((d) => PENDING.has(d.display));
  const summary = recorded
    ? (() => {
        const { income, spending } = moneyOver(byDay, recorded);
        // The amounts only: the Calendar shows no rate.
        const { leftOver } = summarizeCashFlow(income, spending);
        return { range: recorded, income, spending, leftOver };
      })()
    : null;

  const selected = selectedDay(requestedDay, month, today);
  let detail: CalendarDayDetail | null = null;
  if (selected) {
    const range = { start: selected, end: addDays(selected, 1) };
    const activity = selected > today ? null : await getActivity(ctx, { range });
    // A transfer and its fee are one Activity event; here the fee is spending
    // and the transfer is not, so each row goes where its own type belongs.
    const dayRows = (activity?.items ?? [])
      .flatMap((i) => (i.fee ? [i.primary, i.fee] : [i.primary]))
      .sort((a, b) => a.sequence - b.sequence);
    const day = days.find((d) => d.date === selected)!;
    detail = {
      date: selected,
      money: day.money,
      entries: dayRows.filter((r) => MONEY_TYPES.has(r.type)),
      moved: dayRows.filter((r) => r.type === "transfer"),
      adjustments: dayRows.filter((r) => r.type === "adjustment"),
      dues: day.dues,
      verifications: checkpoints
        .filter((c) => c.asOf === selected)
        .map((c) => ({
          accountId: c.accountId,
          accountName: c.accountName,
          statedBalance: money(c.statedBalanceMinor),
          adjustment:
            c.adjustmentId !== null && c.adjustmentAmountMinor !== null
              ? { transactionId: c.adjustmentId, amount: money(c.adjustmentAmountMinor) }
              : null,
          reviewRange: { start: openedOn.get(c.accountId) ?? selected, end: addDays(selected, 1) },
        })),
      scheduled: day.scheduled,
    };
  }

  return {
    month,
    today,
    horizon,
    weekStartsOn,
    months,
    when,
    summary,
    due: {
      occurrences: dues,
      pendingCount: pending.length,
      pendingTotal: sum(pending.map((d) => d.expectedAmount)),
    },
    days,
    weeks: weekTotals(byDay, monthWeeks(month, weekStartsOn)),
    selected,
    detail,
  };
}
