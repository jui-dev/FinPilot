import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { MonthSwitcher } from "@/components/cash-flow/month-switcher";
import { Summary } from "@/components/cash-flow/summary";
import { WhatChanged } from "@/components/cash-flow/what-changed";
import { WhereItWent } from "@/components/cash-flow/where-it-went";
import { monthLabel } from "@/components/format";
import { AreaSwitch, CASH_FLOW_AREA } from "@/components/shell/area-switch";
import { getMonthlyCashFlow } from "@/server/services/analysis-service";

export const metadata: Metadata = { title: "Cash flow" };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * One month's cash flow, read in order: the month, what came in, what went
 * out and what was left over (one equation), where the spending went, and why
 * it changed. Every figure is the domain's; the components only lay it out.
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

  const { period, months, summary, sources, composition, change } = await getMonthlyCashFlow(
    ctx,
    requested,
  );
  const index = months.indexOf(period.month);

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <header className="min-w-0">
          <h1 className="text-title font-bold text-navy">Cash flow</h1>
          <p className="mt-1 text-body text-ink-2">What came in, and where it went.</p>
        </header>
        <div className="flex flex-wrap items-center gap-3">
          <AreaSwitch area={CASH_FLOW_AREA} current="/cash-flow" />
          <MonthSwitcher
            period={period}
            previous={months[index + 1]}
            next={index > 0 ? months[index - 1] : undefined}
            current={months[0]!}
          />
        </div>
      </div>

      <Summary
        title={monthLabel(period.month)}
        summary={summary}
        sources={sources}
        composition={composition}
        range={period.range}
      />

      {/* Each a full-width story: where the month's spending went, then why it moved. */}
      <WhereItWent
        composition={composition}
        range={period.range}
        monthName={monthLabel(period.month)}
        runningMonth={period.kind === "month_to_date"}
      />
      <WhatChanged change={change} period={period} />
    </div>
  );
}
