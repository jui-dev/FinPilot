/**
 * Prints the acceptance scenario's derived ledger state (docs/acceptance-scenarios.md),
 * computed by the real services on a fresh in-memory database.
 */
import { buildSeptember2026, TODAY } from "../acceptance/fixtures/september-2026";

import { likeForLikeWindows } from "@/domain/calendar-date";
import { formatPercent } from "@/domain/ledger/analytics";
import { formatMoney } from "@/domain/money";
import {
  getAccountBalances,
  getIncome,
  getSavingsRate,
  getSpendingByCategory,
  getTotalSpending,
} from "@/server/services/ledger-service";
import { getCategories } from "@/server/services/setup-service";

async function main() {
  const s = await buildSeptember2026();
  const { current, previous } = likeForLikeWindows(TODAY);
  const names = new Map((await getCategories(s.ctx)).map((c) => [c.id, c.name]));

  console.log(`FinPilot acceptance scenario — today ${TODAY} (Asia/Dhaka)\n`);
  console.log("Balances");
  for (const b of await getAccountBalances(s.ctx)) {
    console.log(`  ${b.name.padEnd(10)} ${formatMoney(b.balance).padStart(12)}`);
  }
  console.log("  (Cash 4,200 includes the Sep 20 reconciliation adjustment of −350)\n");

  for (const [label, range] of [
    ["Spending Sep 1–22", current],
    ["Spending Aug 1–22", previous],
  ] as const) {
    console.log(label);
    for (const [id, amount] of await getSpendingByCategory(s.ctx, range)) {
      console.log(`  ${(names.get(id) ?? id).padEnd(16)} ${formatMoney(amount).padStart(10)}`);
    }
    console.log(
      `  ${"Total".padEnd(16)} ${formatMoney(await getTotalSpending(s.ctx, range)).padStart(10)}\n`,
    );
  }

  const rate = await getSavingsRate(s.ctx, current);
  console.log(`Income Sep 1–22   ${formatMoney(await getIncome(s.ctx, current))}`);
  console.log(`Savings rate      ${rate ? formatPercent(rate) : "—"}`);
  s.handle.close();
}

void main();
