# FinPilot — Domain Model

**Status:** Frozen — approved 2026-09-22
**Change policy:** Revisit only when implementation exposes a concrete technical problem. Record every change in §18 with its reason.
**Related:** [product-baseline.md](product-baseline.md) · [tech-stack.md](tech-stack.md) · [acceptance-scenarios.md](acceptance-scenarios.md) · [roadmap.md](roadmap.md)

This document defines FinPilot's financial domain: entities, invariants, transaction semantics and derived calculations. For each important decision it records **why**, the **alternatives considered**, the **trade-offs** and an **interview defense**.

Conventions: amounts are shown in ৳ (whole taka) for readability and **stored as integer poisha** (§3). Examples use **today = 2026-09-22** and owner timezone **Asia/Dhaka**.

---

## 1. Transaction representation: single row (Model S) vs header + postings (Model P)

This decision was deliberately challenged instead of defaulting to double-entry because it sounds rigorous.

### 1.1 The candidates
- **Model P (postings):** a `transaction` header (type, date, description, category) plus `posting` rows (account, signed amount). Balance = Σ postings.
- **Model S (single row):** one `transaction` row holding:
  - `type`, `occurred_on`
  - `amount` (**signed effect on `account_id`**)
  - `account_id`, `counter_account_id` (transfers only), `category_id`
  - an optional `group_id` linking related rows

  Balances come from one SQL **view, `account_entries`**. It emits one entry per row, plus a mirrored entry (−amount) on `counter_account_id` for transfers.

### 1.2 FinPilot's scenarios in each model
| Scenario | Model S | Model P | Notes |
|---|---|---|---|
| Income | 1 row, +amt, income category | header + 1 posting | same |
| Expense | 1 row, −amt, expense category | header + 1 posting | same |
| Asset→asset transfer | 1 row, −amt, counter account | header + 2 postings (−/+) | **S: zero-sum holds by construction** (one amount field). P: zero-sum needs an app or trigger check across rows. |
| Credit-card purchase | expense row on the card account (the liability goes more negative) | same | same |
| Credit-card payment | transfer bank→card (no category → never spending) | 2 postings | same semantics; S has fewer rows |
| Refund | 1 row, type `refund`, +amt, expense category | header + 1 posting | same |
| Opening balance | 1 row, type `opening_balance`, signed amt | header + 1 posting | same |
| Reconciliation adjustment | 1 row, type `adjustment`, signed amt | header + 1 posting | same |
| Wallet cash-out with fee | 2 rows sharing `group_id`: transfer −2,000 + expense −37 (Fees & Charges) | **P can't express this as one balanced transaction.** The fee has a category, and categories aren't accounts, so you get a transfer plus a separate expense anyway, or unbalanced postings. | P's supposed generality doesn't help |
| Split purchase (V1.1) | several expense rows sharing `group_id` | needs a category per line → a third table or category on postings | S handles it with no new table |

### 1.3 Invariants
| Invariant | S | P |
|---|---|---|
| Transfer nets to zero | **by construction** | app check or trigger across rows |
| Transfer has distinct from/to accounts and no category | per-row `CHECK` | cross-row check |
| Sign matches type (expense < 0, income > 0, …) | per-row `CHECK` | check on posting joined to header |
| Income/expense/refund have a category; other types don't | per-row `CHECK` | header check |
| Number of legs per type | not applicable | app check |
| Edit atomicity | one-row update (even a type change) | multi-row rewrite inside a DB transaction |

Every Model S invariant is a **single-row `CHECK`**, which works the same way in SQLite and PostgreSQL.

### 1.4 Queries
- **Balances / net worth:** P: `SUM(amount) GROUP BY account`. S: the same query over the `account_entries` view. The sign and mirroring rules live **in one place** (the view), not in every query.
- **Spending:** S: `−SUM(amount) WHERE type IN ('expense','refund')`, so refunds net out automatically. P: join header to postings, then filter.
- **Balance as of a date / net worth over time:** identical in both; filter entries by `occurred_on ≤ d`.

### 1.5 Decision: **Model S + `account_entries` view**
- **Why:** postings mainly add a guarantee (zero-sum transfers) that Model S gets **structurally, and more strongly**. The multi-leg cases FinPilot really has (fees, splits) involve categories, and postings-lite can't balance those either. Only full double-entry, where categories become accounts, solves them, and that is accounting software, which FinPilot is not.
- **Where S would start to strain:**
  - Cross-currency transfers, where the two sides have different amounts. The fix is a nullable `counter_amount`.
  - Investment trades.

  If FinPilot ever needs real multi-leg transactions, **the `account_entries` view is the migration point**: it becomes a real postings table, and readers don't change.
