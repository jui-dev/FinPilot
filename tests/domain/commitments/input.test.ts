import { describe, expect, it } from "vitest";

import {
  commitmentFieldForRule,
  commitmentInputSchema,
  payOccurrenceInputSchema,
} from "@/domain/commitments/input";
import { fromMajor } from "@/domain/money";

const valid = {
  name: " Rent ",
  categoryId: "housing",
  expectedAmount: "30,000",
  frequency: "monthly",
  interval: "1",
  anchorOn: "2026-08-01",
};

describe("commitmentInputSchema", () => {
  it("parses form text into domain values, with optional fields as null", () => {
    expect(commitmentInputSchema.parse(valid)).toEqual({
      name: "Rent",
      categoryId: "housing",
      expectedAmount: fromMajor(30_000),
      expectedAccountId: null,
      frequency: "monthly",
      interval: 1,
      anchorOn: "2026-08-01",
      endOn: null,
    });
    expect(
      commitmentInputSchema.parse({ ...valid, expectedAccountId: " bank ", endOn: "2026-12-31" }),
    ).toMatchObject({ expectedAccountId: "bank", endOn: "2026-12-31" });
    expect(
      commitmentInputSchema.parse({ ...valid, expectedAccountId: "", endOn: "" }),
    ).toMatchObject({ expectedAccountId: null, endOn: null });
  });

  it("allows names up to 40 characters, like accounts and categories", () => {
    expect(commitmentInputSchema.safeParse({ ...valid, name: "R".repeat(40) }).success).toBe(true);
    const tooLong = commitmentInputSchema.safeParse({ ...valid, name: "R".repeat(41) });
    expect(tooLong.error!.issues).toMatchObject([
      { path: ["name"], message: "Keep it under 40 characters." },
    ]);
  });

  it.each([
    ["name", { name: "  " }],
    ["expectedAmount", { expectedAmount: "0" }],
    ["frequency", { frequency: "weekly" }],
    ["interval", { interval: "0" }],
    ["interval", { interval: "1.5" }],
    ["interval", { interval: "often" }],
    ["anchorOn", { anchorOn: "2026-02-30" }],
    ["endOn", { endOn: "someday" }],
    ["categoryId", { categoryId: "" }],
  ])("rejects a bad %s", (field, patch) => {
    const result = commitmentInputSchema.safeParse({ ...valid, ...patch });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((i) => i.path[0])).toContain(field);
  });
});

describe("payOccurrenceInputSchema", () => {
  it("leaves the amount and date to their defaults when empty", () => {
    expect(payOccurrenceInputSchema.parse({ accountId: "bank" })).toEqual({
      accountId: "bank",
      amount: undefined,
      occurredOn: null,
    });
    expect(
      payOccurrenceInputSchema.parse({ accountId: "bank", amount: "", occurredOn: "" }),
    ).toEqual({ accountId: "bank", amount: undefined, occurredOn: null });
  });

  it("parses a stated amount and date, and requires an account", () => {
    expect(
      payOccurrenceInputSchema.parse({
        accountId: "bank",
        amount: "1,500",
        occurredOn: "2026-09-02",
      }),
    ).toEqual({ accountId: "bank", amount: fromMajor(1_500), occurredOn: "2026-09-02" });
    expect(payOccurrenceInputSchema.safeParse({ accountId: "" }).success).toBe(false);
    expect(payOccurrenceInputSchema.safeParse({ accountId: "bank", amount: "-5" }).success).toBe(
      false,
    );
  });
});

describe("commitmentFieldForRule", () => {
  it("places rule rejections on their field, and others on the form", () => {
    expect(commitmentFieldForRule("end_before_anchor")).toBe("endOn");
    expect(commitmentFieldForRule("account_archived")).toBe("expectedAccountId");
    expect(commitmentFieldForRule("commitment_not_found")).toBeNull();
  });
});
