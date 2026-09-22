import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ACCEPTANCE_CATALOGUE } from "../../acceptance/catalogue";

/**
 * Guards the acceptance skeleton against drift: every assertion ID in
 * docs/acceptance-scenarios.md has an entry, and no entry exists without one.
 */
const ID = /\b(?:A-\d{2}|M[1-3]-\d)\b/g;

const documented = new Set(
  readFileSync("docs/acceptance-scenarios.md", "utf8")
    .split("\n")
    .filter((line) => /^\| (?:A-\d{2}|M[1-3]-\d) \|/.test(line))
    .map((line) => line.match(ID)![0]),
);

const catalogued = ACCEPTANCE_CATALOGUE.flatMap((s) => s.assertions.map((a) => a.id));

describe("acceptance catalogue", () => {
  it("documents a plausible number of assertions", () => {
    expect(documented.size).toBeGreaterThanOrEqual(40);
  });

  it("covers every documented assertion ID, and nothing else", () => {
    expect(new Set(catalogued)).toEqual(documented);
  });

  it("repeats an ID only as distinct (ledger) / (net worth) / (Available) parts, one per stage", () => {
    const seen = new Map<string, { part: string | undefined; stage: string }[]>();
    for (const stage of ACCEPTANCE_CATALOGUE) {
      for (const a of stage.assertions) {
        const part = a.title.match(/^\((ledger|net worth|Available)\)/)?.[1];
        seen.set(a.id, [...(seen.get(a.id) ?? []), { part, stage: stage.stage }]);
      }
    }
    for (const [, parts] of [...seen].filter(([, p]) => p.length > 1)) {
      expect(parts.every((p) => p.part !== undefined)).toBe(true);
      expect(new Set(parts.map((p) => p.part)).size).toBe(parts.length);
      expect(new Set(parts.map((p) => p.stage)).size).toBe(parts.length);
    }
  });
});
