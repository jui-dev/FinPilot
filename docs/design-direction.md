# FinPilot — Design Direction

**Status:** Approved at the design gate on 2026-09-22. The decisions in §8 stay open until they are resolved.
**Change policy:** Update this file when implementation shows that a rule doesn't work. Record each change in §9 with its reason. This file is a north star, not a pixel spec: stages build real UI against it; there are no standalone mocks.
**Related:** [product-baseline.md §11](product-baseline.md) · [domain-model.md §14](domain-model.md) · [roadmap.md](roadmap.md)

---

## 1. Character

**A premium financial workspace.** It pairs the credibility of financial software with the polish of consumer fintech. Its seriousness comes from hierarchy, restraint and precise numbers, not from dullness.

- **Numbers first.** Condition is read from figures, status and charts. Copy is a short label or a single sentence, never a paragraph.
- **One panel per financial question.** Panels are conceptual units, not a grid of KPI cards. No chart may repeat what another already says ([product-baseline.md §6](product-baseline.md)).
- **The domain stays rigorous and the UI stays simple.** [domain-model.md §14](domain-model.md) is binding.
- **Not:** a newspaper, an ERP, a trading terminal, an admin template, a stock shadcn look, a lifestyle or motivational site, or a playful budgeting app.
- **Banned:**
  - greetings or quotes that take space from the first screen
  - photos and illustrations (mountains, lifestyle imagery)
  - merchant logos (FinPilot has no merchant entity)
  - glassmorphism, neon, decorative gradients

## 2. Colour: semantic tokens

Colour always carries identity, hierarchy or financial meaning. A colour is never assigned to fill space.

| Token | Hex | Role |
|---|---|---|
| `canvas` | `#F6F4F1` | App background (warm stone, very subtle) |
| `surface` / `surface-subtle` / `surface-hover` | `#FFFFFF` / `#FAF8F6` / `#F3F0EC` | Panels, wells, hover |
| `border` / `border-strong` | `#E8E3DC` / `#D6CFC5` | Dividers, panel edges / inputs |
| `ink` / `ink-2` / `ink-3` | `#1B1B24` / `#5F5E6B` / `#8F8D98` | Figures and text / labels / axes and hints only |
| `wine` / `wine-hover` / `wine-soft` | `#6E2442` / `#5A1D36` / `#F5E8EC` | **Identity:** active nav, primary action, focus, the Available segment |
| `coral` / `blush` | `#E07A64` / `#F8E1DA` | **Supports wine:** soft selected surfaces, goal-reserve marks, chart highlight accents. Never text, never a status. |
| `sky` / `sky-soft` / `sky-ink` | `#7FA6C9` / `#E8F0F7` / `#3E6488` | Informational, comparison, spoken-for (commitments) |
| `positive` / `-soft` | `#2F7A57` / `#E5F1EA` | Money in, on track, verified |
| `warning` / `-soft` | `#A86A10` / `#FBF0DC` | Due soon, at risk |
| `negative` / `-soft` | `#C0392B` / `#FBE8E5` | Over-committed, overdue, short, errors |
| `chart-neutral` / `chart-reference` | `#D9D4CC` / `#A8A39C` | Context marks, comparison series |

**Rules:**
- **Wine is identity, never status.** A "Due" badge is warning (amber), not wine.
- **Coral supports wine and never replaces it.**
- **Spending is never red and never green.** Red means a plan is broken or data is wrong. A spending increase is shown with a neutral arrow and the word "higher".
- **Status is always icon + word + colour,** never colour alone.
- **Contrast:** all text pairs meet WCAG AA. `ink-3` and `coral` are never used for text a user must read.

## 3. Typography and numbers

- **Face:** **Hanken Grotesk**, weights 400/500/600/700, loaded through `next/font` (self-hosted, no runtime CDN). **Noto Sans Bengali** covers the ৳ glyph. No serif.
- **Scale:** 12 meta · 13 labels, tables · 14 body · 16 panel titles · 18–20 answer headlines · 28 page titles · 40 the Available figure (32 on mobile).
- **Figures** use tabular lining numerals; both chosen faces already use equal-width digits.
- **Money formatting:**
  - South Asian grouping (৳2,30,163).
  - Whole taka on screen, always via the domain `Money` formatter.
  - A true minus sign (U+2212).
  - The currency symbol is smaller and in `ink-2`.
  - Debt is written in words ("৳6,000 owed"). Signs appear only in flows and changes.
- **Amounts in lists:** right-aligned. Money coming in shows a green "+"; everything else is `ink`.

## 4. Space, surfaces, shape

- **Grid:** 4px base.
  - Panel padding: 20px.
  - Gaps: 16px (dense) / 20px (default).
  - List rows: 44px desktop / 52px touch.
  - Page width: max 1280px on a 12-column grid.
