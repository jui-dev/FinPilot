import { describe, expect, it } from "vitest";

import { archivedAccountOf, describeEvent } from "@/components/activity/describe";
import { accountIcon, TransferIcon } from "@/components/ledger/icons";
import type { CalendarDate } from "@/domain/calendar-date";
import type { TransactionType } from "@/domain/ledger/transactions";
import { money } from "@/domain/money";
import type { AccountRef, ActivityItem, ActivityRow } from "@/server/services/activity-service";

const taka = (value: number) => money(value * 100);
const on = "2026-09-20" as CalendarDate;

const cash: AccountRef = { id: "cash", name: "Cash", type: "cash" };
const bank: AccountRef = { id: "bank", name: "City Bank", type: "bank" };
const bkash: AccountRef = { id: "bkash", name: "bKash", type: "mobile_wallet" };
const visa: AccountRef = { id: "visa", name: "Visa card", type: "credit_card" };

function row(type: TransactionType, amount: number, overrides: Partial<ActivityRow> = {}) {
  return {
    id: `${type}-${amount}`,
    sequence: 1,
    type,
    occurredOn: on,
    amount: taka(amount),
    account: cash,
    counterAccount: null,
    category: null,
    refundOfId: null,
    groupId: null,
    description: null,
    note: null,
    ...overrides,
  } satisfies ActivityRow;
}

const item = (primary: ActivityRow, extra: Partial<ActivityItem> = {}): ActivityItem => ({
  key: primary.id,
  occurredOn: primary.occurredOn,
  primary,
  fee: null,
  refundOf: null,
  ...extra,
});

describe("how an Activity row reads in columns", () => {
  it("lays an expense out as its category and its account, with the note beneath", () => {
    const event = describeEvent(
      item(
        row("expense", -450, {
          description: "Pathao",
          category: { id: "t", name: "Transport" },
          note: "Ride home in the rain",
        }),
      ),
    );
    expect(event).toMatchObject({
      title: "Pathao",
      category: "Transport",
      account: { label: "Cash", icon: accountIcon("cash") },
      detail: "Ride home in the rain",
      meta: ["Transport", "Cash"],
      amount: taka(-450),
      sign: "negative",
      amountClass: "text-ink",
      fee: null,
    });
  });

  it("has no second line without a note, and names an uncategorised expense", () => {
    const event = describeEvent(item(row("expense", -90)));
    expect(event.detail).toBeNull();
    expect(event.category).toBe("Uncategorised");
    expect(event.title).toBe("Expense");
  });

  it("shows income with a plus, in its category", () => {
    const event = describeEvent(
      item(row("income", 95_000, { account: bank, category: { id: "s", name: "Salary" } })),
    );
    expect(event).toMatchObject({
      category: "Salary",
      account: { label: "City Bank", icon: accountIcon("bank") },
      amount: taka(95_000),
      sign: "always",
      amountClass: "text-positive",
    });
  });

  it("names what a described refund refers to, and keeps it in the refunded category", () => {
    const original = row("expense", -2_000, { id: "shoes", description: "Bata" });
    const refund = row("refund", 800, {
      account: visa,
      category: { id: "sh", name: "Shopping" },
      description: "Returned sandals",
      refundOfId: "shoes",
    });
    const event = describeEvent(item(refund, { refundOf: original }));
    expect(event).toMatchObject({
      title: "Returned sandals",
      category: "Shopping",
      detail: "Refund of Bata",
      tag: { label: "Refund", tone: "positive" },
      amount: taka(800),
      sign: "always",
    });
  });

  it("does not repeat the original when the title already names it", () => {
    const original = row("expense", -2_000, { id: "shoes", description: "Bata" });
    const event = describeEvent(
      item(row("refund", 800, { refundOfId: "shoes" }), { refundOf: original }),
    );
    expect(event.title).toBe("Refund — Bata");
    expect(event.detail).toBeNull();
  });

  it("shows a transfer as a route with its fee apart, unsigned without a perspective", () => {
    const transfer = row("transfer", -5_000, { account: bkash, counterAccount: cash });
    const fee = row("expense", -93, { id: "fee", account: bkash });
    const event = describeEvent(item(transfer, { fee }));
    expect(event).toMatchObject({
      title: "Transfer to Cash",
      category: "Transfer",
      account: { label: "bKash → Cash", icon: null },
      meta: ["bKash → Cash"],
      icon: TransferIcon,
      tag: null,
      amount: taka(5_000),
      sign: "none",
      fee: taka(93),
    });
  });

  it("signs a transfer from the filtered account's side", () => {
    const transfer = item(row("transfer", -5_000, { account: bkash, counterAccount: cash }));
    expect(describeEvent(transfer, "bkash")).toMatchObject({
      amount: taka(-5_000),
      sign: "negative",
    });
    expect(describeEvent(transfer, "cash")).toMatchObject({ amount: taka(5_000), sign: "always" });
  });

  it("calls a payment to a card a card payment, in the column rather than twice", () => {
    const event = describeEvent(
      item(row("transfer", -12_000, { account: bank, counterAccount: visa })),
    );
    expect(event.category).toBe("Card payment");
    expect(event.tag).toEqual({ label: "Card payment", tone: "info" });
  });

  it("describes opening balances and adjustments by what they are", () => {
    expect(describeEvent(item(row("opening_balance", 4_000)))).toMatchObject({
      title: "Opening balance",
      category: "Starting balance",
      detail: null,
    });
    expect(describeEvent(item(row("opening_balance", -6_000, { account: visa })))).toMatchObject({
      category: "Owed at start",
      amount: taka(6_000),
      sign: "none",
    });
    expect(describeEvent(item(row("adjustment", -350)))).toMatchObject({
      title: "Balance adjustment",
      category: "Adjustment",
      detail: "From verifying the balance",
      amount: taka(-350),
      sign: "always",
    });
  });
});

describe("which archived account freezes an Activity event", () => {
  const accounts = (...archived: string[]) =>
    [cash, bank, bkash, visa].map((a) => ({
      id: a.id,
      name: a.name,
      archivedAt: archived.includes(a.id) ? "2026-09-21T00:00:00.000Z" : null,
    }));

  it("is none when nothing the event touches is archived", () => {
    expect(archivedAccountOf(item(row("expense", -450)), accounts("bank"))).toBeNull();
    expect(archivedAccountOf(null, accounts("cash"))).toBeNull();
  });

  it("names the event's own account when it is archived", () => {
    expect(archivedAccountOf(item(row("expense", -450)), accounts("cash"))).toBe("Cash");
  });

  it("looks at both sides of a transfer and at its fee", () => {
    const transfer = row("transfer", -2_000, { account: bkash, counterAccount: bank });
    expect(archivedAccountOf(item(transfer), accounts("bank"))).toBe("City Bank");
    const withFee = item(row("transfer", -2_000, { account: bank, counterAccount: cash }), {
      fee: row("expense", -37, { account: visa }),
    });
    expect(archivedAccountOf(withFee, accounts("visa"))).toBe("Visa card");
    expect(archivedAccountOf(withFee, accounts("visa", "bank"))).toBe("City Bank");
  });
});
