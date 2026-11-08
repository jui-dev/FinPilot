/**
 * The Guide's words: how FinPilot works, in the product's own terms.
 *
 * Everything here restates rules the product already has (docs/domain-model.md,
 * docs/design-direction.md); nothing is computed, and no figure is the
 * person's own. Every link leads to a page in the main navigation, which a
 * test checks, so the Guide cannot point at a page that has moved.
 */

export type GuideIllustration =
  "accounts" | "record" | "verify" | "commitments" | "set-aside" | "available";

/** Where a step's link leads: a page, or Quick Add itself. */
export type GuideTarget = { readonly href: string } | { readonly quickAdd: true };

export interface GuideStep {
  /** When the step is done, in a few words. */
  readonly when: string;
  readonly title: string;
  readonly text: string;
  /** One idea the step meets, explained where it first matters. */
  readonly goodToKnow: string;
  readonly link: { readonly label: string; readonly to: GuideTarget };
  readonly illustration: GuideIllustration;
  /** The step's name in the progress row. */
  readonly short: string;
}

export const GUIDE_LEAD =
  "FinPilot answers one question: how much of your money is actually free to use right now? Follow six steps and it can answer it for you.";

/** The four-part idea under every page. */
export const GUIDE_CYCLE = [
  {
    title: "Record",
    text: "Write down money as it moves: expenses, income and transfers between your accounts.",
  },
  {
    title: "Verify",
    text: "Now and then, check a balance against the real account, so the numbers stay true.",
  },
  { title: "Understand", text: "See where the money went, how months compare and when it moved." },
  {
    title: "Available",
    text: "Add what you must pay and what you keep aside, and see what's really free.",
  },
] as const;

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    when: "Start here",
    title: "Add your accounts",
    short: "Accounts",
    text: "Every place your money lives: cash, bank, bKash, credit cards. Enter each balance on the day you start. For a card, enter what you owe.",
    goodToKnow:
      "Savings accounts are yours but don't count toward Available, so money there isn't treated as spendable.",
    link: { label: "Open Accounts", to: { href: "/accounts" } },
    illustration: "accounts",
  },
  {
    when: "Every day",
    title: "Record as you go",
    short: "Record",
    text: "Press + Add (or N). Choose Expense, Income or Transfer, type the amount, and pick the category and account. You see each account's balance before and after.",
    goodToKnow:
      "Paying your card bill is a transfer to the card, not an expense. The spending was recorded when you used the card.",
    link: { label: "Open Quick Add", to: { quickAdd: true } },
    illustration: "record",
  },
  {
    when: "Every week or two",
    title: "Verify a balance",
    short: "Verify",
    text: "Look at the real account (your wallet, your banking app) and type what it holds. If it differs, FinPilot records the difference as a balance adjustment.",
    goodToKnow:
      "If you later change an entry from before that day, the account shows Changed, so you know the verified balance no longer matches.",
    link: { label: "Open Accounts", to: { href: "/accounts" } },
    illustration: "verify",
  },
  {
    when: "Once, then as needed",
    title: "Add your commitments",
    short: "Commitments",
    text: "Rent, bills, subscriptions: anything you pay on a schedule. When one is due, Pay records the expense, or Skip it for that time.",
    goodToKnow:
      "Everything due in the next 30 days, overdue included, is already spoken for and comes out of Available.",
    link: { label: "Open Commitments", to: { href: "/commitments" } },
    illustration: "commitments",
  },
  {
    when: "When you're saving",
    title: "Set money aside",
    short: "Set aside",
    text: "Name a purpose (an emergency cushion, a new laptop) and choose the account that holds the money. Nothing moves: it's a label on money you already have.",
    goodToKnow:
      "If you spend from that account, the money set aside can become short. FinPilot tells you, and never counts the same money twice.",
    link: { label: "Open Set aside", to: { href: "/set-aside" } },
    illustration: "set-aside",
  },
  {
    when: "Before you spend",
    title: "Read Available",
    short: "Available",
    text: "Available is not your bank balance. It's what's left in the accounts that count once cards, payments due and money set aside are taken out.",
    goodToKnow:
      "Available is worked out before new income. If it's below zero, you're over-committed, and it says by how much.",
    link: { label: "Open Available", to: { href: "/available" } },
    illustration: "available",
  },
];

export interface GuideWord {
  readonly term: string;
  readonly meaning: string;
  /** How the word appears on screen, when it is a tag. */
  readonly tags?: ReadonlyArray<{
    readonly label: string;
    readonly tone: "positive" | "warning" | "negative";
  }>;
}

export const GUIDE_WORDS: readonly GuideWord[] = [
  {
    term: "Available",
    meaning:
      "What you can use now, before new income: your counted accounts, less what cards owe, payments due in the next 30 days and money set aside.",
  },
  {
    term: "Spoken for",
    meaning: "Money that's already promised: owed on cards, payments due and money set aside.",
  },
  {
    term: "Set aside",
    meaning:
      "Money kept for a purpose. It stays in its account. It's short when the account no longer holds all of it.",
    tags: [{ label: "৳300 short", tone: "negative" }],
  },
  {
    term: "Verified and Changed",
    meaning:
      "Verified: the balance matched what you counted on that day. Changed: an older entry was added, edited or deleted since.",
    tags: [
      { label: "Verified", tone: "positive" },
      { label: "Changed · ৳500 off", tone: "warning" },
    ],
  },
  {
    term: "Commitment",
    meaning:
      "A payment you make on a schedule, like rent or a phone bill. Each time it's due you Pay it (which records the expense) or Skip it.",
  },
  {
    term: "Transfer",
    meaning:
      "Money moving between your own accounts. It's neither spending nor income. Paying a card bill is a transfer to the card.",
  },
  {
    term: "Balance adjustment",
    meaning: "The correction Verify records when what you counted differs from what FinPilot had.",
  },
  {
    term: "Attention",
    meaning:
      "On the Overview: what needs you now, such as an overdue payment, money short, a changed balance or unusual spending.",
  },
];

/** The example Available is worked out from: illustrative figures, in taka. */
export const GUIDE_AVAILABLE_EXAMPLE = {
  inAccounts: 120_000,
  owedOnCards: 18_000,
  dueSoon: 32_500,
  setAside: 25_000,
} as const;

export const exampleAvailable = (e = GUIDE_AVAILABLE_EXAMPLE) =>
  e.inAccounts - e.owedOnCards - e.dueSoon - e.setAside;

/** The anchor of step n (1-based): its card, and what the row of steps links to. */
export const guideStepId = (n: number) => `step-${n}`;
