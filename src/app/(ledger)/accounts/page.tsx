import { CheckCircle2, CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { getRequestContext } from "@/app/_server/context";
import { AccountActions } from "@/components/accounts/account-actions";
import { NewAccountButton } from "@/components/accounts/new-account-panel";
import { verificationView } from "@/components/accounts/verification-view";
import { activityHref } from "@/components/activity/links";
import { shortDate } from "@/components/format";
import { accountIcon, ACCOUNT_TYPE_LABEL, Glyph } from "@/components/ledger/icons";
import { linkClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Money } from "@/components/ui/money";
import { EmptyState, PageHeader, Panel, PanelHeader, Tag } from "@/components/ui/panel";
import { addDays, type CalendarDate } from "@/domain/calendar-date";
import { accountClass, type AccountType } from "@/domain/ledger/accounts";
import { NEVER_VERIFIED } from "@/domain/ledger/verification";
import { negate, type Money as MoneyValue } from "@/domain/money";
import { getAccountBalances, getPosition } from "@/server/services/ledger-service";
import {
  getAccountVerifications,
  type Verification,
} from "@/server/services/reconciliation-service";
import { getAccountReferenceCounts, getAccounts } from "@/server/services/setup-service";

export const metadata: Metadata = { title: "Accounts" };

interface AccountView {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  readonly openedOn: CalendarDate;
  readonly balance: MoneyValue;
  readonly archived: boolean;
  readonly references: number;
  readonly verification: Verification;
}

const GROUPS: ReadonlyArray<{ title: string; types: readonly AccountType[]; note: string }> = [
  {
    title: "Everyday money",
    types: ["cash", "bank", "mobile_wallet"],
    note: "What you spend from day to day.",
  },
  { title: "Savings", types: ["savings"], note: "Money you keep aside." },
  { title: "Credit cards", types: ["credit_card"], note: "What you owe." },
];

/** A verification status spans the row under the details (from the name column to the end). */
const STATUS_PLACEMENT = "col-[2/-1] mt-1";

export default async function AccountsPage() {
  const request = await getRequestContext();
  if (!request.ok) return null;
  const { ctx, today } = request;

  const accounts = await getAccounts(ctx);
  const [balances, position, references, verifications] = await Promise.all([
    getAccountBalances(ctx),
    getPosition(ctx),
    getAccountReferenceCounts(ctx),
    getAccountVerifications(
      ctx,
      accounts.map((a) => a.id),
    ),
  ]);

  const views: AccountView[] = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    openedOn: account.openedOn as CalendarDate,
    balance: balances.find((b) => b.accountId === account.id)?.balance ?? (0 as MoneyValue),
    archived: account.archivedAt !== null,
    references: references.get(account.id) ?? 0,
    verification: verifications.get(account.id) ?? NEVER_VERIFIED,
  }));
  const active = views.filter((a) => !a.archived);
  const archived = views.filter((a) => a.archived);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Accounts"
        description="Every balance is the sum of what you have recorded."
        actions={<NewAccountButton today={today} />}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* First in the page: on one column the answer leads; lg:order puts it on the right. */}
        <Panel className="h-fit p-5 lg:order-2" labelledBy="accounts-net-worth">
          <h2 id="accounts-net-worth" className="text-meta font-semibold text-ink-2">
            Net worth
          </h2>
          <p className="mt-1 text-display font-semibold">
            <Money amount={position.netWorth} />
          </p>
          <dl className="mt-5 flex flex-col gap-2.5 text-body">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-2">Own</dt>
              <dd className="font-medium">
                <Money amount={position.assets} sign="none" />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
              <dt className="text-ink-2">Owe</dt>
              <dd className="font-medium">
                <Money amount={position.liabilities} sign="none" />
              </dd>
            </div>
          </dl>
        </Panel>
        <div className="flex flex-col gap-5 lg:order-1">
          {GROUPS.map((group) => {
            const groupAccounts = active.filter((a) => group.types.includes(a.type));
            if (groupAccounts.length === 0) return null;
            return (
              <Panel key={group.title} className="overflow-hidden">
                <PanelHeader title={group.title} note={group.note} />
                <ul>
                  {groupAccounts.map((account) => (
                    <AccountRow key={account.id} account={account} today={today} />
                  ))}
                </ul>
              </Panel>
            );
          })}

          {active.length === 0 && (
            <Panel>
              <EmptyState title="No accounts yet">
                Add the accounts you actually use — cash, bank, mobile wallet, savings, cards.
              </EmptyState>
            </Panel>
          )}

          {archived.length > 0 && (
            <Panel className="overflow-hidden">
              <PanelHeader title="Archived" />
              <ul>
                {archived.map((account) => (
                  <AccountRow key={account.id} account={account} today={today} />
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Whether the account is still as verified (docs/domain-model.md §14). A
 * changed checkpoint shows how far off it is, the two amounts it compares, and
 * the entries that make up the recorded amount *as they stand now* — never a
 * claim about which of them changed: moved or deleted entries leave no trace
 * without a revision log (V1.1). Never verified says nothing.
 */
function VerificationStatus({
  account,
  today,
}: {
  readonly account: AccountView;
  readonly today: CalendarDate;
}) {
  const view = verificationView(account.verification, account.type);
  if (view.status === "never_verified") return null;
  const day = shortDate(view.asOf, today);
  if (view.status === "verified") {
    return (
      <div className={STATUS_PLACEMENT}>
        <Tag tone="positive" icon={<CheckCircle2 aria-hidden className="size-3.5" />}>
          Verified {day}
        </Tag>
      </div>
    );
  }
  const amount = (value: MoneyValue) => (
    <>
      <Money amount={value} sign={view.owed ? "none" : "negative"} />
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
    <div className={cn(STATUS_PLACEMENT, "flex flex-col items-start gap-1")}>
      <Tag tone="warning" icon={<CircleAlert aria-hidden className="size-3.5" />}>
        Changed since {day} · <Money amount={view.off} sign="none" /> off
      </Tag>
      <p className="text-meta text-ink-2">
        Recorded {amount(view.recorded)} for that day · verified {amount(view.verified)}
        {evidence && (
          <>
            {" · "}
            <Link href={evidence} className={cn("font-medium text-ink", linkClass)}>
              Review entries through {day}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function AccountRow({
  account,
  today,
}: {
  readonly account: AccountView;
  readonly today: CalendarDate;
}) {
  const owed = accountClass(account.type) === "liability";
  const shown = owed ? (negate(account.balance) as MoneyValue) : account.balance;
  return (
    <li className="border-b border-line px-4 py-3 last:border-b-0 md:px-5">
      {/*
       * Phones: the name and balance share the first line; the details and the
       * actions share the second, and the actions wrap below the details when
       * both do not fit (never beside the balance, never overflowing).
       * md and up: the second-line wrapper dissolves (display: contents), so the
       * actions sit between the name and the balance as one row.
       */}
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 md:grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] md:gap-x-4">
        <Glyph icon={accountIcon(account.type)} className="col-[1] row-[1/3]" />
        <div className="col-[2] row-[1] flex min-w-0 items-center gap-2">
          <Link
            href={`/activity?account=${account.id}`}
            className="truncate font-medium hover:underline hover:underline-offset-4"
          >
            {account.name}
          </Link>
          {account.archived && <Tag>Archived</Tag>}
        </div>
        <span className="col-[3] row-[1] text-right text-body font-semibold whitespace-nowrap md:col-[4] md:row-[1/3]">
          <Money amount={shown} sign={owed ? "none" : "negative"} />
          {owed && <span className="ml-1 text-meta font-normal text-ink-2">owed</span>}
        </span>
        <div className="col-[2/-1] row-[2] flex flex-wrap items-center gap-x-3 gap-y-1 md:contents">
          <p className="max-w-full min-w-0 truncate text-meta text-ink-2 md:col-[2] md:row-[2]">
            {ACCOUNT_TYPE_LABEL[account.type]} · since {shortDate(account.openedOn, today)}
          </p>
          <div className="ml-auto md:col-[3] md:row-[1/3] md:ml-0">
            <AccountActions
              id={account.id}
              name={account.name}
              type={account.type}
              balance={account.balance}
              today={today}
              archived={account.archived}
              canArchive={!account.archived && account.balance === 0}
              canDelete={account.references === 0}
            />
          </div>
        </div>
        {/* Under the details, across the row: the status never squeezes beside the actions. */}
        <VerificationStatus account={account} today={today} />
      </div>
    </li>
  );
}