- **Interview defense:** *"I evaluated double-entry postings against our actual scenarios. The single-row model makes transfer balance a structural property rather than a checked one, and every invariant is a single-row CHECK. The one thing postings do better, uniform balance queries, I get from a view. I kept the view as the seam to move to postings if multi-currency or investments ever need it."*

---

## 2. Entities and responsibilities

| Entity | Responsibility | Stored or derived |
|---|---|---|
| **Owner** | Tenancy root. Settings: base currency (BDT), timezone (Asia/Dhaka), locale | stored (one seeded demo owner in V1) |
| **Account** | Where money exists or is owed | stored |
| **Category** | The purpose of income or spending | stored |
| **Transaction** | A fact: money moved, was earned or spent, or a balance was stated | stored (**the ledger**) |
| **ReconciliationCheckpoint** | "On date D the real balance was X" | stored |
| **BudgetLimit** | Planned monthly spending limit per category, with an effective date | stored |
| **Commitment** | The rule for an expected recurring outflow | stored |
| **CommitmentOccurrence** | One expected instance of a commitment, and its outcome | stored (materialised lazily, §8) |
| **Goal** | A target the user is saving toward | stored |
| **EarmarkEntry** | A change to how much of an account is reserved for a goal | stored (append-only) |
| **SignalDismissal** | The user has dismissed a signal for its period | stored |
| Balances, net worth, Available, budget usage/projection, goal backing, analytics, signals | — | **derived; never stored in V1** |

- **Tenancy:** every stored table carries `owner_id`, even though V1 has a single owner (§12).
- **IDs:** UUIDv7 (time-sortable, generated by the app).
  - **Why:** portable across SQLite and Postgres, safe when databases are copied (future demo sandboxes), and safe for idempotent ingestion later.
  - **Alternative:** integer autoincrement. Simpler, but it leaks row counts and collides when databases are merged.
  - The library is chosen at scaffold time (see [tech-stack.md](tech-stack.md)).

## 3. Money representation

- **Decision:** integer **minor units** (poisha), 64-bit range, with a `currency` code on each account. **V1 invariant:** every account uses the owner's base currency (BDT).
- **Why:** exact arithmetic. SQLite has no decimal type, so this also removes the largest SQLite/Postgres difference. No floats anywhere: not in the DB, not in the API, not in computations.
- **Derived maths** (projections, percentages, averages) runs on integers or exact fractions and is **rounded once, at presentation** (half-up; money is displayed to whole taka).
- **Display:** South Asian digit grouping (৳1,50,000) via locale formatting.
- **Alternatives:** DECIMAL columns (fine in Postgres, awkward in SQLite); floats (never).
- **Trade-off:** every boundary (forms, API, seed) converts between taka and poisha explicitly. The `Money` module owns that conversion.
- **Interview defense:** *"Money is an integer count of the smallest unit. Rounding happens exactly once, at the edge."*

## 4. Transaction semantics

### 4.1 Types (6)
| Type | Sign of `amount` (effect on `account_id`) | Category | Counter account | Counts as |
|---|---|---|---|---|
| `income` | > 0 | income-kind, required | — | income |
| `expense` | < 0 | expense-kind, required | — | spending |
| `refund` | > 0 | expense-kind, required | — | negative spending (optional `refund_of_id`) |
| `transfer` | < 0 (from side) | — | required, ≠ `account_id` | nothing (moves money) |
| `opening_balance` | ≠ 0 | — | — | nothing; **exactly one per account** |
| `adjustment` | ≠ 0 | — | — | nothing; created only by reconciliation |

### 4.2 Rules
- **"Card payment" is not a type.** It's a transfer whose counter account is a liability, and the UI labels it that way. The data can't double-count it, because transfers have no category.
- **`occurred_on` is a calendar date** (no time, no timezone). `created_at` and `updated_at` are UTC timestamps. "Today" and month boundaries are computed in the owner's timezone. Months are half-open ranges `[1st, next 1st)`.
- **No future-dated transactions.** The ledger records what happened; expected future money lives in commitments.
- **No transaction on an account may be dated before that account's opening balance.**
- **`group_id`** links rows that are one real-world event (cash-out + fee; splits in V1.1). The UI shows a group as one item.
- **Only three types ever count as income or spending:** `income`, `expense`, `refund`. Transfers, opening balances and adjustments never affect analytics.
- **Interview defense:** *"Every row answers one question: what did this do to this account? The type decides how analytics treat it."*

