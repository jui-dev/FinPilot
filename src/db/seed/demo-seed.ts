import type { DatabaseHandle } from "@/db/client";
import {
  addDays,
  addMonths,
  calendarDate,
  daysInYearMonth,
  firstDayOf,
  toParts,
  yearMonthOf,
  type CalendarDate,
  type YearMonth,
} from "@/domain/calendar-date";
import { fixedClock } from "@/domain/clock";
import type { AccountType } from "@/domain/ledger/accounts";
import { openAccount, recordEntry, refundExpense } from "@/server/commands";
import type { ServiceContext } from "@/server/context";
import { uuidV7Generator } from "@/server/ids";
import { createOwner, getCategories } from "@/server/services/setup-service";

/**
 * Demo seed v1 (roadmap Stage 3): five accounts and about three months of
 * ordinary Bangladeshi household activity, dated relative to `today` so the
 * demo never looks stale. Deterministic for a given `today` (seeded PRNG).
 *
 * Every row goes through the same commands as the UI, so the seed can never
 * contain a ledger the rules would reject. The final seed generator (9–12
 * months, planted anomalies for every signal rule) is Stage 12.
 */

export const DEMO_TIME_ZONE = "Asia/Dhaka";
export const DEMO_HISTORY_MONTHS = 3;

/** mulberry32: a small, fast, seedable PRNG — deterministic demo data. */
function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    between: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    /** A whole-taka amount rounded to `step` taka. */
    amount: (min: number, max: number, step = 10) =>
      Math.round((min + next() * (max - min)) / step) * step,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    chance: (p: number) => next() < p,
  };
}

type AccountKey = "bank" | "cash" | "bkash" | "savings" | "visa";

const ACCOUNTS: ReadonlyArray<{ key: AccountKey; name: string; type: AccountType; start: number }> =
  [
    { key: "bank", name: "Bank", type: "bank", start: 42_000 },
    { key: "cash", name: "Cash", type: "cash", start: 3_500 },
    { key: "bkash", name: "bKash", type: "mobile_wallet", start: 6_000 },
    { key: "savings", name: "Savings", type: "savings", start: 1_20_000 },
    // A card's starting amount is what was owed.
    { key: "visa", name: "Visa card", type: "credit_card", start: 4_200 },
  ];

interface PlannedEntry {
  readonly on: CalendarDate;
  readonly input: Record<string, string>;
  /** Names an entry that a later refund refers to. */
  readonly label?: string;
}

export interface DemoSeedResult {
  readonly ownerId: string;
  readonly transactions: number;
  readonly from: CalendarDate;
  readonly to: CalendarDate;
}

