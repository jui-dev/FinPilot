import { describe, expect, it } from "vitest";

import { verificationView } from "@/components/accounts/verification-view";
import type { CalendarDate } from "@/domain/calendar-date";
import { NEVER_VERIFIED, verificationOf } from "@/domain/ledger/verification";
import { money } from "@/domain/money";

const sep20 = "2026-09-20" as CalendarDate;
const taka = (value: number) => money(value * 100);

describe("how a verification reads on Accounts", () => {
  it("says nothing for an account never verified", () => {
    expect(verificationView(NEVER_VERIFIED, "cash")).toEqual({ status: "never_verified" });
  });

  it("reads as verified with its date", () => {
    expect(verificationView(verificationOf(sep20, taka(4_200), taka(4_200)), "cash")).toEqual({
      status: "verified",
      asOf: sep20,
    });
  });

  it("shows how far off an asset is, whichever way it moved (M2: 4,650 recorded vs 4,200)", () => {
    expect(verificationView(verificationOf(sep20, taka(4_200), taka(4_650)), "cash")).toEqual({
      status: "changed",
      asOf: sep20,
      off: taka(450),
      recorded: taka(4_650),
      verified: taka(4_200),
      owed: false,
    });
    // A backdated ৳250 expense: the ledger now records less than was verified.
    expect(verificationView(verificationOf(sep20, taka(5_000), taka(4_750)), "cash")).toMatchObject(
      { off: taka(250), recorded: taka(4_750), verified: taka(5_000) },
    );
  });

  it("reads a liability as amounts owed", () => {
    // Stated ৳6,000 owed; the ledger now derives ৳6,500 owed.
    expect(
      verificationView(verificationOf(sep20, taka(-6_000), taka(-6_500)), "credit_card"),
    ).toEqual({
      status: "changed",
      asOf: sep20,
      off: taka(500),
      recorded: taka(6_500),
      verified: taka(6_000),
      owed: true,
    });
  });
});