- **Density:** compact but comfortable. Density comes from layout, never from type below 12px.
- **Panels:** white, 1px `border`, **radius 12px**, shadow at most `0 1px 2px rgb(27 27 36 / .04)`. Inside a panel, use rules and whitespace, never nested cards.
- **Controls:** radius 8px. Chips and badges are pills.
- **Overlays** (dialog, sheet, popover): one soft shadow `0 12px 32px rgb(27 27 36 / .14)`.
- **Icons:** lucide, 1.75 stroke, 16–20px.
  - Category icons come from a fixed map for the seeded categories.
  - **User-created categories get a generic tag icon.** Correctness never depends on hand-assigning icons or colours.

## 5. Charts

- **Each chart answers one named question.** The question is its title or its headline.
- **Forms:**
  - cumulative comparison line: this period against the same days of the previous one
  - ranked horizontal bars
  - diverging contribution bars
  - single composition strip
  - bullet bars for budgets
  - coverage bars for goals
  - segmented bar for Available
  - short timeline or list for commitments
- **Marks:**
  - 2px lines; bars 8–12px with 2px rounded ends.
  - One highlighted series; comparison series in `chart-reference`.
  - Direct labels, with a legend only when there are two or more series.
  - A baseline plus at most two faint guides.
  - Event annotations are drawn on the chart.
  - Tooltips on hover and focus; every mark drills into filtered Activity.
- **Fact vs expectation:**
  - **Filled** = has happened (balances, spending, debt).
  - **Soft tint + outline** = spoken for or expected: sky for commitments, blush for goal reserves.
  - **Empty with a red outline** = missing (shortfall, over-committed).
  - Expected amounts always carry a date or a purpose in their label.
- **Categories:** colour never identifies a category; the text label does.
  - Charts show the top 5 by amount plus "Other".
  - Ranked bars use one hue.
  - A composition strip uses ordinal wine→blush→stone steps assigned within that chart, and is always labelled.
  - This keeps user-created categories correct with no manual colour assignment.
- **Charts are drawn in visx with our own components** ([tech-stack.md](tech-stack.md)). Only derived values are rendered; no chart ever contains illustrative data.

## 6. Interaction states

| State | Treatment |
|---|---|
| Hover | `surface-hover` background; borders darken to `border-strong` |
| Focus | 2px `wine` ring, 2px offset. Always visible on keyboard focus. |
| Active nav | `ink` text + 2px `wine` underline |
| Selected (chip, segment) | `wine-soft` background + `wine` text, or an `ink` fill for segmented type choices |
| Primary / secondary / ghost button | wine fill / white with `border-strong` / text only |
| Disabled | 45% opacity, no pointer |
| Pending (server action) | the button keeps its width and shows a spinner; no layout shift |
| Success | a toast stating the effect, with **Undo** where the action is reversible ("Saved −৳450 · Cash") |
| Error | an inline message under the field in plain language; no apology |
| Empty | one sentence on what would appear, plus one action. No illustration. |

- **Quick Add is the primary global action** (`N` / **+ Add**): a dialog on desktop and a bottom sheet on mobile.
- **Motion:** at most 150–250ms, and only for meaning (the new number after a save, a sheet opening). `prefers-reduced-motion` is respected.

## 7. Responsive

- **Desktop (≥1280px):** 12-column grid, top navigation, side panels for editing.
- **Tablet (768–1279px):** panels stack; 2-column where the content fits; editing moves into sheets.
- **Mobile (<768px):**
  - Bottom tab bar with a centred **+**.
  - Quick Add as a bottom sheet with the keypad first.
  - Lists become two-line rows; charts stay horizontal-first.
- **Mobile first screen:** on data pages, the first viewport must state the page's primary answer.
- **No horizontal page scroll at 390px.** Only tables may scroll, inside their own container.

## 8. Open decisions (raised by the reference images)

| # | Topic | Conflict with a frozen decision | Default until resolved |
|---|---|---|---|
| D1 | Overview gains secondary panels (category composition, income vs spending, budgets, goals, upcoming, recent) | [product-baseline.md §6](product-baseline.md) caps the Overview at 4–5 zones | Decide at Stage 11. Candidate: the §6 zones on the first screen, plus one "Plans and breakdowns" band below it, with no duplicated question. |
| D2 | Net worth trend line | Net worth over time is **V1.1** (baseline §9; tech-stack change log) | Net worth shown as a figure with assets/owed; no trend line in V1 |
| D3 | A "Next income" card | Available is "before new income"; expected income is **V1.1** (runway) | Not shown |
| D4 | Donut chart for categories | Baseline §4.2 names the category donut as part of the generic tracker set | Ranked bars / composition strip (§5) |
| D5 | "Subscriptions" as a category | Removed by the baseline; derived from commitments | Subscriptions appear only as commitments |
| D6 | Receipt capture, AI search, "Insights" nav | AI, OCR and drafts are out of V1; the page is named "Cash flow" | Not shown |

## 9. Change log

| Date | Change | Reason |
|---|---|---|
| 2026-09-22 | Created at the design gate, from two mocks and three reference images | The design gate had to be approved before Stage 3 |
