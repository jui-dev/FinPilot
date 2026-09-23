import { existsSync } from "node:fs";
import path from "node:path";

import { connection } from "next/server";
import { cache } from "react";

import { databasePath, openDatabase, type DatabaseHandle } from "@/db/client";
import type { CalendarDate } from "@/domain/calendar-date";
import { systemClock } from "@/server/clock";
import type { ServiceContext } from "@/server/context";
import { uuidV7Generator } from "@/server/ids";
import { getCurrentOwner, type CurrentOwner } from "@/server/owner";

/**
 * Next.js wiring for the services: one SQLite connection per server process,
 * the demo owner resolved through getCurrentOwner(), and the owner's clock.
 * better-sqlite3 is synchronous, so rendering first waits for a real request
 * (connection()) — otherwise Next.js could prerender stale balances at build.
 */

const store = globalThis as typeof globalThis & { __finpilotDatabase?: DatabaseHandle };

function database(): DatabaseHandle | null {
  const file = path.resolve(databasePath());
  if (!existsSync(file)) return null;
  store.__finpilotDatabase ??= openDatabase(file);
  return store.__finpilotDatabase;
}

export type SetupProblem = "no_database" | "not_migrated" | "no_owner" | "multiple_owners";

export type RequestContext =
  | {
      readonly ok: true;
      readonly ctx: ServiceContext;
      readonly owner: CurrentOwner;
      readonly today: CalendarDate;
    }
  | { readonly ok: false; readonly problem: SetupProblem };

function resolve(): RequestContext {
  const handle = database();
  if (!handle) return { ok: false, problem: "no_database" };
  const resolution = getCurrentOwner(handle);
  if (!resolution.ok) return { ok: false, problem: resolution.reason };
  const { owner } = resolution;
  const clock = systemClock(owner.timeZone);
  return {
    ok: true,
    owner,
    today: clock.today(),
    ctx: { db: handle.db, ownerId: owner.id, clock, ids: uuidV7Generator, now: () => new Date() },
  };
}

/** For rendering: resolves once per request. */
export const getRequestContext = cache(async (): Promise<RequestContext> => {
  await connection();
  return resolve();
});

/** For server actions: the same resolution, failing loudly if setup is incomplete. */
export function actionContext(): ServiceContext {
  const resolved = resolve();
  if (!resolved.ok) {
    throw new Error(`FinPilot is not set up (${resolved.problem}). Run npm run db:reset.`);
  }
  return resolved.ctx;
}
