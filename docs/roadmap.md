# FinPilot — Implementation Roadmap (Portfolio V1 and after)

**Status:** Approved 2026-09-22; stages 6–13 re-sequenced by the product-architecture decisions of 2026-09-27 (§8)
**Change policy:** Stages may be split into smaller commits freely. Reordering stages or changing their scope requires agreement first.
**Related:** [product-baseline.md](product-baseline.md) · [domain-model.md](domain-model.md) · [tech-stack.md](tech-stack.md) · [acceptance-scenarios.md](acceptance-scenarios.md)

---

## 1. Approved decisions that shape this roadmap

1. **The design gate runs during F0–F2.** A dedicated UI/UX architecture and visual-design discussion happens while the foundation stages are built. The design direction **must be approved before Stage 3 begins**. No generic dashboard design is improvised during implementation.
2. **Available is introduced once, at Stage 8** (Stage 9 before the 2026-09-27 re-sequencing). It is FinPilot's headline concept, so it arrives with its final V1 semantics when all its inputs exist: eligible asset balances and every liability, commitments, and protected-money earmarks. No temporarily incomplete version ships earlier.
3. **A checkpoint review after Milestone B** covers the product feel and the charts before more of them are built.
4. **No stage starts without explicit approval**, starting with F0.

## 2. Principles

- **The acceptance suite exists before the ledger does.**
  - In F1, every assertion in [acceptance-scenarios.md](acceptance-scenarios.md) is written as `it.todo`.
  - Each later stage turns specific assertions green (§5). The green count is the project's progress indicator.
  - The financial model is validated continuously, not at the end.
- **A real database is used from the first ledger stage onward.** Acceptance and property tests run against migrated in-memory SQLite, with no mocks.
- **The clock is injected.** The acceptance suite runs with today = 2026-09-22 (Asia/Dhaka).
- **Constraint tests insert invalid rows directly**, proving the database's CHECKs reject them even when the domain layer is bypassed.
- **Demo data is not extended stage by stage.** Features are proven by the frozen acceptance scenario and by focused test fixtures; `npm run db:reset` is technical reset infrastructure. The V1 demo is designed in Stage 10 (Overview + V1 readiness), when the V1 features and the Overview exist and it's known what they must demonstrate. Its history is extended once, in Stage 11, for Trends.
- **Definition of done for every stage** (no exceptions):
  - typecheck, lint (including the `src/domain` boundary), unit, property and acceptance (non-todo) tests, and any existing E2E tests all pass
  - one reviewed commit or a small series
  - a git tag at each milestone
- **Foundations stay short, and every stage states what it primarily delivers:** a product capability, a product surface, infrastructure or readiness, or a data/history foundation. The foundation stages F0–F2 were kept to three. A stage is never padded with UI or functionality to make it look visible; a foundation stage's value may become visible through the stage that uses it. *(Until 2026-09-27 this rule read "only three invisible foundation stages; every stage after that produces visible product".)*
- **§14 of the domain model is binding for every UI stage:** the domain is rigorous, the UI is simple.

## 3. Stage overview

| Stage | Name | Kind / primarily delivers | Milestone / tag |
|---|---|---|---|
| F0 | Repository scaffold | foundation | — |
| F1 | Domain primitives + acceptance skeleton | foundation | — |
| F2 | Ledger persistence | foundation (with first real numbers) | — |
| — | **Design gate approved** | gate | — |
| 3 | Accounts, transactions, Quick Add UI | visible | A — `v0.1-ledger` |
| 4a | Reconciliation write path (Verify balance) | visible | A — `v0.1-ledger` |
| 4b | Verification status | visible | A — `v0.1-ledger` |
| 5a | Monthly cash flow foundation | visible | B — `v0.2-understand` |
| 5b | Month-over-month explanation | visible | B — `v0.2-understand` |
| 5c | Evidence drill-down | visible | B — `v0.2-understand` → **review** |
| 5e | Evidence & trust close-out | visible | B — `v0.2-understand` |
| ~~5d~~ | ~~Charts / visual analytics~~ | — | **dropped** at the Milestone B review (§7) |
| V | Visual system / UI upgrade | visible | between B and C — **done** |
| — | **Product-architecture decisions** (documentation only) | decision | before Stage 6 — §8 |
| 6 | Commitments | product capability | C — `v0.3-spoken-for` |
| 7 | Protected money | product capability | C — `v0.3-spoken-for` |
| 8 | Available | product capability and surface | D — `v0.4-available` |
| 9 | Signals | product capability | D — `v0.4-available` |
| 10 | Overview + V1 readiness | product surface; readiness | E — `v1.0` (the **V1.0 candidate**) |
| 11 | Extended demo history | data/history foundation | after V1 — product depth |
| 12 | Trends | product capability | after V1 — product depth |
| 13 | Monthly Plan (optional; replaces Budgets) | product capability | after V1 — product depth |

Stage numbers 7–12 meant different stages before 2026-09-27. §8.4 maps old to new; entries written before then keep their original numbers.

## 4. Stages

### Foundation (invisible, kept short)

#### F0 — Repository scaffold
- **Builds:**
  - Next.js App Router + strict TypeScript and npm scripts.
  - ESLint with a `src/domain` import-boundary rule, Prettier and Vitest.
  - The folder layout from [tech-stack.md §1](tech-stack.md), `.gitignore` and a README stub.
  - The "open checks at scaffold time" ([tech-stack.md §7](tech-stack.md)) are resolved here, or in F1 where relevant.
- **Why first:** everything depends on it.
- **Domain concepts:** none.
- **Tests that must pass:** a smoke test; a lint fixture proving the boundary rule fails on a forbidden import.
- **What you can see at the end:** the app boots and shows a placeholder.
- **Deferred:** the database; Tailwind design tokens (they depend on the design gate).
- **Commit:** `chore: scaffold Next.js app with strict TS, domain boundary lint and Vitest`

#### F1 — Domain primitives + acceptance skeleton
- **Builds:**
  - `Money`: integer minor units, safe-integer guards, ৳ South Asian formatting, parsing.
  - `CalendarDate`: ISO dates, half-open months, the like-for-like window with clamping, day counts.
  - `Clock`: today in the owner's timezone, injectable.
  - UUIDv7 IDs.
  - `acceptance/september-2026.test.ts`, containing **every** assertion as `it.todo`.
- **Why here:** every later rule uses money and dates. Writing the acceptance skeleton first fixes the target.
- **Domain concepts:** minor units, calendar dates vs instants, like-for-like windows.
- **Tests that must pass:**
  - Unit tests.
  - Property tests: parse/format round trip; months partition time; the like-for-like window never exceeds the previous month's length.
- **What you can see at the end:** nothing visible. The `todo` list shows the full target.
- **Deferred:** persistence.
- **Commit:** `feat(domain): money, calendar dates, clock; acceptance scenario skeleton`

