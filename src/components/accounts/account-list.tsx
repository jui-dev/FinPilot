import { CheckCircle2, CircleDashed } from "lucide-react";
import Link from "next/link";

import { addDays, type CalendarDate } from "@/domain/calendar-date";
import type { AccountType } from "@/domain/ledger/accounts";
import type { Verification } from "@/domain/ledger/verification";
import { sum, type Money as MoneyValue } from "@/domain/money";

import { activityHref } from "../activity/links";
import { shortDate } from "../format";
import { accountIcon, ACCOUNT_TYPE_LABEL, Glyph } from "../ledger/icons";
import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { EmptyState, Tag } from "../ui/panel";
import { AccountActions } from "./account-actions";
import { balanceReading } from "./balance-reading";
import { verificationView } from "./verification-view";
import { ChangedDetails } from "./changed-details";
import { VerifyBalanceButton } from "./verify-balance-panel";

export interface AccountView {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  readonly openedOn: CalendarDate;
  readonly balance: MoneyValue;
  readonly archived: boolean;
  readonly references: number;
  readonly verification: Verification;
}

const GROUPS: ReadonlyArray<{ title: string; types: readonly AccountType[] }> = [
  { title: "Everyday money", types: ["cash", "bank", "mobile_wallet"] },
  { title: "Savings", types: ["savings"] },
  { title: "Credit cards", types: ["credit_card"] },
];

/**
 * Desktop: one grid for the column names and every row, shared through
 * subgrid, so balances, verifications and their actions line up down the
 * page whatever each row holds. Four columns — the account (its icon inside),
 * Balance (a fixed-width pill), Verification and Action — each as wide as its content, with the
 * spare width shared out evenly between them (justify-between), so the gaps
 * are equal and nothing is left empty at the row's end. Rows, the head and the
 * group bands pad themselves, which keeps row borders full-bleed.
 */
const DESKTOP_GRID =
  "lg:grid lg:grid-cols-[minmax(14rem,max-content)_max-content_max-content_max-content] lg:justify-between lg:gap-x-8 xl:gap-x-10";
/** Each level's side padding on desktop: the table's edge, inside the full-bleed rows. */
const EDGE = "lg:px-6 xl:px-7";
/** A level between the grid and a row: it passes the columns through. */
const SUBGRID = "lg:col-span-full lg:grid lg:grid-cols-subgrid";

/**
 * "What accounts make up that position, and how far can each balance be
 * trusted?" Read left to right: the account, its balance, whether that balance
 * still matches what was verified, then what can be done with it.
 */
export function AccountList({
  active,
  archived,
  today,
}: {
  readonly active: readonly AccountView[];
  readonly archived: readonly AccountView[];
  readonly today: CalendarDate;
}) {
  const groups = GROUPS.map((group) => ({
    ...group,
    accounts: active.filter((a) => group.types.includes(a.type)),
  })).filter((group) => group.accounts.length > 0);

  return (
    <section
      aria-labelledby="accounts-balances"
      className={cn(
        "overflow-clip rounded-panel border border-line-soft bg-surface shadow-card",
        DESKTOP_GRID,
      )}
    >
      <h2 id="accounts-balances" className="sr-only">
        Balances
      </h2>
      {/* The column names are for sighted scanning; each row reads in the same order. */}
      <div
        aria-hidden
        className={cn(
          SUBGRID,
          // A light-blue gradient with blue labels: the table's head, apart from the warm group rows.
          EDGE,
          // A subgrid keeps its own gap unless told otherwise: the rows', exactly.
          "lg:gap-x-8 xl:gap-x-10",
          "hidden border-b border-line-soft bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-mist)_80%,transparent)_0%,color-mix(in_srgb,var(--color-mist)_15%,transparent)_100%)] py-3.5 text-micro font-bold tracking-[0.08em] text-ocean uppercase",
        )}
      >
        {/* Over the account's name, past its icon. */}
        <span className="pl-12">Account</span>
        <span className="w-44 text-center">Balance</span>
        <span>Verification</span>
        {/* Indented as far as the Verify button's own padding, so the word sits over its icon. */}
        <span className="pl-3">Action</span>
      </div>

      {groups.map((group, index) => (
        <Group
          key={group.title}
          title={group.title}
          first={index === 0}
          accounts={group.accounts}
          // A single-type group already names the type; the row does not repeat it.
          showType={group.types.length > 1}
          today={today}
        />
      ))}

      {active.length === 0 && (
        <div className={cn(SUBGRID, "lg:*:col-span-full")}>
          <EmptyState title="No accounts yet">
            Add the accounts you actually use — cash, bank, mobile wallet, savings, cards.
          </EmptyState>
        </div>
      )}

      {archived.length > 0 && (
        <Group title="Archived" first={false} muted accounts={archived} showType today={today} />
      )}
    </section>
  );
}

