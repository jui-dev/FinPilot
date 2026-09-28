import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  accountEvidence,
  cardsRow,
  earmarkEvidence,
  listOf,
  outcomeOf,
  spokenFor,
  spokenForBar,
} from "@/components/available/describe";
import {
  availableBridge,
  type AvailableAccountInput,
  type AvailableEarmarkInput,
  type AvailableOccurrenceInput,
} from "@/domain/available/bridge";
import { calendarDateFromIso } from "@/domain/calendar-date";
import type { AccountType } from "@/domain/ledger/accounts";
import { fromMajor, money } from "@/domain/money";
import type { AvailableView } from "@/server/services/available-service";

const t = fromMajor;
const TODAY = calendarDateFromIso("2026-09-22");

const acct = (
  id: string,
  type: AccountType,
  balance: number,
  included = type !== "savings",
): AvailableAccountInput => ({
  accountId: id,
  type,
  includedInAvailable: included,
  balance: t(balance),
});
const due = (id: string, amount: number, dueOn = "2026-10-01"): AvailableOccurrenceInput => ({
  occurrenceId: id,
  dueOn: calendarDateFromIso(dueOn),
  expectedAmount: t(amount),
  state: "pending",
});
const covered = (itemId: string, accountId: string, amount: number): AvailableEarmarkInput => ({
  itemId,
  accountId,
  covered: t(amount),
});

/** A view as the service returns it, from the real bridge; names are the ids. */
function view(
  accounts: AvailableAccountInput[],
  occurrences: AvailableOccurrenceInput[] = [],
  earmarks: AvailableEarmarkInput[] = [],
  archived: readonly string[] = [],
): AvailableView {
  const b = availableBridge({ today: TODAY, accounts, occurrences, earmarks });
  return {
    ...b,
    accounts: b.accounts.map((a) => ({
      ...a,
      name: a.accountId,
      archived: archived.includes(a.accountId),
    })),
    commitments: b.commitments.map((c) => ({
      ...c,
      commitmentId: c.occurrenceId,
      name: c.occurrenceId,
      display: "upcoming" as const,
    })),
    earmarks: b.earmarks.map((e) => ({
      ...e,
      itemName: e.itemId,
      accountName: e.accountId,
      reserved: e.covered,
      short: money(0),
    })),
  };
}

/** The September scenario on 2026-09-22 (A-60). */
const september = () =>
  view(
    [
      acct("Bank", "bank", 133_000),
      acct("Cash", "cash", 4_200),
      acct("bKash", "mobile_wallet", 8_963),
      acct("Savings", "savings", 90_000),
      acct("Visa", "credit_card", -6_000),
    ],
    [
      due("Internet", 1_500, "2026-09-25"),
      due("Rent", 30_000),
      due("Streaming", 700, "2026-10-03"),
    ],
    [covered("Laptop", "Savings", 90_000), covered("Laptop", "Bank", 20_000)],
  );

describe("words", () => {
  it("names the card line by the sign of what cards hold, and omits it without a card", () => {
    expect(cardsRow(view([acct("Bank", "bank", 1_000)]))).toBeNull();
    expect(cardsRow(september())).toEqual({ label: "Owed on cards", amount: t(-6_000) });
    expect(cardsRow(view([acct("Bank", "bank", 1_000), acct("Visa", "credit_card", 500)]))).toEqual(
      { label: "Credit on cards", amount: t(500) },
    );
    expect(cardsRow(view([acct("Bank", "bank", 1_000), acct("Visa", "credit_card", 0)]))).toEqual({
      label: "Nothing owed on cards",
      amount: t(0),
    });
  });

  it("lists only what actually stands between the balances and Available", () => {
    expect(listOf(spokenFor(september(), "22 Oct"))).toBe(
      "what you owe on cards, payments due by 22 Oct and money set aside",
    );
    expect(spokenFor(view([acct("Bank", "bank", 1_000)]), "22 Oct")).toEqual([]);
    expect(
      listOf(spokenFor(view([acct("Bank", "bank", 1_000)], [due("Rent", 100)]), "22 Oct")),
    ).toBe("payments due by 22 Oct");
    // A card in credit is not something owed.
    expect(
      spokenFor(view([acct("Bank", "bank", 1_000), acct("Visa", "credit_card", 500)]), "22 Oct"),
    ).toEqual([]);
  });

  it("reads the outcome from the sign of Available", () => {
    expect([outcomeOf(t(1)), outcomeOf(t(0)), outcomeOf(t(-1))]).toEqual(["free", "zero", "over"]);
  });
});