#### F2 — Ledger persistence (the heart)
- **Builds:**
  - **Drizzle schema** for owner, account, category and transaction:
    - per-type CHECKs
    - `typeof` integer checks on money columns
    - the partial unique index "at most one active opening balance per account"
    - soft delete
  - **The `account_entries` view** as a custom migration, declared with `.existing()`.
  - **Connection PRAGMAs** (foreign keys, WAL).
  - **Test harness:** a migrated template DB is serialised once; each test gets `new Database(buffer)`.
  - **Repositories and services:**
    - owner-scoped repositories
    - synchronous transaction scripts for create, edit (including type change), soft delete and restore
    - group writes (transfer + fee)
    - refund linking
  - **Seeded default categories.**
  - **Read queries:** balance, net worth, spending, income and savings rate.
- **Why here:** everything else is derived from the ledger. It must be proven before any UI trusts it.
- **Domain concepts:** Model S, the six types, signed amounts, the entries view, the liability sign convention, soft delete, tenancy.
- **Tests that must pass:**
  - **Constraint tests:** invalid rows are rejected directly by SQLite.
  - **Property tests.** For random valid ledgers:
    - transfers net to zero
    - net worth = Σ balances
    - soft-deleted rows are invisible
    - type edits preserve the invariants
  - **Acceptance:** A-01…A-08 and the M3 ledger values; M3's net worth waits for Stage 4 (see [acceptance-scenarios.md §8](acceptance-scenarios.md)).
- **What you can see at the end:** `npm run ledger:scenario` prints the scenario balances. The financial core is proven on a real database.
- **Deferred:** UI; reconciliation (Cash and net worth assertions stay `todo`).
- **Commits:**
  - `feat(db): ledger schema, constraints and account_entries view`
  - `feat(ledger): transaction services and derived balances`
  - `test: ledger constraints, properties and first acceptance assertions`

> **Design gate:** the UI/UX architecture and visual direction must be approved before Stage 3. **Direction approved 2026-09-22 → [design-direction.md](design-direction.md).** The Stage 3 implementation boundary still needs its own approval.

### Milestone A — "A ledger you can trust" — tag `v0.1-ledger`

#### 3 — Accounts, transactions and Quick Add UI
- **Builds:**
  - The top navigation shell with the approved design tokens.
  - **Accounts page:** create an account with an opening balance; balances; assets, liabilities and net worth; archive rules.
  - **Transaction list:** search and filters in URL params; grouped rows shown as one item.
  - **Quick Add:** keyboard-first; expense, income or transfer; remembers the last category and account; works at phone width.
  - Edit (including type change); delete with undo; a "Refund" action on expenses; transfer with fee.
  - Minimal category management.
  - **Demo seed v1** (accounts plus a few months of transactions, with dates relative to today) and `npm run db:reset`.
- **Why here:** the ledger is proven, so the UI only renders derived state.
- **Domain concepts:** none new. The UI shows positive amounts and no type jargon.
- **Tests that must pass:**
  - Service/server-action integration tests.
  - **Playwright flow 1:** Quick Add an expense → the account balance and the list update; edit the type → balances recompute.
- **What you can see at the end:** a usable manual ledger.
- **Deferred:** analytics, overview, reconciliation.
- **Commit:** `feat(ui): accounts, transaction list and Quick Add`

#### 4a — Reconciliation write path
- **Builds:**
  - The checkpoint table.
  - The reconcile service, which computes and posts the adjustment.
  - The "Verify balance" flow: state what an account really holds, as of today.

#### 4b — Verification status
- **Builds:**
  - Checkpoint status: the balance as of the checkpoint date vs the stated balance.
  - "Verified ✓" / "changed since verified" in the UI.
- **Why here:** it completes "truth" before analysis is built on top of it. The stage is small.
- **Domain concepts:** adjustments, checkpoints, history integrity.
- **Tests that must pass:**
  - **Acceptance:** A-10…A-14, M2-1/M2-2 (the ledger values), and M3-1/M3-3 net worth.
  - **Playwright flow 2:** reconcile.
- **What you can see at the end:** balances that match reality, and detection of backdated edits.
- **Deferred:** the revision log (V1.1).
- **Commit:** `feat(ledger): balance reconciliation with checkpoints`

### Milestone B — "Understand" — tag `v0.2-understand`

#### 5 — Monthly analysis
Built in its conceptual order: what happened → where it went → what changed → which transactions explain it → how to show it.

- **Why here:** it needs only the ledger, and it's the first differentiating feature.
- **Domain concepts:** like-for-like windows, attribution, materiality.
- **What you can see at the end:** "where did my money go, and why did it change?"
- **Deferred:** signals (the numbers exist; the ranked messages come in Stage 9, numbered 10 when this stage was written).

##### 5a — Monthly cash flow foundation
- **Builds:**
  - The Cash flow page for the current month-to-date or a complete past month, with contiguous month navigation from the first account's month.
  - Income, spending, left over (income − spending) and savings rate.
  - Spending composition by category.
- **Tests that must pass:**
  - Domain unit and property tests.
  - Service integration tests (September month-to-date and complete August from the scenario fixture).
  - **Acceptance:** none new (A-03…A-05 are already green).
- **Commit:** `feat(analytics): monthly cash flow and spending composition`

##### 5b — Month-over-month explanation
- **Builds:** like-for-like windows, category contribution over the gross-increase denominator, offsets, materiality.
- **Tests that must pass:**
  - Unit tests for the attribution maths, including the 113% net-vs-gross case.
  - **Acceptance:** A-20…A-23.

##### 5c — Evidence drill-down
- **Builds:** a date-range filter for Activity in URL params, and links from cash-flow and contribution figures to the filtered transactions.

