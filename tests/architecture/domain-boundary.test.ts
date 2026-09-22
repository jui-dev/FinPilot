import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Proves the src/domain import boundary (docs/tech-stack.md §1) is enforced by
 * the real project ESLint config, using virtual files placed inside src/domain.
 */
const BOUNDARY_RULES = new Set(["no-restricted-imports", "no-restricted-syntax"]);

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() });
});

async function boundaryViolations(code: string, filePath = "src/domain/__probe__.ts") {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId && BOUNDARY_RULES.has(m.ruleId));
}

const forbiddenImports = [
  "next",
  "next/server",
  "react",
  "react-dom/server",
  "drizzle-orm",
  "drizzle-orm/sqlite-core",
  "better-sqlite3",
  "node:crypto",
  "fs",
  "@/server/ledger",
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
  "@date-fns/tz",
];

describe("src/domain import boundary", () => {
  it.each(forbiddenImports)("rejects import from %s", async (specifier) => {
    const violations = await boundaryViolations(
      `import x from "${specifier}";\nexport const y = x;\n`,
    );
    expect(violations.map((v) => v.ruleId)).toContain("no-restricted-imports");
  });

  it("rejects type-only imports and re-exports of forbidden modules", async () => {
    expect(
      await boundaryViolations(
        `import type { NextConfig } from "next";\nexport type C = NextConfig;\n`,
      ),
    ).not.toHaveLength(0);
    expect(await boundaryViolations(`export { sql } from "drizzle-orm";\n`)).not.toHaveLength(0);
  });

  it("rejects dynamic import() and require()", async () => {
    expect(
      await boundaryViolations(`export const m = () => import("./money");\n`),
    ).not.toHaveLength(0);
    expect(await boundaryViolations(`export const m = require("./money");\n`)).not.toHaveLength(0);
  });

  it("applies to nested domain folders", async () => {
    const violations = await boundaryViolations(
      `import x from "next";\nexport const y = x;\n`,
      "src/domain/ledger/rules/__probe__.ts",
    );
    expect(violations).not.toHaveLength(0);
  });

  it.each(allowedImports)("allows import from %s", async (specifier) => {
    expect(
      await boundaryViolations(`import x from "${specifier}";\nexport const y = x;\n`),
    ).toEqual([]);
  });

  it("does not restrict layers outside src/domain", async () => {
    const violations = await boundaryViolations(
      `import x from "next/server";\nexport const y = x;\n`,
      "src/server/__probe__.ts",
    );
    expect(violations).toEqual([]);
  });
});
