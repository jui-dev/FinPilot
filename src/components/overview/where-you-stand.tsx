import { CreditCard } from "lucide-react";

import type { Position } from "@/domain/ledger/position";
import type { AvailableView } from "@/server/services/available-service";

import { Money } from "../ui/money";
import { assetRail, shortNames, type AssetRail } from "./describe";
import { ZoneHeader, ZoneLink } from "./zone-header";

/**
 * "Where do I stand?" — secondary context, never a second headline: net
 * worth; what you own, split into the part that counts toward Available and
 * the part outside it; and what you owe on cards (or the credit they hold),
 * on its own line and never drawn against what you own. Every figure is the
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
    <section aria-labelledby="overview-stand" className="flex flex-col p-5 md:p-7">
      <ZoneHeader
        id="overview-stand"
        title="Where you stand"
        action={<ZoneLink href="/accounts">Your accounts</ZoneLink>}
      />
      <dl className="mt-5 text-body">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="font-semibold text-navy">Net worth</dt>
          <dd className="text-figure font-bold whitespace-nowrap text-navy">
            <Money amount={position.netWorth} />
          </dd>
        </div>
        <div className="mt-4 flex items-baseline justify-between gap-4">
          <dt className="text-ink-2">You own</dt>
          <dd className="font-semibold whitespace-nowrap text-ink">
            <Money amount={position.assets} />
          </dd>
        </div>
      </dl>
      {rail && <Rail rail={rail} />}
      <dl className="mt-4 text-body">
        {/* A card paid past zero holds credit: it reads as credit, never as owed. */}
        <div className="flex items-baseline justify-between gap-4">
          <dt className="flex items-center gap-2 text-ink-2">
            <CreditCard aria-hidden className="size-4 self-center text-ink-3" strokeWidth={1.75} />
            {standing.kind === "credit" ? "Credit on cards" : "You owe on cards"}
          </dt>
          <dd className="font-semibold whitespace-nowrap text-ink">
            <Money amount={standing.amount} sign="none" />
          </dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * What you own, in two parts: navy counts toward Available (as Available is
 * drawn elsewhere), tide sits outside it. Each part is named directly under
 * its own end of the rail; the rail itself is hidden from assistive technology.
 */
function Rail({ rail }: { readonly rail: NonNullable<AssetRail> }) {
  const { counts, outside } = rail;
  return (
    <div className="mt-2">
      <div
        aria-hidden
        data-testid="asset-rail"
        className="flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-surface-subtle"
      >
        {counts.amount > 0 && (
          <span className="h-full min-w-1 bg-navy" style={{ width: `${counts.share * 100}%` }} />
        )}
        {outside.amount > 0 && (
          <span className="h-full min-w-1 bg-tide" style={{ width: `${outside.share * 100}%` }} />
        )}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 text-meta">
        <div>
          <dt className="text-ink-2">Counts toward Available</dt>
          <dd className="font-semibold whitespace-nowrap text-ink">
            <Money amount={counts.amount} sign="none" />
          </dd>
        </div>
        {outside.amount > 0 ? (
          <div className="text-right">
            <dt className="text-ink-2">Outside Available</dt>
            <dd className="font-semibold whitespace-nowrap text-ink">
              <Money amount={outside.amount} sign="none" />
              {outside.accounts.length > 0 && (
                <span className="font-normal text-ink-2"> · {shortNames(outside.accounts)}</span>
              )}
            </dd>
          </div>
        ) : (
          <div className="text-right">
            <dt className="text-ink-2">Outside Available</dt>
            <dd className="font-semibold text-ink">Nothing</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
