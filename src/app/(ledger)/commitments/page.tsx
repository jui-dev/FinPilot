import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import {
  CommitmentList,
  RecentlyResolved,
  type CommitmentRow,
  type ResolvedRow,
} from "@/components/commitments/commitment-list";
import { NewCommitmentButton, type Choice } from "@/components/commitments/commitment-panel";
import { CommitmentsSummary } from "@/components/commitments/commitments-summary";
import { pluralPayments } from "@/components/commitments/describe";
import { CARD, OccurrenceList, type PendingRow } from "@/components/commitments/occurrence-list";
import { shortDate } from "@/components/format";
import { AreaSwitch, AVAILABLE_AREA } from "@/components/shell/area-switch";
import { EmptyState } from "@/components/ui/panel";
import { materialisedThrough } from "@/domain/commitments/occurrences";
import { sum } from "@/domain/money";
import {
  getCommitments,
  getOccurrences,
  type OccurrenceView,
} from "@/server/services/commitment-service";
import { getAccounts, getCategories } from "@/server/services/setup-service";

export const metadata: Metadata = { title: "Commitments" };

/** How many settled occurrences the page keeps in view: it looks forward, not back. */
const RECENT_RESOLVED = 5;

/**
 * "What am I committed to paying, what needs my attention now, and what is
 * coming next?" Read in that order: the outcome, what needs a decision now,
 * what is coming, then the commitments themselves and the latest settled ones.
 * Every state and date is the domain's; nothing is paid by reaching a date.
 */
export default async function CommitmentsPage() {
  const request = await getRequestContext();
  if (!request.ok) return null;
  const { ctx, today } = request;

  const [occurrences, commitments, accounts, categories] = await Promise.all([
    getOccurrences(ctx),
    getCommitments(ctx),
    getAccounts(ctx),
    getCategories(ctx),
  ]);

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const activeAccounts: Choice[] = accounts
    .filter((a) => a.archivedAt === null)
    .map((a) => ({ id: a.id, name: a.name }));
  const spendingCategories = categories.filter((c) => c.kind === "expense");
  const formChoices = {
    categories: spendingCategories
      .filter((c) => c.archivedAt === null)
      .map((c) => ({ id: c.id, name: c.name })),
    accounts: activeAccounts,
    today,
  };

  const header = (
    <>
      <AreaSwitch area={AVAILABLE_AREA} current="/commitments" />
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
        <h1 className="text-title font-bold text-navy">Commitments</h1>
        <div className="md:row-span-2">
          <NewCommitmentButton {...formChoices} emphasized={commitments.length === 0} />
        </div>
        <p className="col-span-2 text-body text-ink-2 md:col-span-1">
          What you owe on a schedule, and when each payment is due.
        </p>
      </header>
    </>
  );

  if (commitments.length === 0) {
    return (
      <div className="flex flex-col gap-5 md:gap-6">
        {header}
        <section className={CARD} aria-label="Commitments">
          <EmptyState title="No commitments yet">
            Add the payments you owe on a schedule — rent, internet, school fees, insurance.
            FinPilot shows when each one is due, and records the expense only when you pay it.
          </EmptyState>
        </section>
      </div>
    );
  }

  const pending = (o: OccurrenceView): PendingRow => ({
    id: o.id,
    name: o.name,
    dueOn: o.dueOn,
    timing: o.display === "overdue" || o.display === "due_today" ? o.display : "upcoming",
    expectedAmount: o.expectedAmount,
    categoryName: categoryName.get(o.categoryId) ?? "",
    expectedAccountId: o.expectedAccountId,
    accountName: o.expectedAccountId ? (accountName.get(o.expectedAccountId) ?? null) : null,
  });
  const attention = occurrences
    .filter((o) => o.display === "overdue" || o.display === "due_today")
    .map(pending);
  const comingUp = occurrences.filter((o) => o.display === "upcoming").map(pending);
  const through = materialisedThrough(today);

  const resolved: ResolvedRow[] = occurrences
    .filter((o) => o.state !== "pending")
    .sort((a, b) => (a.dueOn < b.dueOn ? 1 : a.dueOn > b.dueOn ? -1 : 0))
    .slice(0, RECENT_RESOLVED)
    .map((o) => ({
      id: o.id,
      name: o.name,
      dueOn: o.dueOn,
      expectedAmount: o.expectedAmount,
      payment:
        o.payment && o.transactionId
          ? {
              transactionId: o.transactionId,
              amount: o.payment.amount,
              paidOn: o.payment.paidOn,
              accountName: accountName.get(o.payment.accountId) ?? "",
            }
          : null,
    }));

  const rules: CommitmentRow[] = commitments.map((c) => {
    const next = occurrences.find(
      (o) => o.commitmentId === c.id && o.state === "pending" && o.dueOn >= today,
    );
    // Its own category and account stay choosable even if archived since.
    const ownCategory = spendingCategories.find((cat) => cat.id === c.categoryId);
    const ownAccount = accounts.find((a) => a.id === c.expectedAccountId);
    return {
      ...c,
      categoryName: categoryName.get(c.categoryId) ?? "",
      accountName: c.expectedAccountId ? (accountName.get(c.expectedAccountId) ?? null) : null,
      nextDue: next?.dueOn ?? null,
      categories:
        ownCategory && ownCategory.archivedAt !== null
          ? [...formChoices.categories, { id: ownCategory.id, name: ownCategory.name }]
          : formChoices.categories,
      accounts:
        ownAccount && ownAccount.archivedAt !== null
          ? [...activeAccounts, { id: ownAccount.id, name: ownAccount.name }]
          : activeAccounts,
    };
  });

  const nextUp = occurrences.find((o) => o.display === "upcoming");

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      {header}

      <CommitmentsSummary
        attention={{
          total: sum(attention.map((r) => r.expectedAmount)),
          count: attention.length,
          overdue: attention.filter((r) => r.timing === "overdue").length,
        }}
        comingUp={{ total: sum(comingUp.map((r) => r.expectedAmount)), count: comingUp.length }}
        through={through}
        next={
          nextUp ? { name: nextUp.name, dueOn: nextUp.dueOn, amount: nextUp.expectedAmount } : null
        }
        today={today}
      />

      <div className="grid items-start gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-7">
          {attention.length > 0 && (
            <OccurrenceList
              id="needs-attention"
              title="Needs attention"
              note={`${pluralPayments(attention.length)} overdue or due today`}
              rows={attention}
              empty={null}
              accounts={activeAccounts}
              today={today}
              attention
            />
          )}
          <OccurrenceList
            id="coming-up"
            title="Coming up"
            note={`Through ${shortDate(through, today)}`}
            rows={comingUp}
            empty={`Nothing else is due through ${shortDate(through, today)}.`}
            accounts={activeAccounts}
            today={today}
            attention={false}
          />
        </div>
        <div className="flex flex-col gap-5 lg:col-span-5">
          <CommitmentList commitments={rules} today={today} through={through} />
          <RecentlyResolved rows={resolved} today={today} />
        </div>
      </div>
    </div>
  );
}
