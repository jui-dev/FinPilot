import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { Agenda, MonthStrip } from "@/components/calendar/agenda";
import { DayEvidence } from "@/components/calendar/day-evidence";
import { DaySheet } from "@/components/calendar/day-sheet";
import {
  calendarHref,
  dayMonth,
  WEEK_STARTS_ON,
  weekdayLong,
} from "@/components/calendar/describe";
import { CalendarMonthSwitcher, MonthLine } from "@/components/calendar/month-header";
import { MonthGrid } from "@/components/calendar/month-grid";
import { AreaSwitch, CASH_FLOW_AREA } from "@/components/shell/area-switch";
import { weekdayOf } from "@/domain/calendar-weeks";
import { getMonthCalendar } from "@/server/services/calendar-service";

export const metadata: Metadata = { title: "Calendar" };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * When money moved, and when payments fall due. The month's figures, then the
 * month as a grid (from lg) or a strip of days and the month week by week
 * (below lg). Choosing a day opens its
 * evidence in a drawer from the right (a bottom sheet on phones). Every figure is the
 * Calendar read model's; the components only lay it out.
 */
export default async function CalendarPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const request = await getRequestContext();
  if (!request.ok) return null;
  const { ctx } = request;
  const params = await searchParams;
  const text = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

  const calendar = await getMonthCalendar(
    ctx,
    WEEK_STARTS_ON,
    text(params.month),
    text(params.day),
  );
  const { detail, today, month } = calendar;
  // A day the URL names explicitly (not the current month's default) opens the phone sheet.
  const named = detail && text(params.day) === detail.date ? detail.date : null;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <header className="min-w-0">
          <h1 className="text-title font-bold text-navy">Calendar</h1>
          <p className="mt-1 text-body text-ink-2">When money moved, and when payments fall due.</p>
        </header>
        <div className="flex flex-wrap items-center gap-3">
          <AreaSwitch area={CASH_FLOW_AREA} current="/calendar" />
          <CalendarMonthSwitcher calendar={calendar} />
        </div>
      </div>

      <MonthLine calendar={calendar} />

      {/* From lg: the month as a grid. Below lg: a strip of days, then the month week by week. */}
      <MonthGrid calendar={calendar} open={named} className="max-lg:hidden" />
      <div className="flex flex-col gap-4 lg:hidden">
        <MonthStrip calendar={calendar} open={named} />
        <Agenda calendar={calendar} />
      </div>

      {/* A chosen day opens beside the page (a bottom sheet on phones); closing it leaves the day out of the URL. */}
      {detail && (
        <DaySheet
          open={named !== null}
          everywhere
          title={`${weekdayLong(weekdayOf(detail.date))}, ${dayMonth(detail.date)}`}
          closeHref={calendarHref(month)}
        >
          <DayEvidence detail={detail} today={today} headingLevel={3} />
        </DaySheet>
      )}
    </div>
  );
}
