import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CategoryList } from "@/components/categories/category-list";
import {
  archiveNotice,
  listNames,
  renameNotice,
  usedBy,
  type CategoryView,
} from "@/components/categories/describe";
import { KindSwitch } from "@/components/categories/kind-switch";
import { defaultFeeCategory, type QuickAddData } from "@/components/quick-add/quick-add";
import { calendarDateFromIso } from "@/domain/calendar-date";

vi.mock("@/app/_server/actions", () => ({
  addCategoryAction: vi.fn(),
  archiveCategoryAction: vi.fn(),
  deleteCategoryAction: vi.fn(),
  renameCategoryAction: vi.fn(),
  restoreCategoryAction: vi.fn(),
  recordEntryAction: vi.fn(),
  removeEntryAction: vi.fn(),
}));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const view = (patch: Partial<CategoryView> = {}): CategoryView => ({
  id: "groceries",
  name: "Groceries",
  kind: "expense",
  archived: false,
  records: 0,
  commitments: [],
  deletable: false,
  lastActive: false,
  ...patch,
});

describe("what a category is used by, in words", () => {
  it("joins names as a sentence does", () => {
    expect(listNames(["Rent"])).toBe("Rent");
    expect(listNames(["Rent", "Internet"])).toBe("Rent and Internet");
    expect(listNames(["Rent", "Internet", "Gym"])).toBe("Rent, Internet and Gym");
  });

  it("names records and commitments with the right numbers", () => {
    expect(usedBy(view({ records: 1 }))).toBe("1 past record");
    expect(usedBy(view({ records: 48, commitments: ["Rent"] }))).toBe(
      "48 past records and the Rent commitment",
    );
    expect(usedBy(view({ commitments: ["Rent", "Internet"] }))).toBe(
      "the Rent and Internet commitments",
    );
  });

  it("tells a rename what it changes and what it does not", () => {
    expect(renameNotice(view({ records: 48 }))).toBe(
      "Groceries is used in 48 past records. Renaming it also changes the name shown there. Amounts and balances won't change.",
    );
  });

  it("tells an archive what keeps the category", () => {
    expect(archiveNotice(view({ records: 48, commitments: ["Rent"] }))).toBe(
      "Groceries won't be offered for new expenses. The 48 past records that use it keep it. Rent keeps paying into it. You can restore it at any time.",
    );
    expect(archiveNotice(view({ kind: "income", name: "Salary", records: 1 }))).toBe(
      "Salary won't be offered for new income. The past record that uses it keeps it. You can restore it at any time.",
    );
  });
});

describe("the Categories list", () => {
  const categories = [
    view({ id: "housing", name: "Housing", records: 12, commitments: ["Rent"] }),
    view({ id: "pets", name: "Pets", deletable: true }),
    view({ id: "fun", name: "Entertainment", archived: true, records: 3 }),
  ];
  const html = renderToStaticMarkup(<CategoryList kind="expense" categories={categories} />);
  const words = text(html);

  it("names the kind, and adds a category of that kind", () => {
    expect(words).toMatch(
      /^Money out Expense Categories What your money is spent on\. Add category/,
    );
  });

  it("shows identity and actions, never usage, on a row", () => {
    expect(words).not.toMatch(/used|transaction|\d+ past record/i);
    expect(words).toContain("Housing Rename Housing Archive Housing Manage Housing");
  });

  it("offers Delete only where deleting is allowed", () => {
    expect(words).toContain("Pets Rename Pets Archive Pets Delete Pets");
    expect(words).not.toContain("Delete Housing");
    expect(words).not.toContain("Delete Entertainment");
  });

  it("keeps archived categories apart, quieter, with Restore", () => {
    expect(words).toContain(
      "Archived Kept on past records, not offered for new expenses Entertainment Restore Entertainment",
    );
    expect(words).not.toContain("Rename Entertainment");
  });

  it("draws Expense in the warm family and Income in the cool one, never red or green", () => {
    const income = renderToStaticMarkup(
      <CategoryList kind="income" categories={[view({ name: "Salary", kind: "income" })]} />,
    );
    expect(html).toContain("var(--color-coral)");
    // Resting fills only: Delete's hover tint is destructive, not a kind colour.
    expect(html).not.toMatch(/[\s"]bg-(negative|positive)/);
    expect(income).toContain("bg-mist text-ocean");
    expect(income).not.toMatch(/coral|[\s"]bg-(negative|positive)/);
    expect(text(income)).toMatch(/^Money in Income Categories/);
  });

  it("orders active categories by name, above the archived ones", () => {
    expect(words.indexOf("Housing")).toBeLessThan(words.indexOf("Pets"));
    expect(words.indexOf("Pets")).toBeLessThan(words.indexOf("Entertainment"));
  });

  it("says when nothing is archived, and when no category is active", () => {
    const income = text(
      renderToStaticMarkup(
        <CategoryList
          kind="income"
          categories={[view({ id: "salary", name: "Salary", kind: "income", lastActive: true })]}
        />,
      ),
    );
    expect(income).toContain("No archived Income Categories.");
    expect(income).not.toContain("Delete Salary");

    const none = text(renderToStaticMarkup(<CategoryList kind="expense" categories={[]} />));
    expect(none).toContain("No active Expense Categories Add one so new expenses can be recorded.");
  });
});

describe("the kind switch", () => {
  it("links both kinds and marks the one on screen", () => {
    const html = renderToStaticMarkup(<KindSwitch current="income" />);
    expect(html).toContain('aria-label="Category kind"');
    expect(html).toContain('href="/categories"');
    expect(html).toContain('href="/categories?kind=income"');
    const current = html.match(/<a[^>]*aria-current="page"[^>]*>(.*?)<\/a>/)?.[1] ?? "";
    expect(text(current)).toBe("Income Categories");
    // The kind's mark is decoration: the link is named by its words alone.
    expect(current).toMatch(/<span aria-hidden="true"/);
  });
});

describe("where a transfer fee starts", () => {
  const data = (patch: Partial<QuickAddData["defaults"]>, names: readonly string[]) =>
    ({
      accounts: [],
      categories: names.map((name) => ({ id: name, name, kind: "expense" as const })),
      defaults: {
        expense: null,
        income: null,
        transfer: null,
        frequentCategoryIds: { expense: [], income: [] },
        feeCategoryId: null,
        ...patch,
      },
      today: calendarDateFromIso("2026-09-22"),
    }) satisfies QuickAddData;

  it("starts in the last fee's category, whatever it is called", () => {
    expect(defaultFeeCategory(data({ feeCategoryId: "Bank charges" }, ["Bank charges"]))).toBe(
      "Bank charges",
    );
  });

  it("falls back to Fees & Charges, and to no choice once it is renamed", () => {
    expect(defaultFeeCategory(data({}, ["Fees & Charges", "Other"]))).toBe("Fees & Charges");
    expect(defaultFeeCategory(data({}, ["Bank charges", "Other"]))).toBe("");
  });

  it("does not start in a category no longer offered", () => {
    expect(defaultFeeCategory(data({ feeCategoryId: "Gone" }, ["Fees & Charges"]))).toBe(
      "Fees & Charges",
    );
  });
});
