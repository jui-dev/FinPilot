import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import Link from "next/link";

import { addDays, type CalendarDate } from "@/domain/calendar-date";
import { accountClass, type AccountType } from "@/domain/ledger/accounts";
import type { Verification } from "@/domain/ledger/verification";
import { negate, type Money as MoneyValue } from "@/domain/money";

import { activityHref } from "../activity/links";
import { shortDate } from "../format";
import { accountIcon, ACCOUNT_TYPE_LABEL, Glyph } from "../ledger/icons";
import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { EmptyState, Tag } from "../ui/panel";
import { AccountActions } from "./account-actions";
import { verificationView } from "./verification-view";
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
 * subgrid, so balances, verifications and their Verify buttons line up down
 * the page whatever each row holds. The account column is capped, so a balance
 * stays close to its name; the verification is capped at about one line of a
 * changed checkpoint's evidence, and Verify closes it on the right. The rest
 * goes to the management actions, which sit at the row's far end. The
 * zero-width first and last tracks are the side padding (the column gap on
 * either side of them), which keeps row borders full-bleed; the gap is 16px
 * until xl, so 1024px fits every column.
 * Tracks: pad · glyph · account · balance · verification · Verify · manage · pad.
 */
const DESKTOP_GRID =
  "lg:grid lg:grid-cols-[0_2.25rem_minmax(11rem,20rem)_auto_minmax(max-content,34rem)_auto_minmax(max-content,1fr)_0] lg:gap-x-4 xl:gap-x-5";
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
        "overflow-clip rounded-panel border border-line bg-surface shadow-card",
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
          "hidden border-b border-line py-2.5 text-micro font-semibold tracking-wider text-navy uppercase",
        )}
      >
        <span className="col-start-3">Account</span>
        <span className="text-right">Balance</span>
        <span className="col-span-2">Verification</span>
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
      {/* A warm band between hairlines: the ledger's sections, inside one card. */}
      <h3
        className={cn(
          "border-b border-line bg-surface-subtle px-4 py-2 text-meta font-semibold md:px-5 lg:col-span-full lg:px-4 xl:px-5",
          muted ? "text-ink-2" : "text-navy",
          !first && "border-t",
        )}
      >
        {title}
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
  const owed = accountClass(account.type) === "liability";
  const shown = owed ? (negate(account.balance) as MoneyValue) : account.balance;
  const view = verificationView(account.verification, account.type);
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
        "grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-b-0",
        "md:grid-cols-[2.25rem_minmax(0,1fr)_auto_auto_auto] md:px-5",
        // A subgrid keeps its own gap unless told otherwise: the parent's, exactly.
        "lg:gap-x-4 lg:px-0 xl:gap-x-5 lg:py-3.5",
      )}
    >
      <Glyph
        icon={accountIcon(account.type)}
        tone={account.archived ? "neutral" : "info"}
        className="col-start-1 row-[1/3] lg:col-start-2"
      />

      <Link
        href={`/activity?account=${account.id}`}
        className={cn(
          "col-start-2 row-start-1 min-w-0 self-end truncate font-semibold hover:underline hover:underline-offset-4 lg:col-start-3",
          account.archived ? "text-ink-2" : "text-ink",
        )}
      >
        {account.name}
      </Link>

      <p className="col-[2/-1] row-start-2 min-w-0 self-start truncate text-meta text-ink-2 md:col-end-3 md:self-center lg:col-start-3 lg:self-start lg:col-end-4">
        {showType ? `${ACCOUNT_TYPE_LABEL[account.type]} · since ${opened}` : `Since ${opened}`}
      </p>

      <p
        className={cn(
          "col-[3/-1] row-start-1 self-end text-right whitespace-nowrap lg:col-start-4 lg:col-end-5 lg:row-[1/3] lg:self-center",
          account.archived ? "text-ink-2" : "text-navy",
        )}
      >
        <Money
          amount={shown}
          sign={owed ? "none" : "negative"}
          className="text-heading font-bold"
        />
        {owed && <span className="ml-1 text-meta font-medium text-ink-2">owed</span>}
      </p>

      {marked && (
        <div
          className={cn(
            "row-start-3 md:col-start-3 md:col-end-4 md:row-start-2 md:justify-self-end lg:col-start-5 lg:col-end-6 lg:justify-self-start",
            changed ? "col-[2/-1] lg:row-start-1 lg:self-end" : "col-start-2 lg:row-[1/3]",
          )}
        >
          <VerificationMarker view={view} today={today} />
        </div>
      )}

      {!account.archived && (
        <div
          className={cn(
            "col-start-3 justify-self-end md:col-start-4 md:row-start-2 lg:col-start-6",
            changed ? "row-start-5 lg:row-start-1 lg:self-end" : "row-start-3 lg:row-[1/3]",
          )}
        >
          <VerifyBalanceButton
            id={account.id}
            name={account.name}
            type={account.type}
            balance={account.balance}
            today={today}
            emphasized={changed}
          />
        </div>
      )}

      {managed && (
        <div
          className={cn(
            "justify-self-end md:col-start-5 md:row-start-2 lg:col-start-7",
            // Phones: beside a changed row's Verify; otherwise the first free line.
            changed
              ? "col-start-2 row-start-5 lg:row-start-1 lg:self-end"
              : cn("col-[2/-1] lg:row-[1/3]", marked ? "row-start-4" : "row-start-3"),
          )}
        >
          <AccountActions
            id={account.id}
            name={account.name}
            archived={account.archived}
            canArchive={canArchive}
            canDelete={canDelete}
          />
        </div>
      )}

      {/* Desktop: the evidence fills the verification and Verify columns but never
          sizes them (w-0, then min-w-full), so a long sentence wraps instead of
          pushing the management actions out of the row. */}
      {changed && (
        <ChangedEvidence
          account={account}
          view={view}
          today={today}
          className="col-[2/-1] row-start-4 md:row-start-3 lg:col-start-5 lg:col-end-7 lg:row-start-2 lg:w-0 lg:min-w-full"
        />
      )}
    </li>
  );
}

