# FinPilot — Product Baseline

**Status:** Frozen — approved 2026-09-22
**Change policy:** Revisit only when implementation exposes a concrete problem. Record every change in this file with its reason.
**Related:** [domain-model.md](domain-model.md) · [tech-stack.md](tech-stack.md) · [acceptance-scenarios.md](acceptance-scenarios.md) · [roadmap.md](roadmap.md)

---

## 1. Why FinPilot exists

FinPilot is a personal finance and money-management product. It is one of the major projects in a software-engineering portfolio, alongside:

- a Sales Order / Inventory / Supply Management platform
- **SentinelOps**, an incident and operations management platform

FinPilot must therefore **not** feel like another enterprise CRUD or admin dashboard. It exists to show a different side of engineering ability:

- consumer product thinking
- financial domain modelling
- meaningful analytics and data visualisation
- derived insights
- clean UX
- thoughtful backend architecture
- a credible path to automation and AI

It is built to be discussed in depth in an interview. The questions it should answer include "why is yours different from thousands of expense trackers?", "how are balances calculated?", "how do budgets interact with transactions?" and "where would AI actually add value?".

## 2. Product loop

**CAPTURE → ORGANIZE → UNDERSTAND → PLAN → ACT**

Every major feature must answer a real financial question. No feature is added just because other finance apps have it.

| Question | Answered by |
|---|---|
| Where does my money stand right now? | Financial position (net worth, liquid funds, **Available**) |
| Where did my money go? | Spending composition |
| What changed since last month, and why? | Month-over-month contribution analysis |
| Am I spending too fast? Will I go over? | Budget projection |
| What payments are coming? | Commitments |
| Am I progressing toward my goals? | Goals backed by earmarks |
| What deserves my attention? | Deterministic signals |
| Do FinPilot's numbers match reality? | Reconciliation |

## 3. Positioning

### 3.1 Thesis

> **An expense tracker tells you what you spent. FinPilot tells you why it changed and how much of your money is actually free.**

FinPilot combines three things. The combination is harder to copy than any single feature.

- **Truth:** a reconciled ledger and a correct financial position. Transfers and card payments are never double-counted.
- **Explanation:** attribution of change, with evidence (drill-down to the underlying transactions) behind every claim.
- **Planning:** budgets, commitments and goals, joined into one answer: what is actually free.

The overview has **one headline number, Available**. The explanation features form the evidence layer underneath it.

### 3.2 Why this positioning was chosen

We compared three strategies:

| | **Explain-first** | **Available-first** | **Runway-first** |
|---|---|---|---|
| Promise | "Where did it go, and why did it change?" | "What is my money free to do right now?" | "What can I spend until my next income?" |
| Differentiation | Moderate. Attribution is uncommon in basic trackers, but it's still analytics over the past. | High compared with basic trackers. Few join balances, commitments and goal reserves into one number. | Highest on paper, but already claimed by existing products ("safe-to-spend", "in my pocket"). |
| User value | Monthly and reflective. It doesn't answer a daily question. | Daily. It answers the question people ask before a purchase. | Daily, and strongest *if accurate*. |
| Complexity | Low–medium: aggregations, like-for-like windows, attribution maths. | Medium: liquidity flag, commitment occurrences and matching, earmarks, a defined horizon. | High: expected income, irregular income, projecting variable spending, confidence. |
| Interview value | High for SQL, analytics and correctness. | High for domain modelling: several sources of truth combined under explicit rules. | High, but hard to defend if the forecast is naive. |
| Domain concepts needed | Ledger, categories, periods. | + account eligibility, commitment occurrences, earmarks, liabilities. | + expected income, pay cycles, a forecast model. |
| Risk of misleading | Low–medium: partial-month comparisons, "caused" implying causation, trivial percentages. | Medium, **but errs on the safe side**. Without income it understates rather than overstates. Risks: an arbitrary horizon; subtracting an already-paid bill twice. | **Highest, and errs on the unsafe side.** A delayed salary or irregular freelance income leads to overspending. |
| Stage | **V1 (foundation)** | **V1 (headline)** | **V1.1** |

**Runway is not a separate feature.** It's the same Available formula with an expected-inflow term added and a horizon tied to income. V1 designs Available so that this extension is purely additive.

### 3.3 Naming

