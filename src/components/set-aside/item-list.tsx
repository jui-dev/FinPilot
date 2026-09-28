import { CircleAlert, CircleCheck } from "lucide-react";

import type { Money as MoneyValue } from "@/domain/money";
import type { ItemCover } from "@/domain/protected-money/items";

import { CARD } from "../commitments/occurrence-list";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import { backing, barShares, progressLabel, targetView, type Backing } from "./describe";
import { ItemActions, type ActionItem, type Source } from "./panels";

/** One active item as the page shows it: its derived cover, and where the money is. */
export interface ItemRow extends ActionItem {
  readonly cover: ItemCover;
}

/**
 * "What am I keeping money for, is it still really there, and how far along am
 * I?" One block per item, separated by rules: what is set aside (one number
 * unless part of it is short), the target only when there is one, and the
 * accounts that hold it.
 */
export function ItemList({
  items,
  sources,
}: {
  readonly items: readonly ItemRow[];
  readonly sources: readonly Source[];
}) {
  return (
    <section aria-label="Set aside" className={CARD}>
      <ul>
        {items.map((item) => (
          <li key={item.id} className="border-b border-line last:border-b-0">
            <ItemBlock item={item} sources={sources} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemBlock({
  item,
  sources,
}: {
  readonly item: ItemRow;
  readonly sources: readonly Source[];
}) {
  const state = backing(item.cover);
  const target = targetView(item.cover);
  const headingId = `set-aside-${item.id}`;
  return (
    <article
      aria-labelledby={headingId}
      className="grid gap-x-8 gap-y-4 px-4 py-4 md:px-5 md:py-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={headingId} className="min-w-0 truncate text-heading font-semibold text-ink">
            {item.name}
          </h2>
          {state.kind === "short" && (
            <Tag tone="negative" icon={<CircleAlert aria-hidden className="size-3.5" />}>
              <Money amount={state.short} sign="none" /> short
            </Tag>
          )}
          {target?.reached && (
            <Tag tone="info" icon={<CircleCheck aria-hidden className="size-3.5" />}>
              Target reached
            </Tag>
          )}
        </div>
        <Headline state={state} />
        {target && (
          <div className="flex flex-col gap-1.5">
            <p className="text-meta text-ink-2">
              Target <Money amount={target.target} sign="none" className="font-semibold text-ink" />
              {target.reached ? null : (
                <>
                  {" · "}
                  <Money
                    amount={target.stillNeeded}
                    sign="none"
                    className="font-semibold text-ink"
                  />{" "}
                  still needed
                </>
              )}
              {" · "}
              <span className="font-semibold text-ink tabular-nums">{progressLabel(target)}</span>
            </p>
            <TargetBar cover={item.cover} />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        {item.holdings.length > 0 && (
          <div>
            <h3 className="text-meta font-medium text-ink-2">Held in</h3>
            <ul className="mt-1 flex flex-col divide-y divide-line">
              {item.holdings.map((h) => (
                <li
                  key={h.accountId}
                  className="flex items-baseline justify-between gap-3 py-1.5 text-body"
                >
                  <span className="min-w-0 truncate text-ink">{h.accountName}</span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    {h.short > 0 && (
                      <span className="text-meta text-negative">
                        <Money amount={h.short} sign="none" /> short
                      </span>
                    )}
                    <span>
                      <Money amount={h.setAside} sign="none" className="font-semibold text-ink" />
                      <span className="sr-only"> set aside</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {state.kind === "short" && (
              <p className="mt-1.5 text-meta text-ink-2">
                {shortAccounts(item.holdings)} now holds less than is set aside from it. It&apos;s
                covered again if the balance recovers, or you can release it.
              </p>
            )}
          </div>
        )}
        <ItemActions item={item} sources={sources} />
      </div>
    </article>
  );
}

function Headline({ state }: { readonly state: Backing }) {
  if (state.kind === "empty") {
    return <p className="text-body text-ink-2">Nothing set aside yet.</p>;
  }
  if (state.kind === "covered") {
    return (
      <p className="text-body text-ink-2">
        <Money amount={state.setAside} sign="none" className="text-figure font-bold text-navy" />{" "}
        set aside
      </p>
    );
  }
  return (
    <p className="text-body text-ink-2">
      <Money amount={state.covered} sign="none" className="text-figure font-bold text-navy" /> of{" "}
      <Money amount={state.setAside} sign="none" className="font-semibold text-ink" /> still covered
    </p>
  );
}

/**
 * Covered is filled; a shortfall is an outlined gap after it; the rest of the
 * target is a quiet track. Decorative: the figures above carry the meaning.
 */
function TargetBar({ cover }: { readonly cover: ItemCover }) {
  const shares = barShares(cover);
  if (!shares) return null;
  return (
    <div aria-hidden className="flex h-2 w-full overflow-hidden rounded-full bg-mist">
      <span className="h-full bg-navy" style={{ width: `${shares.covered * 100}%` }} />
      {shares.short > 0 && (
        <span
          className="h-full rounded-r-full border border-negative bg-surface"
          style={{ width: `${shares.short * 100}%` }}
        />
      )}
    </div>
  );
}

function shortAccounts(holdings: readonly { accountName: string; short: MoneyValue }[]): string {
  const names = holdings.filter((h) => h.short > 0).map((h) => h.accountName);
  return names.length <= 1
    ? (names[0] ?? "An account")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Archived items: kept for the record, read-only. */
export function ArchivedItems({
  items,
}: {
  readonly items: readonly {
    readonly id: string;
    readonly name: string;
    readonly target: MoneyValue | null;
  }[];
}) {
  if (items.length === 0) return null;
  return (
    <details className={CARD}>
      <summary className="cursor-pointer px-4 py-3 text-body font-semibold text-ink-2 md:px-5">
        Archived ({items.length})
      </summary>
      <ul className="border-t border-line">
        {items.map((i) => (
          <li
            key={i.id}
            className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2.5 text-body text-ink-2 last:border-b-0 md:px-5"
          >
            <span className="min-w-0 truncate">{i.name}</span>
            {i.target !== null && (
              <span className="shrink-0 text-meta">
                Target <Money amount={i.target} sign="none" />
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
