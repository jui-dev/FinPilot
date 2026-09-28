import { describe, expect, it } from "vitest";

import { balanceReading } from "@/components/accounts/balance-reading";
import { verificationView } from "@/components/accounts/verification-view";
import type { CalendarDate } from "@/domain/calendar-date";
import { NEVER_VERIFIED, verificationOf } from "@/domain/ledger/verification";
import { money } from "@/domain/money";

const sep20 = "2026-09-20" as CalendarDate;
const taka = (value: number) => money(value * 100);

describe("how a verification reads on Accounts", () => {
  it("says nothing for an account never verified", () => {
    expect(verificationView(NEVER_VERIFIED)).toEqual({ status: "never_verified" });
  });

  it("reads as verified with its date", () => {
    expect(verificationView(verificationOf(sep20, taka(4_200), taka(4_200)))).toEqual({
      status: "verified",
      asOf: sep20,
    });
  });

  it("shows how far off an asset is, whichever way it moved (M2: 4,650 recorded vs 4,200)", () => {
    expect(verificationView(verificationOf(sep20, taka(4_200), taka(4_650)))).toEqual({
      status: "changed",
      asOf: sep20,
      off: taka(450),
      recorded: taka(4_650),
      verified: taka(4_200),
    });
    // A backdated ৳250 expense: the ledger now records less than was verified.
    expect(verificationView(verificationOf(sep20, taka(5_000), taka(4_750)))).toMatchObject({
      off: taka(250),
      recorded: taka(4_750),
      verified: taka(5_000),
    });
  });

  it("keeps a liability's amounts signed as stored, for balanceReading to word", () => {
    // Stated ৳6,000 owed; the ledger now derives ৳6,500 owed.
    const view = verificationView(verificationOf(sep20, taka(-6_000), taka(-6_500)));
    expect(view).toEqual({
      status: "changed",
      asOf: sep20,
      off: taka(500),
      recorded: taka(-6_500),
      verified: taka(-6_000),
    });
    if (view.status !== "changed") throw new Error("changed");
    expect(balanceReading("credit_card", view.recorded)).toEqual({
      amount: taka(6_500),
      sign: "none",
      note: "owed",
    });
  });

  it("reads a card that moved past zero as credit, not owed", () => {
    // Verified ৳200 owed; a backdated payment now leaves ৳300 of credit that day.
    const view = verificationView(verificationOf(sep20, taka(-200), taka(300)));
    if (view.status !== "changed") throw new Error("changed");
    expect(view.off).toBe(taka(500));
    expect(balanceReading("credit_card", view.recorded)).toMatchObject({ note: "credit" });
    expect(balanceReading("credit_card", view.verified)).toMatchObject({ note: "owed" });
  });
});
