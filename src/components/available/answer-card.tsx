import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

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
  listOf,
  outcomeOf,
  SET_ASIDE_LABEL,
  spokenFor,
  spokenForBar,
  type SegmentKind,
} from "./describe";

const CARD = "overflow-clip rounded-panel border border-line bg-surface shadow-card";

/**
 * "How much can I actually use right now, and why?" One card: the answer
 * (Available, the hero), how it is worked out (the bridge, every term from the
 * read model), and how the balances divide into what is spoken for and what is
 * left (the bar, when it can say something true).
 */
export function AnswerCard({ view }: { readonly view: AvailableView }) {
  const dueBy = shortDate(view.horizonEnd, view.today);
  const bar = spokenForBar(view);
  return (
    <section
      aria-labelledby="available-now"
      className={cn(CARD, "grid lg:grid-cols-[minmax(0,39fr)_minmax(0,61fr)]")}
    >
      <Hero view={view} dueBy={dueBy} />
      <Bridge view={view} dueBy={dueBy} />
      {bar && <Bar bar={bar} dueBy={dueBy} />}
    </section>
  );
}

function Hero({ view, dueBy }: { readonly view: AvailableView; readonly dueBy: string }) {
  const outcome = outcomeOf(view.available);
  const parts = spokenFor(view, dueBy);
  const list = listOf(parts);
  const List = list.charAt(0).toUpperCase() + list.slice(1);
  const accounts = (
    <Money amount={view.includedAssetBalances} sign="none" className="font-semibold text-ink" />
  );
  let sentence: ReactNode;
  if (outcome === "over") {
    sentence = (
      <>
        {List} come to{" "}
        <Money
          amount={-view.available as MoneyValue}
          sign="none"
          className="font-semibold text-ink"
        />{" "}
        more than your accounts hold.
      </>
    );
  } else if (outcome === "zero") {
    sentence =
      parts.length > 0 ? (
        <>{List} take up everything in your accounts.</>
      ) : (
        "The accounts that count toward Available hold nothing right now."
      );
  } else {
    sentence =
      parts.length > 0 ? (
        <>
          What&apos;s left of {accounts} in your accounts after {list}.
        </>
      ) : (
        <>Nothing is owed on cards, due by {dueBy} or set aside: all of it is yours to use.</>
      );
  }
  return (
    <div className="bg-mist px-5 py-5 md:px-7 md:py-6">
      <h2 id="available-now" className="text-body font-semibold text-navy">
        Available now
      </h2>
      {/* The figure keeps navy and a true minus even when negative; only the gap is berry. */}
      <p className="mt-1 text-display font-bold text-navy">
        <Money amount={view.available} />
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {outcome === "over" && (
          <Tag tone="negative" icon={<CircleAlert aria-hidden className="size-3.5" />}>
            Over-committed by <Money amount={-view.available as MoneyValue} sign="none" />
          </Tag>
        )}
        <Tag tone="info">Before new income</Tag>
      </div>
      <p className="mt-3 max-w-md text-body text-ink-2">{sentence}</p>
    </div>
  );
}

type BridgeRow =
  | {
      readonly kind: "step";
      readonly label: string;
      readonly detail?: string;
      readonly amount: MoneyValue;
      /** "plain": as is. "signed": + or −. "deduct": subtracted, written with a minus. */
      readonly show: "plain" | "signed" | "deduct";
    }
  | { readonly kind: "subtotal" | "result"; readonly label: string; readonly amount: MoneyValue };

const names = (list: readonly string[], noun: string) =>
  list.length === 0 ? undefined : list.length <= 3 ? listOf(list) : `${list.length} ${noun}`;

function bridgeRows(view: AvailableView, dueBy: string): BridgeRow[] {
  const cards = cardsRow(view);
  const payments = view.commitments.length;
  const purposes = [...new Set(earmarkEvidence(view).deducted.map((e) => e.itemName))];
  return [
    {
      kind: "step",
      label: "In your accounts",
      detail: names(
        accountEvidence(view).counted.map((a) => a.name),
        "accounts",
      ),
      amount: view.includedAssetBalances,
      show: "plain",
    },
    ...(cards
      ? ([
          { kind: "step", label: cards.label, amount: cards.amount, show: "signed" },
          { kind: "subtotal", label: "After cards", amount: view.balancesInScope },
        ] as const)
      : []),
    {
      kind: "step",
      label: `Due by ${dueBy}`,
      detail:
        payments === 0 ? "Nothing due" : `${payments} ${payments === 1 ? "payment" : "payments"}`,
      amount: view.commitmentsDue,
      show: "deduct",
    },
    { kind: "subtotal", label: "After upcoming payments", amount: view.afterCommitments },
    {
      kind: "step",
      label: SET_ASIDE_LABEL,
      detail: names(purposes, "purposes") ?? "Nothing set aside",
      amount: view.coveredEarmarks,
      show: "deduct",
    },
    { kind: "result", label: "Available", amount: view.available },
  ];
}

