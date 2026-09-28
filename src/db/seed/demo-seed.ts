import type { DatabaseHandle } from "@/db/client";
import {
  addDays,
  addMonths,
  calendarDate,
  dayOfMonth,
  daysInYearMonth,
  firstDayOf,
  toParts,
  yearMonthOf,
  type CalendarDate,
  type YearMonth,
} from "@/domain/calendar-date";
import { fixedClock } from "@/domain/clock";
import type { AccountType } from "@/domain/ledger/accounts";
import {
  createCommitment,
  createProtectedMoneyItem,
  openAccount,
  payOccurrence,
  recordEntry,
  refundExpense,
  reserveProtectedMoney,
  skipOccurrence,
  verifyBalance,
} from "@/server/commands";
import type { ServiceContext } from "@/server/context";
import { uuidV7Generator } from "@/server/ids";
import { getOccurrences } from "@/server/services/commitment-service";
import { getAccountBalances } from "@/server/services/ledger-service";
import { createOwner, getCategories } from "@/server/services/setup-service";

/**
 * The demo: one salaried person in Dhaka, with five accounts and about three
 * months of ordinary household activity, dated relative to `today` so the
 * demo never looks stale. Deterministic for a given `today` (seeded PRNG).
 *
 * Every row goes through the same commands as the UI, so the seed can never
 * contain a ledger the rules would reject.
 *
 * With `situations` (the default; roadmap Stage 10) the same person also has
 * what the V1 product exists to show: rent, internet, the phone bill and the
 * gym as commitments paid through Pay (one month of the gym skipped); money
 * set aside, covered, short, and on Savings outside Available; verified
 * balances, one that no longer matches and one recently adjusted; and a
 * one-off expense that makes this month's spending stand out. Each is dated
 * from `today`, so every V1 Attention kind is there on any day.
 *
 * Without `situations` it is the plain ledger (demo seed v1), on which the
 * end-to-end suite builds its own states. The 9–12 month history is Stage 11.
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
  /** Recorded by paying this commitment occurrence rather than as a plain expense. */
  readonly occurrenceId?: string;
}

/**
 * The first due date of a monthly commitment that must fall due on `target`:
 * that day in the earliest month from `from` that has it. Later due dates aim
 * for the anchor's day, so `target` is always one of them.
 */
function monthlyAnchor(target: CalendarDate, from: YearMonth): CalendarDate {
  const day = dayOfMonth(target);
  for (let month = from; month < yearMonthOf(target); month = addMonths(month, 1)) {
    if (daysInYearMonth(month) >= day) {
      const { year, month: m } = toParts(firstDayOf(month));
      return calendarDate(year, m, day);
    }
  }
  return target;
}

/** Whole taka from a balance in minor units, rounded down. */
const taka = (minor: number) => Math.floor(minor / 100);

export interface DemoSeedOptions {
  /** The PRNG seed. */
  readonly seed?: number;
  /** Commitments, set-aside money, verifications and this month's one-off (default true). */
  readonly situations?: boolean;
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
  { seed = 2026, situations = true }: DemoSeedOptions = {},
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
    // With situations, rent, internet and the phone bill are commitments, paid through Pay.
    if (!situations) expense(day(2), 30_000, "Housing", "bank", "Rent");
    transfer(day(2), 10_000, "bank", "bkash", "bKash top-up");
    transfer(day(3), 10_000, "bank", "savings", "Monthly savings");
    // bKash charges about 1.85% to cash out (৳37 per ৳2,000).
    transfer(day(3), 5_000, "bkash", "cash", "bKash cash-out", 93);
    expense(day(8), random.amount(1_700, 2_600), "Utilities", "bkash", "DESCO electricity");
    expense(day(10), 1_080, "Utilities", "bkash", "Titas gas");
    if (!situations) expense(day(12), 499, "Utilities", "bkash", "Grameenphone recharge");
    transfer(day(16), 8_000, "bank", "bkash", "bKash top-up");
    transfer(day(17), 4_000, "bkash", "cash", "bKash cash-out", 74);
    if (!situations) expense(day(25), 1_500, "Utilities", "bkash", "Link3 internet");
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

