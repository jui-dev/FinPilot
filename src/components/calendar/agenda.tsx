import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { rangeContains } from "@/domain/calendar-date";
import { WEEKDAYS, weekdayIndex, weekdayOf } from "@/domain/calendar-weeks";
import type { CalendarDay, MonthCalendar } from "@/server/services/calendar-service";

import { CARD } from "../cash-flow/labels";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import {
  calendarHref,
  dayHasContent,
  dayMonth,
  weekdayLong,
  weekdayShort,
  weekLabel,
} from "./describe";
import { DueChip } from "./due-state";

/**
 * Phones and tablets: a strip of the month's days for jumping around — bold
 * where something was recorded, underlined where a payment falls due, no
 * dots — then the month as an agenda, week by week, each week's spending in
 * its header and only the days that hold something. A day reads date, then
 * money, then payments due; tapping it opens its evidence in a sheet.
 */
export function MonthStrip({
  calendar,
  open,
  className,
}: {
  readonly calendar: MonthCalendar;
  /** The day whose sheet is open, if any. */
  readonly open: string | null;
  readonly className?: string;
}) {
  const { days, weekStartsOn, today, month } = calendar;
  const order = [
    ...WEEKDAYS.slice(WEEKDAYS.indexOf(weekStartsOn)),
    ...WEEKDAYS.slice(0, WEEKDAYS.indexOf(weekStartsOn)),
  ];
  const lead = weekdayIndex(days[0]!.date, weekStartsOn);
  return (
    <nav aria-label="Days of the month" className={cn(CARD, "px-2.5 pt-2.5 pb-3", className)}>
      <div
        aria-hidden
        className="grid grid-cols-7 pb-1 text-center text-micro font-semibold text-ink-2"
      >
        {order.map((w) => (
          <span key={w}>{weekdayShort(w).slice(0, 2)}</span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-0.5">
        {days.map((day, i) => {
          const recorded = day.counts.entries + day.counts.moved + day.counts.adjustments > 0;
          const needs = day.dues.some((d) => d.display === "overdue" || d.display === "due_today");
          const expected = !needs && day.dues.some((d) => d.display === "upcoming");
          return (
            <li key={day.date} style={i === 0 ? { gridColumnStart: lead + 1 } : undefined}>
              <Link
                href={calendarHref(month, day.date)}
                scroll={false}
                aria-current={day.date === today ? "date" : undefined}
                aria-label={`${weekdayLong(weekdayOf(day.date))}, ${dayMonth(day.date)}`}
                className={cn(
                  "relative grid h-10 place-items-center rounded-control text-body transition-colors hover:bg-surface-hover",
                  recorded ? "font-bold text-ink" : "text-ink-2",
                  day.date === today && "shadow-[inset_0_0_0_1.5px_var(--color-navy)] text-navy",
                  day.date === open && "bg-mist text-ocean",
                  "focus-visible:outline-2 focus-visible:outline-ocean",
                )}
              >
                {Number(day.date.slice(8))}
                {(needs || expected) && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute bottom-1.5 h-0.5 w-3.5 rounded-full",
                      needs ? "bg-warning" : "bg-tide",
                    )}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
      <p aria-hidden className="flex justify-center gap-4 pt-2 text-micro text-ink-2">
        <span>
          <b className="text-ink">Bold</b>: something recorded
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-warning" />
          Payment needs you
        </span>
      </p>
    </nav>
  );
}

export function Agenda({
  calendar,
  className,
}: {
  readonly calendar: MonthCalendar;
  readonly className?: string;
}) {
  const { weeks, days, month, today, when } = calendar;
  return (
    <section aria-labelledby="calendar-agenda" className={cn(CARD, "overflow-clip", className)}>
      <h2 id="calendar-agenda" className="sr-only">
        The month, week by week
      </h2>
      {weeks.map((week) => {
        const shown = days.filter(
          (d) => rangeContains(week.range, d.date) && (dayHasContent(d) || d.date === today),
        );
        return (
          <section key={week.range.start} aria-label={weekLabel(week.range)}>
            <h3 className="sticky top-0 z-10 flex items-baseline justify-between border-y border-line bg-surface-subtle px-4 py-2.5 text-meta first:border-t-0">
              <span className="text-ink-2">{weekLabel(week.range)}</span>
              {when !== "future" && (
                <span className="text-ink-2">
                  Went out <Money amount={week.spending} className="font-bold text-navy" />
                </span>
              )}
            </h3>
            {shown.length === 0 ? (
              <p className="px-4 py-3 text-meta text-ink-2">
                {when === "future" ? "No payments due" : "Nothing recorded"}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {shown.map((day) => (
                  <AgendaDay
                    key={day.date}
                    day={day}
                    href={calendarHref(month, day.date)}
                    today={today}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </section>
  );
}

function AgendaDay({
  day,
  href,
  today,
}: {
  readonly day: CalendarDay;
  readonly href: string;
  readonly today: string;
}) {
  const income = day.money?.income ?? 0;
  const spending = day.money?.spending ?? 0;
  const { entries, moved, adjustments, verifications } = day.counts;
  const evidence = [
    entries > 0 && (entries === 1 ? "1 entry" : `${entries} entries`),
    moved > 0 && `${moved} moved`,
    adjustments > 0 && "adjusted",
    verifications > 0 && "counted",
  ].filter(Boolean);
  const isToday = day.date === today;
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        className="grid grid-cols-[3rem_minmax(0,1fr)_auto_auto] items-baseline gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ocean"
      >
        <span className={cn("row-span-2 leading-tight", isToday ? "text-navy" : "text-ink")}>
          <span className="block text-heading font-bold">{Number(day.date.slice(8))}</span>
          <span className="block text-micro font-medium text-ink-2">
            {isToday ? "Today" : weekdayShort(weekdayOf(day.date))}
          </span>
          <span className="sr-only">{dayMonth(day.date)}</span>
        </span>
        <span className="text-meta text-ink-2">
          {evidence.join(" · ") || (day.money && day.dues.length === 0 ? "Nothing recorded" : "")}
        </span>
        <span className="flex flex-col items-end text-right leading-tight">
          {income !== 0 && (
            <span className="text-meta font-semibold text-ink">
              <Money amount={income} sign="always" />{" "}
              <span className="text-micro font-medium text-ink-2">in</span>
            </span>
          )}
          {spending !== 0 && <Money amount={spending} className="text-body font-bold text-ink" />}
        </span>
        <ChevronRight aria-hidden className="row-span-2 size-4 self-center text-ink-3" />
        {day.dues.length > 0 && (
          <span className="col-span-2 col-start-2 flex flex-wrap gap-1">
            {day.dues.map((d) => (
              <DueChip key={d.occurrenceId} name={d.name} state={d.display} />
            ))}
          </span>
        )}
      </Link>
    </li>
  );
}
