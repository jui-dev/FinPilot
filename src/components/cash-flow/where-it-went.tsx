import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import type { DateRange } from "@/domain/calendar-date";
import { formatShare } from "@/domain/ledger/analytics";
import type { CompositionLine, SpendingComposition } from "@/domain/ledger/cash-flow";
import { negate } from "@/domain/money";

import { activityHref } from "../activity/links";
import { listOf } from "../available/describe";
import { categoryIcon } from "../ledger/icons";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { EmptyState } from "../ui/panel";
import { CARD, fraction, topShare } from "./labels";

/** How many of the largest categories the ring picks out; the rest share one neutral slice. */
const TOP = 3;

/**
 * The ring's tones: the three largest categories, then everything else. They
 * say only "one of the largest" or "the rest" — the order the rows already
 * show — never a category's identity (docs/design-direction.md §5).
 */
const TONES = ["var(--color-navy)", "var(--color-ocean)", "var(--color-tide)"] as const;
const REST = "var(--color-surface-hover)";
const DOT = ["bg-navy", "bg-ocean", "bg-tide"] as const;

/**
 * The rows are a ranked bar chart: the largest category spans the bar column
 * and the others are drawn against it. There is no track, because the bars
 * are not out of 100%; the ring shows the whole. Presentation only.
 */
const relativeTo = (line: CompositionLine, largest: number) =>
  line.share && largest > 0 ? fraction(line.share) / largest : 0;

/**
 * Where the month's spending went, in two views that answer different
 * questions. The ring: how concentrated is it (the three largest, and the
 * rest)? The table: how much went to each category, with its share, each row
 * opening that category's transactions for the period.
 */
