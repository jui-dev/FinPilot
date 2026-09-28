# FinPilot — Domain Model

**Status:** Frozen — approved 2026-09-22; product-architecture decisions of 2026-09-27 applied (§18): Budgets superseded by the optional Monthly Plan (§7), Goals reframed as Protected money (§9), the Available liability invariant (§5, §10), and the signal families re-staged (§11). Open decisions are listed in [roadmap.md §8](roadmap.md).
**Change policy:** Revisit only when implementation exposes a concrete technical problem, or a recorded product decision reopens a section. Record every change in §18 with its reason.
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
| ~~**BudgetLimit**~~ | *(Superseded 2026-09-27 by the optional Monthly Plan, Stage 13; §7.)* A planned monthly spending intention per category | stored (Stage 13; representation open) |
| **Commitment** | The rule for an expected recurring outflow | stored |
| **CommitmentOccurrence** | One expected instance of a commitment, and its outcome | stored (materialised lazily, §8) |
| **Protected-money item** (formerly **Goal**) | Money deliberately set aside (shown to the user as **Set aside**): a name and an **optional** target amount. Its code name is chosen in Stage 7. | stored |
| **EarmarkEntry** | A change to how much of an account is reserved for a protected-money item (a reservation entry) | stored (append-only) |
| **SignalDismissal** | The user has dismissed a signal for its period | stored |
| Balances, net worth, Available, reservation backing, analytics, signals, and (Stage 13) Monthly Plan progress | — | **derived; never stored in V1** |

- **Tenancy:** every stored table carries `owner_id`, even though V1 has a single owner (§12).
- **IDs:** UUIDv7 (time-sortable, generated by the app).
  - **Why:** portable across SQLite and Postgres, safe when databases are copied (future demo sandboxes), and safe for idempotent ingestion later.
  - **Alternative:** integer autoincrement. Simpler, but it leaks row counts and collides when databases are merged.
  - Generated by the `uuid` package behind an injected `IdGenerator` (see [tech-stack.md](tech-stack.md)).
  - **IDs are opaque.** UUIDv7's time-ordering helps index locality, but it is **never** a business ordering. Where FinPilot needs an order of financial records (for example transactions on the same `occurred_on`), that order is modelled explicitly, never inferred by comparing IDs.
- **Three distinct concepts, never mixed:**
  - **UUID = identity.** Opaque; compared only for equality.
  - **`sequence` = deterministic recording order.** A per-owner integer assigned when a transaction is recorded, taken from `owners.next_transaction_sequence` inside the write transaction. It's immutable (editing a transaction, including its date, never changes it), and a rolled-back write consumes no number.
  - **(`occurred_on`, `sequence`) = business and list order.** A total, deterministic order: by date, then by the order of recording. Rows of one group get consecutive sequences.

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
| `opening_balance` | ≠ 0 | — | — | nothing; **at most one active per account** (none when an account opens at zero) |
| `adjustment` | ≠ 0 | — | — | nothing; created only by reconciliation |

### 4.2 Rules
- **"Card payment" is not a type.** It's a transfer whose counter account is a liability, and the UI labels it that way. The data can't double-count it, because transfers have no category.
- **`occurred_on` is a calendar date** (no time, no timezone). `created_at` and `updated_at` are UTC timestamps. "Today" and month boundaries are computed in the owner's timezone. Months are half-open ranges `[1st, next 1st)`.
- **No future-dated transactions.** The ledger records what happened; expected future money lives in commitments.
- **No transaction on an account may be dated before that account's `opened_on`** (§5). This applies to both the account and, for transfers, the counter account.
- **`group_id`** links rows that are one real-world event (cash-out + fee; splits in V1.1). The UI shows a group as one item. **A group is created atomically and deleted/restored as a whole; individual rows may be edited.**
- **Refunds:** `refund_of_id` is optional. When supplied, it must point to an active expense of the same owner, and **the refund must use the same category as that expense**, so category analytics can't be distorted. A standalone refund (no `refund_of_id`) chooses its expense category normally. An expense that has active refunds can't be deleted. Refund amounts are not capped.
- **Only three types ever count as income or spending:** `income`, `expense`, `refund`. Transfers, opening balances and adjustments never affect analytics.
- **Interview defense:** *"Every row answers one question: what did this do to this account? The type decides how analytics treat it."*

