import Link from "next/link";
import type { ReactNode } from "react";

import type { CalendarDate } from "@/domain/calendar-date";
import { weekdayOf } from "@/domain/calendar-weeks";
import type { MonthCalendar } from "@/server/services/calendar-service";

import { calendarHref, dayMonth, weekdayLong, weekdayShort } from "../calendar/describe";
import { monthLabel } from "../format";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { monthGlance, type GlanceDay } from "./describe";
import { ZoneHeader, ZoneLink } from "./zone-header";

/**
 * "What does my month look like?" — the current month as a glance, from the
 * Calendar read model: today in coral (where you are in the month, never a
 * financial meaning), a small ocean dot on each day money came in or went
 * out, and a circled day where a payment is still due — mist with an ocean
 * edge when it is only expected, amber when it is overdue or due today. No
 * day shows an amount; the month's one figure is what is still due.
 *
 * Every day is a link to the Overview with that day named (`/?day=`): the
 * page opens the Calendar's own evidence for it in a side panel, and the day
 * is ringed in ocean as the one selected. The whole month stays in the
 * Calendar.
 *
 * Phones and the spread stack the grid over what is still due; at 768px, where
 * the card is the page's width, they sit side by side.
 */
export function MonthAtAGlance({
  calendar,
  selected = null,
  className,
}: {
  readonly calendar: MonthCalendar;
  /** The day whose evidence is open, when the URL names one. */
  readonly selected?: CalendarDate | null;
  readonly className?: string;
}) {
  const glance = monthGlance(calendar, selected);
  const { month, today, due } = calendar;
  const next = glance.pending.find((d) => d.dueOn >= today);
  // The key names only the marks the month shows.
  const shown = (due: "attention" | "expected") =>
    glance.weeks.some((w) => w.some((d) => d?.due === due));
  const payments = (n: number) => (n === 1 ? "1 payment" : `${n} payments`);

  return (
    <section
      aria-labelledby="overview-glance"
      className={cn(
        "flex flex-col rounded-panel border border-line-soft bg-surface p-5 shadow-card",
        "md:grid md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:gap-x-10 md:p-7",
        "lg:flex",
        className,
      )}
    >
      <div className="md:col-span-2">
        <ZoneHeader
          id="overview-glance"
          title="Month at a glance"
          note={monthLabel(month)}
          action={<ZoneLink href={calendarHref(month)}>Open Calendar</ZoneLink>}
        />
      </div>

      <div className="mt-4 min-w-0">
        <table data-testid="month-glance" className="w-full table-fixed border-collapse">
          <caption className="sr-only">
            The days of {monthLabel(month)}: open one to see what happened on it
          </caption>
          <thead>
            <tr>
              {glance.weekdays.map((w) => (
                <th key={w} scope="col" className="pb-1.5 text-micro font-semibold text-ink-2">
                  <abbr title={weekdayLong(w)} className="no-underline">
                    {weekdayShort(w).slice(0, 2)}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {glance.weeks.map((week, i) => (
              <tr key={i}>
                {week.map((day, j) => (
                  <td key={day?.date ?? `${i}-${j}`} className="p-0">
                    {day && <Day day={day} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sr-only">
          {`Today is ${weekdayLong(weekdayOf(today))}, ${dayMonth(today)}. `}
          {glance.movedDays === 1
            ? "Money came in or went out on 1 day this month so far. "
            : `Money came in or went out on ${glance.movedDays} days this month so far. `}
          {glance.pending.length > 0
            ? `Still due: ${glance.pending
                .map(
                  (d) =>
                    `${d.name} on ${dayMonth(d.dueOn)}${d.display === "overdue" ? ", overdue" : d.display === "due_today" ? ", due today" : ""}`,
                )
                .join("; ")}.`
            : "No payment is still due this month."}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-4 md:justify-between">
        <ul
          aria-hidden
          className="flex flex-wrap gap-x-4 gap-y-1.5 text-micro text-ink-2 md:flex-col lg:flex-row"
        >
          <Key mark={<span className="size-2.5 rounded-full bg-coral" />}>Today</Key>
          {glance.movedDays > 0 && (
            <Key mark={<span className="size-1.5 rounded-full bg-ocean" />}>Money in or out</Key>
          )}
          {shown("expected") && (
            <Key mark={<span className={cn("size-2.5 rounded-full", DUE.expected)} />}>
              Payment due
            </Key>
          )}
          {shown("attention") && (
            <Key mark={<span className={cn("size-2.5 rounded-full", DUE.attention)} />}>
              Overdue or due today
            </Key>
          )}
        </ul>

        <div className="border-t border-line pt-4 md:border-t-0 md:pt-0 lg:border-t lg:pt-4">
          {due.pendingCount > 0 ? (
            <>
              <p className="text-meta text-ink-2">Still due this month</p>
              <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                <Money
                  amount={due.pendingTotal}
                  className="text-figure font-bold text-navy tabular-nums"
                />
                <span className="text-meta text-ink-2">· {payments(due.pendingCount)}</span>
              </p>
              {next && (
                <p className="mt-1 text-meta text-ink-2">
                  Next: <span className="font-semibold text-ink">{next.name}</span>,{" "}
                  {next.dueOn === today ? "today" : dayMonth(next.dueOn)}
                </p>
              )}
            </>
          ) : (
            <p className="text-body font-semibold text-ink">Nothing still due this month</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** A day still owed a payment is circled: expected (mist, ocean edge) or needing a decision (amber). */
const DUE = {
  expected: "bg-mist shadow-[inset_0_0_0_1.5px_var(--color-ocean)]",
  attention: "bg-warning-soft shadow-[inset_0_0_0_1.5px_var(--color-warning)]",
} as const;

/** What a day's link says beyond its date: the marks it carries, in words. */
function dayWords(day: GlanceDay): string {
  const words = [
    day.today && "today",
    day.due === "attention" && "payment overdue or due today",
    day.due === "expected" && "payment due",
    day.moved && "money in or out",
    day.selected && "shown",
  ].filter(Boolean);
  return words.length > 0 ? `, ${words.join(", ")}` : "";
}

function Day({ day }: { readonly day: GlanceDay }) {
  return (
    <Link
      href={`/?day=${day.date}`}
      replace
      scroll={false}
      aria-current={day.today ? "date" : undefined}
      className="flex h-11 flex-col items-center justify-center gap-1 rounded-control transition-colors hover:bg-surface-hover"
    >
      <span className="sr-only">
        {weekdayLong(weekdayOf(day.date))}, {dayMonth(day.date)}
        {dayWords(day)}
      </span>
      <span
        aria-hidden
        className={cn(
          "grid size-8 place-items-center rounded-full text-meta tabular-nums",
          day.today
            ? "bg-coral font-bold text-ink"
            : day.due
              ? cn(
                  DUE[day.due],
                  "font-semibold",
                  day.due === "attention" ? "text-warning" : "text-navy",
                )
              : day.later
                ? "text-ink-2"
                : "font-medium text-ink",
          // The selected day is ringed in ocean, the Calendar's selection.
          day.selected && "ring-2 ring-ocean ring-offset-2 ring-offset-surface",
          // Today can also owe a payment: its circle keeps coral, the due state rings it
          // (unless the selection ring is already there).
          day.today &&
            !day.selected &&
            day.due === "attention" &&
            "outline-[1.5px] outline-offset-2 outline-warning outline-solid",
          day.today &&
            !day.selected &&
            day.due === "expected" &&
            "outline-[1.5px] outline-offset-2 outline-ocean outline-solid",
        )}
      >
        {day.day}
      </span>
      <span
        aria-hidden
        className={cn("size-1 rounded-full", day.moved ? "bg-ocean" : "bg-transparent")}
      />
    </Link>
  );
}

function Key({ mark, children }: { readonly mark: ReactNode; readonly children: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="grid size-2.5 place-items-center">{mark}</span>
      {children}
    </li>
  );
}
