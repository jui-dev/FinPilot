# FinPilot — Design Direction

**Status:** Describes the visual system as implemented on 2026-09-27 (Cash flow, Activity and Accounts, built against the reference palette). Where this file and the committed UI disagree, the UI is the truth and this file is corrected. The open decisions in §9 stay open until they are resolved.
**Change policy:** Update this file when implementation shows that a rule doesn't work. Record each change in §10 with its reason. This file is a north star, not a pixel spec: stages build real UI against it; there are no standalone mocks. The tokens themselves live in [globals.css](../src/app/globals.css).
**Related:** [product-baseline.md §11](product-baseline.md) · [domain-model.md §14](domain-model.md) · [roadmap.md](roadmap.md)

---

## 1. Character and principles

**A calm, light financial workspace.** It pairs the credibility of financial software with the polish of consumer fintech. Its seriousness comes from hierarchy, restraint and precise numbers, not from dullness or a dark, bank-like dashboard.

**Principles:**
1. **Outcome before detail.** A page leads with its answer; the figures it comes from follow.
2. **Evidence behind important figures.** A figure that summarises transactions opens the rows behind it.
3. **One visualisation, one analytical question.** No chart repeats what another already says ([product-baseline.md §6](product-baseline.md)).
4. **Colour carries stable semantics** (§2). It is never assigned to fill space.
5. **Financial direction is not an error state.** Spending more is not "wrong"; red is kept for what is.
6. **Responsive layouts recompose rather than shrink** (§8).
7. **Dense ledger information stays scannable:** aligned columns, fixed-width amounts, day grouping.
8. **No duplicate features, metrics or charts** answering the same question.
9. **Polish never obscures ledger correctness.** The domain stays rigorous and the UI stays simple ([domain-model.md §14](domain-model.md) is binding).
10. **Shared visual language, not identical layouts.** Each screen is composed around its own question (§6).

- **Numbers first.** Copy is a short label or a single sentence, never a paragraph.
- **Not:** a newspaper, an ERP, a trading terminal, an admin template, a stock shadcn look, a lifestyle or motivational site, or a playful budgeting app.
- **Banned:** greetings or quotes that take space from the first screen; photos and illustrations; merchant logos (FinPilot has no merchant entity); glassmorphism, neon, decorative gradients; decorative charts.

## 2. Colour: semantic tokens

These tokens are the whole palette: the default Tailwind palette is removed ([globals.css](../src/app/globals.css)), so a component cannot drift off it.

| Token | Hex | Means | Used for | Never |
|---|---|---|---|---|
| `canvas` | `#F8F7F3` | the foundation | app background | panels |
| `surface` / `surface-subtle` / `surface-hover` | `#FFFFFF` / `#FAF7F2` / `#F1ECE3` | cards and overlays / bands and wells / hover | | |
| `line` / `line-strong` | `#E7E1D6` / `#9C9485` | dividers and panel edges / control edges (3.0:1 on white) | | a divider in `line-strong` |
| `ink` / `ink-2` | `#172033` / `#4F5869` | text and figures / labels and metadata | | |
| `ink-3` | `#8B919C` | quiet marks | icons, placeholders | **any text a person must read** |
| `navy` / `navy-hover` | `#1F385A` / `#182D49` | identity and the strongest emphasis | logo, page and panel titles, key figures, the primary button, the active destination; **higher** in a change explanation | status |
| `ocean` | `#46678D` | interaction and analysis | focus, the selected state, evidence links, info text; ranked bars; **lower** in a change explanation | status |
| `mist` | `#D8F3F5` | a quiet highlighted surface | the hero of a page (Left over, Net worth), selected backgrounds, info tags, icon wells | text |
| `tide` | `#96BED4` | supporting marks | lighter segments of the composition strip | text or anything that must be read (2.0:1 on white) |
| `coral` | `#F06A4E` | the brand and the one global action | the logo stripe, **+ Add** and the phone **+** (ink label, 5.3:1) | spending, higher spending, any financial direction, totals, status, warnings, errors, text |
| `positive` / `-soft` | `#2B6F4F` / `#E4F1EA` | money arrived / verified | "+" on income and refunds, the Verified tag | "spending went down" |
| `warning` / `-soft` | `#9A5B0B` / `#FBF0DC` | needs a look | a changed checkpoint | spending increases |
| `negative` / `-soft` | `#B42318` / `#FBE9E6` | wrong or destructive | errors, Delete, a failed toast, the destructive confirmation | spending, "higher" |

