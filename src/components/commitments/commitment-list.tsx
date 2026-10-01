import { CheckCircle2, ChevronRight, SkipForward } from "lucide-react";
import Link from "next/link";

import type { CalendarDate } from "@/domain/calendar-date";
import type { Money as MoneyValue } from "@/domain/money";

import { shortDate } from "../format";
import { categoryIcon, Glyph } from "../ledger/icons";
import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import { EditCommitmentButton, type Choice, type EditableCommitment } from "./commitment-panel";
import { describeRecurrence, ruleEnded, ruleTiming } from "./describe";
import { CARD, DateTile, FIXED, SCROLL } from "./occurrence-list";

export interface CommitmentRow extends EditableCommitment {
  readonly categoryName: string;
  readonly accountName: string | null;
  /** The next occurrence due today or later that is still to settle. */
  readonly nextDue: CalendarDate | null;
  /** Choices for its edit form (they include its own category and account, even if archived). */
  readonly categories: readonly Choice[];
  readonly accounts: readonly Choice[];
}

/**
 * "What am I committed to?" — each rule in plain language: what it is, how
 * much, how often, what it is for and where it is usually paid from, and what
 * comes next. A row opens the rule for editing.
 */
export function CommitmentList({
  commitments,
  today,
  through,
  className,
}: {
  readonly commitments: readonly CommitmentRow[];
  readonly today: CalendarDate;
  /** The last day occurrences are known for. */
  readonly through: CalendarDate;
  /** Where the card sits in the page's grid. */
  readonly className?: string;
}) {
  const active = commitments.filter((c) => !ruleEnded(c, today)).length;
  return (
    <section aria-labelledby="commitments-rules" className={cn(CARD, FIXED, className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 shrink-0 border-b border-line-soft px-4 py-3.5 md:px-5">
        <h2 id="commitments-rules" className="text-heading font-bold text-navy">
          Your commitments
        </h2>
        <p className="text-meta text-ink-2">{active} active · select one to edit it</p>
      </div>
      <ul className={SCROLL}>
        {commitments.map((c) => {
          const timing = ruleTiming(c, today, through);
          return (
            <li key={c.id} className="border-b border-line-soft last:border-b-0">
              <EditCommitmentButton
                commitment={c}
                categories={c.categories}
                accounts={c.accounts}
                today={today}
                // The button is named "Edit <name>"; its details stay announced.
                describedBy={`${c.id}-amount ${c.id}-recurrence ${c.id}-details${timing ? ` ${c.id}-next` : ""}`}
                className="group grid w-full grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ocean md:px-5"
              >
                {/* Neutral, not mist: rules are management, quieter than what is due. */}
                <Glyph icon={categoryIcon(c.categoryName)} className="row-span-2" />
                <span className="col-start-2 row-start-1 min-w-0 truncate font-semibold text-ink">
                  {c.name}
                </span>
                <span className="col-start-3 row-start-1 flex items-center gap-1 justify-self-end">
                  <span id={`${c.id}-amount`}>
                    <Money
                      amount={c.expectedAmount}
                      sign="none"
                      className="text-body font-bold text-ink"
                    />
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="size-4 text-ink-3 transition-colors group-hover:text-ink-2"
                  />
                </span>
                <span className="col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-meta text-ink-2">
                  <span id={`${c.id}-recurrence`} className="text-ink">
                    {describeRecurrence(c)}
                  </span>
                  <span id={`${c.id}-details`} className="contents">
                    {[c.categoryName, c.accountName && `from ${c.accountName}`]
                      .filter(Boolean)
                      .map((part) => (
                        <span key={part} className="min-w-0 truncate">
                          · {part}
                        </span>
                      ))}
                    {ruleEnded(c, today) && <Tag>Ended {shortDate(c.endOn!, today)}</Tag>}
                  </span>
                </span>
                {timing && (
                  <span
                    id={`${c.id}-next`}
                    className="col-start-3 row-start-2 pr-5 text-right text-meta whitespace-nowrap text-ink-2"
                  >
                    {timing}
                  </span>
                )}
              </EditCommitmentButton>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export interface ResolvedRow {
  readonly id: string;
  readonly name: string;
  readonly dueOn: CalendarDate;
  readonly expectedAmount: MoneyValue;
  /** Present when paid: the ledger payment that settles it. */
  readonly payment: {
    readonly transactionId: string;
    readonly amount: MoneyValue;
    readonly paidOn: CalendarDate;
    readonly accountName: string;
  } | null;
}

/**
 * The most recent occurrences already settled — kept small and secondary: the
 * page looks forward. A payment links to its transaction in Activity, the
 * ledger evidence; a skipped one records only that it was skipped.
 */
export function RecentlyResolved({
  rows,
  today,
  className,
}: {
  readonly rows: readonly ResolvedRow[];
  readonly today: CalendarDate;
  /** Where the card sits in the page's grid. */
  readonly className?: string;
}) {
  return (
    <section aria-labelledby="commitments-resolved" className={cn(CARD, FIXED, className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 shrink-0 border-b border-line-soft px-4 py-3.5 md:px-5">
        <h2 id="commitments-resolved" className="text-heading font-bold text-navy">
          Recently paid or skipped
        </h2>
        {rows.length > 0 && <p className="text-meta text-ink-2">Latest {rows.length}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="flex-1 px-4 py-6 text-body text-ink-2 md:px-5">
          Nothing paid or skipped yet. Payments you record here appear with a link to the expense.
        </p>
      ) : (
        <ul className={SCROLL}>
          {rows.map((row) => (
            <li
              key={row.id}
              className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-line-soft px-4 py-3 last:border-b-0 md:px-5"
            >
              <DateTile date={row.dueOn} muted className="row-span-2" />
              <p className="col-start-2 min-w-0 truncate font-semibold text-ink">
                {row.name}
                <span className="sr-only">, due {shortDate(row.dueOn, today)}</span>
              </p>
              <p className="col-start-3 row-start-1 text-right">
                {row.payment ? (
                  <Money
                    amount={row.payment.amount}
                    sign="none"
                    className="text-body font-semibold text-ink"
                  />
                ) : (
                  <Money amount={row.expectedAmount} sign="none" className="text-body text-ink-2" />
                )}
              </p>
              <p className="col-[2/-1] row-start-2 flex min-w-0 flex-wrap items-center gap-x-2 text-meta text-ink-2">
                {row.payment ? (
                  <>
                    <Tag icon={<CheckCircle2 aria-hidden className="size-3.5" />}>Paid</Tag>
                    <Link
                      href={`/activity?tx=${row.payment.transactionId}`}
                      className={cn("min-w-0 truncate text-ink-2", linkClass)}
                    >
                      {shortDate(row.payment.paidOn, today)} from {row.payment.accountName}
                    </Link>
                  </>
                ) : (
                  <>
                    <Tag icon={<SkipForward aria-hidden className="size-3.5" />}>Skipped</Tag>
                    <span>No expense recorded</span>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
      {rows.some((r) => r.payment) && (
        <p className="shrink-0 border-t border-line-soft px-4 py-3 text-meta text-ink-2 md:px-5">
          An underlined date opens the expense it recorded.
        </p>
      )}
    </section>
  );
}