  // ---------------------------------------------------------------------------
  // Situations: commitments, dated from today so each current occurrence is in
  // the state the story needs — internet overdue, the phone bill due today,
  // rent due soon, the gym later in the month. Every earlier occurrence was
  // paid on its due date through Pay, except the gym's last month, skipped.
  // ---------------------------------------------------------------------------
  let skippedGym: string | null = null;
  if (situations) {
    const commitments = [
      { name: "Rent", amount: 30_000, category: "Housing", from: "bank", due: addDays(today, 4) },
      {
        name: "Link3 internet",
        amount: 1_500,
        category: "Utilities",
        from: "bkash",
        due: addDays(today, -4),
      },
      {
        name: "Grameenphone bill",
        amount: 1_200,
        category: "Utilities",
        from: "bkash",
        due: today,
      },
      {
        name: "Gym membership",
        amount: 3_000,
        category: "Health",
        from: "bank",
        due: addDays(today, 16),
      },
    ] as const;
    const byId = new Map<string, (typeof commitments)[number]>();
    for (const c of commitments) {
      const result = await createCommitment(ctx, {
        name: c.name,
        categoryId: category(c.category),
        expectedAmount: String(c.amount),
        expectedAccountId: account[c.from],
        frequency: "monthly",
        interval: "1",
        anchorOn: monthlyAnchor(c.due, firstMonth),
      });
      if (!result.ok) throw new Error(`Demo commitment ${c.name}: ${result.message}`);
      byId.set(result.value, c);
    }
    const past = (await getOccurrences(ctx))
      .filter((o) => o.dueOn < byId.get(o.commitmentId)!.due && o.dueOn <= today)
      .sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
    skippedGym =
      past.findLast((o) => byId.get(o.commitmentId)!.name === "Gym membership")?.id ?? null;
    for (const o of past) {
      if (o.id === skippedGym) continue;
      const c = byId.get(o.commitmentId)!;
      plan.push({
        on: o.dueOn,
        occurrenceId: o.id,
        input: {
          type: "expense",
          amount: String(c.amount),
          accountId: account[c.from],
          occurredOn: o.dueOn,
        },
      });
    }

    // This month's one-off: a dental treatment on the card two days ago (at
    // the earliest the 1st), which makes this month's spending stand out.
    const firstOfMonth = firstDayOf(yearMonthOf(today));
    const treatedOn = addDays(today, -2) < firstOfMonth ? firstOfMonth : addDays(today, -2);
    expense(treatedOn, 18_500, "Health", "visa", "Square Hospital");
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

    if (entry.occurrenceId) {
      const paid = await payOccurrence(ctx, entry.occurrenceId, {
        accountId: entry.input.accountId,
        amount: entry.input.amount,
        occurredOn: entry.on,
      });
      if (!paid.ok) throw new Error(`Demo seed could not pay on ${entry.on}: ${paid.message}`);
      count += 1;
      continue;
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

  if (situations) count += await plantSituations(ctx, today, account, category, skippedGym);

  return { ownerId: ctx.ownerId, transactions: count, from, to: today };
}

/**
 * What happened after the ledger above, as the person would have done it:
 * skipping a month of the gym, verifying balances, setting money aside, and
 * the entries that came after. Returns the number of transactions it adds.
 */
async function plantSituations(
  ctx: ServiceContext,
  today: CalendarDate,
  account: Record<AccountKey, string>,
  category: (name: string) => string,
  skippedGym: string | null,
): Promise<number> {
  const must = <T extends { ok: boolean; message?: string }>(
    what: string,
    result: T,
  ): Extract<T, { ok: true }> => {
    if (!result.ok) throw new Error(`Demo ${what}: ${result.message}`);
    return result as Extract<T, { ok: true }>;
  };
  const balanceOf = async (key: AccountKey, asOf?: CalendarDate) =>
    taka((await getAccountBalances(ctx, asOf)).find((b) => b.accountId === account[key])!.balance);
  const verify = async (key: AccountKey, asOf: CalendarDate, counted: number) =>
    must(
      `verification of ${key}`,
      await verifyBalance(ctx, { accountId: account[key], asOf, countedAmount: String(counted) }),
    );
  const spend = async (
    key: AccountKey,
    on: CalendarDate,
    amount: number,
    name: string,
    what: string,
  ) =>
    must(
      what,
      await recordEntry(ctx, {
        type: "expense",
        amount: String(amount),
        accountId: account[key],
        categoryId: category(name),
        occurredOn: on,
        description: what,
      }),
    );
  let added = 0;

  // Away that month: the gym was skipped, not paid.
  if (skippedGym) must("skip", await skipOccurrence(ctx, skippedGym));

  // Bank, checked against the statement five days ago: it matches.
  const bankOn = addDays(today, -5);
  await verify("bank", bankOn, await balanceOf("bank", bankOn));

  // Cash, counted ten days ago and matching then. Money from an old phone sold
  // two days before that was entered only afterwards, so it no longer matches.
  const cashOn = addDays(today, -10);
  await verify("cash", cashOn, await balanceOf("cash", cashOn));
  must(
    "late entry",
    await recordEntry(ctx, {
      type: "income",
      amount: "2500",
      accountId: account.cash,
      categoryId: category("Other Income"),
      occurredOn: addDays(cashOn, -2),
      description: "Sold old phone",
    }),
  );
  added += 1;

  // bKash, checked two days ago: ৳180 less than recorded, an unrecorded
  // cash-out charge, so an adjustment is posted.
  const walletOn = addDays(today, -2);
  const wallet = await balanceOf("bkash", walletOn);
  const gap = Math.min(180, wallet);
  await verify("bkash", walletOn, wallet - gap);
  if (gap > 0) added += 1;

  // Money set aside. An emergency cushion in Bank, fully covered; a laptop
  // fund mostly in Savings (outside Available) with a little in bKash.
  const emergency = must(
    "set-aside item",
    await createProtectedMoneyItem(ctx, { name: "Emergency cushion" }),
  ).value!;
  const cushion = Math.min(20_000, Math.floor((await balanceOf("bank")) / 2 / 1_000) * 1_000);
  if (cushion > 0) {
    must(
      "reserve",
      await reserveProtectedMoney(ctx, emergency, {
        accountId: account.bank,
        amount: String(cushion),
      }),
    );
  }
  const laptop = must(
    "set-aside item",
    await createProtectedMoneyItem(ctx, { name: "New laptop", target: "95000" }),
  ).value!;
  must(
    "reserve",
    await reserveProtectedMoney(ctx, laptop, { accountId: account.savings, amount: "50000" }),
  );
  const inWallet = await balanceOf("bkash");
  const fund = Math.min(4_000, Math.floor(inWallet / 500) * 500);
  if (fund > 0) {
    must(
      "reserve",
      await reserveProtectedMoney(ctx, laptop, { accountId: account.bkash, amount: String(fund) }),
    );
    // Then a Daraz order from bKash (to the ৳50, like other shopping) left
    // about ৳1,200 less there than is set aside, never overdrawing it.
    const order = Math.min(
      inWallet,
      Math.ceil((inWallet - fund + Math.min(1_200, fund)) / 50) * 50,
    );
    await spend("bkash", today, order, "Shopping", "Daraz");
    added += 1;
  }
  return added;
}
