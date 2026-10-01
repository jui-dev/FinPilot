import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import type { YearMonth } from "@/domain/calendar-date";
import type { CashFlowPeriod } from "@/domain/ledger/cash-flow";

import { cashFlowHref } from "../activity/links";
import { monthLabel } from "../format";
import { cn } from "../ui/cn";
import { CARD, periodNote } from "./labels";

/**
 * The month being read, with the months either side, and whether it is still
 * running (month to date) or complete. The month's name labels the summary.
 */
export function MonthSwitcher({
  period,
  previous,
  next,
  current,
}: {
  readonly period: CashFlowPeriod;
  readonly previous: YearMonth | undefined;
  readonly next: YearMonth | undefined;
  readonly current: YearMonth;
}) {
  const running = period.kind === "month_to_date";
  return (
    // One control: the month and whether it is still running, between its neighbours.
    <div className={cn(CARD, "flex items-center p-1")}>
      <MonthLink month={previous} current={current} direction="previous" />
      <div className="min-w-0 flex-1 px-2 text-center md:w-44 md:flex-none">
        <h2 id="cash-flow-period" className="text-body leading-tight font-bold text-navy">
          {monthLabel(period.month)}
        </h2>
        <p
          className={cn(
            "inline-flex items-center gap-1.5 text-micro font-medium",
            running ? "text-ocean" : "text-ink-2",
          )}
        >
          {running && <span aria-hidden className="size-1.5 rounded-full bg-ocean" />}
          {periodNote(period)}
        </p>
      </div>
      <MonthLink month={next} current={current} direction="next" />
    </div>
  );
}

function MonthLink({
  month,
  current,
  direction,
}: {
  readonly month: YearMonth | undefined;
  readonly current: YearMonth;
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
      href={cashFlowHref(month, current)}
      aria-label={`${name}: ${monthLabel(month)}`}
      className={cn(className, "hover:bg-mist")}
    >
      <Icon aria-hidden className="size-5" />
    </Link>
  );
}
