import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { balanceReading } from "@/components/accounts/balance-reading";
import { PositionSummary } from "@/components/accounts/position-summary";
import { summarizePosition, type AccountBalance } from "@/domain/ledger/position";
import { fromMajor } from "@/domain/money";

/**
 * How a card's balance reads on Accounts (Stage 10 Slice 2): money owed reads
 * as owed, a credit balance as credit, and neither is ever shown as the other.
 */
const taka = fromMajor;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const summary = (balances: AccountBalance[]) =>
  text(renderToStaticMarkup(<PositionSummary position={summarizePosition(balances)} />));

describe("balanceReading", () => {
  it("shows an asset's signed balance, with no word", () => {
    expect(balanceReading("bank", taka(4_200))).toEqual({
      amount: taka(4_200),
      sign: "negative",
      note: null,
    });
    // An overdrawn asset keeps its minus.
    expect(balanceReading("cash", taka(-300))).toEqual({
      amount: taka(-300),
      sign: "negative",
      note: null,
    });
  });

  it("shows a card as a magnitude with the word that gives its direction", () => {
    expect(balanceReading("credit_card", taka(-3_200))).toEqual({
      amount: taka(3_200),
      sign: "none",
      note: "owed",
    });
    expect(balanceReading("credit_card", taka(500))).toEqual({
      amount: taka(500),
      sign: "none",
      note: "credit",
    });
    expect(balanceReading("credit_card", taka(0))).toEqual({ amount: 0, sign: "none", note: null });
  });
});

describe("PositionSummary", () => {
  it("reads money owed on cards as Owe", () => {
    const html = summary([
      { accountId: "bank", type: "bank", balance: taka(133_000) },
      { accountId: "visa", type: "credit_card", balance: taka(-6_000) },
    ]);
    expect(html).toContain("Own ৳ 1,33,000");
    expect(html).toContain("Owe ৳ 6,000");
    expect(html).not.toContain("Credit on cards");
  });

  it("reads a card's credit balance as Credit on cards, never Owe", () => {
    const html = summary([
      { accountId: "bank", type: "bank", balance: taka(10_000) },
      { accountId: "visa", type: "credit_card", balance: taka(500) },
    ]);
    expect(html).toContain("Credit on cards ৳ 500");
    expect(html).not.toContain("Owe");
    expect(html).toContain("Net worth ৳ 10,500");
  });

  it("reads Owe ৳0 when nothing is owed and no credit is held", () => {
    expect(summary([{ accountId: "bank", type: "bank", balance: taka(1_000) }])).toContain(
      "Owe ৳ 0",
    );
  });

  it("keeps the minus on a negative Own", () => {
    const html = summary([{ accountId: "cash", type: "cash", balance: taka(-300) }]);
    expect(html).toContain("Own − ৳ 300");
  });
});