## 5. Accounts and balance semantics

- **Types:** `cash`, `bank`, `mobile_wallet` and `savings` are assets; `credit_card` is a liability. The asset/liability class is **derived from the type** by a pure mapping, not stored.
- **`opened_on`:** every account has a start date. No transaction may be dated before it. A non-zero starting amount is recorded as an `opening_balance` transaction dated `opened_on`; an account that opens at zero has no opening-balance transaction.
- **Sign convention:** every balance is signed from the user's point of view. A liability balance is ≤ 0 when money is owed, so **net worth = Σ all balances**, with no special cases.
- **Balance** = Σ `account_entries` for the account.
  - It is never stored in V1, and is indexed on (account, date).
  - For a personal ledger of thousands of rows, computing on read is effectively instant.
  - Materialised balances are an evolution path (§15).
- **`included_in_available`:** a stored boolean, defaulted from the type at creation: cash, bank, mobile wallet and credit card **on**; savings **off**. Eligibility is never permanently inferred from the type.
  - **Asset accounts:** the person decides whether the account belongs to the Available pool (Cash and bKash in; a long-term savings account possibly out). V1 may not expose a toggle, but the model supports per-account configuration.
  - **Liability invariant (2026-09-27, binding):** *every liability balance counts in Available, regardless of any eligibility preference.* A liability account may not be excluded from Available: `included_in_available = false` is invalid for a liability, and the Available formula (§10) takes liability balances without consulting the flag. Otherwise an account preference could hide debt and overstate Available, which is the unsafe direction.
  - **Enforcement:** the safety belongs to the domain and the write boundary, not the UI. **Known gap:** the current account-setup service accepts `included_in_available = false` for a credit card when a caller passes it (no UI does). Stage 8 (Available) closes it: the domain rejects the value for liabilities, and the formula-level rule above means Available is safe even before a database CHECK can follow with a later schema change.
  - **Naming decision.** The invariant is: *the account's signed balance, and any reservations against it, fall within Available's scope.*
    - `counts_toward_available` suggests a positive contribution, which is wrong for credit cards.
    - `affects_available` is too broad: an excluded savings account still affects Available when it pays a commitment.
    - `included_in_available` describes membership in the sum, and the sign comes from the balance. **Chosen.** (Since 2026-09-27 the preference applies to assets only; liabilities are always members.)
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

## 7. Monthly Plan (supersedes the Budget model)

**Decision (2026-09-27):** the frozen Budget concept is **superseded** by an optional **Monthly Plan**, built in Stage 13, after the V1 candidate. FinPilot does not keep Budgets and Monthly Plan side by side.

### 7.1 Direction and invariants (not a Stage 13 specification)

- **Question:** *What do I intend to spend or set aside this month, and how did that go?* Before the month it holds an intention, during the month its progress, and afterwards a reflection. One plan serves all three.
- **Optional, binding:** if no Monthly Plan exists, the ledger, Accounts, Activity, reconciliation, Cash flow, Commitments, Protected money, Available, Signals, the Overview and Trends all work unchanged. Only plan-specific output disappears.
- **Never an input to Available** (§10), and never rewrites the ledger.
- **Intent vs reality, not a second Cash flow.** Cash flow owns *what actually happened*; the plan owns *how reality compared with what I intended*. It shows variance for planned lines only and does not repeat Cash flow's composition or What changed.
- **Eventual responsibilities:** category spending intentions; optional intended contributions to protected-money items (actuals come from earmark entries); commitments shown **read-only** from their occurrences, never re-entered; actuals derived from the ledger; fixed vs variable from commitment matches; the projection; variance and end-of-month reflection.
- **Not built:** envelope or zero-based budgeting, rollover, custom periods, or any link that moves money.
- **Open (resolve before Stage 13):** whether intentions are effective-dated, carrying forward as in §7.2, or specific to each month. Either representation reproduces A-40 and M1-4 exactly ([roadmap.md §8](roadmap.md)).

### 7.2 The superseded budget model (history, and the intent Monthly Plan carries forward)