**Rules:**
- **Coral is a brand and action accent, never a meaning.** It is not spending, higher spending, a negative direction, a warning or an error. Coral and `negative` are only 2.2:1 apart, so they are kept apart by role, and red always comes with a word and an icon.
- **Analytical direction uses the blue family:** navy for higher, ocean for lower. Direction is always carried by the word, the sign and the arrow; colour only repeats it.
- **Error and destructive semantics stay separate** from direction: `negative` means a plan is broken, data is wrong or something is being deleted.
- **Spending is never red and never green.**
- **Navy is identity and emphasis, never status.** The header stays white; navy is not a page background.
- **One selected state:** `mist` background, `ocean` text, `ocean` edge, for chips, segmented controls and active filters.
- **Status is always icon + word + colour,** never colour alone.
- **Contrast (measured):** ink 16.3 and ink-2 7.2 on white; ink-2 6.7 on canvas and 6.2 on mist; navy 11.9 on white and 10.2 on mist; ocean 5.9 on white and 5.0 on mist; ink on coral 5.3. Control edges, focus and the navy tab mark are ≥ 3:1.
- **Set aside (protected money) has no dedicated hue in V1** (2026-09-28): covered money is navy, the rest of a target is a mist track, and a shortfall is a warning tag plus a red-outlined gap in the target bar. The colour of commitments is not decided; no hue is reserved for it.

## 3. Typography and numbers

- **Faces:** **Hanken Grotesk** (400/500/600/700) for the whole interface, with **Noto Sans Bengali** for the ৳ glyph, both through `next/font`. **Source Serif 4** sets the FinPilot wordmark and nothing else.
- **Scale:** seven steps and no others; the stock and arbitrary sizes are removed from the theme. Weight is chosen separately.

  | Step | Size / line height | Used for |
  |---|---|---|
  | `display` | 32 (28 on phones) / 1.1 | the one hero figure: Left over, Net worth, the Quick Add amount |
  | `title` | 28 (24 on phones) / 1.15 | page titles |
  | `figure` | 20 (18 on phones) / 1.2 | headline figures and the change headline |
  | `heading` | 16 / 1.35 | panel titles, overlay titles, the month, empty-state titles, Activity's scope |
  | `body` | 14 / 1.45 | copy, row names, **list amounts at 600** |
  | `meta` | 13 / 1.4 | labels, metadata, notes, day headers, hints, compact controls |
  | `micro` | 12 / 1.25 | tags, tab labels, column headers, key hints |

  Relative sizes are allowed only for a glyph inside a figure (the smaller ৳).
- **Figures** use tabular lining numerals.
- **Money formatting:**
  - South Asian grouping (৳2,30,163), whole taka, always via the domain `Money` formatter.
  - A true minus sign (U+2212); the currency symbol is smaller and in `ink-2`.
  - Debt is written in words ("৳6,000 owed"). Signs appear only in flows and changes.
- **Amounts in lists:** right-aligned in a fixed-width column, `body` at 600. Money coming in shows a green "+"; everything else is `ink`.

## 4. Workspace, surfaces, shape

- **Workspace:** one width shared by the navigation and every page: at most **1360px**, with 16 / 24 / 32px gutters on phones / tablets / desktops (1296px of content on a desktop).
- **Grid:** 4px base. Card padding 20px; gaps 16px (dense) / 20px (default). Density comes from layout, never from type below 12px.
- **Cards:** white, 1px `line`, radius 12px, a soft `shadow-card`. The core pages compose their own cards around their question; secondary pages (Settings) use the shared `Panel` with `PanelHeader` and `PanelBand`. Inside a card, use rules and whitespace, never nested cards.
- **A card that holds sticky rows clips its overflow** (`overflow-clip`), never hides it: a hidden overflow makes the card their scroll container.
- **Controls:** radius 8px. Chips and badges are pills.
- **Overlays** (dialog, sheet, side panel): one soft shadow over a scrim of `ink` at 30%.
- **Icons:** lucide, 1.75 stroke, 16–20px. Seeded categories and account types have fixed icons; **user-created categories get a generic tag icon**, so correctness never depends on hand-assigning icons or colours.

