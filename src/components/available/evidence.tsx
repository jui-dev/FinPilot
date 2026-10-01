import {
  ArrowRight,
  CalendarClock,
  CircleAlert,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { Money as MoneyValue } from "@/domain/money";
import type { AvailableView } from "@/server/services/available-service";

import { accountIcon } from "../ledger/icons";
import { shortDate } from "../format";
import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import { accountEvidence, cardsRow, earmarkEvidence, listOf, SET_ASIDE_NOTE } from "./describe";

const CARD = "overflow-clip rounded-panel border border-line-soft bg-surface shadow-card";

/** One warm surface for every part, lit from the top left: the step heading, not the colour, tells them apart. */
const PART =
  "flex flex-col rounded-2xl bg-[radial-gradient(120%_90%_at_0%_0%,color-mix(in_srgb,var(--color-coral)_6%,var(--color-surface-subtle))_0%,var(--color-surface-subtle)_55%,var(--color-surface)_100%)] shadow-[inset_0_0_0_1px_var(--color-line-soft)]";

/**
 * The rows behind the bridge's steps, kept brief: enough to see where a
 * figure came from, while Accounts, Commitments and Set aside stay the places
 * to explore. Each part is headed by its step, with the step's operator and
 * total, so it reads against "How it's worked out". Nothing here is added up;
 * every amount is a read-model line or term.
 */
export function Evidence({ view }: { readonly view: AvailableView }) {
  const dueBy = shortDate(view.horizonEnd, view.today);
  const accounts = accountEvidence(view);
  const earmarks = earmarkEvidence(view);
  const cards = cardsRow(view);
  return (
    <section aria-labelledby="available-evidence" className={CARD}>
      <div className="px-5 pt-5 md:px-7 md:pt-6">
        <h2 id="available-evidence" className="text-heading font-bold text-navy">
          Behind the numbers
        </h2>
        <p className="mt-1 text-meta text-ink-2">The rows each step comes from.</p>
      </div>

      <div className="grid gap-4 p-5 md:px-7 md:pb-6 lg:grid-cols-3">
        <Part
          step="Step 1"
          icon={Wallet}
          title="In your accounts"
          total={<Money amount={view.includedAssetBalances} />}
          href="/accounts"
          link="Open Accounts"
        >
          <Rows>
            {accounts.counted.map((a) => (
              <Row
                key={a.accountId}
                icon={accountIcon(a.type)}
                name={a.name}
                tag={a.archived ? "Archived" : undefined}
              >
                <Money amount={a.balance} />
              </Row>
            ))}
          </Rows>
          {cards && (
            <>
              <SubHead
                op={cards.amount > 0 ? "+" : "−"}
                title={cards.label}
                total={<Money amount={cards.amount} sign="none" />}
              />
              <Rows>
                {accounts.cards.map((a) => (
                  <Row
                    key={a.accountId}
                    icon={accountIcon(a.type)}
                    name={a.name}
                    detail={
                      a.balance < 0 ? "Balance owed" : a.balance > 0 ? "Credit" : "Nothing owed"
                    }
                    tag={a.archived ? "Archived" : undefined}
                  >
                    <Money amount={a.balance} sign="none" />
                  </Row>
                ))}
              </Rows>
            </>
          )}
        </Part>

        <Part
          step="Step 2"
          op="−"
          icon={CalendarClock}
          title={`Due by ${dueBy}`}
          total={<Deducted amount={view.commitmentsDue} />}
          href="/commitments"
          link="Open Commitments"
        >
          {view.commitments.length === 0 ? (
            <Empty>Nothing is due by {dueBy}.</Empty>
          ) : (
            <Rows>
              {view.commitments.map((c) => {
                const [day, month] = shortDate(c.dueOn, view.today).split(" ");
                return (
                  <Row
                    key={c.occurrenceId}
                    lead={<DateChip day={day!} month={month!} state={c.display} />}
                    name={c.name}
                    status={
                      c.display === "overdue" ? (
                        <span className="inline-flex h-5 items-center gap-1 rounded-full bg-surface px-2 text-micro font-semibold text-warning shadow-[inset_0_0_0_1px_var(--color-line)]">
                          <CircleAlert aria-hidden className="size-3.5" />
                          Overdue
                        </span>
                      ) : c.display === "due_today" ? (
                        <Tag tone="info" icon={<CalendarClock aria-hidden className="size-3.5" />}>
                          Due today
                        </Tag>
                      ) : undefined
                    }
                  >
                    <Money amount={c.expectedAmount} sign="none" />
                  </Row>
                );
              })}
            </Rows>
          )}
        </Part>

        <Part
          step="Step 3"
          op="−"
          icon={ShieldCheck}
          title="Set aside"
          total={<Deducted amount={view.coveredEarmarks} />}
          href="/set-aside"
          link="Open Set aside"
        >
          {earmarks.deducted.length === 0 ? (
            <Empty>Nothing is set aside from Available.</Empty>
          ) : (
            <Rows>
              {earmarks.deducted.map((e) => (
                <Row
                  key={`${e.itemId}:${e.accountId}`}
                  icon={ShieldCheck}
                  name={e.itemName}
                  detail={`Held in ${e.accountName}`}
                  note={
                    e.short > 0 ? (
                      <>
                        <span className="font-semibold text-negative">
                          <Money amount={e.short} sign="none" /> short
                        </span>{" "}
                        — not deducted
                      </>
                    ) : undefined
                  }
                >
                  <Money amount={e.covered} sign="none" />
                </Row>
              ))}
            </Rows>
          )}
          <p className="mt-3 text-meta text-ink-2">{SET_ASIDE_NOTE}</p>
        </Part>
      </div>

      <Outside view={view} />
    </section>
  );
}

/**
 * Accounts outside Available and the money set aside in them: shown so a
 * balance is never missing without a reason, never part of any step.
 */
function Outside({ view }: { readonly view: AvailableView }) {
  const { notCounted } = accountEvidence(view);
  const { notDeducted } = earmarkEvidence(view);
  if (notCounted.length === 0 && notDeducted.length === 0) return null;
  const names = listOf(notCounted.map((a) => a.name));
  const plural = notCounted.length > 1;
  return (
    <div className="border-t border-line-soft bg-surface-subtle/60 px-5 py-4 md:px-7">
      <h3 className="text-micro font-bold tracking-[0.08em] text-ink-2 uppercase">
        Not part of Available
      </h3>
      <div className="mt-2 grid gap-x-4 gap-y-2 lg:grid-cols-3 lg:items-center">
        <Rows>
          {notCounted.map((a) => (
            <Row
              key={a.accountId}
              icon={accountIcon(a.type)}
              name={a.name}
              detail="Not counted"
              quiet
            >
              <Money amount={a.balance} />
            </Row>
          ))}
        </Rows>
        {notCounted.length > 0 && (
          <p className="text-meta text-ocean">
            {names} {plural ? "aren't" : "isn't"} counted
            {notDeducted.length > 0 ? ", so nothing set aside there is taken off." : "."}
          </p>
        )}
        <Rows>
          {notDeducted.map((e) => (
            <Row
              key={`${e.itemId}:${e.accountId}`}
              icon={ShieldCheck}
              name={e.itemName}
              detail={`Held in ${e.accountName}`}
              quiet
            >
              <Money amount={e.covered} sign="none" />
            </Row>
          ))}
        </Rows>
      </div>
    </div>
  );
}

function Part({
  step,
  op,
  icon: Icon,
  title,
  total,
  href,
  link,
  children,
}: {
  /** Which step of "How it's worked out" this part explains. */
  readonly step: string;
  readonly op?: "−" | "+";
  readonly icon: LucideIcon;
  readonly title: string;
  readonly total: ReactNode;
  readonly href: string;
  readonly link: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={PART}>
      <div className="flex items-start gap-3 border-b border-line-soft px-4 py-3.5">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface text-navy shadow-[inset_0_0_0_1px_var(--color-line)]"
        >
          <Icon className="size-4.25" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-micro font-semibold tracking-[0.08em] text-ink-2 uppercase">
            {step}
            {op && <span aria-hidden> · {op === "−" ? "takes off" : "adds"}</span>}
          </p>
          <h3 className="text-body font-bold text-navy">{title}</h3>
        </div>
        <p className="shrink-0 pt-3 text-body font-bold whitespace-nowrap text-ink tabular-nums">
          {total}
        </p>
      </div>
      <div className="flex-1 px-4 pt-1">{children}</div>
      <Link
        href={href}
        className={cn(
          linkClass,
          "mx-4 mt-3 mb-4 inline-flex items-center gap-1.5 self-start text-meta font-medium text-ocean",
        )}
      >
        {link}
        <ArrowRight aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}

/** A second heading inside a part: the cards step, which the accounts part also explains. */
function SubHead({
  op,
  title,
  total,
}: {
  readonly op: "−" | "+";
  readonly title: string;
  readonly total: ReactNode;
}) {
  return (
    <div className="mt-3 flex items-center gap-2 border-t border-line-soft pt-3">
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-hover text-meta leading-none font-bold text-ink-2"
      >
        {op}
      </span>
      <h4 className="flex-1 text-meta font-bold text-navy">{title}</h4>
      <p className="text-body font-bold whitespace-nowrap text-ink tabular-nums">
        <span className="sr-only">{op === "−" ? "minus " : "plus "}</span>
        {total}
      </p>
    </div>
  );
}

/** A deducted total: a true minus, announced as "minus". */
function Deducted({ amount }: { readonly amount: MoneyValue }) {
  if (amount === 0) return <Money amount={amount} />;
  return (
    <>
      <span aria-hidden>−</span>
      <span className="sr-only">minus </span>
      <Money amount={amount} sign="none" />
    </>
  );
}

function DateChip({
  day,
  month,
  state,
}: {
  readonly day: string;
  readonly month: string;
  readonly state: AvailableView["commitments"][number]["display"];
}) {
  return (
    <span
      className={cn(
        "grid w-9 shrink-0 place-items-center rounded-[8px] py-1 leading-none",
        state === "overdue"
          ? "bg-surface text-warning shadow-[inset_0_0_0_1.5px_var(--color-warning)]"
          : state === "due_today"
            ? "bg-mist text-ocean shadow-[inset_0_0_0_1.5px_var(--color-ocean)]"
            : "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-line)]",
      )}
    >
      <span className="text-body font-bold">{day}</span>
      <span className="mt-0.5 text-[0.625rem] font-semibold tracking-wide uppercase">{month}</span>
    </span>
  );
}

/** A row's icon: white on the part's warm surface, so it reads as a label, not a status. */
function RowIcon({ icon: Icon }: { readonly icon: LucideIcon }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]"
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  );
}