/** The calculation, as a table: each step, each running total, then Available. */
function Bridge({ view, dueBy }: { readonly view: AvailableView; readonly dueBy: string }) {
  return (
    <div className="border-t border-line px-5 py-4 md:px-7 md:py-5 lg:border-t-0 lg:border-l">
      <table className="w-full border-collapse">
        <caption className="sr-only">How Available is worked out</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bridgeRows(view, dueBy).map((row) => (
            <tr key={row.label} className={cn(row.kind === "result" && "border-t border-line")}>
              <th
                scope="row"
                className={cn(
                  // The rail joins the steps; a navy node marks each running total.
                  "relative py-2 pr-4 pl-6 text-left align-top font-normal",
                  "before:absolute before:top-0 before:bottom-0 before:left-[7px] before:w-px before:bg-line",
                  row.kind === "result" && "pt-3 before:bottom-1/2",
                )}
              >
                {row.kind !== "step" && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-[4px] size-[7px] rounded-full bg-navy",
                      row.kind === "result" ? "top-[1.35rem]" : "top-[0.85rem]",
                    )}
                  />
                )}
                <span
                  className={cn(
                    "block",
                    row.kind === "step" && "text-body text-ink-2",
                    row.kind === "subtotal" && "text-body font-semibold text-ink",
                    row.kind === "result" && "text-heading font-bold text-navy",
                  )}
                >
                  {row.label}
                </span>
                {row.kind === "step" && row.detail && (
                  <span className="block text-meta text-ink-2">{row.detail}</span>
                )}
              </th>
              <td
                className={cn(
                  "py-2 text-right align-top whitespace-nowrap tabular-nums",
                  row.kind === "step" && "text-body text-ink",
                  row.kind === "subtotal" && "text-body font-semibold text-ink",
                  row.kind === "result" && "pt-3 text-heading font-bold text-navy",
                )}
              >
                {row.kind === "step" && row.show === "deduct" ? (
                  <Deduction amount={row.amount} />
                ) : (
                  <Money
                    amount={row.amount}
                    sign={row.kind === "step" && row.show === "signed" ? "always" : "negative"}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A subtracted amount: a true minus, announced as "minus". */
function Deduction({ amount }: { readonly amount: MoneyValue }) {
  if (amount === 0) return <Money amount={amount} />;
  return (
    <>
      <span aria-hidden>−</span>
      <span className="sr-only">minus </span>
      <Money amount={amount} sign="none" />
    </>
  );
}

const SEGMENT: Record<SegmentKind, string> = {
  owed: "bg-ink-3",
  payments: "bg-mist shadow-[inset_0_0_0_1px_var(--color-ocean)]",
  setAside: "bg-tide",
  available: "bg-navy",
};

/**
 * How the balances divide up: owed, payments due and set aside are spoken
 * for, and the rest is Available. Filled = money that exists and is free;
 * tint + outline = expected; an over-commitment is an outlined gap in berry.
 * Hidden from assistive technology: the bridge above carries every figure.
 */
function Bar({
  bar,
  dueBy,
}: {
  readonly bar: NonNullable<ReturnType<typeof spokenForBar>>;
  readonly dueBy: string;
}) {
  const label: Record<SegmentKind, string> = {
    owed: "Owed on cards",
    payments: `Due by ${dueBy}`,
    setAside: SET_ASIDE_LABEL,
    available: "Available",
  };
  return (
    <div aria-hidden className="border-t border-line px-5 py-5 md:px-7 md:py-6 lg:col-span-2">
      <p className="text-body font-semibold text-ink">
        {bar.over ? "More is spoken for than your " : "How your "}
        <Money amount={bar.pool} sign="none" />
        {bar.over ? " holds" : " is spoken for"}
      </p>
      <div className="relative mt-4 flex h-6 gap-0.5 overflow-hidden rounded-full bg-surface-subtle">
        {bar.segments.map((s) => (
          <span
            key={s.kind}
            className={cn("h-full min-w-1", SEGMENT[s.kind])}
            style={{ width: `${s.share * 100}%` }}
          />
        ))}
        {bar.over && (
          <span
            className="absolute inset-y-0 right-0 rounded-r-full border-[1.5px] border-negative bg-negative-soft"
            style={{ left: `${bar.over.from * 100}%` }}
          />
        )}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-meta text-ink-2">
        {bar.segments.map((s) => (
          <li key={s.kind} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded-sm", SEGMENT[s.kind])} />
            {label[s.kind]}
            <Money amount={s.amount} sign="none" className="font-semibold text-ink" />
          </li>
        ))}
        {bar.over && (
          <li className="flex items-center gap-1.5 text-negative">
            <span className="size-3 rounded-sm border-[1.5px] border-negative bg-negative-soft" />
            Over-committed
            <Money amount={bar.over.amount} sign="none" className="font-semibold" />
          </li>
        )}
      </ul>
    </div>
  );
}
