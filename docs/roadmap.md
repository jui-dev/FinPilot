# FinPilot — Implementation Roadmap (Portfolio V1)

**Status:** Approved 2026-09-22
**Change policy:** Stages may be split into smaller commits freely. Reordering stages or changing their scope requires agreement first.
**Related:** [product-baseline.md](product-baseline.md) · [domain-model.md](domain-model.md) · [tech-stack.md](tech-stack.md) · [acceptance-scenarios.md](acceptance-scenarios.md)

---

## 1. Approved decisions that shape this roadmap

1. **The design gate runs during F0–F2.** A dedicated UI/UX architecture and visual-design discussion happens while the foundation stages are built. The design direction **must be approved before Stage 3 begins**. No generic dashboard design is improvised during implementation.
2. **Available stays at Stage 9.** It is FinPilot's headline concept, so it is introduced once, with its final V1 semantics, when all its inputs exist: eligible balances and liabilities, commitments and goal earmarks. No temporarily incomplete version ships earlier.
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
- **Demo data is not extended stage by stage.** Features are proven by the frozen acceptance scenario and by focused test fixtures; `npm run db:reset` is technical reset infrastructure. The portfolio demo dataset is designed once, in Stage 12, when the features, reports and Overview are mature enough to know what it must demonstrate.
- **Definition of done for every stage** (no exceptions):
  - typecheck, lint (including the `src/domain` boundary), unit, property and acceptance (non-todo) tests, and any existing E2E tests all pass
  - one reviewed commit or a small series
  - a git tag at each milestone
- **Only three invisible foundation stages.** Every stage after that produces visible product.
- **§14 of the domain model is binding for every UI stage:** the domain is rigorous, the UI is simple.

## 3. Stage overview

| Stage | Name | Kind | Milestone / tag |
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
| 5d | Charts / visual analytics | visible | deferred; placement decided at the Milestone B review |
| 6 | Commitments | visible | C — `v0.3-plan` |
| 7 | Budgets | visible | C — `v0.3-plan` |
| 8 | Goals and earmarks | visible | C — `v0.3-plan` |
| 9 | Available and position | visible | D — `v0.4-available` |
| 10 | Signal engine | visible | D — `v0.4-available` |
| 11 | Overview | visible | E — `v1.0` |
| 12 | Demo data and polish | visible | E — `v1.0` |

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
- **Deferred:** signals (the numbers exist; the ranked messages come in Stage 10).

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

##### 5d — Charts / visual analytics
- **Builds:** the visx charts (bridge, diverging bars, composition), with the per-chart Recharts fallback.
- **Deferred from the current implementation sequence.** Whether charts come before the `v0.2-understand` tag or move to the visual-refinement phase is decided at the Milestone B review after 5c.

- **→ Checkpoint review** after 5c: the product feel, and where charts belong.

### Milestone C — "Plan" — tag `v0.3-plan`

#### 6 — Commitments
- **Builds:**
  - Commitment rules (schedules, month-end clamping).
  - Lazy, idempotent materialisation up to today + 60 days, and occurrence states.
  - **Pay**, which creates a linked expense.
  - Match suggestions, confirmed by the user.
  - Unlinking when a transaction is deleted.
  - The Upcoming list.
- **Why before budgets:** the budget projection needs to know which spending is fixed and which is variable.
- **Domain concepts:** occurrences, matching, overdue.
- **Tests that must pass:**
  - **Property tests:** materialisation is idempotent; rule edits only regenerate future, untouched occurrences.
  - **Acceptance:** A-30…A-32, M1-1, M1-2.
  - **Playwright flow 3:** pay a commitment.
- **What you can see at the end:** upcoming obligations, with a Pay action.
- **Deferred:** expected income (V1.1).
- **Commit:** `feat(commitments): recurring commitments, occurrences and matching`

#### 7 — Budgets
- **Builds:**
  - Effective-dated, calendar-month limits.
  - Usage net of refunds.
  - The commitment-aware projection and statuses.
  - The budget-health UI (bullet bars).
- **Domain concepts:** effective dating, fixed vs variable spending, certain vs projected overrun.
- **Tests that must pass:**
  - Projection unit tests (Dining 8,455, no projection before day 5, `committed_over`).
  - **Acceptance:** A-40, M1-4.
