import { ArrowDown, CalendarClock } from "lucide-react";
import type { ReactNode } from "react";

import type { CalendarDate } from "@/domain/calendar-date";
import type { Money as MoneyValue } from "@/domain/money";

import { dayLabel, shortDate } from "../format";
import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import { noneThrough, pluralPayments, timingPhrase } from "./describe";
import { CARD, OverdueTag } from "./occurrence-list";

export interface NextDue {
  readonly name: string;
  readonly dueOn: CalendarDate;
  readonly amount: MoneyValue;
}

export interface MonthTotal {
  /** "October". */
  readonly label: string;
  readonly total: MoneyValue;
  readonly count: number;
}

/**
 * "What needs my attention, and what is coming?" — the outcome before the
 * rows behind it. Due now: what is overdue or due today, the only part that
 * asks for a decision. Looking ahead: the next payment, what falls due over
 * the forecast window, and how that divides by month. The lists below hold
 * the evidence.
 */
export function CommitmentsSummary({
  attention,
  comingUp,
  months,
  through,
  next,
  today,
}: {
  readonly attention: {
    readonly total: MoneyValue;
    readonly count: number;
    readonly overdue: number;
  };
  readonly comingUp: { readonly total: MoneyValue; readonly count: number };
  /** Coming up, by calendar month, in date order. */
  readonly months: readonly MonthTotal[];
  /** The last day occurrences are known for. */
  readonly through: CalendarDate;
  readonly next: NextDue | null;
  readonly today: CalendarDate;
}) {
  const dueToday = attention.count - attention.overdue;
  const largest = Math.max(0, ...months.map((m) => m.total));
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6">
      <section
        aria-labelledby="commitments-due-now"
        className="flex flex-col overflow-clip rounded-panel border border-line-soft bg-mist/35 p-5 shadow-card md:p-7"
      >
        <h2 id="commitments-due-now" className="text-heading font-bold text-navy">
          Due now
        </h2>
        {attention.count > 0 ? (
          <>
            <p className="mt-3 text-hero font-bold text-navy tabular-nums">
              <Money amount={attention.total} sign="none" />
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {attention.overdue > 0 && <OverdueTag>{attention.overdue} overdue</OverdueTag>}
              {dueToday > 0 && (
                <Tag tone="info" icon={<CalendarClock aria-hidden className="size-3.5" />}>
                  {dueToday} due today
                </Tag>
              )}
            </div>
            <p className="mt-4 max-w-sm text-body text-ink-2">
              {attention.count === 1
                ? "One payment is waiting on you."
                : `${pluralPayments(attention.count)} are waiting on you.`}{" "}
              Pay or skip each one — nothing is recorded until you do.
            </p>
            <a
              href="#needs-attention"
              className={cn(
                "mt-auto inline-flex items-center gap-1.5 self-start pt-5 text-meta font-medium text-ocean",
                linkClass,
              )}
            >
              Go to Needs attention
              <ArrowDown aria-hidden className="size-3.5" />
            </a>
          </>
        ) : (
          <>
            <p className="mt-3 text-hero font-bold text-navy">All clear</p>
            <p className="mt-4 text-body text-ink-2">Nothing is overdue or due today.</p>
          </>
        )}
      </section>

      <section
        aria-labelledby="commitments-ahead"
        className={cn(CARD, "relative isolate p-5 md:p-7")}
      >
        {/* The same light as Available's working: mist falling from the top left. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(90%_75%_at_0%_0%,var(--color-mist)_0%,transparent_60%)] opacity-60"
        />
        <h2 id="commitments-ahead" className="text-heading font-bold text-navy">
          Looking ahead
        </h2>
        <p className="mt-1 text-meta text-ink-2">
          What you&apos;ll pay next, and what&apos;s due through {shortDate(through, today)}.
        </p>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <Fact term="Next payment">
            {next ? (
              <>
                <Money
                  amount={next.amount}
                  sign="none"
                  className="text-figure font-bold text-navy"
                />
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-2">
                  <span className="font-semibold text-ink">{next.name}</span>
                  {dayLabel(next.dueOn, today)}
                  <Tag>{timingPhrase(next.dueOn, today, "upcoming")}</Tag>
                </span>
              </>
            ) : (
              // Only the forecast window is known: a later one may still fall due.
              <span className="text-body text-ink-2">{noneThrough(through, today)}</span>
            )}
          </Fact>
          <Fact term={`Through ${shortDate(through, today)}`}>
            <Money
              amount={comingUp.total}
              sign="none"
              className="text-figure font-bold text-navy"
            />
            <span className="mt-1 text-meta text-ink-2">
              {comingUp.count === 0 ? "Nothing else due" : pluralPayments(comingUp.count)}
            </span>
          </Fact>
        </dl>

        {months.length > 0 && (
          <div className="mt-5">
            <h3 className="text-micro font-semibold tracking-[0.08em] text-ink-2 uppercase">
              Coming up, by month
            </h3>
            <ul className="mt-2 divide-y divide-line-soft">
              {months.map((m) => (
                <li
                  key={m.label}
                  className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-x-3 py-2 sm:grid-cols-[6rem_minmax(0,1fr)_6rem_auto]"
                >
                  <span className="text-body font-semibold text-ink">{m.label}</span>
                  <span aria-hidden className="block h-2 rounded-full bg-surface-hover/70">
                    <span
                      className="block h-full min-w-1 rounded-full bg-tide"
                      style={{ width: `${largest > 0 ? (m.total / largest) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="text-meta text-ink-2 max-sm:hidden">
                    {pluralPayments(m.count)}
                  </span>
                  <Money
                    amount={m.total}
                    sign="none"
                    className="text-right text-body font-bold whitespace-nowrap text-ink tabular-nums"
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function Fact({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[12px] bg-surface/85 px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--color-line-soft)]">
      <dt className="text-micro font-semibold tracking-[0.08em] text-ink-2 uppercase">{term}</dt>
      <dd className="mt-1 flex min-w-0 flex-col">{children}</dd>
    </div>
  );
}