const Rows = ({ children }: { readonly children: ReactNode }) => (
  <ul className="divide-y divide-line-soft">{children}</ul>
);

function Row({
  icon,
  lead,
  name,
  detail,
  tag,
  status,
  note,
  quiet = false,
  children,
}: {
  readonly icon?: LucideIcon;
  /** Something other than an icon to lead the row (a date). */
  readonly lead?: ReactNode;
  readonly name: string;
  readonly detail?: string;
  readonly tag?: string;
  readonly status?: ReactNode;
  readonly note?: ReactNode;
  /** Shown for explanation, not part of the total. */
  readonly quiet?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      {lead ?? (icon && <RowIcon icon={icon} />)}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn("truncate text-body font-semibold", quiet ? "text-ink-2" : "text-ink")}
            >
              {name}
            </span>
            {tag && <Tag>{tag}</Tag>}
          </span>
          <span
            className={cn(
              "shrink-0 text-body font-bold whitespace-nowrap tabular-nums",
              quiet ? "text-ink-2" : "text-ink",
            )}
          >
            {children}
          </span>
        </div>
        {(detail || status) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            {detail && <span className="text-meta text-ink-2">{detail}</span>}
            {status}
          </div>
        )}
        {note && <p className="mt-0.5 text-meta text-ink-2">{note}</p>}
      </div>
    </li>
  );
}

const Empty = ({ children }: { readonly children: ReactNode }) => (
  <p className="py-3 text-body text-ink-2">{children}</p>
);
