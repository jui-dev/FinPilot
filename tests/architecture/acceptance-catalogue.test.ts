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

  it("repeats an ID only when split into (ledger) and (Available) parts", () => {
    const seen = new Map<string, string[]>();
    for (const stage of ACCEPTANCE_CATALOGUE) {
      for (const a of stage.assertions) seen.set(a.id, [...(seen.get(a.id) ?? []), a.title]);
    }
    for (const [, titles] of [...seen].filter(([, t]) => t.length > 1)) {
      expect(titles.map((t) => t.match(/^\((ledger|Available)\)/)?.[1]).sort()).toEqual([
        "Available",
        "ledger",
      ]);
    }
  });
});
