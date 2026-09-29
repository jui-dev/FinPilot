import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { AttentionList } from "@/components/attention/attention-list";
import { AttentionPreview, PREVIEW_SIGNALS } from "@/components/attention/attention-preview";
import { AttentionSheet, SHEET_HEADING_ID } from "@/components/attention/attention-sheet";
import { countLine, describeSignal } from "@/components/attention/describe";
import { AvailableBand } from "@/components/overview/available-band";
import { ThisMonth } from "@/components/overview/this-month";
import { WhereYouStand } from "@/components/overview/where-you-stand";
import { ZoneHeader } from "@/components/overview/zone-header";
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
 * page that explains it.
 *
 * A spread (docs/design-direction.md §6): from 1024px, the answer on the navy
 * page at the left and the context on one surface at the right — Attention,
 * This month and Where you stand as bands. Below 1024px the same four zones
 * stack in the same order.
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

      {/* In the spread the navy page and the context column share their top edge;
          each is only as tall as its content. */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6">
        <AvailableBand view={available} />

        <div className="overflow-clip rounded-panel border border-line bg-surface shadow-card">
          <section aria-labelledby="overview-attention" className="p-5 md:p-7 md:pb-5">
            <ZoneHeader
              id="overview-attention"
              title="Attention"
              note={signals.length > 0 ? countLine(signals.length) : undefined}
              focusable
              action={
                <AttentionSheet
                  count={signals.length}
                  action={
                    signals.length > PREVIEW_SIGNALS
                      ? "view-all"
                      : signals.some((s) => describeSignal(s, today).hide !== null)
                        ? "open"
                        : null
                  }
                  fallbackFocusId="overview-attention"
                  list={
                    <AttentionList
                      signals={signals}
                      today={today}
                      labelledBy={SHEET_HEADING_ID}
                      className="mt-1"
                    />
                  }
                />
              }
            />
            <AttentionPreview signals={signals} today={today} labelledBy="overview-attention" />
          </section>

          {/* Side by side at 768px, where the column is the page's width; stacked in the spread. */}
          <div className="grid border-t border-line md:grid-cols-2 md:divide-x md:divide-line lg:grid-cols-1 lg:divide-x-0 lg:divide-y max-md:divide-y max-md:divide-line">
            <ThisMonth summary={cashFlow.summary} period={cashFlow.period} />
            <WhereYouStand position={position} available={available} />
          </div>
        </div>
      </div>
    </div>
  );
}
