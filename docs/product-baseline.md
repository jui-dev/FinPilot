# FinPilot — Product Baseline

**Status:** Frozen — approved 2026-09-22; product-architecture decisions of 2026-09-27 applied (§12; recorded in full in [roadmap.md §8](roadmap.md))
**Change policy:** Revisit only when implementation exposes a concrete problem, or a recorded product decision reopens a section. Record every change in this file with its reason.
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

It is built to be discussed in depth in an interview. The questions it should answer include "why is yours different from thousands of expense trackers?", "how are balances calculated?", "how does planning interact with the ledger without rewriting it?" and "where would AI actually add value?".

## 2. Product model

**RECORD → VERIFY → UNDERSTAND → AVAILABLE**

| Step | Question |
|---|---|
| **Record** | What actually happened? |
| **Verify** | Can I trust the financial record? |
| **Understand** | What happened to my money, and how is it changing? |
| **Available** | What can I actually use without consuming money already spoken for? |

- **Commitments** and **Protected money** are not steps after Understand. They are the **inputs** to Available.
- **Notice** (signals: *what deserves my attention?*) runs across every step.
- **Plan** (Monthly Plan: *what do I intend to do this month?*) is **optional**. No other feature requires it.

*(Until 2026-09-27 the loop read CAPTURE → ORGANIZE → UNDERSTAND → PLAN → ACT, with budgets and goals as planning steps; see §12.)*

Every major feature must answer a real financial question. No feature is added just because other finance apps have it, and none exists to make the product look larger. The ledger always wins, planning never rewrites history, derived values stay derived, and important figures carry evidence.

### 2.1 Product responsibilities (no two features share a primary question)

| Feature | Owns | Primary question | Not its job |
|---|---|---|---|
| **Accounts** | position and balance trust | What do I have, what do I owe, and can I trust those balances? | what is free to use (Available) |
| **Activity** | exact ledger evidence | What exactly happened in the ledger? | metrics or summaries |
| **Cash flow** | a period, and attribution between two periods | What happened to my money this month, and why did it change? | patterns across many months (Trends), intentions (Monthly Plan) |
| **Commitments** | scheduled obligations | What money am I already obligated to pay, and when? | recording payments without an action; subscriptions as a feature |
| **Protected money** (shown as **Set aside**) | deliberate reservation of real asset money | What have I deliberately set aside, and is it still really there? | moving money; separate goals and reserves |
| **Available** | what is free after applicable obligations and protection (derived) | How much can I use now without touching money already spoken for? | storing a balance; counting expected income or plans |
| **Signals** | selecting and ranking what deserves attention | Of everything true right now, what deserves my attention? | explaining (the owning feature does); an inbox |
| **Overview** | composing the most important existing answers | What should I know right now, and what should I do next? | any figure of its own |
| **Trends** *(after V1)* | shape across three or more complete periods | Is this a pattern or a one-off? | a single period's attribution |
| **Monthly Plan** *(after V1, optional)* | intent vs reality | What do I intend to spend or set aside this month, and how did that go? | feeding Available; re-showing Cash flow |

## 3. Positioning

### 3.1 Thesis

> **An expense tracker tells you what you spent. FinPilot tells you why it changed and how much of your money is actually free.**

FinPilot combines three things. The combination is harder to copy than any single feature.

- **Truth:** a reconciled ledger and a correct financial position. Transfers and card payments are never double-counted.
- **Explanation:** attribution of change, with evidence (drill-down to the underlying transactions) behind every claim.
- **Planning:** commitments and protected money, joined into one answer: what is actually free (**Available**). An optional Monthly Plan (after V1) adds intent vs reality without ever changing that answer.

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
- A category donut, a transaction list, budget progress bars and goals with a typed-in "current amount" are the standard tracker set. **There is no Goals product:** money set aside is backed by earmarks over real money, and progress toward an optional target is derived (§4.3). Charts are chosen so each answers a different question.
- Several proposed "insights" only restated numbers ("upcoming commitments total ৳21,850"; "91% of dining budget used"). **A signal must make a comparison, a projection or an attribution, and it must carry evidence.**
- A 3-bar waterfall (Income → Expenses → Net) is three numbers dressed up as a chart. **The cash-flow bridge breaks expenses down by category**, or the numbers are shown as a plain statement.
- The original concept only looked backward. **Available adds the forward view**: what is free now.