## 5. Accounts and balance semantics

- **Types:** `cash`, `bank`, `mobile_wallet` and `savings` are assets; `credit_card` is a liability. The asset/liability class is **derived from the type** by a pure mapping, not stored.
- **Sign convention:** every balance is signed from the user's point of view. A liability balance is ≤ 0 when money is owed, so **net worth = Σ all balances**, with no special cases.
- **Balance** = Σ `account_entries` for the account.
  - It is never stored in V1, and is indexed on (account, date).
  - For a personal ledger of thousands of rows, computing on read is effectively instant.
  - Materialised balances are an evolution path (§15).
- **`included_in_available`:** a stored boolean, defaulted from the type at creation: cash, bank, mobile wallet and credit card **on**; savings **off**. V1 may not expose a toggle, but the model supports per-account configuration. Eligibility is never permanently inferred from the type.
  - **Naming decision.** The invariant is: *the account's signed balance, and any reservations against it, fall within Available's scope.*
    - `counts_toward_available` suggests a positive contribution, which is wrong for credit cards.
    - `affects_available` is too broad: an excluded savings account still affects Available when it pays a commitment.
    - `included_in_available` describes membership in the sum, and the sign comes from the balance. **Chosen.**
- **Archiving:** only at zero balance, so money never silently disappears from the position. Delete only if the account has no transactions.
- **Credit scope (narrow by decision):** purchases, refunds and payments only. No credit limit/utilisation, interest, statements or minimum payments.

## 6. Category model

- **Flat**, owner-scoped, with `kind ∈ {income, expense}`, and seeded with defaults:
  - **Income:** Salary, Other Income.
  - **Expense:** Housing, Food & Dining, Groceries, Transport, Shopping, Utilities, Entertainment, Health, Fees & Charges, Other.
  - There is deliberately **no "Subscriptions" category**: it's a way of paying, not a purpose. Subscriptions are derived from commitments.
- The **type ↔ category-kind rule** (income → income-kind; expense and refund → expense-kind) is enforced in the domain layer and covered by tests.
- Categories in use are **archived, not deleted**. Merging and a parent/child hierarchy are V1.1+ (a nullable `parent_id`, with analytics rolling up).
- A category is **required** on income, expense and refund. Quick Add pre-selects the last category used, so this costs no speed. Without it, analytics would silently degrade.
- **Fixed vs variable spending is not a category property.** It comes from whether a transaction is matched to a commitment occurrence (§8). Rent is fixed because it's a commitment, not because "Housing" is.

## 7. Budget model

- **BudgetLimit:** `(category, effective_from_month, amount | null)`. The limit for month M is the most recent row with `effective_from_month ≤ M`. A null amount means "no budget from this month".
- **Period:** **calendar month only** in V1. No rollover, no custom periods.
- **Why effective-dated:** no job copies budgets forward each month, and past months stay exactly as planned. An edit applies from the current month onward; past months are read-only in V1.
- **Alternative rejected:** one row per month. It needs a copy job and loses history easily.
- **Usage** = the category's spending in the month (expenses − refunds).
- **Projection (commitment-aware):**
  - `fixed_spent` = spending matched to commitment occurrences.
  - `variable_spent` = usage − fixed_spent.
  - `remaining_committed` = pending occurrences in this category due within the current month, **including overdue ones from earlier in the month** (clarification, §18).
  - `projected = usage + remaining_committed + variable_spent / elapsed_days × remaining_days`, where `elapsed_days` counts today.
  - **No variable projection before day 5.** Committed overruns are still reported, because they're certain rather than projected.
- **Statuses:**
  - `on_track`
  - `at_risk`: projected > limit
  - `committed_over`: usage + remaining_committed > limit
  - `exceeded`: usage > limit
- **Examples** (22 of 30 days elapsed):
  - **Housing:** 30,000 limit, 30,000 spent, all of it matched rent. A naive linear pace gives 40,909 and a false alarm. FinPilot projects **30,000 → on track**.
  - **Dining:** 8,000 limit, 6,200 variable spent. Projected 6,200 + 6,200/22 × 8 = **8,455 → at risk by ৳455**.
