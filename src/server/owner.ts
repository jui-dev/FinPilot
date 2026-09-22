import type { DatabaseHandle } from "@/db/client";
import { hasLedgerSchema } from "@/db/migrate";
import { listOwners } from "@/server/repositories/setup-repository";

/**
 * The single place that decides whose ledger the app shows
 * (docs/product-baseline.md §5: a fixed demo owner, resolved through one
 * function, so authentication can replace it later).
 *
 * V1 has exactly one owner. Anything else is a setup problem the UI explains
 * instead of guessing.
 */
export interface CurrentOwner {
  readonly id: string;
  readonly name: string;
  readonly timeZone: string;
  readonly baseCurrency: string;
}

export type OwnerResolution =
  | { readonly ok: true; readonly owner: CurrentOwner }
  | { readonly ok: false; readonly reason: "not_migrated" | "no_owner" | "multiple_owners" };

export function getCurrentOwner(handle: DatabaseHandle): OwnerResolution {
  if (!hasLedgerSchema(handle)) return { ok: false, reason: "not_migrated" };
  const owners = listOwners(handle.db);
  if (owners.length === 0) return { ok: false, reason: "no_owner" };
  if (owners.length > 1) return { ok: false, reason: "multiple_owners" };
  const [owner] = owners;
  return {
    ok: true,
    owner: {
      id: owner!.id,
      name: owner!.name,
      timeZone: owner!.timeZone,
      baseCurrency: owner!.baseCurrency,
    },
  };
}
