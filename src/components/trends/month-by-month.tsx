import { ChevronRight } from "lucide-react";
import Link from "next/link";

import type { YearMonth } from "@/domain/calendar-date";
import type { TrendMonth } from "@/server/services/analysis-service";

import { cashFlowHref } from "../activity/links";
import { CARD } from "../cash-flow/labels";
import { monthLabel } from "../format";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";

/**
 * "What exactly happened in each month?" (Trends). The exact record behind
 * the journey, newest first, each month opening its own Cash flow page. A
 * compact table from md up; on phones the same months as calm rows (month,
 * Left over, then in and out), never the table squeezed. A month in the minus
 * says so in words beside its signed figure.
 */
export function MonthByMonth({
  months,
  currentMonth,
  className,
}: {
  readonly months: readonly TrendMonth[];
  readonly currentMonth: YearMonth;
  readonly className?: string;
}) {
  const newestFirst = [...months].reverse();
  const overTag = (
    <span className="rounded-full border border-ocean px-1.5 text-micro font-semibold text-ocean">
      More went out
    </span>
  );
  return (
    <section aria-labelledby="trends-months" className={cn(CARD, "overflow-clip", className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 pt-5 md:px-6">
        <h2 id="trends-months" className="text-heading font-bold text-navy">
          Month by month
        </h2>
        <p className="text-body text-ink-2">Each month opens on Cash flow</p>
      </header>

      <table className="mt-3 hidden w-full md:table">
        <thead>
          <tr className="border-b border-line text-meta text-ink-2">
            <th scope="col" className="py-2 pl-6 text-left font-semibold">
              Month
            </th>
            <th scope="col" className="py-2 pr-6 text-right font-semibold">
              Came in
            </th>
            <th scope="col" className="py-2 pr-6 text-right font-semibold">
              Went out
            </th>
            <th scope="col" className="py-2 pr-6 text-right font-semibold">
              Left over
            </th>
            <th scope="col" className="w-10">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {newestFirst.map((m) => (
            <tr
              key={m.month}
              className="relative border-b border-line transition-colors last:border-b-0 hover:bg-surface-hover"
            >
              <th scope="row" className="py-3 pl-6 text-left font-semibold">
                {/* The month opens its Cash flow page; the link stretches over the row. */}
                <Link
                  href={cashFlowHref(m.month, currentMonth)}
                  className="after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-ocean"
                >
                  {monthLabel(m.month)}
                </Link>
              </th>
              <td className="py-3 pr-6 text-right">
                <Money amount={m.income} />
              </td>
              <td className="py-3 pr-6 text-right">
                <Money amount={m.spending} />
              </td>
              <td className="py-3 pr-6 text-right">
                <span className="inline-flex items-center gap-2">
                  {m.leftOver < 0 && overTag}
                  <Money
                    amount={m.leftOver}
                    className={cn("font-bold", m.leftOver < 0 ? "text-ink" : "text-navy")}
                  />
                </span>
              </td>
              <td className="pr-4 text-ink-3">
                <ChevronRight aria-hidden className="size-4" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul aria-label="Months" className="mt-2 md:hidden">
        {newestFirst.map((m) => (
          <li key={m.month} className="border-b border-line last:border-b-0">
            <Link
              href={cashFlowHref(m.month, currentMonth)}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-5 py-3 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ocean"
            >
              <span className="font-semibold text-ink">{monthLabel(m.month)}</span>
              <ChevronRight aria-hidden className="row-span-3 size-4 text-ink-3" />
              <span className="mt-1 flex flex-wrap items-center gap-2 text-body text-ink-2">
                Left over
                <Money
                  amount={m.leftOver}
                  className={cn(
                    "text-heading font-bold",
                    m.leftOver < 0 ? "text-ink" : "text-navy",
                  )}
                />
                {m.leftOver < 0 && overTag}
              </span>
              <span className="mt-0.5 text-meta text-ink-2">
                In <Money amount={m.income} /> · Out <Money amount={m.spending} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
