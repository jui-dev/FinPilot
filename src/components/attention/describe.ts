import { yearMonthOf, type CalendarDate } from "@/domain/calendar-date";
import { formatShare } from "@/domain/ledger/analytics";
import { accountClass } from "@/domain/ledger/accounts";
import { abs, formatMoney, type Money } from "@/domain/money";
import type { AttentionEvidence, AttentionSignal } from "@/domain/signals/signals";

import { verificationView } from "../accounts/verification-view";
import { activityHref, cashFlowHref } from "../activity/links";
import { dayLabel, monthLabel, shortDate } from "../format";

/**
 * How an Attention signal reads (docs/domain-model.md §11): what happened, why
 * it matters, the figure it is about, and where to look or act. Everything is
 * worded from the signal's own parameters; nothing is recomputed here. No
 * internal term (kind, key, occurrence, checkpoint, earmark) reaches the copy.
 */

export type AttentionTone = "warning" | "negative" | "info" | "neutral";
export type AttentionIcon = "calendar" | "calendar-soon" | "alert" | "mismatch" | "trend" | "scale";

export interface AttentionRow {
  readonly key: string;
  readonly tag: {
    readonly label: string;
    readonly tone: AttentionTone;
    readonly icon: AttentionIcon;
  };
  /** What happened. */
  readonly title: string;
  /** Why it matters, in one sentence. */
  readonly detail: string;
  /** The figure it is about, and a word after it ("short", "off"). */
  readonly amount: {
    readonly value: Money;
    readonly sign: "none" | "always";
    readonly note?: string;
    readonly negative?: boolean;
  };
  /** Where the evidence and the action live. */
  readonly evidence: { readonly href: string; readonly label: string };
  /** Present only for a signal that can be hidden: how long it is hidden for. */
  readonly hide: { readonly until: string | null } | null;
}

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

/** "A", "A and B", "A, B and C". */
export function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The existing page that holds a signal's evidence, as a link. */
export function evidenceHref(evidence: AttentionEvidence, today: CalendarDate): string {
  switch (evidence.page) {
    case "commitments":
      return "/commitments";
    case "set_aside":
      return "/set-aside";
    case "activity":
      return activityHref({ accountId: evidence.accountId, range: evidence.range });
    case "cash_flow_change":
      return `${cashFlowHref(evidence.month, yearMonthOf(today))}#cash-flow-change`;
  }
}