## 5. Visualisation

- **Each visualisation answers one named question**, stated by its title or headline. Only derived values are drawn; no chart ever contains illustrative data.
- **Bars sit beside the exact figure, never instead of it,** and are hidden from assistive technology. The figure and the row carry the meaning; the row, not the mark, opens the evidence.
- **Colour never identifies or ranks a category;** the text label does. This keeps user-created categories correct with no manual colour assignment.
- **Built today (Cash flow):**
  - **Composition strip:** the month's spending as one bar, largest category first. Its tones (navy, ocean, tide) only separate neighbouring segments.
  - **Ranked bars:** one per category, in one blue, drawn against the largest; every spent category is listed.
  - **Change magnitude bars:** one per material driver in What changed, navy for higher and ocean for lower, drawn against the largest change.
- **Fact vs expectation** (for Commitments, Protected money, Available and Monthly Plan): **filled** = has happened; **soft tint + outline** = spoken for or expected; **empty with a red outline** = missing (shortfall, over-committed). Expected amounts always carry a date or a purpose.
- **Hand-built in CSS (SVG where a shape needs it), with no chart library** ([tech-stack.md](tech-stack.md)). A new chart is added only when its concept exists and its question isn't already answered.
- **Approved future directions** (2026-09-27; recorded because their owning concepts are now decided, not yet designed):

  | Owner | Visual | The one question it answers |
  |---|---|---|
  | Available (Stage 8) | one explainable segmented bar / bridge: what is spoken for (credit owed, commitments, covered set aside) and what remains | How much of my money is already spoken for, and by what? |
  | Protected money (Stage 7) | a progress bar **only when a target exists**; covered and short stay distinguishable | How close am I, and is it all still really there? |
  | Trends (Stage 12) | **one** longitudinal Income vs Spending visual over complete months; a category sparkline only later, if it proves useful | Is the gap between what I earn and spend a pattern or a one-off? |
  | Monthly Plan (Stage 13) | actual vs intention / projection per planned line | Am I on pace against what I intended? |

  Cash flow's ranked bars never gain plan markers; plans keep their own visual. The Overview reuses the Available visual rather than adding charts, and Signals have none.
- **Rejected for now:** a savings-rate line (it redraws Income vs Spending); a net-worth line (its monthly change is essentially Left over, A-14); donut; Sankey; stacked category area; heatmap calendar; a commitment calendar; any category colour system; charts on Signals; duplicate charts on the Overview.

## 6. Screens

Each core page answers one question. Keeping them distinct is what prevents features and charts from being duplicated across pages.

### Cash flow: "What happened to my money this month?"

Outcome-first, read in one order:
1. **The month:** navigation and its period ("1–27 Sep 2026, so far" or "Full month").
2. **The outcome:** **Left over** as the hero, with the **savings rate**; **Income** and **Spending** beside it, each opening the transactions behind it.
3. **Where it went** — *composition:* where did the spending go?
4. **What changed** — *explanation:* why is this month different from the comparison period? The direction and size first, both totals, then the drivers, each opening both sides as evidence.

Where it went and What changed are different analytical jobs, not interchangeable widgets.

### Activity: "What exactly happened in the ledger?"

The evidence workspace, not a dashboard. One card holds:
1. **Filters:** search, Period, Account, Category, Type, Clear. They live in the URL, so any view can be linked to and reloaded.
2. **Scope:** what the filters select, the number of entries, Spent and Income for the view, and a link to Cash flow when the view has a month's shape.
3. **Rows,** grouped by day under sticky day headers: **Description · Category · Account · Amount** on desktop. A row opens its transaction in a side panel, marked as current while open.

It has no metric cards.