export function WhereItWent({
  composition,
  range,
  monthName,
  runningMonth,
  className,
}: {
  readonly composition: SpendingComposition;
  readonly range: DateRange;
  readonly monthName: string;
  readonly runningMonth: boolean;
  readonly className?: string;
}) {
  const { spent, refundedMoreThanSpent, total } = composition;
  const quiet = spent.length === 0 && refundedMoreThanSpent.length === 0;
  const largest = Math.max(0, ...spent.map((line) => (line.share ? fraction(line.share) : 0)));
  const top = topShare(spent, TOP);
  return (
    <section
      aria-labelledby="cash-flow-composition"
      className={cn(CARD, "relative isolate overflow-clip", className)}
    >
      {quiet ? (
        <>
          <Header />
          <EmptyState title={`Nothing was spent in ${monthName}`}>
            {runningMonth
              ? "Spending you record this month will appear here."
              : "No expenses were recorded in this month."}
          </EmptyState>
        </>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <div className="relative isolate flex flex-col border-line-soft pb-6 max-lg:border-b lg:border-r">
            {/* The section's light: mist falling from the top left. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(90%_70%_at_0%_0%,var(--color-mist)_0%,transparent_65%)] opacity-60"
            />
            <Header />
            <Ring spent={spent} total={total} />
            {top && (
              <p className="mx-auto mt-5 max-w-72 px-5 text-center text-meta text-ink-2">
                <span className="font-semibold text-ink">{listOf(top.names)}</span> take{" "}
                <span className="font-semibold text-ink">{formatShare(top.share)}</span> of what
                went out
                {top.others > 0 && (
                  <>
                    ; the other {top.others} {top.others === 1 ? "category takes" : "share"} the
                    rest
                  </>
                )}
                .
              </p>
            )}
          </div>

          <div className="min-w-0 px-2 pt-3 pb-3 md:px-4 md:pt-5">
            <div
              aria-hidden
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-line-soft px-3 pb-2 text-micro font-semibold tracking-[0.08em] text-ink-2 uppercase md:grid-cols-[13rem_minmax(0,1fr)_3rem_6.5rem_1rem]"
            >
              <span>Category</span>
              <span className="max-md:hidden">Share of spending</span>
              <span className="text-right max-md:hidden">%</span>
              <span className="text-right">Amount</span>
            </div>
            {spent.length > 0 && (
              <ul aria-label="Spending by category">
                {spent.map((line, index) => (
                  <CategoryRow
                    key={line.categoryId}
                    line={line}
                    range={range}
                    spent
                    largest={largest}
                    tone={index < TOP ? index : null}
                  />
                ))}
              </ul>
            )}
            {refundedMoreThanSpent.length > 0 && (
              <>
                <h3 className="mx-3 mt-2 border-t border-line-soft pt-3 text-micro font-semibold tracking-[0.08em] text-ink-2 uppercase">
                  Refunded more than spent
                </h3>
                <ul aria-label="Refunded more than spent">
                  {refundedMoreThanSpent.map((line) => (
                    <CategoryRow
                      key={line.categoryId}
                      line={line}
                      range={range}
                      spent={false}
                      largest={largest}
                      tone={null}
                    />
                  ))}
                </ul>
              </>
            )}
            <p className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-t-2 border-navy px-3 pt-3 md:grid-cols-[13rem_minmax(0,1fr)_3rem_6.5rem_1rem]">
              <span className="font-bold text-navy">All spending</span>
              <span className="max-md:hidden" />
              <span className="text-right text-meta text-ink-2 max-md:hidden">100%</span>
              <Money
                amount={total}
                className="text-right text-body font-extrabold whitespace-nowrap text-navy tabular-nums"
              />
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function Header() {
  return (
    <header className="px-5 pt-5 md:px-7 md:pt-6">
      <h2 id="cash-flow-composition" className="text-heading font-bold text-navy">
        Where it went
      </h2>
      <p className="mt-1 text-meta text-ink-2">Spending by category, largest first.</p>
    </header>
  );
}

/**
 * The whole of the spending as a ring: the three largest categories in their
 * tones, then one neutral slice for the rest, with a hairline gap between.
 * Hidden from assistive technology: the table carries every figure.
 */
function Ring({
  spent,
  total,
}: {
  readonly spent: readonly CompositionLine[];
  readonly total: SpendingComposition["total"];
}) {
  const shares = spent.map((l) => (l.share ? fraction(l.share) : 0)).filter((f) => f > 0);
  const slices = [
    ...shares.slice(0, TOP).map((f, i) => ({ f, color: TONES[i]! })),
    ...(shares.length > TOP
      ? [{ f: shares.slice(TOP).reduce((a, b) => a + b, 0), color: REST }]
      : []),
  ];
  const r = 42;
  const c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 1.2 : 0;
  let offset = 0;
  return (
    <div className="relative mx-auto mt-6 size-52">
      <svg aria-hidden viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke={REST} strokeWidth="11" opacity="0.5" />
        {slices.map((s, i) => {
          const length = Math.max(s.f * c - gap, 0.4);
          const el = (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="11"
              strokeDasharray={`${length} ${c - length}`}
              strokeDashoffset={-offset}
            />
          );
          offset += s.f * c;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <Money
          amount={total}
          className="text-figure font-extrabold whitespace-nowrap text-navy tabular-nums"
        />
        <span className="text-meta text-ink-2">spent</span>
      </div>
    </div>
  );
}

/**
 * Phones: dot, name and amount, then the bar with the share beside it. md and
 * up: one line (name, bar, share, amount, chevron), so every bar starts at the
 * same x and the bars read as one chart.
 */
function CategoryRow({
  line,
  range,
  spent,
  largest,
  tone,
}: {
  readonly line: CompositionLine;
  readonly range: DateRange;
  /** False for a line refunded more than spent: it has no share, so no bar. */
  readonly spent: boolean;
  readonly largest: number;
  /** Which of the ring's tones it wears, or null for "the rest". */
  readonly tone: number | null;
}) {
  const refunded = line.amount < 0;
  const bar = line.share && spent;
  return (
    <li className="group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-control border-b border-line-soft px-3 py-2.5 transition-colors last:border-b-0 hover:bg-canvas has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-ocean md:grid-cols-[13rem_minmax(0,1fr)_3rem_6.5rem_1rem]">
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full",
            tone !== null ? DOT[tone] : "bg-line-strong/40",
          )}
        />
        <CategoryIcon icon={categoryIcon(line.name)} />
        <Link
          href={activityHref({ categoryId: line.categoryId, range })}
          className="truncate font-semibold text-ink outline-none after:absolute after:inset-0 after:rounded-control"
        >
          {line.name}
        </Link>
      </span>
      <span className="text-right text-body font-bold whitespace-nowrap text-navy tabular-nums md:col-start-4 md:row-start-1">
        {refunded ? (
          <>
            <Money amount={negate(line.amount)} sign="none" />
            <span className="ml-1 text-meta font-normal text-ink-2">back</span>
          </>
        ) : (
          <Money amount={line.amount} sign="none" />
        )}
      </span>
      {bar && (
        <>
          <span
            aria-hidden
            className="col-start-1 h-2 pl-9.5 md:col-start-2 md:row-start-1 md:pl-0"
          >
            <span
              className="block h-full rounded-full bg-ocean"
              // A share that "<1%" describes stays visible; a true zero draws nothing.
              style={{
                width:
                  fraction(line.share!) > 0 ? `max(3px, ${relativeTo(line, largest) * 100}%)` : "0",
              }}
            />
          </span>
          <span className="text-right text-meta text-ink-2 tabular-nums md:col-start-3 md:row-start-1">
            {formatShare(line.share!)}
          </span>
        </>
      )}
      <ChevronRight
        aria-hidden
        className="size-4 text-ink-3 transition-colors group-hover:text-ink-2 max-md:hidden md:col-start-5 md:row-start-1"
      />
    </li>
  );
}

/** A category's icon, quiet beside its name: it helps find a row, it does not rank it. */
function CategoryIcon({ icon: Icon }: { readonly icon: LucideIcon }) {
  return <Icon aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />;
}
