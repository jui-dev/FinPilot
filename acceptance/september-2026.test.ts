import { describe, it } from "vitest";

import { ACCEPTANCE_CATALOGUE } from "./catalogue";

/**
 * Mandatory acceptance scenario (docs/acceptance-scenarios.md), run with the
 * clock fixed at 2026-09-22 (Asia/Dhaka) against a real migrated database.
 *
 * F1: every assertion is a todo. Each roadmap stage replaces its todos with
 * real assertions; the number of todos remaining is the project's progress
 * indicator. A failing number blocks a release.
 */
for (const { stage, assertions } of ACCEPTANCE_CATALOGUE) {
  describe(`Stage ${stage}`, () => {
    for (const { id, title } of assertions) {
      it.todo(`${id} ${title}`);
    }
  });
}