Avoid "Safe-to-Spend": "safe" implies a guarantee the system can't give. Use **"Available"** and label it **"before new income"**.

## 4. Critical review of the original concept

### 4.1 What is genuinely strong
- **Derived state as a rule.** Every number is traceable back to the ledger. There is no separate dashboard state.
- **Drafts before the ledger for AI and automation.** It's the right trust boundary and a real architectural seam (an ingestion inbox), not a slogan.
- **Month-over-month contribution analysis.** It explains *why* spending changed, not just that it changed.
- **Deterministic signals before AI.** They're testable, explainable and cheap, and they give AI something grounded to build on later.
- **Manual Quick Add over receipt OCR as the main capture method.** This was reasoned from user effort rather than trend.
- **Deferring auth, and choosing SQLite for V1** (with caveats; see [tech-stack.md](tech-stack.md)).

### 4.2 What still felt like a generic tracker, and how it changed
- A category donut, a transaction list, budget progress bars and goals with a typed-in "current amount" are the standard tracker set. **Goals are now backed by earmarks** (derived progress). Charts are chosen so each answers a different question.
- Several proposed "insights" only restated numbers ("upcoming commitments total ৳21,850"; "91% of dining budget used"). **A signal must make a comparison, a projection or an attribution, and it must carry evidence.**
- A 3-bar waterfall (Income → Expenses → Net) is three numbers dressed up as a chart. **The cash-flow bridge breaks expenses down by category**, or the numbers are shown as a plain statement.
- The original concept only looked backward. **Available adds the forward view**: what is free now.

### 4.3 Removed or reshaped

| Item | Problem | Decision |
|---|---|---|
| Goals with a manual "current progress" | Breaks the derived-state rule; drifts | Goals are backed by **earmarks**, and progress is derived |
| "Subscriptions" category | Describes *how* you pay, not what the money was for; overlaps with Commitments | **Removed.** Subscriptions are derived from commitments |
| A 9-section dashboard | Exactly the "collection of cards" to avoid | **4–5 zones** (§6) |
| Signals ranked near the bottom | Things that deserve attention shouldn't sit below the charts | Signals form the **Attention** zone near the top |
| A simple 3-bar waterfall | Adds little | A category-level bridge, or a plain statement |

### 4.4 Missing pieces added to V1
1. **Opening balances and reconciliation.** Manual trackers drift because people forget cash spends. The user enters the real balance, and an adjustment is posted that is excluded from analytics. A fast tracker with a wrong balance is useless.
2. **Refunds**, modelled as negative spending in the original category, not as income.
3. **Asset vs liability accounts.** A card purchase is an expense; a card payment is a transfer.
4. **An explicit definition of financial position:** net worth, liquid funds and Available.
5. **Commitment ↔ transaction matching**, with occurrence states (upcoming / due / paid / overdue / skipped).
6. **Transfer fees** (for example mobile-wallet cash-out), modelled as a transfer plus a linked fee expense.
7. **Search and filters** on transactions.
8. **A demo data generator that uses dates relative to today**, so the demo never looks stale.

Deferred to V1.1: expected income (runway), split transactions, CSV import/export with deduplication fingerprints, merchant memory, and an edit history (revision log).

## 5. Portfolio V1 boundary

**In V1:**
- Accounts: asset/liability, opening balance, reconciliation, a per-account Available eligibility flag.
- Ledger: income, expense, transfer (including fees and card payments), refund, opening balance, adjustment.
- Flat categories (income or expense kind).
- **Quick Add:** keyboard-first with sensible defaults, and usable at phone width.
- Transaction list with search and filters.
- Calendar-month category budgets with a commitment-aware projection.
- Recurring commitments (outflows only), with occurrence states, a Pay action and user-confirmed matching.
- Goals backed by earmarks, with shortfall detection.
- Derived position: net worth, assets/liabilities and **Available** (with its bridge).
- Cash flow, a category bridge and composition.
- Like-for-like month-over-month contribution.
- A deterministic signal engine (8 rule families).
- A dated demo seed with a one-command reset.
- A single fixed owner. Every table is owner-scoped from day one.

**Explicitly out of V1:** auth, multi-currency, split transactions, CSV import/export, category hierarchy, budget rollover, custom budget periods, notifications, AI, n8n, MCP, attachments, tags, investments, loans/amortisation, and credit interest, statements or minimum payments.