describe("spokenForBar", () => {
  it("divides the money in counted accounts into what is spoken for and what is left", () => {
    expect(spokenForBar(september())).toMatchObject({
      pool: t(146_163),
      over: null,
      segments: [
        { kind: "owed", amount: t(6_000) },
        { kind: "payments", amount: t(32_200) },
        { kind: "setAside", amount: t(20_000) },
        { kind: "available", amount: t(87_963) },
      ],
    });
  });

  it("includes a card's credit in the pool, and leaves out empty parts", () => {
    const bar = spokenForBar(view([acct("Bank", "bank", 1_000), acct("Visa", "credit_card", 500)]));
    expect(bar).toMatchObject({
      pool: t(1_500),
      segments: [{ kind: "available", amount: t(1_500), share: 1 }],
    });
  });

  it("marks an over-commitment as the part beyond the balances", () => {
    const bar = spokenForBar(
      view(
        [acct("Bank", "bank", 20_000), acct("Visa", "credit_card", -15_000)],
        [due("Rent", 30_000)],
      ),
    )!;
    expect(bar.segments.map((s) => s.kind)).toEqual(["owed", "payments"]);
    expect(bar.over).toEqual({ amount: t(25_000), from: 20_000 / 45_000 });
  });

  it("has no bar when nothing is in the pool", () => {
    expect(spokenForBar(view([acct("Bank", "bank", 0)], [due("Rent", 100)]))).toBeNull();
    expect(spokenForBar(view([acct("Bank", "bank", -500)]))).toBeNull();
    expect(spokenForBar(view([acct("Savings", "savings", 9_000)]))).toBeNull();
  });

  it("always fills the whole bar, and places an over-commitment inside it", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5_000_000 }),
        fc.integer({ min: -3_000_000, max: 1_000_000 }),
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 0, max: 5_000_000 }),
        (bank, card, payment, reserved) => {
          const coveredAmount = Math.min(reserved, bank);
          const v = view(
            [acct("Bank", "bank", bank), acct("Visa", "credit_card", card)],
            payment > 0 ? [due("Bill", payment)] : [],
            coveredAmount > 0 ? [covered("Goal", "Bank", coveredAmount)] : [],
          );
          const bar = spokenForBar(v)!;
          expect(bar.segments.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 9);
          if (v.available < 0) {
            expect(bar.over!.amount).toBe(-v.available);
            expect(bar.over!.from).toBeGreaterThan(0);
            expect(bar.over!.from).toBeLessThan(1);
          } else {
            expect(bar.over).toBeNull();
          }
        },
      ),
    );
  });
});

describe("evidence", () => {
  it("shows the accounts that explain the figure, and leaves out the ones that add nothing", () => {
    const v = view(
      [
        acct("Bank", "bank", 10_000),
        acct("Spare", "cash", 0),
        acct("Kept", "cash", 1_000),
        acct("Savings", "savings", 5_000),
        acct("Empty savings", "savings", 0),
        acct("Deposit", "savings", 0),
        acct("Visa", "credit_card", -2_000),
      ],
      [],
      [covered("Trip", "Deposit", 0)],
      ["Spare", "Kept"],
    );
    const e = accountEvidence(v);
    // An archived account at zero adds nothing; one holding money counts like any other.
    expect(e.counted.map((a) => a.name)).toEqual(["Bank", "Kept"]);
    expect(e.cards.map((a) => a.name)).toEqual(["Visa"]);
    // Excluded accounts appear when they hold money or money set aside.
    expect(e.notCounted.map((a) => a.name)).toEqual(["Savings", "Deposit"]);
  });

  it("separates set-aside money that is deducted from money on accounts outside Available", () => {
    const e = earmarkEvidence(september());
    expect(e.deducted.map((x) => `${x.itemName} · ${x.accountName}`)).toEqual(["Laptop · Bank"]);
    expect(e.notDeducted.map((x) => `${x.itemName} · ${x.accountName}`)).toEqual([
      "Laptop · Savings",
    ]);
  });
});