### 4.3 Removed or reshaped

| Item | Problem | Decision |
|---|---|---|
| Goals with a manual "current progress" | Breaks the derived-state rule; drifts | Backed by **earmarks**, with derived progress. *(Superseded 2026-09-27 by the row below: Goals are no longer a separate concept.)* |
| "Subscriptions" category | Describes *how* you pay, not what the money was for; overlaps with Commitments | **Removed.** Subscriptions are derived from commitments |
| Goals and a separate "reserves" idea (2026-09-27) | Two products solving the same problem; a required target that doesn't fit an emergency reserve | **One concept: Protected money**, shown to the user as **Set aside**, with an optional target ([domain-model.md §9](domain-model.md)). A target date is deferred beyond V1 (2026-09-28). |
| Budgets alongside a monthly plan (2026-09-27) | Two ways to state intent vs actual | **Monthly Plan replaces Budgets**: optional, after V1, never an input to Available ([domain-model.md §7](domain-model.md)) |
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

**In V1** (roadmap Stages 3–10; the V1.0 candidate):
- Accounts: asset/liability, opening balance, reconciliation, a per-account Available eligibility flag for **asset** accounts, set from the type default (liabilities always count). No user-facing toggle to edit it in V1 (2026-09-28).
- Ledger: income, expense, transfer (including fees and card payments), refund, opening balance, adjustment.
- Flat categories (income or expense kind).
- **Quick Add:** keyboard-first with sensible defaults, and usable at phone width.
- Transaction list with search and filters.
- Recurring commitments (outflows only), with occurrence states and a Pay action. Match suggestions and weekly schedules are deferred beyond V1 (§12).
- Protected money, shown as **Set aside**: backed by earmarks, with an optional target (progress and still needed only when one exists) and shortfall detection. No target date or on-track in V1 (§12).
- Derived position: net worth, assets/liabilities and **Available** (with its bridge).
- Cash flow and composition, with evidence behind every figure. No category bridge chart (§12).
- Like-for-like month-over-month contribution.
- A deterministic signal engine: 4 rule families in V1 (month-over-month attribution, commitments, protected-money cover, reconciliation) (§12).
- An Overview composed from existing answers (§6).
- A dated demo seed with a one-command reset, with situations that demonstrate every V1 signal family.
- A single fixed owner. Every table is owner-scoped from day one.

**After the V1 candidate (planned product depth):** extended demo history, **Trends** (complete periods only), and the optional **Monthly Plan**, which replaces Budgets and keeps the commitment-aware projection. Acceptance A-40 and M1-4 are deferred with it.

**Explicitly out of V1:** auth, multi-currency, split transactions, CSV import/export, category hierarchy, notifications, AI, n8n, MCP, attachments, tags, investments, loans/amortisation, and credit interest, statements or minimum payments.

**Out of scope unless a later decision deliberately reopens it (2026-09-27):**
- separate Goals and Reserves products; Budgets alongside Monthly Plan; envelope or zero-based budgeting; budget rollover
- Subscriptions as a separate feature; recurrence as a separate feature; a commitment calendar
- a Signals inbox or read states; push notifications; an Insights navigation item; generic AI-written insights
- financial-health scores; streaks or gamification; custom dashboards
- a net-worth trend (for now); a savings-rate chart; a category colour system
- a debt payoff planner; credit-limit or utilisation modelling; investments; multi-currency; tags
- forecasting beyond explicitly approved deterministic projections; expected income and runway until later

## 6. Overview hierarchy (information architecture only, not a design)

**Narrowed 2026-09-27.** The Overview answers *what should I know right now, and what should I do next?* It owns no financial truth and composes existing answers:

