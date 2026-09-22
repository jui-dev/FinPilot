import { calendarDate } from "@/domain/calendar-date";
import type { Clock } from "@/domain/clock";

/**
 * The real Clock: today's calendar date in the given IANA time zone.
 * This is the one place in the application that reads the current time;
 * `now` is injectable so time-zone boundaries can be tested.
 */
export function systemClock(timeZone: string, now: () => Date = () => new Date()): Clock {
  // Throws RangeError for an unknown time zone, at construction rather than at first use.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return {
    today() {
      const parts = formatter.formatToParts(now());
      const part = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((p) => p.type === type)?.value);
      return calendarDate(part("year"), part("month"), part("day"));
    },
  };
}
