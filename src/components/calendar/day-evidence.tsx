import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { addDays, daysBetween, type CalendarDate } from "@/domain/calendar-date";
import type { Money as MoneyValue } from "@/domain/money";
import { weekdayOf } from "@/domain/calendar-weeks";
import type { ActivityRow } from "@/server/services/activity-service";
import type {
  CalendarDayDetail,
  CalendarDue,
  MonthCalendar,
} from "@/server/services/calendar-service";

import { activityHref } from "../activity/links";
import { monthLabel } from "../format";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { dayMonth, dueNote, rowHref, rowName, weekdayLong } from "./describe";
import { DueTag } from "./due-state";

/**
 * One day's story, as evidence: the day's two figures (each opening Activity
 * for that day), then only the groups the day holds — its money, what moved
 * between accounts, balance adjustments, payments due and counts. Each row
 * leads to the page that holds it. Nothing here is added up: the figures are
 * the read model's, and moves, adjustments and payments due are never part of
 * them.
 */
export function DayEvidence({
  detail,
  today,
  headingLevel = 2,
}: {
  readonly detail: CalendarDayDetail;
  readonly today: CalendarDate;
  readonly headingLevel?: 2 | 3;
}) {
  const { date, money } = detail;
  const range = { start: date, end: addDays(date, 1) };
  const H = headingLevel === 2 ? "h2" : "h3";
  const quiet =
    money !== null &&
    money.income === 0 &&
    money.spending === 0 &&
    detail.entries.length === 0 &&
    detail.moved.length === 0 &&
    detail.adjustments.length === 0 &&
    detail.dues.length === 0 &&
    detail.verifications.length === 0;
  return (
    <div>
      <div className="border-b border-line px-5 pt-4 pb-3">
        <H id="calendar-day" className="text-heading font-bold text-navy">
          {weekdayLong(weekdayOf(date))}, {dayMonth(date)}
        </H>
        <p className="mt-0.5 text-body text-ink-2">{relative(date, today)}</p>
      </div>

      {money && (
        <dl className="grid grid-cols-2 border-b border-line">
          <Figure
            term="Came in"
            amount={money.income}
            sign="always"
            href={money.income !== 0 ? activityHref({ type: "income", range }) : null}
            link="Income in Activity"
          />
          <Figure
            term="Went out"
            amount={money.spending}
            sign="negative"
            href={money.spending !== 0 ? activityHref({ range }) : null}
            link="This day in Activity"
            className="border-l border-line"
          />
        </dl>
      )}

      {quiet && <p className="px-5 py-5 text-body text-ink-2">Nothing was recorded on this day.</p>}
      {!detail.scheduled && (
        <p className="px-5 py-5 text-body text-ink-2">
          Payments due on this day aren&apos;t scheduled yet.
        </p>
      )}

      {detail.entries.length > 0 && (
        <Group title="Money activity" count={detail.entries.length} H={H}>
          {detail.entries.map((r) => (
            <EntryRow key={r.id} row={r} />
          ))}
        </Group>
      )}
      {detail.moved.length > 0 && (
        <Group title="Moved between accounts" note="Not spending" H={H}>
          {detail.moved.map((r) => (
            <Row
              key={r.id}
              href={rowHref(r)}
              title={rowName(r)}
              meta={
                <span className="inline-flex items-center gap-1">
                  {r.account.name}
                  <ArrowRight aria-label="to" className="size-3" />
                  {r.counterAccount?.name}
                </span>
              }
              amount={<Money amount={r.amount} sign="none" className="text-ink-2" />}
            />
          ))}
        </Group>
      )}
      {detail.adjustments.length > 0 && (
        <Group title="Balance adjustments" note="Not spending" H={H}>
          {detail.adjustments.map((r) => (
            <Row
              key={r.id}
              href={rowHref(r)}
              title="Balance adjusted"
              meta={`${r.account.name} · posted when it was counted`}
              amount={<Money amount={r.amount} sign="always" className="text-ink-2" />}
            />
          ))}
        </Group>
      )}
      {detail.dues.length > 0 && (
        <Group title="Commitments due" H={H}>
          {detail.dues.map((d) => (
            <DueRow key={d.occurrenceId} due={d} />
          ))}
        </Group>
      )}
      {detail.verifications.length > 0 && (
        <Group title="Verifications" H={H}>
          {detail.verifications.map((v) => (
            <Row
              key={v.accountId}
              href={activityHref({ accountId: v.accountId, range: v.reviewRange })}
              title={`${v.accountName} counted`}
              meta={
                v.adjustment ? (
                  <>
                    Didn&apos;t match: <Money amount={v.adjustment.amount} sign="always" /> posted
                  </>
                ) : (
                  "Matched the recorded balance"
                )
              }
              amount={<Money amount={v.statedBalance} className="text-ink-2" />}
              link={`Review entries through ${dayMonth(date)}`}
            />
          ))}
        </Group>
      )}
    </div>
  );
}