1. **Available:** the headline, as the entry point to its bridge. The Overview surfaces Available; it does not own it.
2. **Attention:** ranked signals. This zone absorbs upcoming and overdue commitments, protected-money shortfalls and verification issues, so they get no widgets of their own.
3. **This month:** a concise current-month outcome from Cash flow, linking to it.

**Not on the Overview:** recent activity (Activity exists), copies of Cash flow's charts, a full commitment list, protected-money or commitment widgets that repeat Attention, Overview-only metrics, and any card added to fill space.

*(Superseded 2026-09-27: the earlier five zones, which included the cash-flow bridge and month-over-month story, a "Plans" zone of budget health and goal trajectory, and Recent activity.)*

Each zone answers a different question. No two charts may communicate the same thing.

## 7. Recorded product decisions

| Decision | Detail |
|---|---|
| Positioning | Truth + explanation + planning. The headline is **Available**: eligible asset balances, minus all credit owed, minus commitments due within 30 days (including overdue, whatever account they are expected from), minus covered (backed) set-aside money on eligible accounts, never the nominal reserved amount. No expected income and no Monthly Plan. Runway is V1.1, built as an extension of the same formula. |
| Available eligibility | Stored **per account** (`included_in_available`). The default comes from the account type: cash, bank, mobile wallet and credit on; savings off. **Asset** accounts can be configured in the model, and eligibility is never permanently inferred from the type. V1 exposes no toggle to change it (2026-09-28). **Liabilities always count** and can't be excluded (2026-09-27; [domain-model.md §5](domain-model.md)). Archived accounts follow the same rules; there is no archive filter. |
| Protected money (formerly Goals) | One concept, shown to the user as **Set aside** (2026-09-28): a goal-like use has a target, a reserve-like use has none. There is no separate Goals product. An **optional** target is intention only; the money set aside is **earmarks** over real money, and only backed earmarks affect Available. An earmark never creates money or changes a balance. Invariants prevent double allocation, and a shortfall is shown when the backing balance falls. Still needed = max(target − covered, 0). Target reached releases nothing; Release is deliberate. A Savings account is not automatically set aside: account exclusion and protection stay distinct. Target dates, on-track and required monthly contributions are deferred beyond V1; planned contributions belong to Monthly Plan. This is not an envelope-budgeting system. |
| Credit accounts | In V1 as **liabilities**, kept narrow: a purchase is an expense that increases the liability; a payment is an asset→liability transfer and never a second expense. **No** interest, minimum payments, amortisation, statement reconciliation or credit forecasting. |
| Monthly Plan (replaces Budgets) | **Optional**, after V1, calendar month only. No rollover, no custom periods, never an input to Available. |
| Demo | V1 is optimised for local development: a deterministic seed and an easy reset. No demo infrastructure. The public demo strategy is decided at deployment by comparing a per-visitor disposable sandbox, a resettable shared demo, a read-only demo, and any simpler option, against: hosting platform, SQLite/Postgres compatibility, isolation, cost, complexity, abuse prevention and recruiter experience. |
| Auth | Not in V1. A fixed demo owner is used, resolved through one function, so auth can be added later. |
| AI / automation | Never writes to the ledger. Sources produce **drafts** that the user reviews and confirms. |
| Known V1 trade-off | If a protected-money earmark and a commitment describe the same future purpose (a sinking fund), Available is reduced twice. This is conservative, documented and has help text. A link between them is deliberately not built in V1, but must stay possible. |
| UI principle | Domain sophistication must not leak into the UI unnecessarily: the model is rigorous, the product is simple (see [domain-model.md §14](domain-model.md)). |

## 8. Assumptions that were challenged