export function describeSignal(signal: AttentionSignal, today: CalendarDate): AttentionRow {
  const href = evidenceHref(signal.evidence, today);
  const date = (d: CalendarDate) => shortDate(d, today);

  switch (signal.kind) {
    case "commitment_overdue":
      return {
        key: signal.key,
        tag: { label: "Overdue", tone: "warning", icon: "calendar" },
        title: `${signal.name} is overdue`,
        detail:
          signal.occurrenceIds.length === 1
            ? `Due ${date(signal.oldestDueOn)}, ${days(signal.daysOverdue)} ago, and not paid or skipped.`
            : `${signal.occurrenceIds.length} payments are not paid or skipped; the oldest was due ${date(signal.oldestDueOn)}, ${days(signal.daysOverdue)} ago.`,
        amount: { value: signal.total, sign: "none" },
        evidence: { href, label: "Pay or skip in Commitments" },
        hide: null,
      };

    case "commitment_due_today":
      return {
        key: signal.key,
        tag: { label: "Due today", tone: "warning", icon: "calendar" },
        title: `${signal.name} is due today`,
        detail: "It hasn't been paid or skipped yet.",
        amount: { value: signal.amount, sign: "none" },
        evidence: { href, label: "Pay or skip in Commitments" },
        hide: null,
      };

    case "commitment_due_soon":
      return {
        key: signal.key,
        tag: {
          label: signal.daysUntil === 1 ? "Tomorrow" : `In ${signal.daysUntil} days`,
          tone: "info",
          icon: "calendar-soon",
        },
        title:
          signal.daysUntil === 1
            ? `${signal.name} is due tomorrow`
            : `${signal.name} is due ${dayLabel(signal.dueOn, today)}`,
        detail: "Coming up, and not paid yet.",
        amount: { value: signal.amount, sign: "none" },
        evidence: { href, label: "Open Commitments" },
        hide: null,
      };

    case "set_aside_short":
      return {
        key: signal.key,
        tag: { label: "Short", tone: "negative", icon: "alert" },
        title: `${signal.itemName} is short on ${signal.accountName}`,
        detail: `${signal.accountName} now holds less than is set aside there: ${formatMoney(signal.covered)} of ${formatMoney(signal.reserved)} is still covered.`,
        amount: { value: signal.short, sign: "none", note: "short", negative: true },
        evidence: { href, label: "Refill or release in Set aside" },
        hide: null,
      };

    case "verification_changed": {
      // Worded exactly as Accounts words a changed verification: a card's
      // balance reads as an amount owed.
      const view = verificationView(
        {
          status: "changed",
          asOf: signal.asOf,
          stated: signal.stated,
          recorded: signal.recorded,
          drift: signal.drift,
        },
        signal.accountType,
      );
      if (view.status !== "changed") throw new Error("A changed verification has drift.");
      const shown = (value: Money) => `${formatMoney(value)}${view.owed ? " owed" : ""}`;
      return {
        key: signal.key,
        tag: { label: "Doesn't match", tone: "warning", icon: "mismatch" },
        title: `${signal.accountName} no longer matches its ${date(signal.asOf)} verification`,
        detail: `The ledger now records ${shown(view.recorded)} for that day; you verified ${shown(view.verified)}.`,
        amount: { value: view.off, sign: "none", note: "off" },
        evidence: { href, label: `Review entries through ${date(signal.asOf)}` },
        hide: null,
      };
    }

    case "spending_up": {
      const [first, second] = signal.drivers;
      let why: string;
      if (first === undefined) {
        why = "No single category accounts for it.";
      } else if (signal.drivers.length === 1 && first.change === signal.grossIncreases) {
        why = `${first.name} accounts for all of the increase.`;
      } else {
        const shareOf = (l: typeof first) => formatShare(l.shareOfIncreases!);
        why =
          second === undefined
            ? `${first.name} accounts for ${shareOf(first)} of the increase.`
            : `${first.name} accounts for ${shareOf(first)} of the increase, ${second.name} for ${shareOf(second)}.`;
      }
      const lower = signal.offsets.map((l) => l.name);
      if (lower.length > 0)
        why += ` ${listOf(lower)} ${lower.length === 1 ? "was" : "were"} lower.`;
      return {
        key: signal.key,
        tag: { label: "Spending up", tone: "neutral", icon: "trend" },
        title: `Spending is up ${formatMoney(signal.net)} on the same days last month`,
        detail: why,
        amount: { value: signal.net, sign: "always" },
        evidence: { href, label: "See what changed" },
        hide: { until: monthLabel(signal.month).split(" ")[0]! },
      };
    }

    case "unexplained_adjustment": {
      const difference = formatMoney(abs(signal.amount));
      const detail =
        accountClass(signal.accountType) === "asset"
          ? `Verifying on ${date(signal.asOf)} found ${difference} ${signal.amount < 0 ? "less" : "more"} than the ledger recorded, so an adjustment was added.`
          : `Verifying on ${date(signal.asOf)} corrected the recorded balance by ${difference} with an adjustment.`;
      return {
        key: signal.key,
        tag: { label: "Adjusted", tone: "neutral", icon: "scale" },
        title: `${signal.accountName} had an unexplained difference`,
        detail,
        amount: { value: abs(signal.amount), sign: "none" },
        evidence: { href, label: "See the adjustment" },
        hide: { until: null },
      };
    }
  }
}

/** "3 things need a look", "1 thing needs a look". */
export const countLine = (n: number) =>
  n === 1 ? "1 thing needs a look" : `${n} things need a look`;