### Accounts: "What do I have, what do I owe, and can I trust those balances?"

1. **Position:** **Net worth** as the hero, with **Own** and **Owe**.
2. **One ledger of accounts,** grouped by purpose (Everyday money, Savings, Credit cards, then Archived), not separate cards. Each row reads: account, balance, verification, **Verify**, management.
3. **Verification is a first-class trust state:** *Not verified yet* (neutral), *Verified* (positive), *Changed since* a checkpoint (warning), with evidence written neutrally: what the ledger records for that day, what was verified, and a link to the entries through that day. It never claims which entry changed.
4. **Verify** sits beside the state it resolves; **Archive / Restore / Delete** are management actions at the row's end, shown only when allowed.

### Set aside: "What am I keeping money for, and is it still really there?"

A page of the Available area, reached through its local switch (Available · Commitments · Set aside; roadmap §8.3). One card of items, no metric cards; a one-line total only when there are two or more.

1. **Each item:** its name; **one number** ("৳1,20,000 set aside") while everything set aside is covered, or "৳1,10,000 of ৳1,20,000 still covered" with a *short* tag when a balance has fallen.
2. **A target line and bar only when a target exists:** target, still needed (from what is covered) and progress; *Target reached* when covered meets it.
3. **Held in:** the accounts behind it, with any shortfall named on its account.
4. **Actions:** Set aside (more), Release (explicit, never pre-filled), Edit; Archive lives in Edit, final, and refused with its reason while money is set aside. Archived items are listed read-only.

## 7. Interaction states

| State | Treatment |
|---|---|
| Hover | `surface-hover` background; control edges darken to `ink-2` |
| Focus | 2px `ocean` outline, 2px offset; inputs and selects: an `ocean` edge and 1px ring. Always visible on keyboard focus. |
| Active nav | `navy` text + 2px `navy` underline; on phones, a `navy` mark and icon on the tab |
| Selected (chip, segment, active filter) | `mist` background, `ocean` text, `ocean` edge |
| Buttons | primary: `navy` fill · the global Add: `coral` fill, `ink` label · secondary: white with a `line-strong` edge · ghost: text only |
| Destructive | inline: `negative` text; the confirming button of a destructive dialog: a filled `negative` button, never the brand colour |
| Evidence link | an `ocean` underline (50%, full on hover) on an amount or phrase that opens the rows behind it; a whole row when the row is the evidence |
| Disabled | 45% opacity, no pointer |
| Pending | the control keeps its size and shows a spinner; no layout shift |
| Success | a toast stating the effect, with **Undo** where the action is reversible ("Saved −৳450 · Cash") |
| Error | an inline message under the field in plain language; no apology |
| Empty | one sentence on what would appear, plus one action. No illustration. |

- **Quick Add is the one global action** (`N` / **+ Add**): a dialog on desktop and a bottom sheet on mobile.
- **Motion:** at most 150–250ms, and only for meaning. `prefers-reduced-motion` is respected.

## 8. Responsive

- **Recompose, don't shrink.** Each core page changes its information hierarchy across phone, tablet and desktop rather than squeezing desktop columns:
  - **Cash flow:** on phones the month leads, then Left over with Income and Spending side by side under it; on wider screens they sit beside the outcome, and Where it went and What changed sit side by side on desktop.
  - **Activity:** phones show two-line rows (description and details, amount); tablets add a Category column and move the account under the description; desktops show all four columns.
  - **Accounts:** Net worth leads at every width, Own and Owe beside or under it; on desktop the ledger aligns balances, verifications and Verify in shared columns; on phones a row's actions wrap onto its own lines, keep their words and a 40px touch height.
- **Navigation:** top navigation from 768px; below it, a bottom tab bar with a centred coral **+**.
- **Editing:** side panels on desktop; Quick Add as a bottom sheet with the keypad first on phones.
- **The first viewport states the page's primary answer** (Left over on Cash flow, Net worth on Accounts).
- **No horizontal page scroll at 390px.** Checked at 390, 820 and 1280px for every change to the core pages and their overlays.

## 9. Open decisions (raised by the reference images)

