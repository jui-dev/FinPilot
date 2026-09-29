import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { CARD } from "@/components/cash-flow/labels";
import { Agenda, MonthStrip } from "@/components/calendar/agenda";
import { DayEvidence, MonthDue } from "@/components/calendar/day-evidence";
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
import { cn } from "@/components/ui/cn";
import { weekdayOf } from "@/domain/calendar-weeks";
import { getMonthCalendar } from "@/server/services/calendar-service";

export const metadata: Metadata = { title: "Calendar" };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * When money moved, and when payments fall due. From lg: the month line, the
 * grid with its week column, and the chosen day's evidence (or the month's
 * payments due) beside it. Below lg: the month line, a strip of days, the
 * month week by week, and a chosen day as a bottom sheet. Every figure is the
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
      <AreaSwitch area={CASH_FLOW_AREA} current="/calendar" />
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-title font-bold text-navy">Calendar</h1>
          <p className="mt-1 text-body text-ink-2">When money moved, and when payments fall due.</p>
        </div>
        <CalendarMonthSwitcher calendar={calendar} />
      </header>

      <MonthLine calendar={calendar} />

      {/* From lg: the grid, and the evidence beside it. */}
      <div className="hidden items-start gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <MonthGrid calendar={calendar} />
        <aside aria-labelledby="calendar-day" className={cn(CARD, "sticky top-4 overflow-clip")}>
          {detail ? (
            <DayEvidence detail={detail} today={today} />
          ) : (
            <MonthDue calendar={calendar} />
          )}
        </aside>
      </div>

      {/* Below lg: the strip, the agenda, and a chosen day as a sheet. */}
      <div className="flex flex-col gap-4 lg:hidden">
        <MonthStrip calendar={calendar} open={named} />
        <Agenda calendar={calendar} />
        {detail && (
          <DaySheet
            open={named !== null}
            title={`${weekdayLong(weekdayOf(detail.date))}, ${dayMonth(detail.date)}`}
            closeHref={calendarHref(month)}
          >
            <DayEvidence detail={detail} today={today} headingLevel={3} />
          </DaySheet>
        )}
      </div>
    </div>
  );
}
