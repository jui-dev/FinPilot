import type { CalendarDate } from "./calendar-date";

/**
 * The domain's only source of "today". Domain code never reads ambient time
 * (enforced by ESLint); it receives a Clock. The real implementation lives
 * outside the domain (src/server/clock.ts); tests and the acceptance suite
 * use a fixed clock.
 */
export interface Clock {
  /** Today's calendar date in the owner's time zone. */
  today(): CalendarDate;
}

export const fixedClock = (today: CalendarDate): Clock => ({ today: () => today });
