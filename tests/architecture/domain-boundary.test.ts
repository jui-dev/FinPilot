import { describe, expect, it } from "vitest";

import { architectureViolations } from "../support/eslint-probe";

/**
 * Proves the src/domain import boundary (docs/tech-stack.md §1) is enforced by
 * the real project ESLint config, using virtual files placed inside src/domain.
 */
const importOf = (specifier: string) => `import x from "${specifier}";\nexport const y = x;\n`;

const forbiddenImports = [
  "next",
  "next/server",
  "react",
  "react-dom/server",
  "drizzle-orm",
  "drizzle-orm/sqlite-core",
  "better-sqlite3",
  "uuid",
  "@date-fns/tz",
  "node:crypto",
  "fs",
  "@/server/ledger",
  "@/server/clock",
  "@/db/schema",
  "@/app/page",
  "@/components/chart",
  "../server/ledger",
  "../../app/page",
  "../money",
  "axios",
  "zod-extra",
];

const allowedImports = [
  "./money",
  "./money/format",
  "@/domain/money",
  "@/domain",
  "zod",
  "date-fns",
  "date-fns/addDays",
];

describe("src/domain import boundary", () => {
  it.each(forbiddenImports)("rejects import from %s", async (specifier) => {
    const violations = await architectureViolations(importOf(specifier));
    expect(violations.map((v) => v.ruleId)).toContain("no-restricted-imports");
  });

  it("rejects type-only imports and re-exports of forbidden modules", async () => {
    expect(
      await architectureViolations(
        `import type { NextConfig } from "next";\nexport type C = NextConfig;\n`,
      ),
    ).not.toHaveLength(0);
    expect(await architectureViolations(`export { sql } from "drizzle-orm";\n`)).not.toHaveLength(
      0,
    );
  });

  it("rejects dynamic import() and require()", async () => {
    expect(
      await architectureViolations(`export const m = () => import("./money");\n`),
    ).not.toHaveLength(0);
    expect(await architectureViolations(`export const m = require("./money");\n`)).not.toHaveLength(
      0,
    );
  });

  it("applies to nested domain folders", async () => {
    const violations = await architectureViolations(
      importOf("next"),
      "src/domain/ledger/rules/__probe__.ts",
    );
    expect(violations).not.toHaveLength(0);
  });

  it.each(allowedImports)("allows import from %s", async (specifier) => {
    expect(await architectureViolations(importOf(specifier))).toEqual([]);
  });

  it("does not restrict layers outside src/domain", async () => {
    const violations = await architectureViolations(
      `import { v7 } from "uuid";\nimport x from "next/server";\nexport const y = [x, v7];\n`,
      "src/server/__probe__.ts",
    );
    expect(violations).toEqual([]);
  });
});