/** When no day is chosen: the month's payments due, each with its state. */
export function MonthDue({ calendar }: { readonly calendar: MonthCalendar }) {
  const { due, month } = calendar;
  return (
    <div>
      <div className="border-b border-line px-5 pt-4 pb-3">
        <h2 id="calendar-day" className="text-heading font-bold text-navy">
          {monthLabel(month)}
        </h2>
        <p className="mt-0.5 text-body text-ink-2">Choose a day to see what happened on it.</p>
      </div>
      {due.occurrences.length === 0 ? (
        <p className="px-5 py-5 text-body text-ink-2">No commitments fall due this month.</p>
      ) : (
        <Group title="Commitments due this month" H="h3">
          {due.occurrences.map((d) => (
            <DueRow key={d.occurrenceId} due={d} withDate />
          ))}
        </Group>
      )}
    </div>
  );
}

function Figure({
  term,
  amount,
  sign,
  href,
  link,
  className,
}: {
  readonly term: string;
  readonly amount: MoneyValue;
  readonly sign: "always" | "negative";
  readonly href: string | null;
  readonly link: string;
  readonly className?: string;
}) {
  return (
    <div className={cn("px-5 py-3", className)}>
      <dt className="text-body text-ink-2">{term}</dt>
      <dd className="mt-0.5 text-figure font-bold text-ink">
        {amount === 0 ? (
          <span className="text-ink-2">—</span>
        ) : (
          <Money amount={amount} sign={sign} />
        )}
      </dd>
      {href && (
        <dd className="mt-0.5">
          <Link
            href={href}
            className="inline-flex items-center text-meta font-medium text-ocean hover:underline"
          >
            {link}
            <ChevronRight aria-hidden className="size-3.5" />
          </Link>
        </dd>
      )}
    </div>
  );
}

function Group({
  title,
  count,
  note,
  H,
  children,
}: {
  readonly title: string;
  readonly count?: number;
  readonly note?: string;
  readonly H: "h2" | "h3";
  readonly children: ReactNode;
}) {
  const Heading = H === "h2" ? "h3" : "h4";
  return (
    <section className="border-b border-line px-5 pt-3.5 pb-1 last:border-b-0">
      <Heading className="flex items-baseline justify-between gap-3 text-meta font-semibold text-ink-2">
        <span>{title}</span>
        {count !== undefined && (
          <span className="font-normal">{count === 1 ? "1 entry" : `${count} entries`}</span>
        )}
        {note && <span className="font-normal">{note}</span>}
      </Heading>
      <ul className="divide-y divide-dashed divide-line">{children}</ul>
    </section>
  );
}

function Row({
  href,
  title,
  tag,
  meta,
  amount,
  link,
}: {
  readonly href: string;
  readonly title: ReactNode;
  readonly tag?: ReactNode;
  readonly meta: ReactNode;
  readonly amount: ReactNode;
  /** A visible way on; without it, the title is the link. */
  readonly link?: string;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-2.5">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {link ? (
          <span className="font-semibold text-ink">{title}</span>
        ) : (
          <Link
            href={href}
            className="truncate font-semibold text-ink hover:text-ocean hover:underline"
          >
            {title}
          </Link>
        )}
        {tag}
      </span>
      <span className="text-right font-bold whitespace-nowrap">{amount}</span>
      <span className="col-span-2 mt-0.5 text-meta text-ink-2">{meta}</span>
      {link && (
        <Link
          href={href}
          className="col-span-2 mt-1 inline-flex items-center text-meta font-medium text-ocean hover:underline"
        >
          {link}
          <ChevronRight aria-hidden className="size-3.5" />
        </Link>
      )}
    </li>
  );
}

function EntryRow({ row }: { readonly row: ActivityRow }) {
  const incoming = row.type === "income" || row.type === "refund";
  return (
    <Row
      href={rowHref(row)}
      title={rowName(row)}
      tag={
        row.type === "refund" ? (
          <span className="text-micro font-semibold text-ink-2">Refund</span>
        ) : undefined
      }
      meta={[row.category?.name, row.account.name].filter(Boolean).join(" · ")}
      amount={
        <Money amount={row.amount} sign={incoming ? "always" : "none"} className="text-ink" />
      }
    />
  );
}

function DueRow({
  due,
  withDate = false,
}: {
  readonly due: CalendarDue;
  readonly withDate?: boolean;
}) {
  const paid = due.display === "paid" && due.payment;
  return (
    <Row
      href={paid ? `/activity?tx=${due.payment!.transactionId}` : "/commitments"}
      title={due.name}
      tag={<DueTag state={due.display} />}
      meta={withDate ? `Due ${dayMonth(due.dueOn)} · ${dueNote(due).toLowerCase()}` : dueNote(due)}
      amount={
        <Money amount={paid ? due.payment!.amount : due.expectedAmount} className="text-ink-2" />
      }
      link={
        paid
          ? "See the payment"
          : due.display === "skipped"
            ? "Open Commitments"
            : "Pay or skip in Commitments"
      }
    />
  );
}

/** "Today", "Yesterday", "3 days ago", "Tomorrow", "In 6 days". */
function relative(date: CalendarDate, today: CalendarDate): string {
  const n = daysBetween(today, date);
  if (n === 0) return "Today";
  if (n === -1) return "Yesterday";
  if (n === 1) return "Tomorrow";
  return n < 0 ? `${-n} days ago` : `In ${n} days`;
}
