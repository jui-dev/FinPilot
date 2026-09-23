import { describe, expect, it } from "vitest";

import { calendarDateFromIso } from "@/domain/calendar-date";
import { reconcile } from "@/domain/ledger/reconciliation";
import { NEVER_VERIFIED, verificationOf } from "@/domain/ledger/verification";
import { fromMajor, ZERO } from "@/domain/money";

const d = calendarDateFromIso;
const taka = fromMajor;
const SEP_20 = d("2026-09-20");

describe("verificationOf", () => {
  it("is verified while the ledger still derives the stated balance", () => {
    const v = verificationOf(SEP_20, taka(4_200), taka(4_200));
    expect(v.status).toBe("verified");
    expect(v.drift).toBe(ZERO);
    expect(v.asOf).toBe(SEP_20);
  });

  it("is changed, with a positive drift, when the ledger now shows more", () => {
    // M2: the lunch moved off Cash, so Sep 20 derives 4,650 against a stated 4,200.
    const v = verificationOf(SEP_20, taka(4_200), taka(4_650));
    expect(v.status).toBe("changed");
    expect(v.drift).toBe(taka(450));
  });

  it("is changed, with a negative drift, when the ledger now shows less", () => {
    expect(verificationOf(SEP_20, taka(4_200), taka(3_900)).drift).toBe(taka(-300));
  });

  it("verifies a liability at its signed balance", () => {
    expect(verificationOf(SEP_20, taka(-6_500), taka(-6_500)).status).toBe("verified");
    expect(verificationOf(SEP_20, taka(-6_500), taka(-6_000)).drift).toBe(taka(500));
  });

  it("verifies an account stated as empty", () => {
    expect(verificationOf(SEP_20, ZERO, ZERO).status).toBe("verified");
  });

  it("reports never_verified with no checkpoint to speak of", () => {
    expect(NEVER_VERIFIED).toEqual({
      status: "never_verified",
      asOf: null,
      stated: null,
      recorded: null,
      drift: null,
    });
  });
});

describe("drift is the opposite of reconciliation's difference", () => {
  // The two signs must never be swapped: reconciliation asks what correction to
  // post, verification asks how far the ledger has moved away.
  it.each([
    [taka(4_550), taka(4_200)],
    [taka(4_200), taka(4_550)],
    [taka(-6_000), taka(-6_500)],
    [ZERO, taka(1_000)],
  ])("recorded %s, stated %s", (recorded, stated) => {
    const { difference } = reconcile(recorded, stated);
    const { drift } = verificationOf(SEP_20, stated, recorded);
    expect(drift).toBe(-difference);
  });

  it("agrees that a freshly posted adjustment leaves no drift", () => {
    // Reconciliation posts `difference` on the checkpoint date, so the balance
    // that date derives becomes recorded + difference — which is `stated`.
    const recorded = taka(4_550);
    const stated = taka(4_200);
    const { difference } = reconcile(recorded, stated);
    const afterAdjustment = (recorded + difference) as typeof recorded;
    expect(verificationOf(SEP_20, stated, afterAdjustment).status).toBe("verified");
  });
});
