import { describe, expect, it } from "vitest";

import { architectureViolations } from "../support/eslint-probe";

/** Proves only repositories may open database transactions (docs/tech-stack.md §4). */
const code = "export const run = (db: any) => db.transaction(() => 1);\n";

describe("transaction boundary", () => {
  it.each([
    "src/server/services/__probe__.ts",
    "src/server/__probe__.ts",
    "src/app/__probe__.ts",
    "src/db/__probe__.ts",
  ])("rejects db.transaction() in %s", async (file) => {
    const violations = await architectureViolations(code, file);
    expect(violations.map((v) => v.ruleId)).toContain("no-restricted-properties");
  });

  it("allows db.transaction() in src/server/repositories", async () => {
    expect(await architectureViolations(code, "src/server/repositories/__probe__.ts")).toEqual([]);
  });

  it("keeps the domain's own restrictions active alongside it", async () => {
    const violations = await architectureViolations(
      "export const t = Date.now();\n",
      "src/domain/__probe__.ts",
    );
    expect(violations.map((v) => v.ruleId)).toContain("no-restricted-syntax");
  });
});
