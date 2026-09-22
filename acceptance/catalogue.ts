/**
 * Every assertion of the mandatory acceptance scenario
 * (docs/acceptance-scenarios.md), grouped by the roadmap stage that must turn
 * it green (docs/acceptance-scenarios.md §8).
 *
 * Amounts are whole taka; the implementation stores integer poisha.
 * Mutations M1–M3 are applied independently to the base scenario.
 * Where one documented assertion is verified across stages, it appears once per
 * stage with a "(ledger)", "(net worth)" or "(Available)" part.
 */
export interface AcceptanceAssertion {
  readonly id: string;
  readonly title: string;
}

export interface AcceptanceStage {
  readonly stage: string;
  readonly assertions: readonly AcceptanceAssertion[];
}

export const ACCEPTANCE_CATALOGUE: readonly AcceptanceStage[] = [
  {
    stage: "F2 — Ledger persistence",
    assertions: [
      {
        id: "A-01",
        title:
          "balances end of Aug 31: Bank 85,000 · Cash 3,000 · bKash 6,000 · Savings 120,000 · Visa −12,000",
      },
      {
        id: "A-02",
        title: "current balances: Bank 133,000 · bKash 8,963 · Savings 90,000 · Visa −6,000",
      },
      {
        id: "A-03",
        title:
          "Sep 1–22 spending: Housing 30,000 · Health 30,000 · Groceries 4,200 · Shopping 1,800 · Food & Dining 450 · Fees & Charges 37 · total 66,487",
      },
      { id: "A-04", title: "Sep 1–22 income 95,000 (the refund is not income)" },
      { id: "A-05", title: "savings rate Sep 1–22 = 28,513 / 95,000 → 30.0%" },
      {
        id: "A-06",
        title:
          "transfers (12,000 card payment, 5,000 top-up, 2,000 cash-out) contribute 0 to income and spending; Σ transfer entries = 0",
      },
      {
        id: "A-07",
        title:
          "Aug 1–22 spending: Housing 30,000 · Groceries 5,000 · Shopping 3,800 · Food & Dining 1,200 · Fees & Charges 37 · total 40,037 (Utilities 0)",
      },
      {
        id: "A-08",
        title:
          "spending ≠ 78,487 (card payment not an expense); income ≠ 96,200 (refund not income)",
      },
      {
        id: "M3-1",
        title:
          "(ledger) card payment entered as expense −12,000 Bank/Other: Bank 133,000 · Visa −18,000 · spending 78,487",
      },
      {
        id: "M3-2",
        title:
          "correction edits the same row to a transfer to Visa, category cleared; row id unchanged",
      },
      {
        id: "M3-3",
        title: "(ledger) after correction: Visa −6,000 · spending 66,487",
      },
    ],
  },
  {
    stage: "4 — Reconciliation",
    assertions: [
      {
        id: "A-10",
        title: "reconcile Cash on Sep 20 (counted 4,200) posts adjustment −350; Cash 4,200",
      },
      { id: "A-11", title: "net worth 230,163; assets 236,163; liabilities 6,000" },
      { id: "A-12", title: "adjustment excluded from analytics: spending remains 66,487" },
      { id: "A-13", title: "Cash checkpoint Sep 20 status matches (balance as of Sep 20 = 4,200)" },
      {
        id: "A-14",
        title: "230,163 − 202,000 = 28,163 = income 95,000 − spending 66,487 − adjustment 350",
      },
      {
        id: "M2-1",
        title:
          "lunch moved to bKash: Cash as of Sep 20 = 4,650 vs stated 4,200 → checkpoint broken by 450",
      },
      {
        id: "M2-2",
        title: "(ledger) Cash 4,650 · bKash 8,513 · net worth 230,163 · spending 66,487 unchanged",
      },
      { id: "M3-1", title: "(net worth) card payment as expense: net worth 218,163" },
      { id: "M3-3", title: "(net worth) after correction: net worth 230,163" },
    ],
  },
  {
    stage: "5 — Monthly analysis",
    assertions: [
      {
        id: "A-20",
        title:
          "MoM Δ: Health +30,000 · Shopping −2,000 · Groceries −800 · Food & Dining −750 · Housing 0 · Fees & Charges 0",
      },
      { id: "A-21", title: "net Δ +26,450 (66,487 − 40,037); gross increases 30,000" },
      {
        id: "A-22",
        title: "Health = 100% of gross increases; Shopping, Groceries, Food & Dining are offsets",
      },
      {
        id: "A-23",
        title:
          "materiality |Δ| ≥ max(500, 10% of previous): Health, Shopping, Groceries, Food & Dining all material",
      },
    ],
  },
  {
    stage: "6 — Commitments",
    assertions: [
      {
        id: "A-30",
        title:
          "occurrences to Nov 21: paid Rent Aug 1, Internet Aug 25, Rent Sep 1; pending Internet Sep 25, Rent Oct 1, Streaming Oct 3, Internet Oct 25, Rent Nov 1, Streaming Nov 3; no Streaming before Oct 3",
      },
      {
        id: "A-31",
        title: "pending due ≤ Oct 22 = Internet 1,500 + Rent 30,000 + Streaming 700 = 32,200",
      },
      { id: "A-32", title: "materialisation is idempotent: reading twice creates no duplicates" },
      { id: "M1-1", title: "rent transaction deleted: Rent Sep 1 back to pending, shown overdue" },
      { id: "M1-2", title: "rent deleted: Bank 163,000 · net worth 260,163 · spending 36,487" },
    ],
  },
  {
    stage: "7 — Budgets",
    assertions: [
      {
        id: "A-40",
        title:
          "Housing Sep: limit 30,000 · usage 30,000 · fixed 30,000 · variable 0 · remaining committed 0 · projected 30,000 · on_track",
      },
      {
        id: "M1-4",
        title:
          "rent deleted: Housing usage 0 · remaining committed 30,000 · projected 30,000 · on_track",
      },
    ],
  },
  {
    stage: "8 — Goals and earmarks",
    assertions: [
      {
        id: "A-50",
        title: "Laptop: reserved 120,000 · covered 110,000 · short 10,000 (Savings) · progress 73%",
      },
      {
        id: "A-51",
        title: "rejected earmarks (Savings +1,000 over balance; Visa liability) leave no write",
      },
    ],
  },
  {
    stage: "9 — Available",
    assertions: [
      { id: "A-60", title: "bridge 146,163 → −6,000 → −32,200 → −20,000 = Available 87,963" },
      {
        id: "A-61",
        title: "Savings balance and Savings earmark excluded; Oct 1 salary not included",
      },
      {
        id: "M1-3",
        title: "rent deleted: Available unchanged 87,963 (176,163 − 6,000 − 62,200 − 20,000)",
      },
      { id: "M2-2", title: "(Available) lunch moved to bKash: Available unchanged 87,963" },
      { id: "M3-1", title: "(Available) card payment as expense: Available 75,963" },
      { id: "M3-3", title: "(Available) after correction: Available 87,963" },
    ],
  },
  {
    stage: "10 — Signals",
    assertions: [
      { id: "A-70", title: "goal under-covered: Laptop short 10,000 on Savings" },
      { id: "A-71", title: "commitment due soon: Internet Sep 25, in 3 days, 1,500" },
      {
        id: "A-72",
        title:
          "MoM attribution: Health accounted for all of the increase; offsets Shopping −2,000, Groceries −800, Food & Dining −750",
      },
      {
        id: "A-73",
        title: "reconciliation adjustment (info): Cash unexplained difference 350 on Sep 20",
      },
      { id: "M1-5", title: "rent deleted: Rent overdue 21 days" },
      { id: "M2-3", title: "lunch moved: Cash verification of Sep 20 no longer matches, 450" },
    ],
  },
];