## 6. Overview hierarchy (information architecture only, not a design)

1. **Position:** Available as the headline, with net worth and assets/liabilities as context.
2. **Attention:** ranked signals. This zone absorbs budget risk, upcoming and overdue commitments, and goal shortfalls.
3. **This month:** the cash-flow bridge and month-over-month contribution, told as one story (what came in, where it went, what changed).
4. **Plans:** budget health and goal trajectory.
5. **Recent activity:** kept small; the full list has its own page.

Each zone answers a different question. No two charts may communicate the same thing.

## 7. Recorded product decisions

| Decision | Detail |
|---|---|
| Positioning | Truth + explanation + planning. The headline is **Available**: eligible balances, minus credit owed, minus commitments due within 30 days (including overdue), minus backed goal earmarks. No expected income. Runway is V1.1, built as an extension of the same formula. |
| Available eligibility | Stored **per account** (`included_in_available`). The default comes from the account type: cash, bank, mobile wallet and credit on; savings off. It can be configured per account, and is never permanently inferred from the type. |
| Goals | Backed by **earmarks** over real money. An earmark never creates money or changes a balance. Invariants prevent double allocation, and a shortfall is shown when the backing balance falls. This is not an envelope-budgeting system. |
| Credit accounts | In V1 as **liabilities**, kept narrow: a purchase is an expense that increases the liability; a payment is an asset→liability transfer and never a second expense. **No** interest, minimum payments, amortisation, statement reconciliation or credit forecasting. |
| Budgets | **Calendar month only.** No rollover, no custom periods. |
| Demo | V1 is optimised for local development: a deterministic seed and an easy reset. No demo infrastructure. The public demo strategy is decided at deployment by comparing a per-visitor disposable sandbox, a resettable shared demo, a read-only demo, and any simpler option, against: hosting platform, SQLite/Postgres compatibility, isolation, cost, complexity, abuse prevention and recruiter experience. |
| Auth | Not in V1. A fixed demo owner is used, resolved through one function, so auth can be added later. |
| AI / automation | Never writes to the ledger. Sources produce **drafts** that the user reviews and confirms. |
| Known V1 trade-off | If a goal earmark and a commitment describe the same future purpose, Available is reduced twice. This is conservative, documented and has help text. Goal↔commitment linking is deliberately not built. |
| UI principle | Domain sophistication must not leak into the UI unnecessarily: the model is rigorous, the product is simple (see [domain-model.md §14](domain-model.md)). |

## 8. Assumptions that were challenged

- **"Quick Add speed is the capture problem."** The bigger problem is *forgotten* entries, which makes reconciliation essential. Spending also happens on a phone, so Quick Add must be first-class at mobile width, even though navigation is desktop-first.
- **"SQLite → Postgres is the big interview story."** With integer money and migrations, the engine swap is mostly mechanical. The real multi-user change is **tenancy** (row scoping, auth, authorisation). Hence `owner_id` on every table from day one.
- **SQLite and deployment.** Hosts with ephemeral filesystems break SQLite, and the demo must be tamper-proof. This is decided at deployment (§7). It is not allowed to shape V1.
- **Gmail → n8n as the automation story.** In Bangladesh, bank and mobile-wallet notifications likely arrive by **SMS** far more often than by email. The durable, portable piece is FinPilot's **ingestion endpoint + draft inbox + idempotency keys**. n8n is just one client of it.
- **Credit accounts** are kept only with correct liability semantics. A half-modelled credit card is worse than none.
- **Goal "target date → on track"** is only meaningful when the required monthly contribution is compared with the actual contribution rate. It's shown only when a target date exists.

## 9. Evolution roadmap beyond V1

**V1.1 / polish**
- Expected income and the runway / "available until next income" view (forecast chart to month end or payday)
- CSV import/export with dedup fingerprints (the first idempotent-ingestion story)
- Split transactions (via `group_id`)
- Merchant memory for category suggestions
- Net worth over time (historical balance reconstruction)
- Transaction revision log
- User-set goal priority
- Category merge and hierarchy
- Keyboard shortcuts / command bar

