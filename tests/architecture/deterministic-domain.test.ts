import { describe, expect, it } from "vitest";

import { architectureViolations } from "../support/eslint-probe";

/**
 * Proves src/domain cannot read ambient time or randomness (the Clock is the
 * only source of "today"), while deterministic date construction, parsing and
 * calculation from explicit values stays allowed.
 */
const forbidden: Array<[label: string, code: string]> = [
  ["Date.now()", "export const t = Date.now();"],
  ["new Date() with no arguments", "export const t = new Date();"],
  ["Date() called as a function", "export const t = Date();"],
  ["Math.random()", "export const r = Math.random();"],
  ["global crypto", "export const r = crypto.randomUUID();"],
  ["global performance", "export const t = performance.now();"],
  ["Temporal.Now", "export const t = Temporal.Now.plainDateISO();"],
  ["date-fns isToday", 'import { isToday } from "date-fns";\nexport const f = isToday;'],
  [
    "date-fns startOfToday",
    'import { startOfToday } from "date-fns";\nexport const f = startOfToday;',
  ],
  [
    "date-fns constructNow",
    'import { constructNow } from "date-fns";\nexport const f = constructNow;',
  ],
  [
    "date-fns formatDistanceToNow",
    'import { formatDistanceToNow } from "date-fns";\nexport const f = formatDistanceToNow;',
  ],
  [
    "date-fns deep import isPast",
    'import isPast from "date-fns/isPast";\nexport const f = isPast;',
  ],
  [
    "date-fns fp deep import",
    'import isFuture from "date-fns/fp/isFuture";\nexport const f = isFuture;',
  ],
  [
    "date-fns namespace import (could reach isToday)",
    'import * as dateFns from "date-fns";\nexport const f = dateFns;',
  ],
];

const allowed: Array<[label: string, code: string]> = [
  ["new Date(epochMs)", "export const d = new Date(1_790_000_000_000);"],
  ["new Date(y, m, d)", "export const d = new Date(2026, 8, 22);"],
  ["new Date(isoString)", 'export const d = new Date("2026-09-22T00:00:00Z");'],
  ["Date.UTC(...)", "export const t = Date.UTC(2026, 8, 22);"],
  ["Date.parse(...)", 'export const t = Date.parse("2026-09-22");'],
  ["other Math functions", "export const r = Math.floor(Math.max(1, 2) / 3);"],
  [
    "pure date-fns functions",
    'import { addDays, differenceInCalendarDays, format } from "date-fns";\n' +
      "export const r = [addDays(new Date(2026, 8, 22), 1), differenceInCalendarDays, format];",
  ],
  ["a local variable named now", "export const f = (now: number) => now + 1;"],
];

describe("deterministic src/domain", () => {
  it.each(forbidden)("rejects %s", async (_label, code) => {
    expect(await architectureViolations(code)).not.toHaveLength(0);
  });

  it.each(allowed)("allows %s", async (_label, code) => {
    expect(await architectureViolations(code)).toEqual([]);
  });

  it("ignores inline eslint-disable comments inside src/domain", async () => {
    const suppressedLine =
      "// eslint-disable-next-line no-restricted-syntax\nexport const t = Date.now();";
    const suppressedFile = "/* eslint-disable */\nexport const t = Date.now();";
    const ruleOff = "/* eslint no-restricted-syntax: off */\nexport const t = Date.now();";
    for (const code of [suppressedLine, suppressedFile, ruleOff]) {
      expect(await architectureViolations(code)).not.toHaveLength(0);
    }
  });

  it("leaves ambient time available outside src/domain (the real Clock lives there)", async () => {
    const code = "export const now = () => new Date();\nexport const t = Date.now();";
    expect(await architectureViolations(code, "src/server/__probe__.ts")).toEqual([]);
  });
});
