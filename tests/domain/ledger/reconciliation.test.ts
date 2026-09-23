import { describe, expect, it } from "vitest";

import { signedBalance } from "@/domain/ledger/input";
import { reconcile } from "@/domain/ledger/reconciliation";
import { fromMajor, ZERO } from "@/domain/money";

const taka = fromMajor;

describe("reconcile", () => {
  it("needs a negative adjustment when less is there than recorded", () => {
    // The scenario's row 10: Cash recorded 4,550, counted 4,200.
    const result = reconcile(taka(4_550), taka(4_200));
    expect(result.difference).toBe(taka(-350));
    expect(result.needsAdjustment).toBe(true);
  });

  it("needs a positive adjustment when more is there than recorded", () => {
    expect(reconcile(taka(4_200), taka(4_550)).difference).toBe(taka(350));
  });

  it("needs no adjustment when the ledger already agrees", () => {
    const result = reconcile(taka(4_200), taka(4_200));
    expect(result.difference).toBe(ZERO);
    expect(result.needsAdjustment).toBe(false);
  });

  it("agrees at zero on both sides", () => {
    expect(reconcile(ZERO, ZERO).needsAdjustment).toBe(false);
  });

  it("keeps the recorded and stated balances it was given", () => {
    const result = reconcile(taka(100), taka(250));
    expect({ recorded: result.recorded, stated: result.stated }).toEqual({
      recorded: taka(100),
      stated: taka(250),
    });
  });

  it("treats a liability's stated balance as money owed", () => {
    // A card recorded at −6,000 (owed) where the person states they owe 6,500.
    const stated = signedBalance("credit_card", taka(6_500));
    expect(stated).toBe(taka(-6_500));
    expect(reconcile(taka(-6_000), stated).difference).toBe(taka(-500));
  });

  it("counts an emptied account as a real statement, not a missing one", () => {
    const result = reconcile(taka(4_550), signedBalance("cash", ZERO));
    expect(result.difference).toBe(taka(-4_550));
    expect(result.needsAdjustment).toBe(true);
  });
});
