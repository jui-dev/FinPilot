import type { CategoryKind } from "@/domain/ledger/transactions";

/** One category as the Categories page shows it; every fact is the server's. */
export interface CategoryView {
  readonly id: string;
  readonly name: string;
  readonly kind: CategoryKind;
  readonly archived: boolean;
  /** Recorded (not deleted) transactions in this category. */
  readonly records: number;
  /** Commitments that pay into it, by name. */
  readonly commitments: readonly string[];
  /** Nothing has ever referenced it, and it is not the kind's last active category. */
  readonly deletable: boolean;
  /** The only active category of its kind: it cannot be archived or deleted. */
  readonly lastActive: boolean;
}

/** The product's words for each kind. */
export const KIND_WORDS: Readonly<
  Record<CategoryKind, { title: string; one: string; note: string; entries: string }>
> = {
  expense: {
    title: "Expense Categories",
    one: "Expense Category",
    note: "What your money is spent on.",
    entries: "new expenses",
  },
  income: {
    title: "Income Categories",
    one: "Income Category",
    note: "Where your money comes from.",
    entries: "new income",
  },
};

/** Whether changing the category shows on anything already recorded or planned. */
export const isUsed = (view: CategoryView) => view.records > 0 || view.commitments.length > 0;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Rent", "Rent and Internet", "Rent, Internet and Gym". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** "48 past records and the Rent commitment" — what uses the category, in words. */
export function usedBy(view: CategoryView): string {
  const parts: string[] = [];
  if (view.records > 0) parts.push(plural(view.records, "past record", "past records"));
  if (view.commitments.length > 0) {
    parts.push(
      `the ${listNames(view.commitments)} ${view.commitments.length === 1 ? "commitment" : "commitments"}`,
    );
  }
  return listNames(parts);
}

/** What renaming a used category changes, and what it does not. */
export function renameNotice(view: CategoryView): string {
  return `${view.name} is used in ${usedBy(view)}. Renaming it also changes the name shown there. Amounts and balances won't change.`;
}

/** What archiving a used category does to the records and commitments that use it. */
export function archiveNotice(view: CategoryView): string {
  const sentences = [`${view.name} won't be offered for ${KIND_WORDS[view.kind].entries}.`];
  if (view.records > 0) {
    sentences.push(
      `${view.records === 1 ? "The past record that uses it keeps" : `The ${view.records} past records that use it keep`} it.`,
    );
  }
  if (view.commitments.length > 0) {
    sentences.push(
      `${listNames(view.commitments)} ${view.commitments.length === 1 ? "keeps" : "keep"} paying into it.`,
    );
  }
  sentences.push("You can restore it at any time.");
  return sentences.join(" ");
}