**Production evolution**
- Auth (sessions → OAuth; Auth.js vs Better Auth decided then)
- Tenancy enforcement (composite FKs / Postgres row-level security)
- PostgreSQL migration
- Multi-currency with FX-at-date
- Backups and export, rate limiting, audit log, monitoring

**Automation / n8n**
1. Ingestion API: `POST /api/ingest` → draft, with an idempotency key, HMAC signature and source metadata.
2. Draft inbox UI.
3. n8n as one producer (email or forwarded SMS).
4. Webhook replay protection.

The endpoint and the inbox come first; n8n comes last.

**AI (only where it adds value)**
- (a) extraction → draft
- (b) category suggestion when merchant memory has no match
- (c) natural-language questions translated into calls to **existing deterministic query tools**, with answers that cite tool results
- (d) a narrative summary *of computed signals*

AI never computes financial numbers and never writes to the ledger. In the public demo, AI responses are cached or mocked, or put under a strict quota.

**MCP**
MCP fits only once (c) exists. The same deterministic services (`get_cashflow`, `explain_change`, `list_upcoming`, `create_draft`) are exposed to external agents with read-only or draft-only permissions. It's a sound design because the tools already exist, not a buzzword.

**Advanced system design**
- Materialised balance and aggregate tables, with invariant checks against recomputation
- Event log of ledger changes driving signal recomputation and notifications
- Background jobs (occurrence materialisation, nightly signals)
- Per-owner, per-month caching invalidated on ledger writes
- Read replicas and partitioning by owner

## 10. Strongest interview stories

1. **Ledger modelling:** single-row transactions with a derived entries view. Transfers net to zero by construction, refunds net out, and card payments aren't double-counted. Why not postings (see [domain-model.md §1](domain-model.md)).
2. **Derived state and source-of-truth rules.** Compute on read now, materialise later with invariant tests.
3. **Money and time correctness:** integer minor units, calendar dates vs instants, month boundaries in the owner's timezone, like-for-like comparison.
4. **Attribution maths:** offsetting contributions, and why the denominator is gross increases.
5. **Commitment-aware budget projection:** fixed vs variable spending comes from commitment matches, not category labels.
6. **The signal engine:** pure rules, materiality, ranking, evidence, per-period dismissal. Highly unit-testable.
7. **Available:** combining the ledger, expected obligations and intent under explicit rules. It errs on the safe side by design.
8. **Earmarks:** write-time invariants vs read-time reconciliation (shortfall).
9. **Ingestion boundary:** drafts, idempotency, the trust boundary for AI and automation.
10. **Tenancy-first evolution:** why the database-engine swap is the easy part.
11. **Acceptance-driven development:** a hand-verifiable scenario whose numbers must be reproduced exactly (see [acceptance-scenarios.md](acceptance-scenarios.md)).

## 11. UI direction inputs (principles only; the design is decided at the design gate)

FinPilot must immediately read as a serious **money-management** product. It must not look like:

- a motivational site or a lifestyle/wellness app
- a generic SaaS admin dashboard or an enterprise operations dashboard
- an accounting ERP, a crypto app or a banking clone

- **Navigation:** horizontal/top-level. No permanent desktop sidebar (the other portfolio projects are sidebar-heavy).
- **Palette direction:**
  - warm off-white/ivory background and clean white financial surfaces
  - charcoal/near-black type
  - refined coral/orange, peach/salmon, and deep burgundy/wine where appropriate
  - a very selective, subtle sky blue
  - restrained semantic green/red
- **Feel:** serious, polished, modern, financial, trustworthy, calm, data-driven, premium, but not boring, old-fashioned, cluttered, gimmicky, childish or decorative.
- **Layout:** excellent whitespace, subtle borders and shadows, strong information hierarchy, serious financial charts.
- **Avoid:** mountains, motivational illustrations, quotes, lifestyle imagery, excessive gradients, and decorative cards without a function.
- **Design gate:** the UI/UX architecture and visual design are agreed in a dedicated discussion during foundation stages F0–F2, and **must be approved before Stage 3** (see [roadmap.md](roadmap.md)). No generic dashboard design is improvised during implementation.
- **Design gate outcome (2026-09-22):** the approved direction is recorded in [design-direction.md](design-direction.md). It refines this palette into semantic tokens and lists the reference-driven proposals that would touch frozen decisions (§6, §9) as open items. Nothing in this baseline changes until those items are decided.