function Group({
  title,
  first,
  muted = false,
  accounts,
  showType,
  today,
}: {
  readonly title: string;
  readonly first: boolean;
  readonly muted?: boolean;
  readonly accounts: readonly AccountView[];
  readonly showType: boolean;
  readonly today: CalendarDate;
}) {
  return (
    <section className={SUBGRID}>
      {/* A warm band between hairlines: the ledger's sections, inside one card, each with its count and total. */}
      <h3
        className={cn(
          // A warm gradient: each group's band, fading toward the row's end.
          "flex items-baseline justify-between gap-3 border-b border-line-soft bg-[linear-gradient(90deg,var(--color-surface-hover)_0%,var(--color-surface-subtle)_45%,var(--color-surface)_100%)] px-4 py-2.5 md:px-5",
          // Desktop: the group's total sits in the Balance column, over its accounts' balances.
          "lg:col-span-full lg:grid lg:grid-cols-subgrid lg:gap-x-8 xl:gap-x-10",
          EDGE,
          !first && "border-t",
        )}
      >
        <span
          className={cn(
            "text-micro font-semibold tracking-[0.08em] uppercase lg:col-start-1",
            muted ? "text-ink-2" : "text-navy",
          )}
        >
          {title}
          <span className="ml-2 font-medium tracking-normal text-ink-2 normal-case">
            {accounts.length === 1 ? "1 account" : `${accounts.length} accounts`}
          </span>
        </span>
        {!muted && <GroupTotal accounts={accounts} />}
      </h3>
      <ul className={SUBGRID}>
        {accounts.map((account) => (
          <AccountRow key={account.id} account={account} showType={showType} today={today} />
        ))}
      </ul>
    </section>
  );
}

/**
 * One account: who it is, its balance, whether that balance still matches what
 * was verified (with the Verify that settles it), then managing the account.
 *
 * Phones: the name and balance share the first line, the details the second,
 * the verification and Verify the third. A changed checkpoint's tag takes the
 * whole third line, its evidence follows, and Verify comes after the evidence.
 * Tablets: details, verification and actions share the second line. Desktop:
 * one row in the shared columns; a changed checkpoint's evidence sits under
 * its tag. Only a changed row grows.
 *
 * The balance is the row's last amount unless the verification has changed.
 */