- **Interview defense:** *"Linear pacing is wrong for lumpy spending. I split fixed from variable using commitment matches, not category labels."*

## 8. Commitment and occurrence model

- **Commitment** fields:
  - name, category (expense-kind), expected amount (an estimate for variable bills), optional expected account
  - schedule: `monthly | weekly | yearly`, interval, anchor/start date, optional end date
  - status: `active | paused | ended`

  Monthly anchors on the 29th–31st are clamped to the last day of shorter months.
- **Why occurrences are stored:** they carry state (paid, skipped, linked transaction), and state must persist.
- **Materialisation:** occurrences are materialised **lazily and idempotently** up to **today + 60 days** whenever they're read. The unique key `(commitment_id, due_on)` makes this idempotent. There's no background job in V1; one comes later.
  - Rejected alternative: purely virtual occurrences (can't hold state).
  - Rejected alternative: eager generation (unbounded rows).
- **Editing a rule** regenerates only **future, pending, untouched** occurrences. Paid and skipped history is kept.
- **Occurrence** fields: `due_on`, `expected_amount` (a snapshot), `status ∈ {pending, paid, skipped}`, `transaction_id` (unique, nullable). A paid occurrence has a transaction; a skipped one has none.
  - The displayed state is derived: upcoming / due today / **overdue** (pending and past due).
- **Matching:**
  1. **"Pay" on an occurrence** (the primary path) creates a pre-filled expense already linked to it.
  2. **Suggestions** when a new expense looks like a pending occurrence: same category, due within ±7 days, amount within ±20%. The user confirms. **Nothing is auto-matched silently.**
- **When the linked transaction is deleted,** the occurrence returns to pending.
- **Scope:** V1 has only outflow commitments, and no commitments for card payments (credit already counts in Available). Expected income (V1.1) uses the same model with a `direction` field.
- **Interview defense:** *"Lazy, idempotent materialisation keyed by (rule, date). The ledger holds what happened, occurrences hold what was expected, and a match is the explicit bridge between them."*

## 9. Goal and earmark model

- **Goal:** name, target amount, optional target date, `active | completed | archived`.
- **EarmarkEntry:** `(goal, account, ±amount, created_at)`, append-only. An earmark's current amount is the sum of its entries.
- **Earmarks never touch the ledger or any balance.** An earmark is a planning allocation over existing money, not money.
- **Write-time invariants**, checked inside one DB transaction:
  1. Earmarks are allowed on asset accounts only.
  2. A goal's earmark on an account never goes below zero.
  3. On an increase, Σ earmarks of **active** goals on that account ≤ the account's current balance. This is what prevents the same money being allocated to two goals.
- **The ledger always wins.** Spending, transfers and corrections are never blocked by earmarks; the UI only warns at entry (for example "this leaves Laptop under-covered by ৳2,000").
- **Backing (derived at read time):**
  - Per account, earmarks are ordered **oldest first**.
  - `backed_i = clamp(balance − Σ earlier earmarks, 0, earmark_i)`
  - `shortfall_i = earmark_i − backed_i`
  - Goal progress = Σ backed / target. The goal shows **Reserved / Covered / Short**, so a shortfall is never reported as funded.
  - Oldest-first is simple and explainable. Proportional splitting was rejected because it produces odd fractions. User-set priority is V1.1 if ever needed.
- **On track** (shown only when a target date exists): the required amount per month, (target − backed) / months left, is compared with the actual amount per month, the net earmark entries over the last 3 months.
- **Lifecycle:** completing or archiving a goal **releases** its earmarks, because only active goals count. No extra entries are needed, and history stays intact. "Reduce reservation to match balance" is one action that writes one negative entry.
- **Deliberately not built:** category envelopes, zero-based "assign every taka", or any link between budgets and money.
- **Interview defense:** *"Earmarks are plans over real money, never money. Invariants apply at write time; reality is reconciled at read time as a visible shortfall."*

## 10. Available

```
Available = Σ balance(accounts with included_in_available)                  ← liabilities are negative, so debt is subtracted
          − Σ expected_amount(pending occurrences with due_on ≤ today + 30)  ← includes overdue
          − Σ backed earmarks on included asset accounts                     ← reserves on excluded accounts are not subtracted
```

- **Presented as a bridge:** included asset balances → − credit owed → − upcoming commitments → − reserved for goals → **= Available**.
- **Horizon: rolling 30 days**, not "until month end". With a month-end horizon, rent due on the 1st would drop out when viewed on the 29th, and Available would jump just before a big bill.
- **Matching prevents double subtraction.** Once an occurrence is paid, it leaves the commitment term, and the ledger term already reflects the payment.
- **May be negative:** shown as "over-committed by ৳X", never clamped to zero.
- **Excludes future income by design** and is labelled "before new income". The V1.1 runway is the same formula plus expected inflows before the next income date.
- **Deliberate V1 scope trade-off:**
  - If a goal earmark and a commitment describe the same future purpose (for example annual insurance), Available is reduced twice. This errs on the conservative side.
  - V1 does **not** add goal↔commitment linking to solve it, because that would add an entity relationship, UI and matching rules for an edge case.
  - **V1 response:** this documentation, plus help text suggesting "use one or the other for the same payment".
  - **Revisit trigger:** real usage shows the double reservation happening often.

## 11. Signal engine

- **Shape:** `rule(context) → Signal[]`. Rules are **pure functions** over one derived **context** built per request. The context includes:
  - the as-of date and month windows
  - category spending for the current month-to-date and the like-for-like previous window
  - 3-month category averages
  - budget statuses, occurrences, goal backing, the Available bridge, reconciliation checkpoints
- **Signal fields:**
  - `key`: rule + subject + period; stable, used for dismissal and dedup
  - `severity`: critical / warning / info / positive
  - `score`: used for ranking
  - a message template with integer parameters
  - **evidence**: a transaction-list filter, so every signal has a drill-down
- **Computed on read.** Only dismissals are stored, keyed per period, so dismissing September's dining warning doesn't hide October's.
- **V1 rule families:**
  1. Budget at risk / committed over / exceeded
  2. Month-over-month change attribution
  3. Category spike vs the 3-month average
  4. Commitments due within 7 days / overdue
  5. Goal under-covered / behind schedule
  6. Available low / over-committed
  7. **Reconciliation:** a broken checkpoint, a stale or missing verification, and a recent adjustment (an informational "unexplained difference"; clarification, §18)
  8. Savings-rate change (positive)
- **Month-over-month rules:**
  - **Like for like:** the current month-to-date vs the same days of the previous month (for example Sep 1–22 vs Aug 1–22). The window is clamped to the previous month's length.
  - **Materiality:** a category change is material when |Δ| ≥ max(৳500, 10% of that category's previous-window amount) (clarification, §18). This keeps changes like ৳50 → ৳200 quiet.
  - **Share of change** is computed over **gross increases**, with offsets listed separately. The wording is "accounted for", never "caused".
- **Savings rate** = (income − spending) / income. It excludes transfers, opening balances and adjustments. It's undefined when income is 0.

## 12. Editing, deletion and history

| Object | Rule | Why |
|---|---|---|
| Transaction | Fully editable, **including its type** (a one-row update in Model S). **Soft delete** (`deleted_at`) with undo. All readers go through views that filter deleted rows. | This is a personal tool, not a bank. Mistakes must be cheap to fix, and the views keep the deleted-row filter in one place. |
| Opening balance | Exactly one per account (partial unique index). Editable. | One starting point per account. |
| Adjustment | Created only by reconciliation. Deletable but not editable; re-reconcile instead. | An adjustment is only meaningful alongside its checkpoint. |
| ReconciliationCheckpoint | Stores `(account, as_of, stated_balance, adjustment_id)`. Its status is derived: does the balance *as of that date* still equal the stated balance? | **Detects backdated edits that break verified history.** This is V1's history-integrity mechanism. |
| Occurrence | When the linked transaction is deleted, it returns to pending. | The expectation reappears. |
| BudgetLimit | Past months are read-only. | Plans are history. |
| EarmarkEntry | Append-only; corrections are new entries. | Gives goal trajectories for free. |
| Category / Account | Archived when in use; deleted only when unused. | No orphaned history. |

- **Out of V1:** a transaction revision log (V1.1: store the previous row on each update) and hard purge.
- **Tenancy:**
  - `owner_id` is on every table, and all access goes through repositories that require an owner context.
  - Cross-owner reference checks are enforced in the app and tested.
  - Later, Postgres composite FKs or row-level security can enforce this at the database level.

## 13. Source-of-truth boundaries

- **Facts** (written only by user actions): accounts, categories, transactions, checkpoints, budget limits, commitments, occurrence outcomes, goals, earmark entries, signal dismissals.
- **Derived** (pure functions of the facts plus today's date): every number the user reads.
- **Future boundaries:**
  - **Drafts** (from AI or n8n) live in their own table and never appear in `account_entries` until the user confirms them.
  - **Caches and materialisations** must always be rebuildable from the facts, with an invariant test: materialised = recomputed.

## 14. Domain sophistication vs UI simplicity (binding principle)

**The financial model is rigorous; the product is simple.** Internal concepts (entry views, backing order, occurrence states, checkpoints) stay out of the UI unless the user needs them in order to act. Any screen that exposes a domain term must say which question it helps answer.

| Domain concept | What the user sees |
|---|---|
| Signed amounts, 6 types | Positive amounts, and "Expense / Income / Transfer" in Quick Add. Refund is an action on an expense. Adjustments appear only through "Reconcile". |
| `account_entries` view | Nothing; balances just add up. |
| Earmark entries, backing order | "Reserve ৳X from Savings for Laptop". A shortfall line appears **only when there is one**. |
| Occurrence states, matching | An "Upcoming" list with a **Pay** button; "Looks like this pays *Internet (Sep 25)* — link?" |
| Budget projection maths | "On pace to go ৳455 over" or "On track". |
| Checkpoints | "Balance verified Sep 20 ✓" / "Changed since verified". |
| Available bridge | One number; tap it to see the 4-step breakdown. |

## 15. Evolution paths (not V1)

- Materialised balances and monthly aggregates maintained on ledger writes, invariant-tested against recomputation.
- An event log of ledger changes that drives signal recomputation and notifications.
- Background jobs for occurrence materialisation and nightly signals.
- PostgreSQL: the same CHECKs and views, with a real `DATE` type and row-level security.
- `counter_amount` for multi-currency transfers.
- `account_entries` → a real postings table, if investments are ever added.
- `direction` on commitments for expected income (V1.1 runway).

## 16. Mandatory acceptance scenario

The end-to-end scenario, a hand-verifiable August–September ledger with mutations M1–M3, is specified in **[acceptance-scenarios.md](acceptance-scenarios.md)**. It is binding:

- The implementation must reproduce **every number exactly**.
- It must never be replaced by generic CRUD tests.
- A failing number blocks a release.

Headline results on 2026-09-22:

| Result | Value |
|---|---|
| Net worth | **230,163** |
| Spending, Sep 1–22 | **66,487** |
| Savings rate | **30.0%** |
| Laptop goal covered | **110,000 (73%)**, short 10,000 |
| Available | **87,963** |
| Month over month | **+26,450**, all of the increase accounted for by Health |

## 17. Approved decisions (frozen)

1. Model S (single row + `account_entries` view) instead of postings.
2. Signed amounts relative to `account_id`; 6 types; per-row CHECKs; no future-dated transactions.
3. Lazily materialised occurrences keyed `(commitment_id, due_on)`; user-confirmed matching.
4. Effective-dated, calendar-month budget limits; commitment-aware projection.
5. Append-only earmark entries; oldest-first backing; completing a goal releases its earmarks.
6. Soft-deleted transactions; reconciliation checkpoints as the history-integrity mechanism; no revision log in V1.
7. Owner scoping on every table; a per-account `included_in_available` flag with type-based defaults.
8. The goal/commitment double reservation is a deliberate V1 trade-off (§10).
9. §14 (UI simplicity) and the acceptance scenario (§16) are binding.

## 18. Change log

| Date | Change | Reason |
|---|---|---|
| 2026-09-22 | **Acceptance scenario: August prologue added.** Opening balances are dated Aug 1 with August activity. The Laptop earmark on Savings is dated Aug 10. Streaming starts Oct 3. All September numbers are unchanged. | The original scenario broke two frozen rules: an August earmark on an account opened Sep 1, and August comparison data dated before the opening balances. It also had Streaming overdue on Sep 3, which would have changed Available. Details in [acceptance-scenarios.md](acceptance-scenarios.md). |
| 2026-09-22 | **Clarification:** `remaining_committed` includes pending occurrences overdue earlier in the current month. | Found during documentation verification. Without it, deleting the rent payment (M1) would make the Housing projection drop to 0 while the rent is still owed. |
| 2026-09-22 | **Clarification:** the materiality base is the category's previous-window amount. | "10%" was ambiguous. |
| 2026-09-22 | **Clarification:** the "unexplained cash difference" signal belongs to rule family 7 (reconciliation). | The scenario used this signal, but no rule family listed it. |