The frozen model is kept below as the record. Its **commitment-aware projection, its statuses and the Housing and Dining examples are the intent Monthly Plan keeps**, and A-40 and M1-4 remain its acceptance targets ([acceptance-scenarios.md §5.4](acceptance-scenarios.md)). Its foundation is already required in V1: Stage 6 records every occurrence↔transaction match, which is exactly the data the fixed/variable split needs.

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
- **Interview defense:** *"Linear pacing is wrong for lumpy spending. I split fixed from variable using commitment matches, not category labels."* It moves to Monthly Plan unchanged.

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
- **What Commitments owns (2026-09-27):** the only place a *scheduled financial obligation* exists. *What money am I already obligated to pay, and when?* A commitment or occurrence is an obligation; a transaction is something that happened. Recurrence is scheduling infrastructure, not a product feature, and there is no separate Subscriptions feature. No transaction is ever created without an explicit user action (Pay).
- **Stage 6 requirements from later decisions:**
  - Record every occurrence↔transaction match. Monthly Plan's fixed/variable split (§7) depends on it.
  - Keep `expected_account` **optional and descriptive** ("usually paid from"). Stage 6 must not give it funding semantics, because how a commitment expected from an account excluded from Available affects Available is **open decision O-1** (§10).
- **Interview defense:** *"Lazy, idempotent materialisation keyed by (rule, date). The ledger holds what happened, occurrences hold what was expected, and a match is the explicit bridge between them."*

## 9. Protected money and earmarks (formerly the goal model)

**Decision (2026-09-27):** the product concept **Goals** is replaced by **Protected money**, one concept for both goal-like and reserve-like set-asides. FinPilot does not build separate Goals and Reserves features. *Question: what money have I deliberately set aside, and is it still really there?*

**User-facing term (2026-09-28): "Set aside."** The product shows one concept, *Set aside*: a goal-like use is a set-aside item with a target, a reserve-like use is one without. "Protected money" remains the domain concept in these documents, and `EarmarkEntry` and the earmark/backing semantics keep their names; domain terms are not renamed to match UI copy unless implementation gives a concrete reason (§14).

- **Two concepts, kept apart internally:**
  - the **protected-money item**, the container and intention: a name, an **optional** target amount, and a lifecycle status. Its code name is chosen in Stage 7. *(A target date is deferred beyond V1; see "Deferred" below.)*
  - **earmark entries**, the actual reservations over real account money. `EarmarkEntry` keeps its name: a product-language change does not justify a technical rename.

  A target is intent; an earmark is an allocation of money that exists. **Only backed earmarks ever enter Available; a target never does.**
- **With and without a target:** *Laptop, target ৳1,20,000, protected ৳45,000* behaves like a goal. *Emergency reserve, no target, protected ৳80,000* behaves like a reserve. Both are the same concept.
- **EarmarkEntry:** `(item, account, ±amount, created_at)`, append-only. An earmark's current amount is the sum of its entries.
- **Earmarks never touch the ledger or any balance.** An earmark is a planning allocation over existing money, not money.
- **Write-time invariants**, checked inside one DB transaction:
  1. Earmarks are allowed on asset accounts only.
  2. An item's earmark on an account never goes below zero.
  3. On an increase, Σ earmarks of **active** items on that account ≤ the account's current balance. This is what prevents the same money being set aside twice.
- **The ledger always wins.** Spending, transfers and corrections are never blocked by earmarks; the UI only warns at entry (for example "this leaves Laptop under-covered by ৳2,000").
- **Backing (derived at read time), unchanged:**
  - Per account, earmarks are ordered **oldest first**.
  - `backed_i = clamp(balance − Σ earlier earmarks, 0, earmark_i)`
  - `shortfall_i = earmark_i − backed_i`
  - Every item shows **Reserved / Covered**, and **Short** when there is a shortfall, so a shortfall is never reported as funded. What is nominally reserved and what real money backs are not necessarily equal.
  - Oldest-first is simple and explainable. Proportional splitting was rejected because it produces odd fractions. User-set priority is V1.1 if ever needed.
