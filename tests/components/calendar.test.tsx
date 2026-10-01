import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { Agenda, MonthStrip } from "@/components/calendar/agenda";
import { DayEvidence } from "@/components/calendar/day-evidence";
import { calendarHref, weekLabel, WEEK_STARTS_ON } from "@/components/calendar/describe";
import { MonthLine } from "@/components/calendar/month-header";
import { MonthGrid } from "@/components/calendar/month-grid";
import type { DatabaseHandle } from "@/db/client";
import type { CalendarDate, YearMonth } from "@/domain/calendar-date";
import { createCommitment, payOccurrence, recordEntry, verifyBalance } from "@/server/commands";
import { getMonthCalendar } from "@/server/services/calendar-service";
import { getOccurrences } from "@/server/services/commitment-service";

import { ok, setupLedger } from "../support/ledger";

/**
 * How the Calendar reads (built from the real read model on a small ledger):
 * the grid's cells and week column, the phone strip and agenda, a day's
 * evidence, and the month line.
 */
let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

async function ledger() {
  const setup = await setupLedger("2026-09-22");
  handle = setup.handle;
  const { ctx, category } = setup;
  const bank = await setup.account("Bank", "bank", "2026-09-01", 50_000);
  const cash = await setup.account("Cash", "cash", "2026-09-01", 0);
  const record = async (input: Record<string, string>) => ok(await recordEntry(ctx, input)).ids;
  await record({
    type: "income",
    amount: "60000",
    accountId: bank,
    categoryId: category("Salary"),
    occurredOn: "2026-09-01",
    description: "Salary",
  });
  await record({
    type: "expense",
    amount: "980",
    accountId: bank,
    categoryId: category("Food & Dining"),
    occurredOn: "2026-09-01",
    description: "Sultan's Dine",
  });
  await record({
    type: "transfer",
    amount: "5000",
    accountId: bank,
    counterAccountId: cash,
    fee: "93",
    feeCategoryId: category("Fees & Charges"),
    occurredOn: "2026-09-03",
    description: "Cash-out",
  });
  // Three payments due on the 20th: two named in the cell, the third summarised.
  for (const [name, amount] of [
    ["Internet", 1_500],
    ["Phone", 1_200],
    ["Water", 800],
  ] as const) {
    ok(
      await createCommitment(ctx, {
        name,
        categoryId: category("Utilities"),
        expectedAmount: String(amount),
        expectedAccountId: bank,
        frequency: "monthly",
        interval: "1",
        anchorOn: "2026-09-20",
      }),
    );
  }
  ok(
    await createCommitment(ctx, {
      name: "Rent",
      categoryId: category("Housing"),
      expectedAmount: "20000",
      expectedAccountId: bank,
      frequency: "monthly",
      interval: "1",
      anchorOn: "2026-09-03",
    }),
  );
  const rent = (await getOccurrences(ctx)).find(
    (o) => o.name === "Rent" && o.dueOn === "2026-09-03",
  )!;
  ok(
    await payOccurrence(ctx, rent.id, {
      accountId: bank,
      amount: "20000",
      occurredOn: "2026-09-05",
    }),
  );
  ok(await verifyBalance(ctx, { accountId: cash, asOf: "2026-09-10", countedAmount: "4800" }));
  return setup;
}

describe("the month grid", () => {
  it("starts the week on Saturday and sets the week column apart", async () => {
    const { ctx } = await ledger();
    const cal = await getMonthCalendar(ctx, WEEK_STARTS_ON);
    const html = renderToStaticMarkup(<MonthGrid calendar={cal} open={null} />);
    const heads = [...html.matchAll(/<abbr title="(\w+)"/g)].map((m) => m[1]);
    expect(heads).toEqual([
      "Saturday",
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ]);
    expect(text(html)).toContain("Week out");
    expect(text(html)).toContain(`${weekLabel(cal.weeks[0]!.range)} ৳ 1,073`);
  });

  it("puts money first after the date, naming in and out only where a day has both", async () => {
    const { ctx } = await ledger();
    const words = text(
      renderToStaticMarkup(
        <MonthGrid calendar={await getMonthCalendar(ctx, WEEK_STARTS_ON)} open={null} />,
      ),
    );
    expect(words).toContain("Tuesday, 1 Sep 1 + ৳ 60,000 in ৳ 980 out");
    // The 5th: only spending, so no label.
    expect(words).toMatch(/Saturday, 5 Sep 5 ৳ 20,000 (?!out)/);
  });

  it("names two payments due in a day and summarises the rest", async () => {
    const { ctx } = await ledger();
    const words = text(
      renderToStaticMarkup(
        <MonthGrid calendar={await getMonthCalendar(ctx, WEEK_STARTS_ON)} open={null} />,
      ),
    );
    expect(words).toMatch(/Sunday, 20 Sep 20 Internet , overdue Phone , overdue \+1 due/);
    expect(words).toContain("Rent , paid");
  });

  it("links every day to itself, marks today, and outlines the day whose drawer is open", async () => {
    const { ctx } = await ledger();
    const cal = await getMonthCalendar(ctx, WEEK_STARTS_ON, "2026-09", "2026-09-05");
    const html = renderToStaticMarkup(
      <MonthGrid calendar={cal} open={"2026-09-05" as CalendarDate} />,
    );
    expect(html).toContain(
      `href="${calendarHref("2026-09" as YearMonth, "2026-09-05" as CalendarDate).replace(/&/g, "&amp;")}"`,
    );
    expect(html).toMatch(/aria-current="date"[^>]*>.*?Tuesday, 22 Sep/);
    expect(text(html)).toContain("Saturday, 5 Sep, open");
    // With no drawer open, no day is marked, not even today.
    const closed = text(renderToStaticMarkup(<MonthGrid calendar={cal} open={null} />));
    expect(closed).not.toContain(", open");
  });
});