function AccountRow({
  account,
  showType,
  today,
}: {
  readonly account: AccountView;
  readonly showType: boolean;
  readonly today: CalendarDate;
}) {
  const reading = balanceReading(account.type, account.balance);
  const view = verificationView(account.verification);
  const changed = view.status === "changed";
  // An archived account cannot be verified: it shows only a verification it already has.
  const marked = !(account.archived && view.status === "never_verified");
  const canArchive = !account.archived && account.balance === 0;
  const canDelete = account.references === 0;
  const managed = account.archived || canArchive || canDelete;
  const opened = shortDate(account.openedOn, today);
  return (
    <li
      className={cn(
        SUBGRID,
        "grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line-soft px-4 py-3 transition-colors last:border-b-0 hover:bg-canvas",
        "md:grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] md:px-5",
        // A subgrid keeps its own gap unless told otherwise: the parent's, exactly.
        "lg:gap-x-8 xl:gap-x-10 lg:py-3.5",
        EDGE,
      )}
    >
      <Glyph
        icon={accountIcon(account.type)}
        tone={account.archived ? "neutral" : "info"}
        className="col-start-1 row-[1/3] lg:col-start-1 lg:justify-self-start"
      />

      <Link
        href={`/activity?account=${account.id}`}
        className={cn(
          "col-start-2 row-start-1 min-w-0 self-end truncate font-semibold hover:underline hover:underline-offset-4 lg:col-start-1 lg:pl-12",
          account.archived ? "text-ink-2" : "text-ink",
        )}
      >
        {account.name}
      </Link>

      <p className="col-[2/-1] row-start-2 min-w-0 self-start truncate text-meta text-ink-2 md:col-end-3 md:self-center lg:col-start-1 lg:col-end-2 lg:self-start lg:pl-12">
        {showType ? `${ACCOUNT_TYPE_LABEL[account.type]} · since ${opened}` : `Since ${opened}`}
      </p>

      <p
        className={cn(
          "col-[3/-1] row-start-1 self-end text-right whitespace-nowrap lg:col-start-2 lg:col-end-3 lg:row-[1/3] lg:self-center",
          // Desktop: a fixed-width pill, the amount centred in it, so the column keeps one
          // width and straight edges whatever the amount's length.
          "lg:w-44 lg:rounded-full lg:bg-surface-subtle lg:py-1.5 lg:text-center lg:shadow-[inset_0_0_0_1px_var(--color-line-soft)]",
          account.archived ? "text-ink-2" : "text-navy",
        )}
      >
        <Money amount={reading.amount} sign={reading.sign} className="text-heading font-bold" />
        {reading.note && (
          <span className="ml-1 text-meta font-medium text-ink-2">{reading.note}</span>
        )}
      </p>

      {marked && (
        <div
          className={cn(
            "col-start-2 row-start-3 md:col-start-3 md:col-end-4 md:row-start-2 md:justify-self-end lg:col-start-3 lg:col-end-4 lg:row-[1/3] lg:justify-self-start",
          )}
        >
          <VerificationMarker account={account} view={view} today={today} />
        </div>
      )}

      {/* The Action cell: Verify, then whatever managing the ledger allows. */}
      {(!account.archived || managed) && (
        <div className="col-start-3 row-start-3 flex items-center justify-end gap-1 justify-self-end md:col-[4/-1] md:row-start-2 lg:col-start-4 lg:col-end-5 lg:row-[1/3] lg:justify-self-start">
          {!account.archived && (
            <VerifyBalanceButton
              id={account.id}
              name={account.name}
              type={account.type}
              balance={account.balance}
              today={today}
              emphasized={changed}
            />
          )}
          {managed && (
            <AccountActions
              id={account.id}
              name={account.name}
              archived={account.archived}
              canArchive={canArchive}
              canDelete={canDelete}
            />
          )}
        </div>
      )}
    </li>
  );
}

type View = ReturnType<typeof verificationView>;

/**
 * A group's total, read as its accounts are: a card group's is owed (or held
 * as credit). Every balance is the ledger's; this only adds the group's rows.
 */
function GroupTotal({ accounts }: { readonly accounts: readonly AccountView[] }) {
  const total = sum(accounts.map((a) => a.balance));
  const reading = balanceReading(accounts[0]!.type, total);
  return (
    // A sky-blue pill, the balances' width: the group's total, apart from its accounts'.
    <span className="rounded-full bg-mist/45 px-3 py-0.5 text-right text-body font-bold whitespace-nowrap text-ocean tabular-nums shadow-[inset_0_0_0_1px_rgb(70_103_141/0.1)] lg:col-start-2 lg:w-44 lg:text-center">
      <Money amount={reading.amount} sign={reading.sign} />
      {reading.note && <span className="ml-1 text-meta font-medium">{reading.note}</span>}
    </span>
  );
}

