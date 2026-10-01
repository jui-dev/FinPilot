import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { AttentionList } from "@/components/attention/attention-list";
import { AttentionPreview, PREVIEW_SIGNALS } from "@/components/attention/attention-preview";
import { AttentionSheet, SHEET_HEADING_ID } from "@/components/attention/attention-sheet";
import { countLine, describeSignal } from "@/components/attention/describe";
import { DayEvidence } from "@/components/calendar/day-evidence";
import { DaySheet } from "@/components/calendar/day-sheet";
import { dayMonth, WEEK_STARTS_ON, weekdayLong } from "@/components/calendar/describe";
import { AvailableCard } from "@/components/overview/available-card";
import { ThisMonth } from "@/components/overview/this-month";
import { WhereYouStand } from "@/components/overview/where-you-stand";
import { MonthAtAGlance } from "@/components/overview/month-at-a-glance";
import { ZoneHeader } from "@/components/overview/zone-header";
import { weekdayOf } from "@/domain/calendar-weeks";
import { getMonthlyCashFlow } from "@/server/services/analysis-service";
import { getAttention } from "@/server/services/attention-service";
import { getAvailable } from "@/server/services/available-service";
import { getMonthCalendar } from "@/server/services/calendar-service";
import { getPosition } from "@/server/services/ledger-service";

export const metadata: Metadata = { title: "Overview" };

/**
 * "/" — the Overview (roadmap Stage 10): what can I use right now, what does
 * my month look like, what needs me, and how does that sit against this month
 * and where I stand? It owns no financial truth and has no service of its own:
 * it composes the answers of Available, the Calendar, Attention, Cash flow and
 * the position, and each zone leads to the page that explains it.
 *
 * From 1024px, Available and Month at a glance side by side, one height; Attention
 * across the page under them; then This month and Where you stand. Below
 * 1024px the same zones stack in the same order.
 *
 * `?day=YYYY-MM-DD` opens that day's evidence — the Calendar's own — in a
 * side panel (a bottom sheet on phones); closing it returns to "/".
 */
export default async function OverviewPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const request = await getRequestContext();
  if (!request.ok) return null;
  const { ctx, today } = request;
  const { day } = await searchParams;
  const requestedDay = typeof day === "string" ? day : undefined;
  const [available, calendar, signals, cashFlow, position] = await Promise.all([
    getAvailable(ctx),
    // A day the URL names is untrusted: the read model keeps only a day of this month.
    getMonthCalendar(ctx, WEEK_STARTS_ON, undefined, requestedDay),
    getAttention(ctx),
    getMonthlyCashFlow(ctx),
    getPosition(ctx),
  ]);

  // Only a day the URL names opens its evidence, never the read model's default (today).
  const { detail } = calendar;
  const named = detail && requestedDay === detail.date ? detail.date : null;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <h1 className="text-title font-bold text-navy">Overview</h1>

      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <AvailableCard view={available} />
        <MonthAtAGlance calendar={calendar} selected={named} />
      </div>

      <section
        aria-labelledby="overview-attention"
        className="rounded-panel border border-line-soft bg-surface p-5 shadow-card md:p-7"
      >
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

      {detail && (
        <DaySheet
          open={named !== null}
          everywhere
          title={`${weekdayLong(weekdayOf(detail.date))}, ${dayMonth(detail.date)}`}
          closeHref="/"
        >
          <DayEvidence detail={detail} today={today} headingLevel={3} />
        </DaySheet>
      )}

      {/* How money moved, then what it adds up to: each a full-width story of its own. */}
      <ThisMonth cashFlow={cashFlow} />
      <WhereYouStand position={position} accounts={available.accounts} />
    </div>
  );
}