- **What you can see at the end:** "am I staying within my plans?"
- **Deferred:** rollover, custom periods.
- **Commit:** `feat(budgets): monthly budgets with commitment-aware projection`

#### 8 — Goals and earmarks
- **Builds:**
  - Goals and append-only earmark entries.
  - Write-time invariants inside synchronous transaction scripts.
  - Oldest-first backing, shortfall, and release on completion.
  - The simple UI: "Reserve ৳X from …", with a shortfall line only when there is one.
- **Domain concepts:** earmarks, backing, shortfall.
- **Tests that must pass:**
  - **Property tests:** covered ≤ max(balance, 0); Σ covered per account ≤ balance.
  - **Acceptance:** A-50, and A-51 (the rollback test).
- **What you can see at the end:** goals backed by real money.
- **Deferred:** user-set priority, goal↔commitment linking.
- **Commit:** `feat(goals): goals with earmarks, backing and shortfall`

### Milestone D — "What is actually free" — tag `v0.4-available`

#### 9 — Available and position
- **Builds:**
  - The Available service (the [domain-model.md §10](domain-model.md) formula) and the bridge chart.
  - `included_in_available` defaults (a per-account toggle only if it's cheap).
  - The over-committed state and the "before new income" label.
- **Why here:** it's the first point where all its inputs exist (see §1, decision 2).
- **Domain concepts:** Available and its bridge.
- **Tests that must pass:**
  - **Property test:** the bridge terms always add up to Available.
  - **Acceptance:** A-60, A-61, M1-3, and the Available values in M2/M3.
- **What you can see at the end:** the headline number, fully explainable.
- **Deferred:** runway / expected income (V1.1).
- **Commit:** `feat(position): Available with explainable bridge`

#### 10 — Signal engine
- **Builds:**
  - The context builder.
  - Eight pure rule families.
  - Keys, severity and ranking; templates.
  - Evidence filters (drill-down).
  - Per-period dismissals.
- **Domain concepts:** signals, materiality, ranking, evidence.
- **Tests that must pass:**
  - Per-rule unit tests with fixtures, including materiality edge cases.
  - **Acceptance:** A-70…A-73, M1-5, M2-3.
- **What you can see at the end:** "what deserves my attention?", with drill-down on each signal.
- **Deferred:** persisted signal history, notifications.
- **Commit:** `feat(signals): deterministic signal engine`

### Milestone E — "Portfolio-ready V1" — tag `v1.0`

#### 11 — Overview
- **Builds:** the overview zones (Position/Available → Attention → This month → Plans → Recent activity), composed purely from existing services.
- **Why late:** an overview built last can't hold fake state.
- **Tests that must pass:**
  - **Playwright flow 4:** Quick Add → the overview updates (Available, budget, signals).
  - **Acceptance: 100% green, with no `todo` remaining.**
- **What you can see at the end:** the complete FinPilot overview.
- **Commit:** `feat(overview): derived overview dashboard`

#### 12 — Demo data and polish
- **Builds:**
  - **The final seed generator:** 9–12 months of history, dates relative to today, curated Bangladeshi merchants, and anomalies planted so every signal rule fires.
  - **Polish:** a responsive pass, empty states, an accessibility pass, and a performance check at seed volume.
  - **README:** architecture, decisions, how to run.
- **Tests that must pass:** a seed smoke test (every rule fires on a fresh seed), plus the full suite.
- **What you can see at the end:** clone → `npm install` → `npm run db:reset` → `npm run dev`.
- **Deferred:** deployment and the public demo strategy, auth, V1.1 items.
- **Commits:**
  - `feat(demo): realistic seed generator`
  - `chore: V1 polish and README`

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
| 5d | none |
| 6 | A-30…A-32, M1-1, M1-2 |
| 7 | A-40, M1-4 |
| 8 | A-50, A-51 |
| 9 | A-60, A-61, M1-3, Available values in M2/M3 |
| 10 | A-70…A-73, M1-5, M2-3 |
| 11 | full suite green |

## 6. After V1

These come after Portfolio V1, each as a separate discussion:

- the deployment and public demo strategy
- V1.1 (runway, CSV import, splits, merchant memory, net worth over time, revision log)
- auth and tenancy enforcement
- PostgreSQL migration
- ingestion and n8n
- AI
- MCP

See [product-baseline.md §9](product-baseline.md).
