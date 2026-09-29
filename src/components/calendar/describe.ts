import { addDays, toParts, type CalendarDate, type YearMonth } from "@/domain/calendar-date";
import type { Weekday } from "@/domain/calendar-weeks";
import type { ActivityRow } from "@/server/services/activity-service";
import type { CalendarDay, CalendarDue } from "@/server/services/calendar-service";

import { activityHref } from "../activity/links";

/**
 * The week the Calendar shows: Saturday first, with Friday and Saturday the
 * weekend, as the demo's Bangladeshi calendar runs. A presentation
 * convention, passed to the read model, which sums each week over its dates.
 */
export const WEEK_STARTS_ON: Weekday = "saturday";

const WEEKDAY_SHORT: Record<Weekday, string> = {
  sunday: "Sun",
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
};
export const weekdayShort = (w: Weekday): string => WEEKDAY_SHORT[w];
export const weekdayLong = (w: Weekday): string => w[0]!.toUpperCase() + w.slice(1);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "5 Sep". */
export const dayMonth = (date: CalendarDate): string => {
  const { month, day } = toParts(date);
  return `${day} ${MONTHS[month - 1]}`;
};
/** "1–4 Sep", or "31 Oct" for a one-day week. */
export function weekLabel(range: {
  readonly start: CalendarDate;
  readonly end: CalendarDate;
}): string {
  const last = addDays(range.end, -1);
  return range.start === last ? dayMonth(last) : `${toParts(range.start).day}–${dayMonth(last)}`;
}

/** The Calendar at a month, and at one of its days. */
export function calendarHref(month: YearMonth, day?: CalendarDate | null): string {
  const params = new URLSearchParams({ month });
  if (day) params.set("day", day);
  return `/calendar?${params.toString()}`;
}

/** One row opened in Activity, with the list around it set to that day. */
export function rowHref(row: ActivityRow): string {
  return `${activityHref({ range: { start: row.occurredOn, end: addDays(row.occurredOn, 1) } })}&tx=${row.id}`;
}

/** Whether a day holds anything worth a line of its own (in the phone agenda). */
export function dayHasContent(day: CalendarDay): boolean {
  const { entries, moved, adjustments, verifications } = day.counts;
  return entries + moved + adjustments + verifications > 0 || day.dues.length > 0;
}

/** A payment due, as a fact: what happened to it, or when it is expected. */
export function dueNote(due: CalendarDue): string {
  switch (due.display) {
    case "paid":
      return due.payment && due.payment.paidOn !== due.dueOn
        ? `Paid ${dayMonth(due.payment.paidOn)}`
        : "Paid on the day";
    case "skipped":
      return "Skipped for this month";
    case "overdue":
      return "Not paid or skipped yet";
    case "due_today":
      return "Due today";
    case "upcoming":
      return "Expected";
  }
}

/** What a row is called: its description, or its category, or what it is. */
export function rowName(row: ActivityRow): string {
  if (row.description) return row.description;
  if (row.category) return row.category.name;
  return row.type === "adjustment"
    ? "Balance adjustment"
    : row.type[0]!.toUpperCase() + row.type.slice(1);
}