| # | Topic | Conflict with a frozen decision | Default until resolved |
|---|---|---|---|
| D1 | Overview gains secondary panels (category composition, income vs spending, budgets, goals, upcoming, recent) | [product-baseline.md §6](product-baseline.md) caps the Overview at 4–5 zones | **Resolved 2026-09-27: no secondary panels.** The Overview (Stage 10) is narrowed to Available, Attention and a concise current-month outcome; composition, commitments, protected money and recent activity stay with their owning pages. |
| D2 | Net worth trend line | Net worth over time is **V1.1** (baseline §9; tech-stack change log) | **Resolved 2026-09-27: rejected for now.** It would largely redraw Trends' Income vs Spending (A-14). Net worth stays a figure with Own and Owe. |
| D3 | A "Next income" card | Available is "before new income"; expected income is **V1.1** (runway) | Not shown |
| D4 | Donut chart for categories | Baseline §4.2 names the category donut as part of the generic tracker set | Ranked bars / composition strip (§5) |
| D5 | "Subscriptions" as a category | Removed by the baseline; derived from commitments | Subscriptions appear only as commitments |
| D6 | Receipt capture, AI search, "Insights" nav | AI, OCR and drafts are out of V1; the page is named "Cash flow" | Not shown |

## 10. Change log

Earlier entries are history. Where an entry describes a visual system, the current one is §1–§8.

| Date | Change | Reason |
|---|---|---|
| 2026-09-22 | Created at the design gate, from two mocks and three reference images | The design gate had to be approved before Stage 3 |
| 2026-09-27 | *(Superseded by the next entry.)* Navy and cream palette (wine, blush and sky retired; coral kept only as the logo accent); seven type steps; one selected state; ocean focus; a filled destructive confirmation; `PanelHeader` and `PanelBand`; composition bars in "Where it went"; page width 1120px; responsive checks at 390/820/1280 | Milestone B review: the navy direction was approved conceptually, then frozen against the real product in the visual-system boundary. The wine identity read as a neutral template with an accent; 13px panel titles left no tier between the page title and metadata; readable text used `ink-3` (about 3:1); control edges were 1.6:1. |
| 2026-09-27 | **Implemented visual system recorded (§1–§8):** the reference palette (navy `#1F385A`, ocean, light-cyan mist, tide, a warm off-white canvas); coral as the brand and global Add accent only; navy higher / ocean lower in What changed; a Source Serif 4 wordmark; a 1360px workspace; soft card surfaces; the Cash flow, Activity and Accounts compositions (§6); the Kept/Spent bar removed; principles and responsive recomposition made explicit | The palette and the three page redesigns were built against the approved reference after the navy/cream freeze, and the file had fallen behind the committed UI. Coral had briefly marked higher spending, which let an increase read like an error; direction moved to the blue family. The Kept/Spent bar redrew the savings rate printed beside it. |
| 2026-09-27 | **Product-architecture decisions** ([roadmap.md §8](roadmap.md)): §2 colour note renamed to protected money (Stage 7); §5 records the approved future visual directions, each with its one question and owner, and the rejected charts; §9 D1 (Overview panels) and D2 (net-worth trend) resolved. No screen is specified before it is built. | Goals became Protected money and Budgets the optional Monthly Plan; the chart policy was reviewed so that each visual has one analytical question and no duplicate. |
| 2026-09-28 | **Set aside (Stage 7):** §2 records no dedicated hue for Set aside in V1; §6 adds the Set aside screen. | Built in Stage 7 Slice 3 with the existing visual system. |
| 2026-09-28 | **Stage 8 Slice 0:** §5's Available visual names its set-aside segment "covered set aside" (a provisional term). | Available subtracts only the covered portion; plain "Set aside" means the nominal amount on the Set aside screen ([domain-model.md §10](domain-model.md)). |
| 2026-09-28 | **Stage 8 Slice 2A:** §6 Set aside is reached through the Available area's local switch (Available · Commitments · Set aside); Available replaces Commitments as the fourth global destination and phone tab. | Navigation decision P-2 ([roadmap.md §8.3](roadmap.md)). |
