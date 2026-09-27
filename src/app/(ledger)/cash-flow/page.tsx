import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { MonthSwitcher } from "@/components/cash-flow/month-switcher";
import { Summary } from "@/components/cash-flow/summary";
import { WhatChanged } from "@/components/cash-flow/what-changed";
import { WhereItWent } from "@/components/cash-flow/where-it-went";
import { monthLabel } from "@/components/format";
import { getMonthlyCashFlow } from "@/server/services/analysis-service";

export const metadata: Metadata = { title: "Cash flow" };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * One month's cash flow, read in order: the month, what was left over, the
 * income and spending it came from, where the spending went, and why it
 * changed. Every figure is the domain's; the components only lay it out.
 */
export default async function CashFlowPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const request = await getRequestContext();
  if (!request.ok) return null;
  const { ctx } = request;
  const params = await searchParams;
  const requested = typeof params.month === "string" ? params.month : undefined;

  const { period, months, summary, composition, change } = await getMonthlyCashFlow(ctx, requested);
  const index = months.indexOf(period.month);

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-title font-bold text-navy">Cash flow</h1>
          <p className="mt-1 text-body text-ink-2">What came in, and where it went.</p>
        </div>
        <MonthSwitcher
          period={period}
          previous={months[index + 1]}
          next={index > 0 ? months[index - 1] : undefined}
          current={months[0]!}
        />
      </header>

      <Summary summary={summary} range={period.range} />

      <div className="grid items-start gap-5 lg:grid-cols-12">
        <WhereItWent
          composition={composition}
          range={period.range}
          monthName={monthLabel(period.month)}
          runningMonth={period.kind === "month_to_date"}
          className="lg:col-span-7"
        />
        <WhatChanged change={change} period={period} className="lg:col-span-5" />
      </div>
    </div>
  );
}
