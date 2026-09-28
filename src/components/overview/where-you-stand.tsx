import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { Position } from "@/domain/ledger/position";
import type { AvailableView } from "@/server/services/available-service";

import { listOf } from "../available/describe";
import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { assetRail, type AssetRail } from "./describe";

/**
 * "Where do I stand?" — secondary context, never a second headline: net
 * worth, what you own and what you owe (or the credit held on cards), and how
 * much of what you own counts toward Available. Every figure is the
 * position's or the Available read model's.
 */
export function WhereYouStand({
  position,
  available,
}: {
  readonly position: Position;
  readonly available: AvailableView;
}) {
  const standing = position.liabilityStanding;
  const rail = assetRail(available, position.assets);
  return (
    <section aria-labelledby="overview-stand" className="flex flex-col px-5 py-5 md:px-7 md:py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="overview-stand" className="text-heading font-bold text-navy">
          Where you stand
        </h2>
      </header>
      <dl className="mt-4 text-body">
        <div className="flex items-baseline justify-between gap-4 pb-2">
          <dt className="font-semibold text-navy">Net worth</dt>
          <dd className="text-figure font-bold text-navy">
            <Money amount={position.netWorth} />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-line py-2">
          <dt className="text-ink-2">Own</dt>
          <dd className="font-semibold text-ink">
            <Money amount={position.assets} />
          </dd>
        </div>
        {/* A card paid past zero holds credit: it reads as credit, never as owed. */}
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-ink-2">{standing.kind === "credit" ? "Credit on cards" : "Owe"}</dt>
          <dd className="font-semibold text-ink">
            <Money amount={standing.amount} sign="none" />
          </dd>
        </div>
      </dl>
      {rail && <Rail rail={rail} />}
      <Link
        href="/accounts"
        className={cn(
          "mt-auto inline-flex min-h-8 items-center gap-1.5 self-start pt-4 text-meta font-medium text-ocean max-md:min-h-10",
          linkClass,
        )}
      >
        Your accounts
        <ArrowRight aria-hidden className="size-3.5" />
      </Link>
    </section>
  );
}

/**
 * What you own, split in two: the part that counts toward Available (navy,
 * as Available is drawn elsewhere) and the part outside it (tide). The words
 * under the rail carry both amounts; the rail itself is hidden from assistive
 * technology.
 */
function Rail({ rail }: { readonly rail: NonNullable<AssetRail> }) {
  const { counts, outside } = rail;
  return (
    <div className="mt-3">
      <p className="text-meta font-semibold text-ink">Of what you own</p>
      <div
        aria-hidden
        data-testid="asset-rail"
        className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-subtle"
      >
        {counts.amount > 0 && (
          <span className="h-full min-w-1 bg-navy" style={{ width: `${counts.share * 100}%` }} />
        )}
        {outside.amount > 0 && (
          <span className="h-full min-w-1 bg-tide" style={{ width: `${outside.share * 100}%` }} />
        )}
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-meta text-ink-2">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 shrink-0 rounded-sm bg-navy" />
          <span className="min-w-0">
            Counts toward Available{" "}
            <Money amount={counts.amount} sign="none" className="font-semibold text-ink" />
          </span>
        </li>
        {outside.amount > 0 ? (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm bg-tide" />
            <span className="min-w-0">
              Outside Available{" "}
              <Money amount={outside.amount} sign="none" className="font-semibold text-ink" />
              {outside.accounts.length > 0 && <> · {listOf(outside.accounts)}</>}
            </span>
          </li>
        ) : (
          <li>Everything you own counts toward Available.</li>
        )}
      </ul>
    </div>
  );
}
