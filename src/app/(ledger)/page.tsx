import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { AttentionList } from "@/components/attention/attention-list";
import { countLine } from "@/components/attention/describe";
import { AvailableBand } from "@/components/overview/available-band";
import { ThisMonth } from "@/components/overview/this-month";
import { WhereYouStand } from "@/components/overview/where-you-stand";
import { getMonthlyCashFlow } from "@/server/services/analysis-service";
import { getAttention } from "@/server/services/attention-service";
import { getAvailable } from "@/server/services/available-service";
import { getPosition } from "@/server/services/ledger-service";

export const metadata: Metadata = { title: "Overview" };

/**
 * "/" — the Overview (roadmap Stage 10): what can I use right now, what needs
 * me, and how does that sit against this month and where I stand? It owns no
 * financial truth and has no service of its own: it composes the answers of
 * Available, Attention, Cash flow and the position, and each zone leads to the
 * page that explains it. Four zones in one fixed order, the same in the DOM
 * and on screen at every width.
 */
export default async function OverviewPage() {
  const request = await getRequestContext();
  if (!request.ok) return null;
  const { ctx, today } = request;
  const [available, signals, cashFlow, position] = await Promise.all([
    getAvailable(ctx),
    getAttention(ctx),
    getMonthlyCashFlow(ctx),
    getPosition(ctx),
  ]);

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <h1 className="text-title font-bold text-navy">Overview</h1>

      {/* From 1280px Attention sits beside the band; below it, under it. */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-6">
        <AvailableBand view={available} />

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            {/* Takes focus after Hide, when the row that held it is gone. */}
            <h2
              id="overview-attention"
              tabIndex={-1}
              className="text-heading font-bold text-navy outline-none"
            >
              Attention
            </h2>
            {signals.length > 0 && (
              <p className="text-meta text-ink-2">{countLine(signals.length)}</p>
            )}
          </div>
          <AttentionList signals={signals} today={today} labelledBy="overview-attention" />
        </div>
      </div>

      {/* This month and Where you stand share one split card. */}
      <div className="grid overflow-clip rounded-panel border border-line bg-surface shadow-card md:grid-cols-2 md:divide-x md:divide-line max-md:divide-y max-md:divide-line">
        <ThisMonth summary={cashFlow.summary} period={cashFlow.period} />
        <WhereYouStand position={position} available={available} />
      </div>
    </div>
  );
}
