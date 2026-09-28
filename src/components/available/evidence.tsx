import { CalendarClock, CircleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { AvailableView } from "@/server/services/available-service";

import { shortDate } from "../format";
import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import { accountEvidence, earmarkEvidence, SET_ASIDE_LABEL, SET_ASIDE_NOTE } from "./describe";

const CARD = "overflow-clip rounded-panel border border-line bg-surface shadow-card";

/**
 * The rows behind the bridge's deductions, kept brief: enough to see where a
 * figure came from, while Accounts, Commitments and Set aside stay the places
 * to explore. Nothing here is added up; every amount is a read-model line.
 */
export function Evidence({ view }: { readonly view: AvailableView }) {
  const dueBy = shortDate(view.horizonEnd, view.today);
  const accounts = accountEvidence(view);
  const earmarks = earmarkEvidence(view);
  return (
    <section aria-labelledby="available-evidence" className={CARD}>
      <h2
        id="available-evidence"
        className="px-5 pt-5 text-heading font-semibold text-navy md:px-6"
      >
        Behind the numbers
      </h2>
      <div className="mt-4 grid divide-y divide-line border-t border-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <Part title="Accounts" href="/accounts" link="Open Accounts">
          <Rows>
            {accounts.counted.map((a) => (
              <Row key={a.accountId} name={a.name} tag={a.archived ? "Archived" : undefined}>
                <Money amount={a.balance} />
              </Row>
            ))}
            {accounts.cards.map((a) => (
              <Row key={a.accountId} name={a.name} tag={a.archived ? "Archived" : undefined}>
                <Money amount={a.balance} sign="none" />{" "}
                {a.balance < 0 ? "owed" : a.balance > 0 ? "credit" : ""}
              </Row>
            ))}
          </Rows>
          {accounts.notCounted.length > 0 && (
            <>
              <p className="mt-5 text-meta font-semibold text-ink-2">Not part of Available</p>
              <Rows>
                {accounts.notCounted.map((a) => (
                  <Row key={a.accountId} name={a.name} quiet>
                    <Money amount={a.balance} />
                  </Row>
                ))}
              </Rows>
            </>
          )}
        </Part>

        <Part title={`Due by ${dueBy}`} href="/commitments" link="Open Commitments">
          {view.commitments.length === 0 ? (
            <Empty>Nothing is due by {dueBy}.</Empty>
          ) : (
            <Rows>
              {view.commitments.map((c) => (
                <Row
                  key={c.occurrenceId}
                  name={c.name}
                  detail={shortDate(c.dueOn, view.today)}
                  status={
                    c.display === "overdue" ? (
                      <Tag tone="warning" icon={<CircleAlert aria-hidden className="size-3.5" />}>
                        Overdue
                      </Tag>
                    ) : c.display === "due_today" ? (
                      <Tag tone="info" icon={<CalendarClock aria-hidden className="size-3.5" />}>
                        Due today
                      </Tag>
                    ) : undefined
                  }
                >
                  <Money amount={c.expectedAmount} sign="none" />
                </Row>
              ))}
            </Rows>
          )}
        </Part>

        <Part title={SET_ASIDE_LABEL} href="/set-aside" link="Open Set aside">
          {view.earmarks.length === 0 ? (
            <Empty>Nothing is set aside.</Empty>
          ) : (
            <>
              <Rows>
                {earmarks.deducted.map((e) => (
                  <Row
                    key={`${e.itemId}:${e.accountId}`}
                    name={e.itemName}
                    detail={e.accountName}
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
                {earmarks.notDeducted.map((e) => (
                  <Row
                    key={`${e.itemId}:${e.accountId}`}
                    name={e.itemName}
                    detail={e.accountName}
                    note={<>Not deducted — {e.accountName} isn&apos;t part of Available.</>}
                    quiet
                  >
                    <Money amount={e.covered} sign="none" />
                  </Row>
                ))}
              </Rows>
              <p className="mt-3 text-meta text-ink-2">{SET_ASIDE_NOTE}</p>
            </>
          )}
        </Part>
      </div>
    </section>
  );
}

function Part({
  title,
  href,
  link,
  children,
}: {
  readonly title: string;
  readonly href: string;
  readonly link: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col px-5 py-5 md:px-6 md:py-6">
      <h3 className="text-body font-semibold text-navy">{title}</h3>
      <div className="mt-3 flex-1">{children}</div>
      <Link
        href={href}
        className={cn(linkClass, "mt-4 self-start text-meta font-medium text-ocean")}
      >
        {link}
      </Link>
    </div>
  );
}

const Rows = ({ children }: { readonly children: ReactNode }) => (
  <ul className="divide-y divide-line">{children}</ul>
);

function Row({
  name,
  detail,
  tag,
  status,
  note,
  quiet = false,
  children,
}: {
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
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("truncate text-body", quiet ? "text-ink-2" : "text-ink")}>
            {name}
          </span>
          {detail && <span className="text-meta text-ink-2">{detail}</span>}
          {tag && <Tag>{tag}</Tag>}
          {status}
        </span>
        <span
          className={cn(
            "shrink-0 text-body font-semibold whitespace-nowrap tabular-nums",
            quiet ? "text-ink-2" : "text-ink",
          )}
        >
          {children}
        </span>
      </div>
      {note && <p className="mt-0.5 text-meta text-ink-2">{note}</p>}
    </li>
  );
}

const Empty = ({ children }: { readonly children: ReactNode }) => (
  <p className="py-2 text-body text-ink-2">{children}</p>
);
