import type { AppDatabase } from "@/db/client";
import type { CalendarDate } from "@/domain/calendar-date";
import type { Clock } from "@/domain/clock";
import type { IdGenerator } from "@/domain/ids";

/**
 * Everything a service needs, injected explicitly. The owner comes from
 * getCurrentOwner() once the UI exists (Stage 3); tests pass a fixed clock,
 * a deterministic `now` and the real ID generator.
 */
export interface ServiceContext {
  readonly db: AppDatabase;
  readonly ownerId: string;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Instant source for created_at / updated_at / deleted_at audit timestamps. */
  readonly now: () => Date;
}

/** What a repository write script needs, resolved by the service before the transaction. */
export interface WriteContext {
  readonly ownerId: string;
  readonly today: CalendarDate;
  readonly nowIso: string;
  readonly ids: IdGenerator;
}

export const writeContext = (ctx: ServiceContext): WriteContext => ({
  ownerId: ctx.ownerId,
  today: ctx.clock.today(),
  nowIso: ctx.now().toISOString(),
  ids: ctx.ids,
});