describe("the phone agenda", () => {
  it("lists, week by week, only the days that hold something, with each week's spending", async () => {
    const { ctx } = await ledger();
    const cal = await getMonthCalendar(ctx, WEEK_STARTS_ON);
    const words = text(renderToStaticMarkup(<Agenda calendar={cal} />));
    expect(words).toContain("1–4 Sep Went out ৳ 1,073");
    expect(words).toContain("1 Tue 1 Sep 2 entries + ৳ 60,000 in ৳ 980");
    expect(words).toContain("3 Thu 3 Sep 1 entry · 1 moved ৳ 93");
    // The 2nd holds nothing: no line of its own.
    expect(words).not.toContain("2 Wed");
    // Today is always there.
    expect(words).toContain("22 Today");
  });

  it("marks days in the strip by weight and a line, never by dots", async () => {
    const { ctx } = await ledger();
    const html = renderToStaticMarkup(
      <MonthStrip calendar={await getMonthCalendar(ctx, WEEK_STARTS_ON)} open={null} />,
    );
    expect(html).toContain('aria-label="Tuesday, 1 Sep"');
    expect(html).not.toMatch(/rounded-full[^"]*size-1\.5/);
    expect(text(html)).toContain("Payment needs you");
  });
});

describe("a day's evidence", () => {
  it("puts a fee with the money and the transfer apart, as not spending", async () => {
    const { ctx } = await ledger();
    const cal = await getMonthCalendar(ctx, WEEK_STARTS_ON, "2026-09", "2026-09-03");
    const html = renderToStaticMarkup(<DayEvidence detail={cal.detail!} today={cal.today} />);
    const words = text(html);
    expect(words).toContain("Thursday, 3 Sep 19 days ago");
    expect(words).toContain("Went out ৳ 93 This day in Activity");
    expect(words).toContain("Money activity 1 entry Cash-out (fee) ৳ 93 Fees & Charges · Bank");
    expect(words).toContain("Moved between accounts Not spending Cash-out ৳ 5,000");
    expect(words).toContain("Commitments due Rent Paid ৳ 20,000 Paid 5 Sep See the payment");
    expect(html).toContain("/activity?from=2026-09-03&amp;to=2026-09-03&amp;tx=");
  });

  it("shows a count and the adjustment it posted, and renders only the groups a day holds", async () => {
    const { ctx } = await ledger();
    const cal = await getMonthCalendar(ctx, WEEK_STARTS_ON, "2026-09", "2026-09-10");
    const words = text(
      renderToStaticMarkup(<DayEvidence detail={cal.detail!} today={cal.today} />),
    );
    expect(words).toContain("Balance adjustments Not spending Balance adjusted − ৳ 200");
    expect(words).toContain(
      "Cash counted ৳ 4,800 Didn't match: − ৳ 200 posted Review entries through 10 Sep",
    );
    expect(words).not.toContain("Money activity");
    expect(words).not.toContain("Commitments due");
  });

  it("says when nothing was recorded", async () => {
    const { ctx } = await ledger();
    const cal = await getMonthCalendar(ctx, WEEK_STARTS_ON, "2026-09", "2026-09-02");
    expect(
      text(renderToStaticMarkup(<DayEvidence detail={cal.detail!} today={cal.today} />)),
    ).toContain("Nothing was recorded on this day.");
  });
});

describe("the month line and a future month", () => {
  it("keeps recorded money apart from payments still due", async () => {
    const { ctx } = await ledger();
    const words = text(
      renderToStaticMarkup(<MonthLine calendar={await getMonthCalendar(ctx, WEEK_STARTS_ON)} />),
    );
    expect(words).toContain("September so far What was recorded, and what is still to pay.");
    expect(words).toContain(
      "Came in + ৳ 60,000 Went out ৳ 21,073 Still due this month ৳ 3,500 3 payments",
    );
    expect(words).not.toContain("%");
  });

  it("shows a future month's payments due and no money at all", async () => {
    const { ctx } = await ledger();
    const october = await getMonthCalendar(ctx, WEEK_STARTS_ON, "2026-10");
    const line = text(renderToStaticMarkup(<MonthLine calendar={october} />));
    expect(line).toContain("October 2026");
    expect(line).toContain(
      "Nothing has come in or gone out yet Due this month ৳ 23,500 4 payments",
    );
    expect(line).not.toContain("Open in Cash flow");
    const grid = text(renderToStaticMarkup(<MonthGrid calendar={october} open={null} />));
    expect(grid).not.toMatch(/৳/);
  });
});