- **Progress** = Σ backed / target, **only when a target exists**. An item without a target has no percentage.
- **Still needed** = max(target − Σ backed, 0), **only when a target exists**. It is computed from what is covered, not from what is nominally reserved, so a shortfall never makes an item look closer to its target than real money allows (in the acceptance scenario, Laptop: 150,000 − 110,000 = 40,000, not 150,000 − 120,000).
- **Deferred beyond V1 (2026-09-28):** a target date, on-track / behind-schedule status, and a required monthly contribution toward a target. Planned contributions belong to the optional Monthly Plan (§7), which would otherwise duplicate them. *(History: the frozen model compared the required amount per month, (target − backed) / months left, with the net earmark entries over the last 3 months.)*
- **Excluded accounts:** *account exclusion* means "this whole asset account is outside my spendable-money scope"; *protection* means "this part of otherwise spendable money is deliberately set aside". An earmark on an account excluded from Available still tracks progress and backing, but causes **no Available deduction**, because that money is already outside the pool (A-61).

### 9.1 Lifecycle operations (semantics; the representation is decided in Stage 7)

These define what each operation means so that Stage 7 does not paint FinPilot into a corner. **The storage representation of operation kinds (whether entries carry a kind, and which values) is deliberately not frozen here.** In particular, "reduce" and "release" are not assumed to be separate persisted values unless Stage 7 shows the distinction is needed.

| Operation | Meaning | Financial transaction? | Effect on Available (included account) |
|---|---|---|---|
| **Reserve** | Set aside more of an asset account's money for an item: a positive entry, subject to invariant 3. | none | falls by the newly backed amount |
| **Target reached** | **Derived** (Σ backed ≥ target), never an action. It releases nothing: the item stays active and keeps protecting its money. *Target reached ≠ purpose completed.* | — | none |
| **Release** | Deliberately remove protection, fully or **partly**: negative entries, append-only. The money stays where it is, now unprotected. Bringing a reservation down to match a fallen balance (the shortfall action) is a partial release. | **none** | rises by the backed amount released |
| **Archive** | Allowed **only when nothing remains reserved** on any account, mirroring accounts, which archive only at zero. *(Supersedes the frozen rule that completing or archiving a goal released its earmarks through its status.)* | none | none |
| **Use** *(future; not required in the minimum Stage 7 slice)* | Spend protected money for its purpose: record the real event **through the normal ledger boundary**, the same transaction services as the UI, and release the corresponding reservation in the same write. Protected money never contains a second transaction system. The entry model must allow a release to reference the ledger transaction that caused it. | the normal expense | neutral when the expense equals the release (see below) |
| **Move** *(future)* | Move protection between two asset accounts of the same item, atomically: a negative entry on the source, a positive one on the destination (append-only; invariant 3 applies to the destination). It moves protection, not money; the money moves by an ordinary transfer. It exists so a transfer never leaves a reservation attached to the wrong account. | none | depends on the accounts' inclusion |

- **Why Use is Available-neutral:** a ৳1,20,000 laptop bought from Bank lowers the included balance by 1,20,000 while the Bank reservation of 1,20,000 is released. Bought on the Visa card, the debt grows by 1,20,000 while the Bank reservation is released. Either way Available does not move: the money was already not free.
- **Why Move is needed:** without it, moving the Laptop money Bank → Savings (excluded) lowers Available through the transfer, while the Bank reservation keeps being deducted until it turns into a shortfall.
- **Open (resolve before Use is implemented):** how much is released when the expense differs from the reservation, and what happens to the release when the Use transaction is later edited or deleted ([roadmap.md §8](roadmap.md)).

- **Deliberately not built:** separate Goals and Reserves products; category envelopes; zero-based "assign every taka"; any link between plans and money; automatic matching between protected money and commitments (§10).
- **Interview defense:** *"Earmarks are plans over real money, never money. A target is intent and a reservation is an allocation; only backed reservations reduce Available. Invariants apply at write time; reality is reconciled at read time as a visible shortfall. Reaching a target releases nothing; releasing is a deliberate act."*

## 10. Available

*Question: how much can I use now without touching money that is already spoken for?* Available is a central decision metric. It is **not** an account balance, net worth, cash flow, a budget or a stored balance: it owns no ledger truth and is derived on every read.