- **"Quick Add speed is the capture problem."** The bigger problem is *forgotten* entries, which makes reconciliation essential. Spending also happens on a phone, so Quick Add must be first-class at mobile width, even though navigation is desktop-first.
- **"SQLite → Postgres is the big interview story."** With integer money and migrations, the engine swap is mostly mechanical. The real multi-user change is **tenancy** (row scoping, auth, authorisation). Hence `owner_id` on every table from day one.
- **SQLite and deployment.** Hosts with ephemeral filesystems break SQLite, and the demo must be tamper-proof. This is decided at deployment (§7). It is not allowed to shape V1.
- **Gmail → n8n as the automation story.** In Bangladesh, bank and mobile-wallet notifications likely arrive by **SMS** far more often than by email. The durable, portable piece is FinPilot's **ingestion endpoint + draft inbox + idempotency keys**. n8n is just one client of it.
- **Credit accounts** are kept only with correct liability semantics. A half-modelled credit card is worse than none.
- **Protected money "target date → on track"** is only meaningful when the required monthly contribution is compared with the actual contribution rate. *Deferred beyond V1 (2026-09-28):* it would duplicate Monthly Plan's planned contributions, so V1 has no target date.

## 9. Evolution roadmap beyond V1

**V1.1 / polish**
- Expected income and the runway / "available until next income" view (forecast chart to month end or payday)
- CSV import/export with dedup fingerprints (the first idempotent-ingestion story)
- Split transactions (via `group_id`)
- Merchant memory for category suggestions
- ~~Net worth over time (historical balance reconstruction)~~ *Rejected for now (2026-09-27):* its monthly change is essentially Left over less adjustments (A-14), so it would largely duplicate Trends' Income vs Spending.
- Transaction revision log
- User-set protected-money priority
- Category merge and hierarchy
- Keyboard shortcuts / command bar

**Production evolution**
- Auth (sessions → OAuth; Auth.js vs Better Auth decided then)
- Tenancy enforcement (composite FKs / Postgres row-level security)
- PostgreSQL migration
- Multi-currency with FX-at-date
- Backups and export, rate limiting, audit log, monitoring

**Automation / n8n**
1. Ingestion API: `POST /api/ingest` → draft (a **Transaction Candidate**), with an idempotency key, HMAC signature and source metadata.
2. Draft (candidate) inbox UI: the user reviews every candidate before it reaches the ledger.
3. CSV import as the first producer.
4. n8n as one producer (email or forwarded SMS).
5. Receipt or screenshot capture as a later producer.
6. Webhook replay protection.

The endpoint and the inbox come first; every producer, n8n included, comes after them and shares the same pipeline ([roadmap.md §4](roadmap.md)).

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
5. **Commitment-aware projection** (Monthly Plan, after V1; formerly the budget projection): fixed vs variable spending comes from commitment matches, not category labels. V1 records every match, so the foundation exists before the plan.
6. **The signal engine:** pure rules, materiality, ranking, evidence, per-period dismissal. Highly unit-testable.
7. **Available:** combining the ledger, expected obligations and intent under explicit rules. It errs on the safe side by design.
8. **Protected money and earmarks:** write-time invariants vs read-time reconciliation (shortfall); a target is intent, a reservation is an allocation; reaching a target releases nothing.
9. **Ingestion boundary:** drafts, idempotency, the trust boundary for AI and automation.
10. **Tenancy-first evolution:** why the database-engine swap is the easy part.
11. **Acceptance-driven development:** a hand-verifiable scenario whose numbers must be reproduced exactly (see [acceptance-scenarios.md](acceptance-scenarios.md)).

## 11. UI direction inputs (principles only; the design is decided at the design gate)

FinPilot must immediately read as a serious **money-management** product. It must not look like:

- a motivational site or a lifestyle/wellness app
- a generic SaaS admin dashboard or an enterprise operations dashboard
- an accounting ERP, a crypto app or a banking clone

- **Navigation:** horizontal/top-level. No permanent desktop sidebar (the other portfolio projects are sidebar-heavy).
- **Palette direction** (as implemented; tokens in [design-direction.md §2](design-direction.md)):
  - a warm off-white foundation and clean white financial surfaces
  - navy-tinted near-black type
  - deep navy for identity and emphasis; an ocean blue for interaction; the blue family, not red or coral, for financial direction; a light cyan for quiet highlighted surfaces
  - coral only as the brand accent and the global Add action, never for spending, direction, status or errors
  - restrained semantic green/amber/red
