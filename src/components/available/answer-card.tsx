import { CircleAlert } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import type { Money as MoneyValue } from "@/domain/money";
import type { AvailableView } from "@/server/services/available-service";

import { shortDate } from "../format";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import {
  accountEvidence,
  cardsRow,
  earmarkEvidence,
  heroFacts,
  listOf,
  outcomeOf,
  SET_ASIDE_LABEL,
} from "./describe";
import { AvailableSentence } from "./sentence";

const CARD =
  "relative isolate overflow-clip rounded-panel border border-line-soft bg-surface shadow-card";

/**
 * "How much can I actually use right now, and why?" Two cards side by side
 * from 1024px: the answer (Available, the hero, on a mist card), and how it
 * is worked out (the bridge as a waterfall: each step, what it takes, and
 * what is left). Every figure is the read model's.
 */
export function AnswerCard({ view }: { readonly view: AvailableView }) {
  const dueBy = shortDate(view.horizonEnd, view.today);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-6">
      <Hero view={view} dueBy={dueBy} />
      <Bridge view={view} dueBy={dueBy} />
    </div>
  );
}

function Hero({ view, dueBy }: { readonly view: AvailableView; readonly dueBy: string }) {
  const outcome = outcomeOf(view.available);
  const facts = heroFacts(view);
  return (
    <section
      aria-labelledby="available-now"
      className="flex flex-col overflow-clip rounded-panel border border-line-soft bg-mist/35 p-5 shadow-card md:p-7"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="available-now" className="text-heading font-bold text-navy">
          Available now
        </h2>
        {/* White on the mist card, so the tag keeps its edge. */}
        <span className="inline-flex h-5 items-center rounded-full bg-surface px-2 text-micro font-semibold whitespace-nowrap text-ocean">
          Before new income
        </span>
      </div>
      {/* The figure keeps navy and a true minus even when negative; only the gap is berry. */}
      <p className="mt-3 text-hero font-bold text-navy tabular-nums">
        <Money amount={view.available} />
      </p>
      {outcome === "over" && (
        <div className="mt-3">
          <Tag tone="negative" icon={<CircleAlert aria-hidden className="size-3.5" />}>
            Over-committed by <Money amount={-view.available as MoneyValue} sign="none" />
          </Tag>
        </div>
      )}
      <p className="mt-4 max-w-md text-body text-ink-2">
        <AvailableSentence view={view} dueBy={dueBy} figureClassName="font-semibold text-ink" />
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-2">
        {facts.leftFree !== null && (
          <Fact term="Left free">{Math.round(facts.leftFree * 100)}%</Fact>
        )}
        <Fact term="Spoken for">
          <Money amount={facts.spokenFor} sign="none" />
        </Fact>
        <Fact term="Counted until">{dueBy}</Fact>
      </dl>
    </section>
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

type Mark = "accounts" | "owed" | "payments" | "setAside" | "result" | "over";

interface Step {
  readonly op: "" | "−" | "+" | "=";
  readonly label: string;
  readonly detail?: string;
  readonly amount: MoneyValue;
  /** The running total after this step; none on the result. */
  readonly left?: MoneyValue;
  /** Where the step's mark runs, between two running totals. */
  readonly from: MoneyValue;
  readonly to: MoneyValue;
  readonly mark: Mark;
}

const names = (list: readonly string[], noun: string) =>
  list.length === 0 ? undefined : list.length <= 3 ? listOf(list) : `${list.length} ${noun}`;

function steps(view: AvailableView, dueBy: string): Step[] {
  const cards = cardsRow(view);
  const payments = view.commitments.length;
  const purposes = [...new Set(earmarkEvidence(view).deducted.map((e) => e.itemName))];
  const zero = 0 as MoneyValue;
  return [
    {
      op: "",
      label: "In your accounts",
      detail: names(
        accountEvidence(view).counted.map((a) => a.name),
        "accounts",
      ),
      amount: view.includedAssetBalances,
      left: view.includedAssetBalances,
      from: zero,
      to: view.includedAssetBalances,
      mark: "accounts",
    },
    ...(cards
      ? [
          {
            op: cards.amount > 0 ? ("+" as const) : ("−" as const),
            label: cards.label,
            detail: names(
              accountEvidence(view).cards.map((a) => a.name),
              "cards",
            ),
            amount: cards.amount,
            left: view.balancesInScope,
            from: view.includedAssetBalances,
            to: view.balancesInScope,
            mark: "owed" as const,
          },
        ]
      : []),
    {
      op: "−",
      label: `Due by ${dueBy}`,
      detail:
        payments === 0 ? "Nothing due" : `${payments} ${payments === 1 ? "payment" : "payments"}`,
      amount: -view.commitmentsDue as MoneyValue,
      left: view.afterCommitments,
      from: view.balancesInScope,
      to: view.afterCommitments,
      mark: "payments",
    },
    {
      op: "−",
      label: SET_ASIDE_LABEL,
      detail: names(purposes, "purposes") ?? "Nothing set aside",
      amount: -view.coveredEarmarks as MoneyValue,
      left: view.available,
      from: view.afterCommitments,
      to: view.available,
      mark: "setAside",
    },
    {
      op: "=",
      label: "Available",
      amount: view.available,
      from: zero,
      to: view.available,
      mark: view.available < 0 ? "over" : "result",
    },
  ];
}

/** Filled = money that exists; tint + outline = expected; berry outline = more spoken for than held. */
const MARK: Record<Mark, string> = {
  accounts: "bg-[color-mix(in_srgb,var(--color-tide)_55%,var(--color-surface))]",
  owed: "bg-ink-3",
  payments: "bg-mist shadow-[inset_0_0_0_1.5px_var(--color-ocean)]",
  setAside: "bg-tide",
  result: "bg-navy",
  over: "bg-negative-soft shadow-[inset_0_0_0_1.5px_var(--color-negative)]",
};

/**
 * The calculation, as a waterfall table: each step's amount and what is left
 * after it, with a mark on one shared scale showing the slice it takes. The
 * marks are hidden from assistive technology; every figure is in the table.
 */
function Bridge({ view, dueBy }: { readonly view: AvailableView; readonly dueBy: string }) {
  const rows = steps(view, dueBy);
  const ends = rows.flatMap((r) => [r.from, r.to]);
  const lo = Math.min(0, ...ends);
  const span = Math.max(...ends) - lo;
  const at = (v: number) => (span > 0 ? ((v - lo) / span) * 100 : 0);
  return (
    <section aria-labelledby="available-worked-out" className={cn(CARD, "p-5 md:p-7")}>
      {/* The same light as the answer, falling from the top left. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(90%_75%_at_0%_0%,var(--color-mist)_0%,transparent_60%)] opacity-60"
      />
      <h2 id="available-worked-out" className="text-heading font-bold text-navy">
        How it&apos;s worked out
      </h2>
      <p className="mt-1 text-meta text-ink-2">
        Each step takes its share of{" "}
        <Money amount={view.includedAssetBalances} sign="none" className="font-semibold text-ink" />
        ; what&apos;s left carries down.
      </p>

      <table className="mt-5 w-full border-collapse">
        <caption className="sr-only">How Available is worked out</caption>
        <thead>
          <tr className="border-b border-line text-micro font-semibold tracking-[0.08em] text-ink-2 uppercase">
            <td aria-hidden className="w-7" />
            <th scope="col" className="pb-2 text-left font-semibold">
              Step
            </th>
            <td aria-hidden className="max-sm:hidden" />
            <th scope="col" className="pb-2 pl-3 text-right font-semibold">
              Amount
            </th>
            <th scope="col" className="pb-2 pl-3 text-right font-semibold">
              Left
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const result = row.op === "=";
            const start = at(Math.min(row.from, row.to));
            const width = Math.abs(at(row.to) - at(row.from));
            const mark: CSSProperties = { left: `${start}%`, width: `${width}%` };
            return (
              <tr
                key={row.label}
                className={cn(result ? "border-t-2 border-navy" : "border-b border-line-soft")}
              >
                <td aria-hidden className={cn("align-top", result ? "pt-4" : "py-3")}>
                  {row.op && (
                    <span
                      className={cn(
                        "grid size-5 place-items-center rounded-full text-meta leading-none font-bold",
                        result ? "bg-navy text-white" : "bg-surface-hover text-ink-2",
                      )}
                    >
                      {row.op}
                    </span>
                  )}
                </td>
                <th
                  scope="row"
                  className={cn("pr-3 text-left align-top font-normal", result ? "pt-4" : "py-3")}
                >
                  <span
                    className={cn(
                      "block",
                      result
                        ? "text-heading font-bold text-navy"
                        : "text-body font-semibold text-ink",
                    )}
                  >
                    {row.label}
                  </span>
                  {row.detail && <span className="block text-meta text-ink-2">{row.detail}</span>}
                </th>
                <td
                  aria-hidden
                  className={cn("w-[34%] align-top max-sm:hidden", result ? "pt-5" : "pt-4.5")}
                >
                  <span className="relative block h-2.5 rounded-full bg-surface-hover/70">
                    {width > 0 && (
                      <span
                        className={cn("absolute inset-y-0 min-w-1 rounded-full", MARK[row.mark])}
                        style={mark}
                      />
                    )}
                  </span>
                </td>
                <td
                  data-cell="amount"
                  className={cn(
                    "pl-3 text-right align-top whitespace-nowrap tabular-nums",
                    result
                      ? "pt-4 text-heading font-bold text-navy"
                      : "py-3 text-body font-bold text-ink",
                  )}
                >
                  {row.op === "" || result ? (
                    <Money amount={row.amount} />
                  ) : (
                    <Signed amount={row.amount} />
                  )}
                </td>
                <td
                  className={cn(
                    "pl-3 text-right align-top whitespace-nowrap text-body text-ink-2 tabular-nums",
                    result ? "pt-4" : "py-3",
                  )}
                >
                  {row.left !== undefined && <Money amount={row.left} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** A step's amount as a magnitude: the operator column shows its direction, announced as "minus" or "plus". */
function Signed({ amount }: { readonly amount: MoneyValue }) {
  return (
    <>
      {amount !== 0 && <span className="sr-only">{amount < 0 ? "minus " : "plus "}</span>}
      <Money amount={amount} sign="none" />
    </>
  );
}