export async function seedDemo(
  handle: DatabaseHandle,
  today: CalendarDate,
  seed = 2026,
): Promise<DemoSeedResult> {
  const random = prng(seed);
  let tick = Date.UTC(toParts(today).year, toParts(today).month - 1, toParts(today).day, 3);
  const now = () => new Date((tick += 1000));

  const ownerResult = await createOwner(
    { db: handle.db, ids: uuidV7Generator, now },
    { name: "Demo", baseCurrency: "BDT", timeZone: DEMO_TIME_ZONE },
  );
  if (!ownerResult.ok) throw new Error(`Demo owner: ${ownerResult.error.message}`);
  const ctx: ServiceContext = {
    db: handle.db,
    ownerId: ownerResult.value,
    clock: fixedClock(today),
    ids: uuidV7Generator,
    now,
  };

  const categoryIds = new Map((await getCategories(ctx)).map((c) => [c.name, c.id]));
  const category = (name: string) => {
    const id = categoryIds.get(name);
    if (!id) throw new Error(`Demo seed: no category ${name}`);
    return id;
  };

  const firstMonth: YearMonth = addMonths(yearMonthOf(today), -DEMO_HISTORY_MONTHS);
  const from = firstDayOf(firstMonth);
  const account: Record<AccountKey, string> = {} as Record<AccountKey, string>;
  for (const a of ACCOUNTS) {
    const result = await openAccount(ctx, {
      name: a.name,
      type: a.type,
      openedOn: from,
      startingAmount: String(a.start),
    });
    if (!result.ok) throw new Error(`Demo account ${a.name}: ${result.message}`);
    account[a.key] = result.value;
  }

  // ---------------------------------------------------------------------------
  // Plan the months: fixed monthly rhythm plus randomised everyday spending.
  // ---------------------------------------------------------------------------
  const plan: PlannedEntry[] = [];
  const expense = (
    on: CalendarDate,
    amount: number,
    categoryName: string,
    from: AccountKey,
    description: string,
    label?: string,
  ) =>
    plan.push({
      on,
      label,
      input: {
        type: "expense",
        amount: String(amount),
        accountId: account[from],
        categoryId: category(categoryName),
        occurredOn: on,
        description,
      },
    });
  const transfer = (
    on: CalendarDate,
    amount: number,
    fromKey: AccountKey,
    toKey: AccountKey,
    description: string,
    fee?: number,
  ) =>
    plan.push({
      on,
      input: {
        type: "transfer",
        amount: String(amount),
        accountId: account[fromKey],
        counterAccountId: account[toKey],
        occurredOn: on,
        description,
        ...(fee ? { fee: String(fee), feeCategoryId: category("Fees & Charges") } : {}),
      },
    });

  for (let offset = 0; offset <= DEMO_HISTORY_MONTHS; offset++) {
    const month = addMonths(firstMonth, offset);
    const days = daysInYearMonth(month);
    const { year, month: m } = toParts(firstDayOf(month));
    const day = (d: number) => calendarDate(year, m, Math.min(d, days));

    plan.push({
      on: day(1),
      input: {
        type: "income",
        amount: "95000",
        accountId: account.bank,
        categoryId: category("Salary"),
        occurredOn: day(1),
        description: "Salary",
      },
    });
    expense(day(2), 30_000, "Housing", "bank", "Rent");
    transfer(day(2), 10_000, "bank", "bkash", "bKash top-up");
    transfer(day(3), 10_000, "bank", "savings", "Monthly savings");
    // bKash charges about 1.85% to cash out (৳37 per ৳2,000).
    transfer(day(3), 5_000, "bkash", "cash", "bKash cash-out", 93);
    expense(day(8), random.amount(1_700, 2_600), "Utilities", "bkash", "DESCO electricity");
    expense(day(10), 1_080, "Utilities", "bkash", "Titas gas");
    expense(day(12), 499, "Utilities", "bkash", "Grameenphone recharge");
    transfer(day(16), 8_000, "bank", "bkash", "bKash top-up");
    transfer(day(17), 4_000, "bkash", "cash", "bKash cash-out", 74);
    expense(day(25), 1_500, "Utilities", "bkash", "Link3 internet");
    expense(day(random.between(15, 27)), 850, "Entertainment", "visa", "Star Cineplex");

    for (let week = 0; week < 4; week++) {
      expense(
        day(4 + week * 7 + random.between(0, 2)),
        random.amount(1_600, 4_400),
        "Groceries",
        week % 2 === 0 ? "visa" : "cash",
        random.pick(["Shwapno", "Meena Bazar", "Agora"]),
      );
    }
    for (let i = 0; i < 6; i++) {
      const place = random.pick(["Foodpanda", "Sultan's Dine", "Star Kabab", "Pizza Hut", "Café"]);
      expense(
        day(random.between(1, days)),
        random.amount(350, 1_600),
        "Food & Dining",
        place === "Foodpanda" ? "bkash" : random.pick<AccountKey>(["cash", "visa"]),
        place,
      );
    }
    for (let i = 0; i < 8; i++) {
      expense(
        day(random.between(1, days)),
        random.amount(160, 620),
        "Transport",
        random.pick<AccountKey>(["bkash", "cash"]),
        random.pick(["Pathao", "Uber", "CNG"]),
      );
    }
    for (let i = 0; i < 2; i++) {
      const shop = random.pick(["Aarong", "Daraz", "Yellow", "Bata"]);
      expense(
        day(random.between(3, days)),
        random.amount(1_200, 5_800, 50),
        "Shopping",
        "visa",
        shop,
        offset === 1 && i === 0 ? "refundable" : undefined,
      );
    }
    if (random.chance(0.7)) {
      expense(
        day(random.between(1, days)),
        random.amount(300, 1_400),
        "Health",
        "cash",
        "Lazz Pharma",
      );
    }
  }

  // The card is paid off from the bank each month (a transfer, never an expense).
  // Its amount is derived from the plan so the demo stays internally consistent.
  const visaCharges = new Map<string, number>();
  for (const e of plan) {
    if (e.input.type === "expense" && e.input.accountId === account.visa) {
      const month = yearMonthOf(e.on);
      visaCharges.set(month, (visaCharges.get(month) ?? 0) + Number(e.input.amount));
    }
  }
  for (let offset = 1; offset <= DEMO_HISTORY_MONTHS; offset++) {
    const month = addMonths(firstMonth, offset);
    const previous = addMonths(month, -1);
    const owed = (visaCharges.get(previous) ?? 0) + (offset === 1 ? 4_200 : 0);
    const on = calendarDate(toParts(firstDayOf(month)).year, toParts(firstDayOf(month)).month, 11);
    transfer(on, owed, "bank", "visa", "Visa card payment");
  }

  // Only what has happened: nothing after today.
  const due = plan
    .filter((e) => e.on <= today)
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));

  // A running balance per account keeps the story believable: when cash or
  // wallet money would run out, the purchase goes on the card instead.
  const keyOf = new Map(Object.entries(account).map(([key, id]) => [id, key as AccountKey]));
  const running = Object.fromEntries(
    ACCOUNTS.map((a) => [a.key, a.type === "credit_card" ? -a.start : a.start]),
  ) as Record<AccountKey, number>;
  const spendable = (key: AccountKey) => key === "cash" || key === "bkash";

  let count = 0;
  const labelled = new Map<string, { id: string; amount: string; on: CalendarDate }>();
  for (const planned of due) {
    const entry = { ...planned, input: { ...planned.input } };
    const amount = Number(entry.input.amount);
    const fromKey = keyOf.get(entry.input.accountId!)!;
    if (entry.input.type === "expense" && spendable(fromKey) && running[fromKey] < amount) {
      entry.input.accountId = account.visa;
    }
    if (entry.input.type === "transfer" && spendable(fromKey)) {
      const fee = Number(entry.input.fee ?? 0);
      if (running[fromKey] < amount + fee) continue;
    }
    const key = keyOf.get(entry.input.accountId!)!;
    const fee = Number(entry.input.fee ?? 0);
    if (entry.input.type === "income") running[key] += amount;
    if (entry.input.type === "expense") running[key] -= amount;
    if (entry.input.type === "transfer") {
      running[key] -= amount + fee;
      running[keyOf.get(entry.input.counterAccountId!)!] += amount;
    }

    const result = await recordEntry(ctx, entry.input);
    if (!result.ok) {
      throw new Error(
        `Demo seed rejected ${entry.input.description} on ${entry.on}: ${result.message}`,
      );
    }
    count += result.value.ids.length;
    if (entry.label) {
      labelled.set(entry.label, {
        id: result.value.ids[0]!,
        amount: entry.input.amount!,
        on: entry.on,
      });
    }
  }

  // One partial refund of a card purchase, a week after it.
  const refundable = labelled.get("refundable");
  if (refundable) {
    const on = addDays(refundable.on, 7);
    if (on <= today) {
      const partial = Math.round((Number(refundable.amount) * 0.4) / 50) * 50;
      const result = await refundExpense(ctx, refundable.id, {
        amount: String(partial),
        accountId: account.visa,
        occurredOn: on,
        description: "Refund — returned item",
      });
      if (!result.ok) throw new Error(`Demo refund: ${result.message}`);
      count += 1;
    }
  }

  return { ownerId: ctx.ownerId, transactions: count, from, to: today };
}