```
Available = Σ balance(asset accounts with included_in_available)
          + Σ balance(liability accounts)                                    ← always, regardless of the flag (§5); ≤ 0 when owed, so debt is subtracted
          − Σ expected_amount(pending occurrences with due_on ≤ today + 30)  ← includes overdue; see O-1 below
          − Σ backed earmarks on included asset accounts                     ← reserves on excluded accounts are not subtracted
```

*(2026-09-27: the first line previously read "Σ balance(accounts with included_in_available)", which let an excluded liability drop out. The acceptance fixture includes its only liability, so every acceptance value is unchanged.)*

- **Inputs:** only balances, Commitments and Protected money. **Excluded, by decision:** expected income (the V1.1 runway extension adds it as an explicit term), and **Monthly Plan intentions**: discretionary plans never reduce Available, so Available works identically whether or not a plan exists.
- **Presented as a bridge:** included asset balances → − credit owed → − upcoming commitments → − protected money → **= Available**.
- **Horizon: rolling 30 days**, not "until month end". With a month-end horizon, rent due on the 1st would drop out when viewed on the 29th, and Available would jump just before a big bill.
- **Matching prevents double subtraction.** Once an occurrence is paid, it leaves the commitment term, and the ledger term already reflects the payment.
- **May be negative:** shown as "over-committed by ৳X", never clamped to zero, not even for presentation.
- **Excludes future income by design** and is labelled "before new income". The V1.1 runway is the same formula plus expected inflows before the next income date.
- **Open decision O-1: a pending commitment whose `expected_account` is an asset account excluded from Available** (for example annual insurance expected from Savings, which is excluded). **Under reconsideration; no new rule is chosen here.**
  - **What the frozen model currently says:** the commitment term above subtracts *every* pending occurrence due within the horizon, whatever its expected account, so the insurance reduces Available. §5's naming note assumes the same ("an excluded savings account still affects Available when it pays a commitment").
  - **The competing concerns:** the money that will pay it may already be outside the pool, so subtracting it again understates Available. But ignoring the commitment is unsafe if that account cannot actually cover it.
  - **Must be resolved before Stage 8 freezes Available's semantics.** Until then Stage 6 keeps `expected_account` optional and descriptive (§8), so it decides nothing early. Tracked in [roadmap.md §8](roadmap.md).
- **Deliberate V1 trade-off: sinking funds are reserved twice.**
  - **Why it happens:** Commitments and Protected money are independent. An annual insurance commitment of ৳60,000 and an "Insurance" protected-money item of ৳60,000 describe the same economic purpose. In the 30 days before the due date, Available subtracts both. Outside the horizon, only the reservation counts. Protected money makes this more likely than goals did, because target-less reserves are exactly how people save for a known bill.
  - **Why V1 keeps it:** it errs on the conservative side. Automatic matching would add real semantics: which item covers which occurrence, partial cover, what happens on Pay (release? Use?), and cover moving between accounts. That is an entity relationship, UI and matching rules.
  - **V1 response:** this documentation, plus help text suggesting "use one or the other for the same payment". It is **not a V1 blocker**.
  - **Architecture requirement:** nothing in Stage 6 or 7 may prevent a future **explicit, user-made** relationship between a protected-money item and a commitment (§15). No automatic matching is built.
  - **Revisit trigger:** real usage shows the double reservation happening often.

## 11. Signal engine

- **Shape:** `rule(context) → Signal[]`. Rules are **pure functions** over one derived **context** built per request. The context includes:
  - the as-of date and month windows
  - category spending for the current month-to-date and the like-for-like previous window
  - 3-month category averages (from Stage 12, Trends, for family 3)
  - occurrences, protected-money backing, the Available bridge, reconciliation checkpoints, and Monthly Plan statuses only when a plan exists (Stage 13)
- **Signal fields:**
  - `key`: rule + subject + period; stable, used for dismissal and dedup
  - `severity`: critical / warning / info / positive
  - `score`: used for ranking
  - a message template with integer parameters
  - **evidence**: a transaction-list filter, so every signal has a drill-down