##### ~~5d — Charts / visual analytics~~ (dropped)
- **Dropped at the Milestone B review (2026-09-27; §7).** There is no standalone chart stage. Each chart must earn its place and is built only when its concept exists: budget bullet bars in Stage 7, the Available bar in Stage 9 *(numbers as of that review; now Monthly Plan's actual-vs-intention visual in Stage 13 and the Available bar in Stage 8, §8)*. Inline composition bars for "Where it went" may be considered in the visual-system boundary. visx is not installed ([tech-stack.md](tech-stack.md)).

- **→ Checkpoint review** after 5c: held 2026-09-27 (§7).

##### 5e — Evidence & trust close-out
- **Builds:**
  - Activity states the scope of a date-range view, and offers the Cash flow month when the range has a Cash flow period's shape.
  - Cash flow's Income and Spending figures open the Activity rows behind them.
  - The smaller changes can be expanded, each with its evidence.
  - A verification status shows how far off a changed checkpoint is, the recorded and verified amounts, and a link to the account's entries through the checkpoint date, as they stand now. It never claims which entries caused the difference: without a revision log the ledger cannot know.
- **Tests that must pass:** service tests that every linked figure equals the Activity total behind it, and that a checkpoint's evidence composes its recorded balance (base, M2, a deleted entry); E2E for each link.
- **Acceptance:** none new.
- **Then:** tag `v0.2-understand`.

### Visual system / UI upgrade (between Milestones B and C)

- **Builds:** the approved visual direction applied to the real product: semantic colour and type tokens, shared primitives, and the three existing pages recomposed around their questions.
- **Rules:** tokens are tested against the real product rather than in isolation, and recorded in [design-direction.md](design-direction.md) and [product-baseline.md §11](product-baseline.md). Coral is never the colour of spending or of any financial direction, and error/destructive states stay distinguishable from it. Information architecture and domain semantics are preserved.
- **Why before Stage 6:** Stages 6–9 add new surfaces and the first charts; they should be built once, in their final colour roles.
- **Done (2026-09-27, branch `visual-system`):** recorded in [design-direction.md](design-direction.md) (§1–§8).
  - **Foundation:** the reference palette (navy, ocean, light-cyan mist, a warm off-white canvas), coral as the brand and global Add accent only, seven type steps, a Source Serif 4 wordmark, a 1360px workspace and soft card surfaces. An earlier navy/cream freeze was superseded by it.
  - **Cash flow** recomposed outcome-first: the month, Left over with the savings rate, Income and Spending as evidence, then Where it went (composition) and What changed (explanation). Higher and lower spending use the blue family; the Kept/Spent bar was removed as a duplicate of the savings rate.
  - **Activity** as one evidence workspace: filters, scope, and day-grouped rows aligned as Description · Category · Account · Amount, recomposed for tablets and phones. Filter changes made in quick succession, or while a search is still settling, are no longer lost.
  - **Accounts** led by Position (Net worth, Own, Owe), then one ledger grouped by purpose, with verification as a first-class state and Verify beside it.
  - No domain, server, schema or acceptance change.
- **Left for later:**
  - The colours of commitments (Stage 6) and protected money (Stage 7; formerly "goal reserves", Stage 8); no hue is reserved yet.
  - A copy review: a lone increase among the smaller changes reads "100% of the increase" even when spending fell overall; correct by the formula, but it reads oddly.
  - ~~The side panels (Verify, New account, transaction edit) return focus to the page, not to the button that opened them.~~ **Resolved in Stage 10 Slice 5:** every dialog, side panel and sheet returns focus to the control that opened it.
  - Opening a transaction in Activity while a typed search is still settling can lose the opened transaction. Fixing it means row navigation must carry the newest filters, and a product decision on what happens when the newly filtered list no longer contains the open transaction.

### Milestone C — "Spoken for" — tag `v0.3-spoken-for`

The two inputs to Available: money already obligated and money deliberately set aside. *(Before 2026-09-27 this milestone was "Plan", `v0.3-plan`, with Budgets and Goals; see §8.)*

#### 6 — Commitments
- **Question:** *What money am I already obligated to pay, and when?* ([domain-model.md §8](domain-model.md))
- **Scope (Milestone B review):** only what the core product and Available need. Match suggestions and weekly schedules are deferred beyond V1.
- **Builds:**
  - Commitment rules (schedules, month-end clamping). Recurrence is infrastructure, not a feature; there is no Subscriptions feature.
  - Lazy, idempotent materialisation up to today + 60 days, and occurrence states.
  - **Pay**, which creates a linked expense. No transaction is ever created without that explicit action.
  - ~~Match suggestions, confirmed by the user.~~ Deferred beyond V1.
  - Unlinking when a transaction is deleted.
  - The Upcoming list.
- **Requirements from the 2026-09-27 decisions:**
  - Every occurrence↔transaction match is recorded: it is the foundation of Monthly Plan's fixed/variable split (Stage 13).
  - `expected_account` stays **optional and descriptive**, with no funding semantics, because open decision **O-1** (§8.5) is resolved only before Stage 8. *(O-1 resolved 2026-09-28: it stays descriptive permanently in V1.)*
  - The commitment colour is decided here ([design-direction.md §2](design-direction.md)).
- **Why first:** obligations are the first input to Available, and commitments are the richest new domain (materialisation, occurrences, Pay).
- **Domain concepts:** occurrences, matching, overdue.
- **Tests that must pass:**
  - **Property tests:** materialisation is idempotent; rule edits only regenerate future, untouched occurrences.
  - **Acceptance:** A-30…A-32, M1-1, M1-2.
  - **Playwright flow 3:** pay a commitment.
- **What you can see at the end:** upcoming obligations, with a Pay action.
- **Deferred:** expected income (V1.1).
- **Commit:** `feat(commitments): recurring commitments, occurrences and Pay`

#### 7 — Protected money
- **Question:** *What money have I deliberately set aside, and is it still really there?* ([domain-model.md §9](domain-model.md)). It replaces the former Goals stage; there are no separate Goals and Reserves features.
- **User-facing term (2026-09-28):** **Set aside** is the one concept the user sees (with a target it is goal-like, without one reserve-like). "Protected money" and `EarmarkEntry` remain the domain names.
- **Builds:**
  - Protected-money items with an **optional** target amount, and append-only earmark entries.
  - Write-time invariants inside synchronous transaction scripts.
  - Oldest-first backing and shortfall (set aside / covered / short); progress and still needed = max(target − covered, 0) only when a target exists.
  - **Reserve** and **Release** (full or partial, never a transaction). Archive only when nothing remains reserved. Target reached is derived and releases nothing.
  - The simple UI: "Set aside ৳X from …", with a shortfall line only when there is one.
- **Decided before Slice 2 (2026-09-28):** backing priority is the order in which each (item, account) earmark was established, stored explicitly ([domain-model.md §9](domain-model.md)); Reserve on an archived account is rejected (`account_archived`) while Release from it stays allowed.
- **Decided in the Stage 7 plan, not earlier:** ~~the container's code name; how operation kinds are represented~~ *(resolved as O-3: `protected_money_items`; signed append-only entries with no stored kind, [domain-model.md §9.1](domain-model.md))*; whether **Move** is in the minimum slice; the protected-money colour.
- **Must not be precluded:** **Use** (through the normal ledger boundary) and **Move**, and a future explicit item↔commitment relationship.
- **Domain concepts:** earmarks, backing, shortfall, target vs reservation, release.
- **Tests that must pass:**
  - **Property tests:** covered ≤ max(balance, 0); Σ covered per account ≤ balance; reaching a target never changes what is reserved.
  - **Acceptance:** A-50, and A-51 (the rollback test).
- **What you can see at the end:** protected money backed by real money, with targets where they exist.
- **Deferred:** **Use** until its reversal semantics are decided (§8.5); Move if it isn't in the minimum slice; user-set priority; the item↔commitment relationship; and, beyond V1 (2026-09-28), a target date, on-track / behind-schedule and a required monthly contribution (planned contributions belong to Monthly Plan, Stage 13).
- **Commit:** `feat(protected-money): reservations over real money, backing and shortfall`
- **Done (2026-09-28):** the domain `cab43fb`, persistence `84210b5` and the Set aside page `f90a222`. Milestone C completed at `f90a222`; its tag `v0.3-spoken-for` has not been created.

### Milestone D — "What is actually free" — tag `v0.4-available`

#### 8 — Available
- **Question:** *How much can I use now without touching money that is already spoken for?* ([domain-model.md §10](domain-model.md))
- ~~**Resolve first:** open decision **O-1**~~ **Resolved before implementation (2026-09-28, Slice 0; [domain-model.md §5, §10](domain-model.md)):**
  - **O-1:** every pending commitment due within the horizon reduces Available, whatever its `expected_account`, which stays descriptive and pre-fill information only.
  - **Set aside enters as covered:** Available subtracts covered (backed) set-aside money on included asset accounts, never the nominal reserved amount.
  - **Transfers (accepted V1 trade-off):** earmarks never move, release or change automatically. A transfer away from an account that backs set-aside money can create a shortfall, so an included-to-included transfer can raise Available. **Move is not part of Stage 8.**
  - **Archived accounts:** no special rule. An archived asset follows its `included_in_available`, and liabilities always count. The archived-account balance gap (§8.5) stays deferred.
  - **Asset preference:** no user-facing toggle or edit UI in Stage 8 / V1. The stored flag and its type defaults stay as they are.
  - **Bridge term:** the set-aside deduction is labelled **"Set aside from Available"** (Slice 2B, replacing the provisional "Covered set aside"), never plain "Set aside"; the semantics are unchanged ([domain-model.md §10](domain-model.md)).
- **Builds:**
  - The Available service (the §10 formula) and its explainable bridge visual.
  - The **liability invariant** at the domain/write boundary: a liability can't be excluded, which closes the known setup-path gap ([domain-model.md §5](domain-model.md)).
  - ~~The `included_in_available` preference for **asset** accounts.~~ *(2026-09-28: no user-facing preference in Stage 8. The existing stored flag and its domain semantics are enforced, and no new functionality is added for it.)*
  - The over-committed state and the "before new income" label.
  - **The forward-looking product area**, first built here: it leads with Available, and its bridge terms open Commitments and Protected money. *(Decided 2026-09-28, Slice 2A: the area is named **Available**. It is the fourth global destination (Activity · Accounts · Cash flow · Available), `/available` is its landing page, and a local switch holds Available · Commitments · Set aside, whose URLs are unchanged. The phone keeps four destinations around the centred +. See §8.3 and §8.5 P-2 and P-3.)*
- **Why here:** it's the first point where all its inputs exist (see §1, decision 2).
- **Domain concepts:** Available and its bridge; account eligibility.
- **Tests that must pass:**
  - **Property tests:** the bridge terms always add up to Available; every liability balance is counted whatever its flag.
  - A domain test: `included_in_available = false` is rejected for a liability.
  - **Acceptance:** A-60, A-61, M1-3, and the Available values in M2/M3.
- **What you can see at the end:** the headline number, fully explainable.
- **Deferred:** runway / expected income (V1.1).
- **Commit:** `feat(available): Available with explainable bridge`
- **Done (2026-09-28):** semantics `a31ef92`, read model `19166ca`, liability rule `a91d99a`, navigation and area `28f339e`, the page with its bridge, bar and evidence `7311d2e` (after the berry `negative` in `b7d7f19`). A-60, A-61, M1-3 and the Available values in M2/M3 are green. The milestone tag `v0.4-available` follows Stage 9.

#### 9 — Signals
- **Question:** *Of everything true right now, what deserves my attention?* Signals select and rank; the owning feature explains ([domain-model.md §11](domain-model.md)).
- **Scope (Milestone B review):** V1 has rule families 2 (month-over-month change), 4 (commitments overdue / due), 5 (protected money under-covered only; behind schedule is deferred with target dates) and 7 (reconciliation), the ones the acceptance scenario asserts. Families 1 and 3 arrive with Stages 13 and 12; 6 and 8 are deferred beyond V1 unless a later review finds a compelling dependency (P-6). Family numbers are internal to the domain documentation and never appear in the product.
- ~~**Resolve first:** family 2's trigger rule.~~ **Decided before implementation (2026-09-28, Slice 0; [domain-model.md §11](domain-model.md)):**
  - **Selectivity:** a signal exists only when a situation is actionable, a broken promise, time-bound, or materially unusual for the month as a whole. What changed says *something changed*; Attention says *this may need you*.
  - **O-2:** `spending_up` fires at most once per month, for total spending, when the previous same-days total is above zero and the net increase is at least **max(৳5,000, 20% × the previous same-days total)**. There is no day-of-month guard. It carries What changed's material increases and offsets rather than recomputing them.
  - **Seven signal kinds, in a fixed priority order:** `commitment_overdue` (one per commitment) → `commitment_due_today` → `set_aside_short` → `verification_changed` → `commitment_due_soon` (1–7 days) → `spending_up` → `unexplained_adjustment` (current checkpoint, within 7 days). Ties are broken deterministically. There is **no severity and no score**: the kind fixes the priority and the tone.
  - **One signal per checkpoint:** a checkpoint that no longer matches produces only `verification_changed`, never also its adjustment. Checkpoint signals are not produced for archived accounts.
  - **Not signals in V1:** a missing or stale verification, commitments due in 8–30 days, a target reached, category-level changes, Available low / over-committed (P-6 stays open) and positive signals.
  - **Keys** are `kind : subject`, plus the episode (a month, an adjustment) where the kind has one, from ids and dates only. **Evidence targets** are a typed union in the domain (Commitments; Set aside; Activity scoped to an account and dates; Cash flow's What changed for a month), turned into links by the presentation layer. No signal is a dead end, and Attention never performs Pay, Release or Verify itself.
  - **Dismissal, minimal:** only `spending_up` (for its month) and `unexplained_adjustment` (for that adjustment) can be hidden; every other kind is resolved on its owning page. Hide → a toast with Undo. A small stored dismissal (owner, key; unique) is the only new persistence. No dismissal history, hidden-items view, management page, preferences, notification centre or read/unread state.
  - **P-4, Attention's first home is `/`:** the root page becomes the Attention page inside the application shell, and `HOME_PATH` (the logo) moves from Activity to `/` in Stage 9 rather than Stage 10. **No new global navigation destination** and no phone tab are added (P-3 stays open). The page holds only the Attention heading, a short count when there is something to show, the reusable Attention list and a deliberate empty state; the rest of the Overview is not designed early. Stage 10 grows `/` into the Overview and reuses the same list and read model.
- **Builds:**
  - The signal context, composed from the existing read models (commitments, set-aside backing, reconciliation checkpoints, the month-over-month explanation). It reads the current checkpoint's adjustment, the one additive read it needs.
  - Pure rules for the seven kinds, the priority order, keys and evidence targets.
  - Minimal dismissal (Hide → Undo) for the two dismissible kinds.
  - The Attention page at `/`.
- **Not built:** a Signals inbox, read/unread state, an Insights destination, charts, notifications, AI-written observations, a navigation destination for Attention, and inline Pay / Release / Verify from Attention.
- **Domain concepts:** signals, materiality, priority, evidence, episodes.
- **Tests that must pass:**
  - Per-rule unit tests with fixtures, including materiality and date edge cases, and the priority order.
  - **Acceptance:** A-70…A-73, M1-5, M2-3.
- **What you can see at the end:** "what deserves my attention?" at `/`, with a link from each signal to the page that owns its explanation and action. Stage 10 composes Attention into the Overview. Signals own the selection and ranking of noteworthy conditions; the Overview may surface them but never owns their logic.
- **Deferred:** persisted signal history, notifications, the V1 demo situations that make each kind visible on a fresh seed (Stage 10).
- **Done (2026-09-28):** decisions and the signal catalogue `616ebc1`, pure signal derivation `5295ec2`, the Attention read model and minimal dismissal `4f0b7f1`, and the Attention page at `/` `a25bf44` (the logo leads there; still four global destinations and four phone tabs; [design-direction.md §6](design-direction.md)). A-70, A-71, A-72, A-73, M1-5 and M2-3 are green. Milestone D is tagged `v0.4-available` at `598a381` (2026-09-28, before Stage 10).
- **Commit:** `feat(signals): deterministic signal engine`

### Milestone E — "Portfolio-ready V1" — tag `v1.0`

#### 10 — Overview + V1 readiness
- **Question:** *What can I use right now, what needs me, and how does that sit against this month and where I stand?* The Overview owns no financial truth; it composes existing answers, and each links to the page that explains it. *(Until 2026-09-28: "What should I know right now, and what should I do next?")*
- **Decided before implementation (2026-09-28, Slice 0; [product-baseline.md §6](product-baseline.md), [design-direction.md §2, §5](design-direction.md)):**
  - **Four zones, in one fixed order:** **Available** → **Attention** → **This month** → **Where you stand**. The DOM order and the visual reading order are the same at every width; no zone is reordered with CSS.
  - **Available is the single headline,** on the navy panel (the product's one navy surface): the figure in the `hero` step, *Before new income*, the over-commitment tag when there is one, and Available's own hero sentence, extracted and shared rather than copied, linking to `/available`. The panel carries a **free-share ring**, FinPilot's only ring: one arc of `available` against the pool, which the words call the money **on hand**, with no percentage, score or thresholds; no ring when the pool is ≤ 0, and an empty track when Available is ≤ 0. The Overview never redraws the bridge or the spoken-for bar. *(Revised 2026-09-29 by the Overview redesign: the hero step and the "on hand" wording.)*
  - **Attention is second:** at most the first **3** signals in priority order, as a compact queue with no Hide. **View all N** opens the complete list, with Hide, in a side panel (a bottom sheet on phones) when there are more than 3; with 3 or fewer, **Open Attention** does so only when one can be hidden. With nothing to show, a compact line ("Nothing needs your attention" and its existing sentence), with no action. There is **no Attention route**, no inbox and no new signal. After Hide in the sheet, the next signal moves up and focus goes to the sheet's heading. *(Revised 2026-09-29 by the Overview redesign; until then, Show N more opened the rest in place.)*
  - **This month is third:** Came in, Went out and Left over for the current month so far, drawn as a proportional **flow** (the two amounts on one scale, the span between them named Left over), linking In and Out to their Activity rows and the zone to Cash flow. **No savings rate, percentage or month comparison** (Attention owns a material change, Cash flow every change) and **no month-progress ticks**. *(Revised 2026-09-29 by the Overview redesign; until then, a statement with no chart.)*
  - **Where you stand is fourth and secondary:** net worth (never a hero), what you own with a two-part rail — **Counts toward Available** and **Outside Available**, labelled directly, drawn only when both parts are ≥ 0 and assets are above zero, with the outside accounts named — and what you owe on its own line (a card holding credit reads *Credit on cards*).
  - **Not on the Overview:** an assets-vs-liabilities chart, a savings-rate or month-comparison visual, any time series, separate commitment or set-aside totals, recent activity, and repeated KPI cards.
  - **Layout:** a spread from 1024px — the navy panel beside one context surface holding Attention, This month and Where you stand as bands; one column below that, Available first. *(Revised 2026-09-29; until then, Attention sat beside the band from 1280px and This month and Where you stand shared one split card.)*
  - **Architecture:** no Overview service or read model merely for orchestration; the page composes `getAvailable`, `getAttention`, `getMonthlyCashFlow` and `getPosition`. The one additive value is **excluded asset balances** in the Available bridge, owned by the domain with the invariant *included + excluded asset balances = position assets* ([domain-model.md §10](domain-model.md)), so no component adds up balances. Whether the spoken-for pool rule moves from presentation into the bridge is decided in the read-model slice, only if the gauge requires it. *(Resolved 2026-09-28, Slice 2: it moves. The gauge needs the same pool as the spoken-for bar, so the bridge supplies `pool` = included asset balances + max(liability balances, 0) and the bar reads it; see [domain-model.md §10](domain-model.md).)*
  - **P-3 resolved** (§8.5): Overview becomes a global destination; the phone bar is Overview · Activity · + · Accounts · Available, and Cash flow stays its own page without a phone tab.
  - **The existing Accounts sign defect** (Own and Owe written as magnitudes, so a card holding credit reads as owed) is fixed in its own commit, not inside the Overview.
- **V1 demo situations (approved catalogue).** Dated relative to today and written through the normal commands, on top of the existing five accounts (Savings excluded from Available, Visa owing):
  1. an Internet commitment 3–5 days past due, unpaid → `commitment_overdue`
  2. a mobile bill due today → `commitment_due_today`
  3. rent due in 2–6 days → `commitment_due_soon`
  4. a commitment due in 8–30 days: it reduces Available without a signal
  5. commitment history with at least one Paid and one Skipped occurrence
  6. Set aside *Emergency* on Bank, fully covered (deducted)
  7. Set aside *Laptop* on bKash, left short by later spending → `set_aside_short`
  8. set-aside money on Savings ("Not deducted")
  9. Cash verified about 10 days ago, then a backdated entry before that day → `verification_changed`
  10. bKash reconciled 1–6 days ago with an adjustment → `unexplained_adjustment` (another account than 9, since a checkpoint gives one signal)
  11. a large expense this month, with spending on the same days of last month above zero → `spending_up`
  12. Bank verified and still matching

  Available stays positive at about 30–60% of the pool. Over-committed, negative net worth and card credit are proven by tests, not the demo. The seed smoke test asserts that all seven kinds fire, run for several `today`s (the 1st, the 15th, and the 29th–31st for month-end clamping).
- **V1 UX blockers (from the deferred list):** side panels return focus to the button that opened them; the toast no longer covers phone sheets. *(Both resolved in Slice 5, 2026-09-29: focus returns to the opener of every overlay; while one is open the toast moves to the top, beside a side panel from 768px, and its Undo no longer closes the overlay.)* The rest stay known V1 limitations: the Activity row-click race, the "100% of the increase" copy, collapsible phone evidence, long evidence lists, account deep links, and Set aside's wording, sort and desktop empty space.
- **Still open, not owned by Stage 10:** O-4, O-5, O-6, P-1, P-2 (Monthly Plan's placement), P-5 and P-6.
- **Builds — Overview:**
  - Available, as the entry point to its bridge.
  - Attention (signals).
  - A concise current-month outcome from Cash flow, linking to it.
  - Where you stand, as secondary context.
  - `/` grows from the Attention page (Stage 9) into the Overview; home is already `/`.
  - **Not built:** Recent activity (Activity exists), copies of Cash flow's charts, a full commitment list, Overview-only metrics, and protected-money or commitment widgets when Attention already surfaces the shortfall or deadline.
- **Builds — V1 readiness** (the responsibilities of the former Stage 12 that V1 needs):
  - Demo seed situations that demonstrate the V1 product, including a **planted situation for every V1 signal family**, on the existing short history. Extended history is Stage 11.
  - A responsive review (390 / 820 / 1280) and an accessibility review.
  - **README:** architecture, decisions, how to run, and **portfolio screenshots** (required).
  - A final V1 product and polish review. *(Decided 2026-09-29: the current Overview is the accepted V1 composition; its final visual and product polish is deferred until the remaining portfolio features are built, and no space is reserved on it now for features that don't exist yet.)*
- **Why here:** an overview built after its inputs can't hold fake state, and it no longer waits for optional features.
- **Tests that must pass:**
  - **Playwright flow 4:** Quick Add → the overview updates (Available, signals). *(Green 2026-09-29, `e2e/overview-flow.spec.ts`: a newly verified Cash account records a ৳275 expense through Quick Add on `/`; without a reload, Available and the money on hand drop by ৳275 and Attention gains the account's *Doesn't match* item, ৳275 off.)*
  - A seed smoke test: every V1 signal family fires on a fresh seed.
  - **V1 exit criterion:** every acceptance assertion is green **except A-40 and M1-4**, which are deliberately deferred with Monthly Plan to Stage 13.
- **What you can see at the end:** the V1.0 candidate. Clone → `npm install` → `npm run db:reset` → `npm run dev`.
- **Then:** tag `v1.0` after the V1 review.
- **Deferred:** deployment and the public demo strategy, auth, V1.1 items.
- **Slices, in order** (decided 2026-09-28; each planned, audited and committed on its own):
  0. decisions (this entry)
  1. V1 demo situations, before any Overview UI is tuned
  2. read model: excluded asset balances; the Accounts sign fix in its own commit
  3. the Overview at `/`
  4. navigation (P-3)
  5. responsive and accessibility review, Playwright flow 4, and the two UX blockers
  6. V1 readiness: README and screenshots, docs closure, then `v1.0` after review
- **Progress:** Slice 0 `72dcd1f`; Slice 1 `a86b755`; Slice 2 (2026-09-28): the Accounts sign fix `09828bc` (liability standing: a card's credit reads as credit, never owed), then the read model: the Available bridge exposes `excludedAssetBalances` and `pool`, with their invariants, and the spoken-for bar reads `pool` instead of rebuilding it. Slice 3 (2026-09-29): the Overview at `/` — the navy Available band with the free-share ring, Attention's first 3 with Show N more in place, This month as a statement, and Where you stand with the asset rail — composed in the page from `getAvailable`, `getAttention`, `getMonthlyCashFlow` and `getPosition`, with no service of its own; Available's hero sentence is shared with the Available page. Slice 4 (2026-09-29): P-3 navigation — Overview is the first destination on desktop and a phone tab; Cash flow has no phone tab, and no tab is current on `/cash-flow` at phone width. Slice 5 (2026-09-29): the two V1 UX blockers — overlays return focus to their opener, and toasts stay clear of open overlays with Undo that no longer closes them. The Overview redesign (2026-09-29, "the Spread"): the navy panel with a 48px hero and a larger ring beside one context surface; Attention as a 3-row queue with View all in a sheet; This month as a proportional flow; Where you stand with a labelled rail. Playwright flow 4 (2026-09-29): Quick Add on the Overview → Available and Attention update, through the real write and read models.
- **Commits:**
  - `feat(demo): V1 demo situations`
  - `feat(overview): overview composed from existing answers`
  - `chore: V1 polish and README`

### After the V1 candidate — product depth

#### 11 — Extended demo history
- **Primarily delivers:** a data/history foundation for longitudinal analysis. Its value becomes visible through Stage 12 (Trends); no UI or functionality is added to Stage 11 to make it look visible.
- **Builds:** the seed extended to 9–12 months of history, with dates relative to today, curated Bangladeshi merchants, and the multi-month patterns that Trends and signal family 3 need to demonstrate. It stays deterministic.
- **Why before Trends:** the current three months cannot show a longitudinal pattern.
- **Tests that must pass:** the seed smoke test still passes; every V1 signal family still fires.
- **Commit:** `feat(demo): extended history`

#### 12 — Trends
- **Question:** *Is this a pattern or a one-off?* The shape across **three or more complete periods**. Cash flow owns one period and its attribution against another; Trends is not Cash flow with a wider date selector.
- **Rules:** a partial current month is never treated as a complete month. **One** longitudinal visual first: Income vs Spending across complete months. A category trend (for example a sparkline beside the figure) comes only if it proves useful. The rejected charts are listed in [design-direction.md §5](design-direction.md).
- **Resolve first:** the definition of "typical" (window; mean or median) used by Trends and by family 3 (§8.5).
- **Builds:** the Trends view, and signal family 3 (category spike vs typical).
- **Commit:** `feat(trends): multi-month pattern`

#### 13 — Monthly Plan
- **Question:** *What do I intend to spend or set aside this month, and how did that go?* It is optional, it never feeds Available, and it never rewrites the ledger ([domain-model.md §7](domain-model.md)).
- **Resolve first:** effective-dated or month-specific intentions (§8.5).
- **Builds:**
  - Category spending intentions and optional intended protected-money contributions.
  - Commitments shown read-only.
  - Actuals derived from the ledger and earmark entries.
  - The commitment-aware projection and statuses.
  - Variance and end-of-month reflection.
  - An actual-vs-intention visual.
  - Signal family 1.
- **Not built:** envelope or zero-based budgeting, rollover, custom periods, and Budgets beside the plan.
- **Tests that must pass:**
  - Projection unit tests (Dining 8,455, no projection before day 5, `committed_over`).
  - A test that every other feature returns identical results with and without a plan.
  - **Acceptance:** A-40, M1-4 → **full suite green**.
- **Commit:** `feat(plan): optional monthly plan with commitment-aware projection`

### Portfolio differentiators (after the product-depth stages; each its own discussion)

The candidate pipeline comes before every producer ([product-baseline.md §9](product-baseline.md)):

1. **Transaction Candidate pipeline:** an ingestion endpoint, a candidate (draft) inbox, idempotency keys and user review. Nothing reaches the ledger without confirmation.
2. **CSV producer:** the first idempotent-ingestion story.
3. **Email / SMS producer via n8n.**
4. **Receipt / screenshot capture.**

**Much later:** AI narration of computed evidence, natural-language financial questions answered through deterministic tools, MCP, and richer forecasting.

## 5. Acceptance progress by stage

| Stage | Assertions turned green (IDs in [acceptance-scenarios.md](acceptance-scenarios.md)) |
|---|---|
| F1 | none (all written as `todo`) |
| F2 | A-01…A-08, M3 ledger values |
| 4a | A-10, A-11, A-12, A-14, M2-2 ledger values, M3 net worth |
| 4b | A-13, M2-1 |
| 5a | none (A-03…A-05 already green) |
| 5b | A-20…A-23 |
| 5c | none |
| 5e | none |
| V | none |
| 6 | A-30…A-32, M1-1, M1-2 |
| 7 | A-50, A-51 |
| 8 | A-60, A-61, M1-3, Available values in M2/M3 |
| 9 | A-70…A-73, M1-5, M2-3 |
| 10 | none new. **V1 exit:** all green except A-40 and M1-4 (deferred with Monthly Plan) |
| 11 | none |
| 12 | none |
| 13 | A-40, M1-4 → full suite green |

## 6. After V1

Stages 11–13 and the portfolio differentiators (§4) are planned product depth after the V1.0 candidate. These also come after Portfolio V1, each as a separate discussion:

- the deployment and public demo strategy
- V1.1 (runway, splits, merchant memory, revision log); CSV import is now the first producer of the candidate pipeline (§4), and net worth over time is rejected for now (§8)
- auth and tenancy enforcement
- PostgreSQL migration
- AI
- MCP

See [product-baseline.md §9](product-baseline.md).

## 7. Milestone B review outcome (2026-09-27)

Agreed after Stage 5c. Scope and sequence changes only; no acceptance number changed. *(History: the stage numbers below are the ones in use then, and item 5 (Budgets) is superseded by §8.)*

1. **Stage 5d is dropped** as a standalone stage, and visx is not installed. Charts must earn their place individually; budget and Available visuals wait until those concepts exist.
2. **Visual direction approved conceptually** (navy / slate-ocean blue / soft blue and pale cyan / warm cream / restrained coral). Exact tokens are frozen inside the visual-system boundary. *(Superseded: the palette actually implemented is recorded under "Visual system / UI upgrade" above.)*
3. **Sequence:** 5e Evidence & trust close-out → tag `v0.2-understand` → visual system / UI upgrade → Stage 6.
4. **Signals** narrowed to families 2, 4, 5 and 7 for V1.
5. **Budgets** kept, narrowed; A-40 and M1-4 unchanged.
6. **Commitments:** match suggestions and weekly schedules deferred beyond V1.
7. **Deployment** stays after V1; README screenshots are required in Stage 12.
8. `v0.2-understand` is tagged only after 5e is implemented, validated, reviewed and committed.

## 8. Product-architecture decisions (2026-09-27)

A documentation-only boundary between the visual system and Stage 6. It reopened frozen decisions deliberately, under their change policies. **No acceptance value changed, and every assertion ID is kept.**

### 8.1 Product model

**Record** (*what actually happened?*) → **Verify** (*can I trust the record?*) → **Understand** (*what happened to my money, and how is it changing?*) → **Available** (*what can I actually use without consuming money already spoken for?*).

- **Commitments** and **Protected money** are not steps after Understand. They are the **inputs** to Available.
- **Notice** (signals) runs across every layer.
- **Plan** (Monthly Plan) is **optional**: no other feature requires it.
- The rules stand: the ledger always wins, planning never rewrites history, derived values stay derived, important figures carry evidence, and no feature, metric or chart is duplicated or added to make the product look larger.

The product-responsibility matrix, which gives each feature one primary question, is in [product-baseline.md §2](product-baseline.md).

### 8.2 Decisions

1. **Commitments** own scheduled obligations. A commitment is not a transaction. Recurrence is infrastructure. There is no Subscriptions feature and no transaction without explicit action ([domain-model.md §8](domain-model.md)).
2. **Protected money replaces Goals** as one concept with an optional target and target date *(2026-09-28, before Stage 7: shown to the user as "Set aside"; the target date and on-track are deferred beyond V1; see Stage 7)*. Target reached is derived and releases nothing; Release is deliberate and may be partial; archiving requires nothing reserved; Use and Move are defined semantically and implemented later. Account exclusion and protection stay distinct. `EarmarkEntry` keeps its name ([domain-model.md §9](domain-model.md)).
3. **Available** remains the central derived decision metric, with its full formula. **Liability invariant:** every liability counts regardless of `included_in_available`. The known setup-path gap is closed in Stage 8. Available excludes expected income and Monthly Plan, is never stored and never clamped ([domain-model.md §5, §10](domain-model.md)).
4. **Sinking funds:** Commitments and Protected money stay independent. The conservative double reservation is kept for V1, with no automatic matching; a future explicit relationship must stay possible.
5. **Signals** select and rank; the owning feature explains. There is no inbox, no read state, no Insights destination and no duplicate charts. Family 2 must be meaningfully more selective than What changed ([domain-model.md §11](domain-model.md)). *(Resolved in Stage 9 as O-2, §8.5.)*
6. **Overview** moves before the optional features and is narrowed to Available, Attention and a concise current-month outcome ([product-baseline.md §6](product-baseline.md)). *(2026-09-28, Stage 10 Slice 0: Where you stand is added as secondary context; Available stays the one headline.)*
7. **Trends** moves after the V1 candidate, over complete periods only, with extended demo history before it.
8. **Monthly Plan replaces Budgets:** optional, after V1, independent of Available, not envelope budgeting. It carries forward the commitment-aware projection with A-40 and M1-4 ([domain-model.md §7](domain-model.md)).
9. **Charts:** one visualisation answers one analytical question. Future visuals are recorded only where their owning concept is decided ([design-direction.md §5](design-direction.md)).
10. **Out of scope** unless deliberately reopened: [product-baseline.md §5](product-baseline.md).

### 8.3 The forward-looking product area

Available, Commitments and Protected money naturally form one forward-looking decision area. The area **leads with Available**, and Available's bridge terms open the other two.

- **Named "Available" (decided 2026-09-28, Stage 8 Slice 2A).** It is the fourth global destination, after Activity, Accounts and Cash flow: the navigation follows the product model, Record → Verify → Understand → Available. `/available` is the area's landing page, and a local switch holds its three pages, **Available · Commitments · Set aside**; the Commitments and Set aside URLs are unchanged. Commitments is no longer a global destination.
- *(History: "Plan" was a working name only, never a navigation label, because a destination called "Plan" could suggest that Available depends on planning, or that planning is expected.)*
- **Monthly Plan** is conceptually related but **does not feed Available**. It may or may not live in the same area; its placement is decided by Stage 13.
- The **Overview** may surface Available but does not own it. **Accounts** keeps position and balance trust, with no competing headline beside Net worth, Own and Owe. **Cash flow** keeps what happened in a period, and Available is not part of it.

### 8.4 Stage numbering: old → new

| Before 2026-09-27 | From 2026-09-27 | Acceptance assertions |
|---|---|---|
| 6 Commitments | **6** Commitments | A-30…A-32, M1-1, M1-2 (unchanged) |
| 7 Budgets | **13** Monthly Plan (replaces Budgets) | A-40, M1-4 |
| 8 Goals and earmarks | **7** Protected money | A-50, A-51 |
| 9 Available and position | **8** Available | A-60, A-61, M1-3, Available values in M2/M3 |
| 10 Signal engine | **9** Signals | A-70…A-73, M1-5, M2-3 |
| 11 Overview | **10** Overview + V1 readiness | — (V1 exit: all but A-40, M1-4) |
| 12 Demo data and polish | split: V1 demo, polish and README → **10**; extended history → **11** | — |
| — | **12** Trends (new) | — |

**Code follow-up (before Stage 6 starts):** the stage labels and comments that still use the old numbers are corrected in a small, separate code change: `acceptance/catalogue.ts` stage names, `src/components/shell/navigation.ts` and `src/app/page.tsx` ("Stage 11" → Stage 10), and `src/db/seed/demo-seed.ts` ("Stage 12" → Stages 10 and 11), plus the catalogue's A-70 title ("goal under-covered" → protected money). This boundary did not touch code.

### 8.5 Open decisions: intentionally unresolved

Every item here is **deliberately open, not forgotten**. A stage's plan resolves the items it is blocked by before implementation starts, and records the answer in the owning document.

**A. Implementation blockers**

| # | Decision | Owning doc | Resolve before |
|---|---|---|---|
| ~~O-1~~ | ~~How a pending commitment whose `expected_account` is an asset account **excluded** from Available affects Available.~~ **Resolved 2026-09-28 (before Stage 8):** it reduces Available like every other pending commitment in the horizon. `expected_account` stays descriptive and pre-fill information only, with no funding semantics. | [domain-model.md §10](domain-model.md) | closed |
| ~~O-2~~ | ~~Signal family 2's trigger: stricter or otherwise meaningfully more selective than What changed; A-72 must stay present.~~ **Resolved 2026-09-28 (Stage 9 Slice 0):** `spending_up` fires at most once per month, for total spending, when the previous same-days total is above zero and the net increase is at least max(৳5,000, 20% × that total); no day-of-month guard. A-72 stays present. | [domain-model.md §11](domain-model.md) | closed |
| ~~O-3~~ | ~~Protected money: the container's code name, and the representation of operation kinds.~~ **Resolved 2026-09-28 (Stage 7):** `protected_money_items`; append-only signed earmark entries, positive = Reserve, negative = Release, no operation-kind field. | [domain-model.md §9.1](domain-model.md) | closed |
| O-4 | **Use:** how much is released when the expense differs from the reservation, and what happens to the release when the Use transaction is edited or deleted. | [domain-model.md §9.1](domain-model.md) | implementing **Use** (not required in the minimum Stage 7 slice) |
| O-5 | "Typical" for Trends and signal family 3: the window, and mean or median. | this file, Stage 12 | **Stage 12** |
| O-6 | Monthly Plan intentions: effective-dated or month-specific. Either reproduces A-40 and M1-4. | [domain-model.md §7](domain-model.md) | **Stage 13** |

**B. Later product questions**

| # | Question | Resolve when |
|---|---|---|
| P-1 | An explicit protected-money ↔ commitment relationship (sinking funds). **Not a V1 blocker:** the conservative double reservation is acceptable for V1 ([domain-model.md §10](domain-model.md)). | if the revisit trigger fires (double reservation seen often) |
| P-2 | ~~The forward-looking area's final name and its navigation placement~~ **Resolved 2026-09-28 (Stage 8 Slice 2A):** the area is **Available**, the fourth global destination, with `/available` as its landing page and a local switch for Available · Commitments · Set aside (§8.3). **Still open:** Monthly Plan's placement. *(History: in Stage 7, Set aside sat beside Commitments behind a local switch, under the Commitments destination.)* | Monthly Plan's placement by Stage 13 |
| P-3 | ~~Phone tab-bar capacity once Overview and the forward-looking area join the bar.~~ **Stage 8 part resolved (2026-09-28):** Available replaced the Commitments tab, so the bar still has four destinations around the centred +. **Stage 10 part resolved (2026-09-28, Slice 0):** the Overview at `/` becomes a global destination. **Desktop:** Overview · Activity · Accounts · Cash flow · Available. **Phone:** Overview · Activity · + · Accounts · Available, still four destinations. **Cash flow** has no persistent phone tab; it is reached from context (This month on the Overview, Attention's "See what changed", Activity's month link) and **stays its own page**: on `/cash-flow` at phone width **no tab is marked current** — not the Overview, not any other destination. On desktop Cash flow is current as before. The logo still leads to `/`. *Why:* on phones the tab bar is the navigation model, so home needs a tab; Cash flow is the least frequent phone task and the one the Overview summarises, while Verify (Accounts) and Pay or Skip (Available) are phone tasks. *Rejected:* logo-only home (weak on phones; no current state on `/`), a desktop-only tab (leaves the phone gap), replacing the Available tab (Home would stand in for a whole area), replacing Accounts (Verify is done on the phone), a fifth phone tab. | closed |
| P-4 | ~~How Attention is reachable when signals ship, before the Overview composes it.~~ **Resolved 2026-09-28 (Stage 9 Slice 0):** Attention's first home is `/`, inside the application shell; the logo (`HOME_PATH`) leads there from Stage 9; no new global navigation destination or phone tab. Stage 10 grows `/` into the Overview and reuses the same list. Signals own selection and ranking; the Overview only surfaces them. | closed |
| P-5 | The colours of commitments and protected money ([design-direction.md §2](design-direction.md)). *Protected money resolved for V1 (2026-09-28): no dedicated hue.* | Stages 6 and 7 |
| P-6 | Signal families 6 (Available low) and 8 (savings-rate change). | a review after V1 |

**Known gaps, not open questions:**

- ~~The account-setup service accepts `included_in_available = false` for a credit card when a caller passes it (no UI does).~~ **Resolved in Stage 8 (`a91d99a`):** a liability cannot be created with `included_in_available = false`; the rule is enforced at the domain/write boundary. The database CHECK remains deferred ([domain-model.md §5](domain-model.md)).
- *(Found 2026-09-28, Stage 10 Slice 2.)* **Verifying a card cannot state a credit balance.** Verify asks "How much do you actually owe?" and accepts only an amount ≥ 0, which the account type signs, so a card holding credit can be verified only as owing zero or more. The recorded balance now reads correctly ("Recorded as credit"); the input is unchanged. A deferred V1 limitation, not a Stage 10 fix.
- *(Found 2026-09-28, Stage 7.)* An account is archived only at a zero balance, but that is checked only when it is archived. Afterwards, **deleting** a transaction that touched it, or **editing** one so it no longer does, is still allowed (only the new version's accounts are checked), so an archived account can regain a non-zero balance. New entries, restores and reconciliation on it are rejected. Not fixed in Stage 7, which never assumes an archived account holds zero; to be reviewed later. **Not fixed in Stage 8 either (2026-09-28):** Available has no archive filter, so a regained balance counts by the account's flag (always, for a liability) ([domain-model.md §10](domain-model.md)).
