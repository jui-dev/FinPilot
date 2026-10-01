import { afterEach, describe, expect, it } from "vitest";

import { previewEffects, type PreviewInput } from "@/components/quick-add/preview";
import type { DatabaseHandle } from "@/db/client";
import { recordEntry } from "@/server/commands";
import { getAccountBalances } from "@/server/services/ledger-service";

import { d, ok, setupLedger } from "../support/ledger";

/**
 * Differential: what Quick Add previews before saving equals what the ledger
 * reports after saving, for every kind of entry it records. The preview and
 * the account_entries view therefore cannot drift apart.
 */
let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

async function ledger() {
  const setup = await setupLedger();
  handle = setup.handle;
  return {
    ...setup,
    bank: await setup.account("Bank", "bank", "2026-08-01", 42_300),
    bkash: await setup.account("bKash", "mobile_wallet", "2026-08-01", 8_400),
    visa: await setup.account("Visa", "credit_card", "2026-08-01", -18_200),
  };
}

type Ctx = Awaited<ReturnType<typeof ledger>>["ctx"];

async function previewThenRecord(ctx: Ctx, input: PreviewInput) {
  const accounts = (await getAccountBalances(ctx)).map((b) => ({
    id: b.accountId,
    name: b.name,
    type: b.type,
    balance: b.balance,
  }));
  const preview = previewEffects(input, accounts);
  const recorded = ok(
    await recordEntry(ctx, {
      type: input.type,
      amount: input.amount,
      accountId: input.accountId,
      ...(input.type === "transfer"
        ? {
            counterAccountId: input.counterAccountId,
            ...(input.fee ? { fee: input.fee, feeCategoryId: input.feeCategoryId } : {}),
          }
        : { categoryId: input.categoryId }),
      occurredOn: input.occurredOn,
    }),
  );
  return {
    preview: preview?.map((e) => [e.accountId, e.before, e.after]),
    recorded: recorded.effects.map((e) => [e.accountId, e.before, e.after]),
  };
}

const base = { counterAccountId: "", categoryId: "", fee: null, feeCategoryId: "" };

describe("Quick Add's preview ⇔ the ledger's recorded effect", () => {
  it("agrees for an expense and an income", async () => {
    const { ctx, bank, bkash, category } = await ledger();
    const expense = await previewThenRecord(ctx, {
      ...base,
      type: "expense",
      amount: "450",
      accountId: bkash,
      categoryId: category("Groceries"),
      occurredOn: d("2026-09-22"),
    });
    expect(expense.preview).toEqual(expense.recorded);
    const income = await previewThenRecord(ctx, {
      ...base,
      type: "income",
      amount: "25,000",
      accountId: bank,
      categoryId: category("Salary"),
      occurredOn: d("2026-09-22"),
    });
    expect(income.preview).toEqual(income.recorded);
  });

  it("agrees for a transfer, with and without a fee in poisha", async () => {
    const { ctx, bank, bkash, category } = await ledger();
    const plain = await previewThenRecord(ctx, {
      ...base,
      type: "transfer",
      amount: "5000",
      accountId: bank,
      counterAccountId: bkash,
      occurredOn: d("2026-09-22"),
    });
    expect(plain.preview).toEqual(plain.recorded);
    const withFee = await previewThenRecord(ctx, {
      ...base,
      type: "transfer",
      amount: "2000",
      accountId: bkash,
      counterAccountId: bank,
      fee: "18.50",
      feeCategoryId: category("Fees & Charges"),
      occurredOn: d("2026-09-22"),
    });
    expect(withFee.preview).toEqual(withFee.recorded);
  });

  it("agrees for a card payment and for spending on the card", async () => {
    const { ctx, bank, visa, category } = await ledger();
    const payment = await previewThenRecord(ctx, {
      ...base,
      type: "transfer",
      amount: "5000",
      accountId: bank,
      counterAccountId: visa,
      occurredOn: d("2026-09-22"),
    });
    expect(payment.preview).toEqual(payment.recorded);
    const onCard = await previewThenRecord(ctx, {
      ...base,
      type: "expense",
      amount: "1200",
      accountId: visa,
      categoryId: category("Shopping"),
      occurredOn: d("2026-09-22"),
    });
    expect(onCard.preview).toEqual(onCard.recorded);
  });
});