- **Computed on read.** Only dismissals are stored, keyed per period, so dismissing September's dining warning doesn't hide October's.
- **Signals select and rank; the owning feature explains** (2026-09-27). *Question: of everything true right now, what deserves my attention?* A signal is one ranked sentence whose evidence opens the feature that owns the explanation: a verification issue opens Accounts, a material spending change opens Cash flow's What changed, a commitment deadline opens Commitments, an Available concern opens Available's bridge. Signals never become a second analytics system: no charts, no inbox, no read/unread state, no separate Insights destination, no notifications, and no generic AI-written observations.
- **Rule families** (the numbering is kept; the stage says when each is built):

  | # | Family | Stage |
  |---|---|---|
  | 1 | Monthly Plan at risk / committed over / exceeded (formerly "budget") | 13, only when a plan exists |
  | 2 | Month-over-month change attribution: **trigger under reconsideration** (below) | 9 |
  | 3 | Category spike vs the 3-month average | 12 (needs Trends' baseline) |
  | 4 | Commitments due within 7 days / overdue | 9 |
  | 5 | Protected money under-covered (formerly "goal"). *Behind schedule is deferred with target dates (§9).* | 9 |
  | 6 | Available low / over-committed | deferred beyond V1 |
  | 7 | **Reconciliation:** a broken checkpoint, a stale or missing verification, and a recent adjustment (an informational "unexplained difference"; clarification, §18) | 9 |
  | 8 | Savings-rate change (positive) | deferred beyond V1 |

- **Family 2 must stay selective (decision required before Stage 9).** Cash flow's What changed answers *why did this period change?* The signal must answer *is this change important enough to bring to my attention unasked?* As first defined, family 2 used the same materiality rule that What changed uses to list its drivers, so it would fire for every driver Cash flow already shows. That is a duplicate. Its trigger must be **stricter or otherwise meaningfully selective**; the rule is decided in Stage 9, not here. A-72 and its expected values stand: spending up 26,450 on 40,037 (+66%), with all of the increase from Health (+30,000), passes any sensibly stricter bar.
- **Month-over-month rules:**
  - **Like for like:** the current month-to-date vs the same days of the previous month (for example Sep 1–22 vs Aug 1–22). The window is clamped to the previous month's length.
  - **Materiality:** a category change is material when |Δ| ≥ max(৳500, 10% of that category's previous-window amount) (clarification, §18). This keeps changes like ৳50 → ৳200 quiet.
  - **Share of change** is computed over **gross increases**, with offsets listed separately. The wording is "accounted for", never "caused".
- **Savings rate** = (income − spending) / income. It excludes transfers, opening balances and adjustments. It's undefined when income is 0.

## 12. Editing, deletion and history

| Object | Rule | Why |
|---|---|---|
| Transaction | Fully editable, **including its type** (a one-row update in Model S). **Soft delete** (`deleted_at`) with undo. All readers go through views that filter deleted rows. | This is a personal tool, not a bank. Mistakes must be cheap to fix, and the views keep the deleted-row filter in one place. |
| Opening balance | At most one **active** per account (partial unique index over non-deleted rows), dated `opened_on`. Absent when the account opens at zero. Editable. | `accounts.opened_on` is every account's start date; the opening-balance row only records a non-zero starting amount. |
| Adjustment | Created only by reconciliation. Deletable but not editable; re-reconcile instead. | An adjustment is only meaningful alongside its checkpoint. |
| ReconciliationCheckpoint | Stores `(account, as_of, stated_balance, adjustment_id)`. Its status is derived: does the balance *as of that date* still equal the stated balance? | **Detects backdated edits that break verified history.** This is V1's history-integrity mechanism. |
| Occurrence | When the linked transaction is deleted, it returns to pending. | The expectation reappears. |
| Monthly Plan intentions (Stage 13; formerly BudgetLimit) | Past months are read-only. | Plans are history. |
| EarmarkEntry | Append-only; corrections, releases and moves are new entries. | Gives protected-money trajectories for free. |
| Category / Account | Archived when in use; deleted only when unused. | No orphaned history. |

- **Out of V1:** a transaction revision log (V1.1: store the previous row on each update) and hard purge.
- **Tenancy:**
  - `owner_id` is on every table, and all access goes through repositories that require an owner context.
  - **Cross-owner references are impossible at the database level** (from F2): every reference is a composite foreign key `(owner_id, x) → parent(owner_id, id)`. SQLite requires a foreign key's parent columns to be the PRIMARY KEY or to carry a UNIQUE index on exactly those columns (otherwise writes fail with "foreign key mismatch"), so each referenced table has `UNIQUE (owner_id, id)`. That index also serves owner-scoped lookups, so there is no separate `owner_id` index. The same constraints port to Postgres unchanged.
  - Later, row-level security can add per-request enforcement on top.

## 13. Source-of-truth boundaries

- **Facts** (written only by user actions): accounts, categories, transactions, checkpoints, commitments, occurrence outcomes, protected-money items, earmark entries, signal dismissals, and (Stage 13) Monthly Plan intentions.
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
| Protected money, earmark entries, backing order | **Set aside**, the one user-facing term, including Available's bridge: "Set aside ৳X from Savings for Laptop". A shortfall line appears **only when there is one**; a percentage and "still needed" only when there is a target. "Protected money" is not shown as a second name. (Exact copy is decided in Stage 7.) |
| Occurrence states, matching | An "Upcoming" list with a **Pay** button; "Looks like this pays *Internet (Sep 25)* — link?" (match suggestions are deferred beyond V1) |
| Monthly Plan projection maths (Stage 13) | "On pace to go ৳455 over" or "On track". |
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
- An explicit, user-made relationship between a protected-money item and a commitment (sinking funds, §10), if the double reservation proves common.

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
| Laptop (protected money, target 150,000) covered | **110,000 (73%)**, short 10,000 |
| Available | **87,963** |
| Month over month | **+26,450**, all of the increase accounted for by Health |

## 17. Approved decisions (frozen)

1. Model S (single row + `account_entries` view) instead of postings.
2. Signed amounts relative to `account_id`; 6 types; per-row CHECKs; no future-dated transactions.
3. Lazily materialised occurrences keyed `(commitment_id, due_on)`; user-confirmed matching.
4. ~~Effective-dated, calendar-month budget limits; commitment-aware projection.~~ *Superseded 2026-09-27:* Budgets are replaced by the optional Monthly Plan (Stage 13), which keeps the commitment-aware projection; effective-dated vs month-specific intentions is open until Stage 13 (§7).
5. Append-only earmark entries; oldest-first backing. ~~Completing a goal releases its earmarks.~~ *Amended 2026-09-27:* Protected money with an optional target; target reached is derived and releases nothing; Release is deliberate and may be partial; archiving requires nothing reserved (§9). *Amended 2026-09-28:* shown to the user as "Set aside"; the target date and on-track are deferred beyond V1.
6. Soft-deleted transactions; reconciliation checkpoints as the history-integrity mechanism; no revision log in V1.
7. Owner scoping on every table; a per-account `included_in_available` flag with type-based defaults. *Amended 2026-09-27:* the flag is a preference for asset accounts only; every liability balance always counts in Available (§5).
8. The protected-money/commitment double reservation is a deliberate V1 trade-off (§10).
9. §14 (UI simplicity) and the acceptance scenario (§16) are binding.
10. *(2026-09-27)* Available excludes expected income and Monthly Plan intentions, is never stored, and is never clamped (§10).
11. *(2026-09-27)* Signals select and rank; the feature that owns a signal's evidence explains it (§11).

## 18. Change log

| Date | Change | Reason |
|---|---|---|
| 2026-09-22 | **Acceptance scenario: August prologue added.** Opening balances are dated Aug 1 with August activity. The Laptop earmark on Savings is dated Aug 10. Streaming starts Oct 3. All September numbers are unchanged. | The original scenario broke two frozen rules: an August earmark on an account opened Sep 1, and August comparison data dated before the opening balances. It also had Streaming overdue on Sep 3, which would have changed Available. Details in [acceptance-scenarios.md](acceptance-scenarios.md). |
| 2026-09-22 | **Clarification:** `remaining_committed` includes pending occurrences overdue earlier in the current month. | Found during documentation verification. Without it, deleting the rent payment (M1) would make the Housing projection drop to 0 while the rent is still owed. |
| 2026-09-22 | **Clarification:** the materiality base is the category's previous-window amount. | "10%" was ambiguous. |
| 2026-09-22 | **Clarification:** the "unexplained cash difference" signal belongs to rule family 7 (reconciliation). | The scenario used this signal, but no rule family listed it. |
| 2026-09-22 | **Clarification:** UUIDv7 IDs are never a business ordering; explicit ordering is modelled in F2 (§2). | Approved alongside the move to the `uuid` package. |
| 2026-09-22 | **D1 (F2): owner consistency via composite foreign keys**, with `UNIQUE (owner_id, id)` parent keys (§12). | Approved F2 plan. Stronger than the original "app-enforced" rule, and just as portable. |
| 2026-09-22 | **D2 (F2): `accounts.opened_on`**; an opening-balance transaction exists only for a non-zero start and is dated `opened_on`. The index guarantees **at most one active** opening balance per account (previously worded "exactly one"). | Approved F2 plan and terminology correction: zero-balance accounts have no opening-balance row. |
| 2026-09-22 | **D3 (F2): identity vs recording order vs business order** (§2): UUID / `sequence` / (`occurred_on`, `sequence`). | Approved F2 plan; makes the "no ordering by UUID" clarification concrete. |
| 2026-09-22 | **D6/D7 (F2): refund and group rules** (§4.2). A linked refund must use its expense's category; groups are atomic for create/delete/restore. | Approved F2 plan, including the same-category addition. |
| 2026-09-22 | **Interpretation:** "half-up" display rounding is implemented as half **away from zero**, so −৳1.50 displays as −৳2, matching ৳1.50 → ৳2. | Found in F1: plain half-up would round −1.50 to −1, so a negative amount and its positive counterpart would display differently. |
| 2026-09-24 | **Clarification (5b):** a complete past month is compared with the **whole previous calendar month**. The like-for-like window (§11) applies only to the month to date. | §11 defined only the month-to-date comparison; two complete months are already like for like. |
| 2026-09-24 | **Clarification (5b):** when the comparison month predates every account (the first selectable month), there is **no comparison**, rather than a comparison with zero. A comparison month only partly covered by account history is still compared (a known limitation). | Comparing with an empty month would describe everything in the first month as an increase. |
| 2026-09-24 | **Clarification (5b):** materiality uses the **magnitude** of the previous amount: \|Δ\| ≥ max(৳500, 10% × \|previous\|). | A refund-heavy category can have a negative previous amount, which would otherwise turn the 10% term negative. No acceptance value changes. |
| 2026-09-27 | **Product-architecture decisions** (recorded in full in [roadmap.md §8](roadmap.md)). **§7:** Budgets superseded by the optional Monthly Plan (Stage 13); the old budget model is kept as §7.2, and its projection is the intent Monthly Plan carries forward. **§9:** Goals become Protected money; target and target date optional; target reached derived and releasing nothing; Release (partial allowed), Archive-at-zero, and the future Use and Move operations defined semantically, with their representation left to Stage 7; the distinction between account exclusion and protection made explicit; `EarmarkEntry` keeps its name. **§5/§10:** liabilities always count in Available regardless of `included_in_available`; the known setup-path gap is left for Stage 8. **§10:** Monthly Plan excluded from Available; open decision O-1 (commitments expected from an excluded account) recorded without choosing a rule; sinking-fund double reservation documented and kept for V1. **§11:** signals select and rank; the family table is staged, and family 2's trigger is under reconsideration. **Every acceptance value is unchanged.** | Product-architecture review after the visual-system boundary: every feature must own one distinct question, planning must stay optional, and Available must not be overstated by an account preference. |
| 2026-09-28 | **Stage 7 product decision (before implementation).** **§9:** "Set aside" is the single user-facing term for protected money (goal-like = with a target, reserve-like = without); "Protected money", `EarmarkEntry` and the backing semantics keep their names. The V1 item has an optional target amount only; **still needed** = max(target − covered, 0) is defined; a target date, on-track / behind-schedule and a required monthly contribution are **deferred beyond V1**, with planned contributions left to Monthly Plan (§7). **§2, §14, §17:** aligned. **§11:** family 5 is under-covered only in V1. O-1, O-3 and P-1 stay open. **Every acceptance value is unchanged** (the fixture's Laptop already has no target date, and A-50's 73% progress is target-based). | Showing Goals and Protected money separately would duplicate one intention; target dates and on-track would duplicate Monthly Plan's planned contributions. |