- **Feel:** serious, polished, modern, financial, trustworthy, calm, data-driven, premium, but not boring, old-fashioned, cluttered, gimmicky, childish or decorative.
- **Layout:** excellent whitespace, subtle borders and shadows, strong information hierarchy, serious financial charts.
- **Avoid:** mountains, motivational illustrations, quotes, lifestyle imagery, excessive gradients, and decorative cards without a function.
- **Design gate:** the UI/UX architecture and visual design are agreed in a dedicated discussion during foundation stages F0–F2, and **must be approved before Stage 3** (see [roadmap.md](roadmap.md)). No generic dashboard design is improvised during implementation.
- **Design gate outcome (2026-09-22):** the approved direction is recorded in [design-direction.md](design-direction.md). It refines this palette into semantic tokens and lists the reference-driven proposals that would touch frozen decisions (§6, §9) as open items. Nothing in this baseline changes until those items are decided.

## 12. Change log

| Date | Change | Reason |
|---|---|---|
| 2026-09-28 | **Stage 8 Slice 0: Available decisions** (recorded in full in [domain-model.md §10](domain-model.md)). §5: the V1 asset eligibility flag is set from the type default, with no user-facing toggle. §7: Available subtracts commitments whatever their expected account (O-1 resolved), and covered set-aside money rather than the nominal reserved amount. Archived accounts follow the same rules. No acceptance value changed. | O-1 had to be resolved before Available froze; "backed" needed to be stated as binding against "reserved". |
| 2026-09-28 | **Stage 7 product decision.** §2.1, §4.2, §4.3, §5, §7, §8: "Set aside" is the single user-facing term for protected money; there is no separate Goals product (stale present-tense Goals wording corrected, history marked as superseded); V1 keeps an optional target, derived progress, covered, shortfall and still needed = max(target − covered, 0); target date, on-track and required monthly contributions are deferred beyond V1. O-1 and P-1 stay open. No acceptance value changed. | One intention must not be entered twice; target dates would duplicate Monthly Plan's planned contributions. |
| 2026-09-27 | **Product-architecture decisions** (recorded in full in [roadmap.md §8](roadmap.md)). §1, §2: the product model becomes Record → Verify → Understand → Available, with Commitments and Protected money as its inputs, Notice across every step, and Plan optional; the responsibility matrix is added (§2.1). §3.1, §4.3, §5, §7: Goals → Protected money (optional target); Budgets → the optional Monthly Plan after V1; liabilities always count in Available; the out-of-scope list is added. §6: the Overview is narrowed to Available, Attention and this month. §9: net worth over time rejected for now; the candidate pipeline before every producer. §10: stories 5 and 8 re-scoped. No acceptance value changed. | Every feature must own one distinct question; planning must stay optional; an account preference must not be able to overstate Available. |
| 2026-09-27 | **Palette direction updated** (§11) to the implemented visual system: the reference palette, coral as the brand and global Add accent only, financial direction in the blue family. | The navy/cream freeze below was superseded when the palette and the Cash flow, Activity and Accounts redesigns were built against the approved reference ([design-direction.md §10](design-direction.md)). |
| 2026-09-27 | *(Superseded by the entry above.)* **Palette frozen** (§11): navy and cream replace burgundy/wine; coral is only a rare brand accent. | Visual-system boundary: the direction approved at the Milestone B review was tested against the real product and recorded as tokens in [design-direction.md](design-direction.md). |
| 2026-09-27 | **Milestone B review: V1 narrowed** (§5). Signal families narrowed to 2, 4, 5 and 7 (the ones the acceptance scenario asserts). Commitment match suggestions and weekly schedules deferred beyond V1. Budgets kept, narrowed. No category bridge chart; charts are built only when their concept exists. No acceptance number changed. | Keeps Portfolio V1 small and coherent without weakening the thesis: Available and its inputs stay complete. Details in [roadmap.md §7](roadmap.md). The palette in §11 is revisited, and frozen, in the visual-system boundary. |