/**
 * The balance's verification, always stated: never verified is a quiet,
 * neutral marker (an invitation, not a warning); verified is calm; changed is
 * the only warning.
 */
function VerificationMarker({
  account,
  view,
  today,
}: {
  readonly account: AccountView;
  readonly view: View;
  readonly today: CalendarDate;
}) {
  if (view.status === "never_verified") {
    return (
      <span className="inline-flex h-5 items-center gap-1.5 text-meta whitespace-nowrap text-ink-2">
        <CircleDashed aria-hidden className="size-3.5 text-ink-3" />
        Not verified yet
      </span>
    );
  }
  const day = shortDate(view.asOf, today);
  if (view.status === "verified") {
    return (
      <Tag tone="positive" icon={<CheckCircle2 aria-hidden className="size-3.5" />}>
        Verified {day}
      </Tag>
    );
  }
  return (
    // The only warning: the warning ink on white, never a yellow fill.
    // Short, so the column stays narrow: what changed opens in a dialog.
    <ChangedDetails
      label={
        <>
          Changed · <Money amount={view.off} sign="none" /> off
        </>
      }
      title={`${account.name} has changed since ${day}`}
    >
      <ChangedEvidence account={account} view={view} today={today} />
    </ChangedDetails>
  );
}

/**
 * Whether the account is still as verified (docs/domain-model.md §14). A
 * changed checkpoint shows the two amounts it compares, and the entries that
 * make up the recorded amount *as they stand now* — never a claim about which
 * of them changed: moved or deleted entries leave no trace without a revision
 * log (V1.1). Verifying again (the row's Verify) settles it.
 */
function ChangedEvidence({
  account,
  view,
  today,
}: {
  readonly account: AccountView;
  readonly view: Extract<View, { status: "changed" }>;
  readonly today: CalendarDate;
}) {
  const day = shortDate(view.asOf, today);
  const amount = (value: MoneyValue) => {
    const reading = balanceReading(account.type, value);
    return (
      <>
        <Money amount={reading.amount} sign={reading.sign} />
        {reading.note && (
          <span className="ml-1 text-meta font-medium text-ink-2">{reading.note}</span>
        )}
      </>
    );
  };
  // A checkpoint cannot predate its account (the reconcile service rejects
  // it); should one ever exist, there is no valid range to link to.
  const evidence =
    account.openedOn <= view.asOf
      ? activityHref({
          accountId: account.id,
          range: { start: account.openedOn, end: addDays(view.asOf, 1) },
        })
      : null;
  const figure = "mt-1 text-figure font-bold whitespace-nowrap text-navy tabular-nums";
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-[12px] bg-surface-subtle px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-line-soft)]">
          <dt className="text-micro font-semibold tracking-[0.08em] text-ink-2 uppercase">
            Recorded for {day}
          </dt>
          <dd className={figure}>{amount(view.recorded)}</dd>
        </div>
        <div className="rounded-[12px] bg-mist/35 px-4 py-3 shadow-[inset_0_0_0_1px_rgb(70_103_141/0.14)]">
          <dt className="text-micro font-semibold tracking-[0.08em] text-ocean uppercase">
            You verified
          </dt>
          <dd className={figure}>{amount(view.verified)}</dd>
        </div>
      </dl>
      <p className="text-body text-ink-2">
        Entries dated on or before {day} have changed since you verified, so what&apos;s recorded
        for that day is now{" "}
        <Money amount={view.off} sign="none" className="font-semibold text-warning" /> off what you
        counted. Review them, then verify again to settle it.
      </p>
      {evidence && (
        <Link
          href={evidence}
          className={cn("self-start text-body font-medium text-ocean", linkClass)}
        >
          Review entries through {day}
        </Link>
      )}
    </div>
  );
}
