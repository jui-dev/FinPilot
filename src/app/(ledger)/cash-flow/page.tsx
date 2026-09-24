import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { getRequestContext } from "@/app/_server/context";
import { monthLabel, shortDate } from "@/components/format";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Money } from "@/components/ui/money";
import { EmptyState, PageHeader, Panel } from "@/components/ui/panel";
import { addDays, dayOfMonth, type YearMonth } from "@/domain/calendar-date";
import { formatPercent, formatShare } from "@/domain/ledger/analytics";
import type { CashFlowPeriod, CompositionLine } from "@/domain/ledger/cash-flow";
import { negate } from "@/domain/money";
import { getMonthlyCashFlow } from "@/server/services/analysis-service";

export const metadata: Metadata = { title: "Cash flow" };

type SearchParams = Record<string, string | string[] | undefined>;

/** The current month lives at the bare path; earlier months carry ?month=YYYY-MM. */
const hrefFor = (month: YearMonth, current: YearMonth) =>
  month === current ? "/cash-flow" : `/cash-flow?month=${month}`;

/** "1–24 Sep, so far" for the running month; "Full month" for a finished one. */
function periodNote(period: CashFlowPeriod): string {
  if (period.kind === "complete") return "Full month";
  const last = addDays(period.range.end, -1);
  const first = dayOfMonth(period.range.start);
  return first === dayOfMonth(last)
    ? `${shortDate(last)}, so far`
    : `${first}–${shortDate(last)}, so far`;
}

export default async function CashFlowPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const request = await getRequestContext();
  if (!request.ok) return null;
  const { ctx } = request;
  const params = await searchParams;
  const requested = typeof params.month === "string" ? params.month : undefined;

  const { period, months, summary, composition } = await getMonthlyCashFlow(ctx, requested);
  const index = months.indexOf(period.month);
  const current = months[0]!;
  const previous = months[index + 1];
  const next = index > 0 ? months[index - 1] : undefined;
  const label = monthLabel(period.month);
  const quiet = composition.spent.length === 0 && composition.refundedMoreThanSpent.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Cash flow" description="What came in, and where it went." />

      <Panel className="overflow-hidden" labelledBy="cash-flow-period">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
          <MonthLink month={previous} current={current} direction="previous" />
          <div className="min-w-0 text-center">
            <h2 id="cash-flow-period" className="text-base font-semibold">
              {label}
            </h2>
            <p className="text-[12.5px] text-ink-2">{periodNote(period)}</p>
          </div>
          <MonthLink month={next} current={current} direction="next" />
        </div>

        <dl className="grid grid-cols-2 gap-px bg-line md:grid-cols-4">
          <Figure term="Income">
            <Money amount={summary.income} sign="none" />
          </Figure>
          <Figure term="Spending">
            <Money amount={summary.spending} />
          </Figure>
          <Figure term="Left over" hint="Income − spending">
            <Money amount={summary.leftOver} />
          </Figure>
          <Figure
            term="Savings rate"
            hint={summary.savingsRate ? "Of income, left over" : "No income this month"}
          >
            {summary.savingsRate ? formatPercent(summary.savingsRate) : "—"}
          </Figure>
        </dl>
      </Panel>

      <Panel className="overflow-hidden" labelledBy="cash-flow-composition">
        <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
          <h2 id="cash-flow-composition" className="text-[13px] font-semibold">
            Where it went
          </h2>
          <p className="text-[12.5px] text-ink-3">By category, largest first</p>
        </div>

        {quiet ? (
          <EmptyState title={`Nothing was spent in ${label}`}>
            {period.kind === "month_to_date"
              ? "Spending you record this month will appear here."
              : "No expenses were recorded in this month."}
          </EmptyState>
        ) : (
          <>
            {composition.spent.length > 0 && (
              <ul aria-label="Spending by category">
                {composition.spent.map((line) => (
                  <CategoryRow key={line.categoryId} line={line} />
                ))}
              </ul>
            )}
            {composition.refundedMoreThanSpent.length > 0 && (
              <>
                <h3 className="border-y border-line bg-surface-subtle px-4 py-2 text-[12.5px] font-semibold text-ink-2 md:px-5">
                  Refunded more than spent
                </h3>
                <ul aria-label="Refunded more than spent">
                  {composition.refundedMoreThanSpent.map((line) => (
                    <CategoryRow key={line.categoryId} line={line} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

function Figure({
  term,
  hint,
  children,
}: {
  readonly term: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="bg-surface px-4 py-4 md:px-5">
      <dt className="text-[13px] text-ink-2">{term}</dt>
      <dd className="mt-1 text-[20px] leading-tight font-semibold tracking-tight">{children}</dd>
      {hint && <dd className="mt-0.5 text-[12px] text-ink-2">{hint}</dd>}
    </div>
  );
}

function CategoryRow({ line }: { readonly line: CompositionLine }) {
  const refunded = line.amount < 0;
  return (
    <li className="flex items-baseline gap-3 border-b border-line px-4 py-3 last:border-b-0 md:px-5">
      <span className="min-w-0 flex-1 truncate font-medium">{line.name}</span>
      {line.share && (
        <span className="text-[13px] text-ink-2 tabular-nums">{formatShare(line.share)}</span>
      )}
      <span className="w-28 text-right text-[15px] font-medium">
        {refunded ? (
          <>
            <Money amount={negate(line.amount)} sign="none" />
            <span className="ml-1 text-[12.5px] font-normal text-ink-2">back</span>
          </>
        ) : (
          <Money amount={line.amount} sign="none" />
        )}
      </span>
    </li>
  );
}

function MonthLink({
  month,
  current,
  direction,
}: {
  readonly month: YearMonth | undefined;
  readonly current: YearMonth;
  readonly direction: "previous" | "next";
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const name = direction === "previous" ? "Previous month" : "Next month";
  const className = buttonClass("ghost", "icon");
  if (!month) {
    return (
      <span aria-disabled="true" aria-label={name} className={cn(className, "opacity-45")}>
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <Link
      href={hrefFor(month, current)}
      aria-label={`${name}: ${monthLabel(month)}`}
      className={className}
    >
      <Icon className="size-4" />
    </Link>
  );
}
