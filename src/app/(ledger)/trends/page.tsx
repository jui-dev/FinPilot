import type { Metadata } from "next";
import Link from "next/link";

import { getRequestContext } from "@/app/_server/context";
import { CARD } from "@/components/cash-flow/labels";
import { monthLabel } from "@/components/format";
import { AreaSwitch, CASH_FLOW_AREA } from "@/components/shell/area-switch";
import { monthsCount } from "@/components/trends/describe";
import { MonthByMonth } from "@/components/trends/month-by-month";
import { RangeSwitch } from "@/components/trends/range-switch";
import { TrendTotals } from "@/components/trends/totals";
import { TrendWhatChanged } from "@/components/trends/what-changed";
import { buttonClass, linkClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/panel";
import { yearMonthOf } from "@/domain/calendar-date";
import { MIN_TREND_MONTHS } from "@/domain/ledger/trends";
import { getTrends } from "@/server/services/analysis-service";

export const metadata: Metadata = { title: "Trends" };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Money across complete months, in three answers, each once: how the months
 * add up (one equation), how each month went (its bars and exact figures in
 * one place), and why the recent half differs from the earlier one. The current month
 * is Cash flow's. Every figure is the Trends read model's; the components
 * only lay it out.
 */
export default async function TrendsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const request = await getRequestContext();
  if (!request.ok) return null;
  const { ctx } = request;
  const params = await searchParams;
  const requested = typeof params.range === "string" ? params.range : undefined;

  const { length, months, change } = await getTrends(ctx, requested);
  const currentMonth = yearMonthOf(ctx.clock.today());

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <header className="min-w-0">
          <h1 className="text-title font-bold text-navy">Trends</h1>
          <p className="mt-1 text-body text-ink-2">
            How your money moved across complete months.{" "}
            <Link href="/cash-flow" className={cn("text-ocean", linkClass)}>
              {monthLabel(currentMonth).split(" ")[0]} so far is on Cash flow
            </Link>
            .
          </p>
        </header>
        <div className="flex flex-wrap items-center gap-3">
          <AreaSwitch area={CASH_FLOW_AREA} current="/trends" />
          <RangeSwitch current={length} />
        </div>
      </div>

      {months.length < MIN_TREND_MONTHS ? (
        <section aria-label="Trends" className={CARD}>
          <EmptyState
            title={`Trends needs ${MIN_TREND_MONTHS} complete months`}
            action={
              <Link href="/cash-flow" className={buttonClass("secondary", "sm")}>
                Go to Cash flow
              </Link>
            }
          >
            {months.length === 0
              ? "No month is complete yet."
              : `So far there ${months.length === 1 ? "is" : "are"} ${monthsCount(months.length)}.`}{" "}
            Until then, each month is on Cash flow.
          </EmptyState>
        </section>
      ) : (
        <>
          {months.length < length && (
            <p className="-mt-2 text-body text-ink-2">
              Only {monthsCount(months.length)} are complete so far, so all of them are shown.
            </p>
          )}
          <TrendTotals months={months} />
          <MonthByMonth months={months} currentMonth={currentMonth} />
          {change && <TrendWhatChanged change={change} />}
        </>
      )}
    </div>
  );
}
