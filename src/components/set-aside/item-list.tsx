import { CircleAlert, CircleCheck, ShieldCheck, type LucideIcon } from "lucide-react";

import type { AccountType } from "@/domain/ledger/accounts";

import type { Money as MoneyValue } from "@/domain/money";
import type { ItemCover } from "@/domain/protected-money/items";

import { CARD } from "../commitments/occurrence-list";
import { accountIcon } from "../ledger/icons";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import { backing, barShares, progressLabel, targetView, type Backing } from "./describe";
import { ItemActions, type ActionItem, type Source } from "./panels";

/** One active item as the page shows it: its derived cover, and where the money is. */
export interface ItemRow extends ActionItem {
  readonly cover: ItemCover;
}

/** One warm surface per purpose, lit from the top left (as Available's evidence). */
const PURPOSE =
  "flex min-w-0 flex-col rounded-2xl bg-[radial-gradient(120%_90%_at_0%_0%,color-mix(in_srgb,var(--color-coral)_6%,var(--color-surface-subtle))_0%,var(--color-surface-subtle)_55%,var(--color-surface)_100%)] shadow-[inset_0_0_0_1px_var(--color-line-soft)]";

/**
 * "What am I keeping money for, is it still really there, and how far along am
 * I?" One card per purpose: what is set aside (one number unless part of it
 * is short), the target only when there is one, the accounts that hold it,
 * and its actions.
 */
export function ItemList({
  items,
  sources,
  types,
}: {
  readonly items: readonly ItemRow[];
  readonly sources: readonly Source[];
  readonly types: ReadonlyMap<string, AccountType>;
}) {
  return (
    <section aria-labelledby="set-aside-purposes" className={CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 pt-5 md:px-7 md:pt-6">
        <div>
          <h2 id="set-aside-purposes" className="text-heading font-bold text-navy">
            Your purposes
          </h2>
          <p className="mt-1 text-meta text-ink-2">What each one is for, and where its money is.</p>
        </div>
        <p className="text-meta text-ink-2">
          {items.length} {items.length === 1 ? "purpose" : "purposes"}
        </p>
      </div>
      <ul className="grid gap-4 p-5 md:px-7 md:pb-6 lg:grid-cols-2">
        {items.map((item) => (
          <li key={item.id} className="flex min-w-0">
            <ItemBlock item={item} sources={sources} types={types} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemBlock({
  item,
  sources,
  types,
}: {
  readonly item: ItemRow;
  readonly sources: readonly Source[];
  readonly types: ReadonlyMap<string, AccountType>;
}) {
  const state = backing(item.cover);
  const target = targetView(item.cover);
  const headingId = `set-aside-${item.id}`;
  return (
    <article aria-labelledby={headingId} className={cn(PURPOSE, "w-full")}>
      <div className="flex items-start gap-3 border-b border-line-soft px-4 py-3.5 md:px-5">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface text-navy shadow-[inset_0_0_0_1px_var(--color-line)]"
        >
          <ShieldCheck className="size-4.25" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 pt-1.5">
          <h3 id={headingId} className="min-w-0 truncate text-heading font-bold text-navy">
            {item.name}
          </h3>
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
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:px-5">
        <Headline state={state} />
        {target ? (
          <div className="flex flex-col gap-2">
            <TargetBar cover={item.cover} />
            <p className="flex flex-wrap justify-between gap-x-3 text-meta text-ink-2">
              <span>
                Target{" "}
                <Money amount={target.target} sign="none" className="font-semibold text-ink" />
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
              </span>
              <span className="font-semibold text-ink tabular-nums">{progressLabel(target)}</span>
            </p>
          </div>
        ) : (
          <p className="text-meta text-ink-2">No target — kept for as long as you need it.</p>
        )}

        {item.holdings.length > 0 && (
          <div>
            <h4 className="text-micro font-semibold tracking-[0.08em] text-ink-2 uppercase">
              Held in
            </h4>
            <ul className="mt-1 divide-y divide-line-soft">
              {item.holdings.map((h) => {
                const type = types.get(h.accountId);
                return (
                  <li key={h.accountId} className="flex items-center gap-3 py-2 text-body">
                    <AccountBadge icon={type ? accountIcon(type) : null} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                      {h.accountName}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      {h.short > 0 && (
                        <span className="text-meta text-negative">
                          <Money amount={h.short} sign="none" /> short
                        </span>
                      )}
                      <span>
                        <Money
                          amount={h.setAside}
                          sign="none"
                          className="font-bold text-ink tabular-nums"
                        />
                        <span className="sr-only"> set aside</span>
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {state.kind === "short" && (
              <p className="mt-1.5 text-meta text-ink-2">
                {shortAccounts(item.holdings)} now holds less than is set aside from it. It&apos;s
                covered again if the balance recovers, or you can release it.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-line-soft px-4 py-3 md:px-5">
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
 * Covered is filled; a shortfall is a muted berry fill after it; the rest of the
 * target is a quiet track. Decorative: the figures above carry the meaning.
 */
function TargetBar({ cover }: { readonly cover: ItemCover }) {
  const shares = barShares(cover);
  if (!shares) return null;
  return (
    <div aria-hidden className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-hover/80">
      <span
        className={cn("h-full bg-navy", shares.short === 0 && "rounded-full")}
        style={{ width: `${shares.covered * 100}%` }}
      />
      {shares.short > 0 && (
        <span className="h-full bg-negative/45" style={{ width: `${shares.short * 100}%` }} />
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
      <ul className="border-t border-line-soft">
        {items.map((i) => (
          <li
            key={i.id}
            className="flex items-baseline justify-between gap-3 border-b border-line-soft px-4 py-2.5 text-body text-ink-2 last:border-b-0 md:px-5"
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

/** An account's icon in a white ring: a label on the warm and mist surfaces, never a status. */
export function AccountBadge({
  icon: Icon,
  size = "md",
}: {
  readonly icon: LucideIcon | null;
  readonly size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-surface text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]",
        size === "sm" ? "size-7" : "size-8",
      )}
    >
      {Icon && <Icon className={size === "sm" ? "size-3.5" : "size-4"} strokeWidth={1.75} />}
    </span>
  );
}
