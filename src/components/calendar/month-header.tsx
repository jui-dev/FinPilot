import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { yearMonthOf, type YearMonth } from "@/domain/calendar-date";
import type { MonthCalendar } from "@/server/services/calendar-service";

import { cashFlowHref } from "../activity/links";
import { CARD } from "../cash-flow/labels";
import { monthLabel } from "../format";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { calendarHref, dayMonth } from "./describe";

/** The month shown, with the months either side that can be shown. */
export function CalendarMonthSwitcher({ calendar }: { readonly calendar: MonthCalendar }) {
  const { months, month } = calendar;
  const index = months.indexOf(month);
  return (
    <div className={cn(CARD, "flex items-center p-1")}>
      <MonthLink month={months[index + 1]} direction="previous" />
      <h2
        id="calendar-month"
        className="min-w-0 flex-1 px-2 text-center text-heading font-bold text-navy md:w-48 md:flex-none"
      >
        {monthLabel(month)}
      </h2>
      <MonthLink month={index > 0 ? months[index - 1] : undefined} direction="next" />
    </div>
  );
}

function MonthLink({
  month,
  direction,
}: {
  readonly month: YearMonth | undefined;
  readonly direction: "previous" | "next";
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const name = direction === "previous" ? "Previous month" : "Next month";
  const className =
    "grid size-10 shrink-0 place-items-center rounded-control text-navy transition-colors";
  if (!month) {
    return (
      <span aria-disabled="true" aria-label={name} className={cn(className, "opacity-30")}>
        <Icon aria-hidden className="size-5" />
      </span>
    );
  }
  return (
    <Link
      href={calendarHref(month)}
      aria-label={`${name}: ${monthLabel(month)}`}
      className={cn(className, "hover:bg-mist")}
    >
      <Icon aria-hidden className="size-5" />
    </Link>
  );
}

/**
 * The month in one quiet line: what was recorded (Cash flow's figures, to
 * date) and, apart from it, what is known to fall due. A future month has no
 * recorded money, only its payments due.
 */
export function MonthLine({ calendar }: { readonly calendar: MonthCalendar }) {
  const { summary, due, when, month, today, horizon } = calendar;
  const lastScheduledMonth = yearMonthOf(horizon) === month;
  return (
    <section
      aria-label="The month"
      className={cn(CARD, "flex flex-wrap items-baseline gap-x-7 gap-y-2 px-5 py-3.5")}
    >
      <p className="w-full font-semibold text-navy md:w-auto">
        {when === "current" ? `${monthLabel(month).split(" ")[0]} so far` : monthLabel(month)}
      </p>
      {summary ? (
        <dl className="contents">
          <Pair term="Came in">
            <Money amount={summary.income} sign={summary.income > 0 ? "always" : "negative"} />
          </Pair>
          <Pair term="Went out">
            <Money amount={summary.spending} />
          </Pair>
        </dl>
      ) : (
        <p className="text-body text-ink-2">Nothing has come in or gone out yet</p>
      )}
      {(due.pendingCount > 0 || when === "future") && (
        <dl className="contents">
          <Pair
            term={
              when === "past"
                ? "Not paid or skipped"
                : when === "future"
                  ? "Due this month"
                  : "Still due this month"
            }
            navy
          >
            <Money amount={due.pendingTotal} />
            <span className="ml-1.5 text-meta font-normal text-ink-2">
              · {due.pendingCount === 1 ? "1 payment" : `${due.pendingCount} payments`}
            </span>
          </Pair>
        </dl>
      )}
      {lastScheduledMonth && (
        <p className="text-meta text-ink-2">Payments are scheduled through {dayMonth(horizon)}</p>
      )}
      {summary && (
        <Link
          href={cashFlowHref(month, yearMonthOf(today))}
          className="ml-auto inline-flex items-center text-meta font-medium text-ocean hover:underline"
        >
          Open in Cash flow
          <ChevronRight aria-hidden className="size-3.5" />
        </Link>
      )}
    </section>
  );
}

function Pair({
  term,
  navy = false,
  children,
}: {
  readonly term: string;
  readonly navy?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-meta text-ink-2">{term}</dt>
      <dd className={cn("text-figure font-bold", navy ? "text-navy" : "text-ink")}>{children}</dd>
    </div>
  );
}
