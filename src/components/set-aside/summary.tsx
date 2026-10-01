import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import type { AccountType } from "@/domain/ledger/accounts";
import type { Money as MoneyValue } from "@/domain/money";
import type { ItemCover } from "@/domain/protected-money/items";

import { CARD } from "../commitments/occurrence-list";
import { accountIcon } from "../ledger/icons";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import { overview, summary, type AccountHolding } from "./describe";
import { AccountBadge } from "./item-list";

/**
 * "How much am I keeping, is it all still there, and where is it?" The total
 * first, on the area's flat mist card; beside it each account that holds
 * set-aside money, with what is kept there against what is still free.
 * Every figure is derived from the service's covers and reserve sources.
 */
export function SetAsideSummary({
  covers,
  accounts,
  free,
  types,
}: {
  readonly covers: readonly ItemCover[];
  readonly accounts: readonly AccountHolding[];
  /** How much more each account could set aside (the reserve sources'). */
  readonly free: ReadonlyMap<string, MoneyValue>;
  readonly types: ReadonlyMap<string, AccountType>;
}) {
  const total = summary(covers);
  const facts = overview(covers);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6">
      <section
        aria-labelledby="set-aside-total"
        className="flex flex-col overflow-clip rounded-panel border border-line-soft bg-mist/35 p-5 shadow-card md:p-7"
      >
        <h2 id="set-aside-total" className="text-heading font-bold text-navy">
          Kept aside
        </h2>
        <p className="mt-3 text-hero font-bold text-navy tabular-nums">
          {/* What is really there: when part is short, the covered amount. */}
          <Money
            amount={
              total.kind === "short"
                ? total.covered
                : total.kind === "covered"
                  ? total.setAside
                  : (0 as MoneyValue)
            }
            sign="none"
          />
        </p>
        {total.kind === "short" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-meta text-ink-2">
            <Tag tone="negative" icon={<CircleAlert aria-hidden className="size-3.5" />}>
              <Money amount={total.short} sign="none" /> short
            </Tag>
            <span>
              Still covered, of{" "}
              <Money amount={total.setAside} sign="none" className="font-semibold text-ink" /> set
              aside.
            </span>
          </div>
        )}
        <p className="mt-4 max-w-sm text-body text-ink-2">
          Still in your balances, but taken off Available wherever the account counts toward it.
          Releasing it records no transaction.
        </p>

        <dl className="mt-6 grid grid-cols-3 gap-2 lg:mt-auto lg:pt-8">
          <Fact term="Purposes">{facts.purposes}</Fact>
          <Fact term="Accounts">{accounts.length}</Fact>
          <Fact term="Still needed">
            {facts.targets ? <Money amount={facts.targets.stillNeeded} sign="none" /> : "—"}
          </Fact>
        </dl>
      </section>

      <section
        aria-labelledby="set-aside-where"
        className={cn(CARD, "relative isolate p-5 md:p-7")}
      >
        {/* The area's light: mist falling from the top left. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(90%_75%_at_0%_0%,var(--color-mist)_0%,transparent_60%)] opacity-60"
        />
        <h2 id="set-aside-where" className="text-heading font-bold text-navy">
          Where it&apos;s held
        </h2>
        <p className="mt-1 text-meta text-ink-2">
          What each account keeps aside, against what it still has free.
        </p>
        {accounts.length === 0 ? (
          <p className="mt-5 text-body text-ink-2">No account holds set-aside money yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line-soft">
            {accounts.map((a) => (
              <AccountLine
                key={a.accountId}
                line={a}
                free={free.get(a.accountId) ?? (0 as MoneyValue)}
                type={types.get(a.accountId)}
              />
            ))}
          </ul>
        )}
        <ul aria-hidden className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-meta text-ink-2">
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-tide" /> Set aside
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-surface-hover" /> Free
          </li>
          {accounts.some((a) => a.short > 0) && (
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-negative/45" />{" "}
              Short
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Fact({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[10px] bg-surface/85 px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--color-line-soft)]">
      <dt className="text-micro text-ink-2">{term}</dt>
      <dd className="mt-0.5 truncate text-body font-bold text-ink tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * One account: what is set aside on it (covered in tide, any shortfall as a
 * muted berry fill) against what is still free. The bar is decorative; the
 * figures beside it carry the meaning.
 */
function AccountLine({
  line,
  free,
  type,
}: {
  readonly line: AccountHolding;
  readonly free: MoneyValue;
  readonly type: AccountType | undefined;
}) {
  const whole = line.setAside + free;
  const covered = whole > 0 ? (line.setAside - line.short) / whole : 0;
  const short = whole > 0 ? line.short / whole : 0;
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-3">
      <span className="row-span-2">
        <AccountBadge icon={type ? accountIcon(type) : null} />
      </span>
      <p className="min-w-0">
        <span className="font-semibold text-ink">{line.name}</span>
        <span className="text-meta text-ink-2"> · for {line.purposes.join(", ")}</span>
      </p>
      <p className="text-right text-body font-bold whitespace-nowrap text-ink tabular-nums">
        <Money amount={line.setAside} sign="none" />
        <span className="sr-only"> set aside</span>
      </p>
      <span aria-hidden className="flex h-2 overflow-hidden rounded-full bg-surface-hover/80">
        <span className="h-full bg-tide" style={{ width: `${covered * 100}%` }} />
        {short > 0 && (
          <span className="h-full bg-negative/45" style={{ width: `${short * 100}%` }} />
        )}
      </span>
      <p className="text-right text-meta whitespace-nowrap text-ink-2">
        {line.short > 0 ? (
          <span className="text-negative">
            <Money amount={line.short} sign="none" /> short
          </span>
        ) : (
          <>
            <Money amount={free} sign="none" /> free
          </>
        )}
      </p>
    </li>
  );
}
