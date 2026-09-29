import Link from "next/link";

import { rangeContains, type CalendarDate, type YearMonth } from "@/domain/calendar-date";
import { WEEKDAYS, weekdayIndex, weekdayOf } from "@/domain/calendar-weeks";
import type { CalendarDay, MonthCalendar } from "@/server/services/calendar-service";

import { CARD } from "../cash-flow/labels";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { calendarHref, dayMonth, weekdayLong, weekdayShort, weekLabel } from "./describe";
import { DueChip } from "./due-state";

/** More payments than this in a day are summarised ("+2 due"). */
const CHIPS = 2;

/**
 * The month as a grid (desktop): when money moved, and when payments fall
 * due. After the date, a day shows its money — what went out, and what came
 * in — then, secondary, the payments due that day. The last column sums each
 * week's spending over the week's own dates (the read model's), set apart as
 * a summary rather than an eighth day. Every day opens its evidence.
 */
export function MonthGrid({
  calendar,
  className,
}: {
  readonly calendar: MonthCalendar;
  readonly className?: string;
}) {
  const { weekStartsOn, weeks, days, month, selected, today, when } = calendar;
  const order = [
    ...WEEKDAYS.slice(WEEKDAYS.indexOf(weekStartsOn)),
    ...WEEKDAYS.slice(0, WEEKDAYS.indexOf(weekStartsOn)),
  ];
  return (
    <div className={cn(CARD, "overflow-clip", className)}>
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">
          Each day of the month: what came in, what went out and the payments due
        </caption>
        <thead>
          <tr className="border-b border-line text-meta text-ink-2">
            {order.map((w) => (
              <th key={w} scope="col" className="px-2.5 py-2 text-left font-semibold">
                <abbr title={weekdayLong(w)} className="no-underline">
                  {weekdayShort(w)}
                </abbr>
              </th>
            ))}
            <th
              scope="col"
              className="w-24 border-l border-line-strong/40 bg-surface-subtle px-3 py-2 text-right font-semibold"
            >
              Week out
            </th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => {
            const inWeek = days.filter((d) => rangeContains(week.range, d.date));
            const lead = weekdayIndex(inWeek[0]!.date, weekStartsOn);
            const trail = 7 - lead - inWeek.length;
            return (
              <tr key={week.range.start} className="border-b border-line last:border-b-0">
                {Array.from({ length: lead }, (_, i) => (
                  <td key={`l${i}`} className="border-r border-line bg-surface-subtle" />
                ))}
                {inWeek.map((day) => (
                  <td
                    key={day.date}
                    className={cn(
                      "h-[106px] border-r border-line p-0 align-top",
                      !day.scheduled && "bg-surface-subtle",
                    )}
                  >
                    <DayCell
                      day={day}
                      month={month}
                      today={today}
                      selected={day.date === selected}
                    />
                  </td>
                ))}
                {Array.from({ length: trail }, (_, i) => (
                  <td key={`t${i}`} className="border-r border-line bg-surface-subtle" />
                ))}
                <td className="border-l border-line-strong/40 bg-surface-subtle px-3 py-2.5 text-right align-top">
                  <span className="block text-micro text-ink-2">{weekLabel(week.range)}</span>
                  {when === "future" ? (
                    <span className="text-meta text-ink-2">—</span>
                  ) : (
                    <Money amount={week.spending} className="text-meta font-semibold text-ink" />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DayCell({
  day,
  month,
  today,
  selected,
}: {
  readonly day: CalendarDay;
  readonly month: YearMonth;
  readonly today: CalendarDate;
  readonly selected: boolean;
}) {
  const isToday = day.date === today;
  const later = day.date > today;
  const income = day.money?.income ?? 0;
  const spending = day.money?.spending ?? 0;
  const both = income !== 0 && spending !== 0;
  const shown = day.dues.slice(0, CHIPS);
  const more = day.dues.length - shown.length;
  return (
    <Link
      href={calendarHref(month, day.date)}
      scroll={false}
      aria-current={isToday ? "date" : undefined}
      className={cn(
        "flex h-full flex-col gap-1 px-2.5 pt-2 pb-2 transition-colors outline-none hover:bg-surface-hover",
        "focus-visible:shadow-[inset_0_0_0_2px_var(--color-ocean)]",
        selected && "bg-mist/40 shadow-[inset_0_0_0_2px_var(--color-ocean)] hover:bg-mist/50",
      )}
    >
      <span className="sr-only">
        {weekdayLong(weekdayOf(day.date))}, {dayMonth(day.date)}
        {selected ? ", shown" : ""}
      </span>
      <span aria-hidden className="flex items-center gap-1.5">
        <span
          className={cn(
            "text-meta font-semibold",
            isToday
              ? "grid h-6 min-w-6 place-items-center rounded-full bg-navy px-1.5 text-white"
              : later
                ? "text-ink-2"
                : "text-ink",
          )}
        >
          {Number(day.date.slice(8))}
        </span>
        {isToday && <span className="text-micro font-bold text-navy">Today</span>}
      </span>

      {(income !== 0 || spending !== 0) && (
        <span className="flex flex-col leading-tight">
          {income !== 0 && (
            <span className="text-meta font-semibold text-ink">
              <Money amount={income} sign="always" />{" "}
              <span className="text-micro font-medium text-ink-2">in</span>
            </span>
          )}
          {spending !== 0 && (
            <span className="text-body font-bold text-ink">
              <Money amount={spending} />
              {both && (
                <>
                  {" "}
                  <span className="text-micro font-medium text-ink-2">out</span>
                </>
              )}
            </span>
          )}
        </span>
      )}

      {shown.length > 0 && (
        <span className="mt-auto flex flex-col gap-0.5">
          {shown.map((d) => (
            <DueChip key={d.occurrenceId} name={d.name} state={d.display} />
          ))}
          {more > 0 && <span className="text-micro font-semibold text-ocean">+{more} due</span>}
        </span>
      )}
      {!day.scheduled && <span className="sr-only">Payments not scheduled yet</span>}
    </Link>
  );
}