type View = ReturnType<typeof verificationView>;

/**
 * The balance's verification, always stated: never verified is a quiet,
 * neutral marker (an invitation, not a warning); verified is calm; changed is
 * the only warning.
 */
function VerificationMarker({
  view,
  today,
}: {
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
    <Tag tone="warning" icon={<CircleAlert aria-hidden className="size-3.5" />}>
      Changed since {day} · <Money amount={view.off} sign="none" /> off
    </Tag>
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
  className,
}: {
  readonly account: AccountView;
  readonly view: Extract<View, { status: "changed" }>;
  readonly today: CalendarDate;
  readonly className?: string;
}) {
  const day = shortDate(view.asOf, today);
  const amount = (value: MoneyValue) => (
    <>
      <Money amount={value} sign={view.owed ? "none" : "negative"} className="text-ink" />
      {view.owed && " owed"}
    </>
  );
  // A checkpoint cannot predate its account (the reconcile service rejects
  // it); should one ever exist, there is no valid range to link to.
  const evidence =
    account.openedOn <= view.asOf
      ? activityHref({
          accountId: account.id,
          range: { start: account.openedOn, end: addDays(view.asOf, 1) },
        })
      : null;
  return (
    <p
      className={cn(
        "rounded-r-control border-l-2 border-warning bg-surface-subtle px-3 py-2 text-meta text-ink-2",
        className,
      )}
    >
      Recorded {amount(view.recorded)} for that day · verified {amount(view.verified)}
      {evidence && (
        <>
          {" · "}
          <Link href={evidence} className={cn("font-medium whitespace-nowrap text-ink", linkClass)}>
            Review entries through {day}
          </Link>
        </>
      )}
    </p>
  );
}
