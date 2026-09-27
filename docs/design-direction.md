# FinPilot — Design Direction

**Status:** Approved at the design gate on 2026-09-22. **The visual system (§2–§7) was replaced on 2026-09-27** by the navy and cream direction, frozen against the real product in the visual-system boundary; the wine palette is retired. The decisions in §8 stay open until they are resolved.
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

Colour always carries identity, interaction or financial meaning. A colour is never assigned to fill space. These tokens are the whole palette: the default Tailwind palette is removed ([globals.css](../src/app/globals.css)), so a component cannot drift off it.

| Token | Hex | Means | Allowed | Never |
|---|---|---|---|---|
| `canvas` | `#F5F1EA` | the foundation (warm cream) | app background | panels |
| `surface` / `surface-subtle` / `surface-hover` | `#FFFFFF` / `#FAF7F2` / `#F1ECE3` | panels and overlays / bands and wells / hover and neutral glyphs | | |
| `line` | `#E7E1D6` | dividers, panel edges | | control edges |
| `line-strong` | `#9C9485` | control edges (3.0:1 on white) | inputs, selects, secondary buttons, unselected chips | dividers |
| `ink` / `ink-2` | `#172033` / `#4F5869` | text and figures / labels and metadata | | |
| `ink-3` | `#8B919C` | quiet marks | icons, placeholders | **any text a person must read** |
| `navy` / `navy-hover` | `#1D3050` / `#15243D` | FinPilot | logo, primary button, the active destination (nav underline, phone tab mark), the phone **+** | status, categories, amounts, page backgrounds |
| `ocean` | `#355F7D` | you can act here / this is selected | focus, the selected state, evidence-link underlines, info tag text | financial direction, large fills |
| `mist` | `#E5EEF4` | a quiet selected or analytical surface | selected backgrounds, the composition-bar track, info tags, the transfer glyph | text |
| `tide` | `#5B84A3` | proportion | the composition-bar fill | anything else |
| `coral` | `#DF7A62` | a rare brand accent | the logo stripe | spending, financial direction, status, warnings, errors, destructive actions, controls, amounts, text |
| `positive` / `-soft` | `#2B6F4F` / `#E4F1EA` | money arrived / verified | "+" on income and refunds, the Verified tag | "spending went down" |
| `warning` / `-soft` | `#9A5B0B` / `#FBF0DC` | needs a look | a changed checkpoint (later: due soon) | spending increases |
| `negative` / `-soft` | `#B42318` / `#FBE9E6` | wrong or destructive | errors, Delete, a failed toast, the destructive confirmation | spending, "higher" |

**Rules:**
- **Navy is identity, never status.** A "Due" badge is warning (amber), not navy.
- **Navy anchors the product; it is not its background.** The header stays white.
- **One selected state:** mist background, ocean text, ocean edge, for chips, segmented controls and active filters. It never marks a financial direction or status.
- **Coral is not red.** Coral and `negative` are only 2.2:1 apart, so they are kept apart by role: coral never appears on text, controls or status, and red always comes with a word and an icon.
- **Spending is never red and never green.** Red means a plan is broken or data is wrong. A spending increase is shown with a neutral arrow and the word "higher".
- **Status is always icon + word + colour,** never colour alone.
- **Contrast (measured):** text pairs ≥ 4.5:1 (ink 16.3 on white; ink-2 7.2 on white and 6.4 on canvas; ocean on mist 5.8; Verified 5.2; Changed 4.8; negative 6.6); control edges, focus and the navy tab mark ≥ 3:1.
- **Not decided yet:** the colour of commitments ("spoken for", Stage 6) and of goal reserves (Stage 8). A pale cyan is held in reserve for the first of them that needs its own hue; until then expectations use the soft-tint-and-outline treatment (§5).

## 3. Typography and numbers

- **Face:** **Hanken Grotesk**, weights 400/500/600/700, loaded through `next/font` (self-hosted, no runtime CDN). **Noto Sans Bengali** covers the ৳ glyph. No serif.
- **Scale:** seven steps and no others. The stock and arbitrary sizes are removed from the theme; weight is chosen separately (400/500/600).

  | Step | Size / line height | Used for |
  |---|---|---|
  | `display` | 32 (28 on phones) / 1.1 | the one hero figure: Net worth, the Quick Add amount, later Available |
  | `title` | 28 (24 on phones) / 1.15 | page titles |
  | `figure` | 20 / 1.2 | headline figures and the change headline |
  | `heading` | 16 / 1.35 | panel titles, overlay titles, the month, empty-state titles, Activity's scope and totals |
  | `body` | 14 / 1.45 | copy, row names, **list amounts at 600** |
  | `meta` | 13 / 1.4 | labels, metadata, notes, day headers, hints, compact controls |
  | `micro` | 12 / 1.25 | tags, tab labels, key hints |

  Relative sizes are allowed only for a glyph inside a figure (the smaller ৳).
- **Figures** use tabular lining numerals; both chosen faces already use equal-width digits.
- **Money formatting:**
  - South Asian grouping (৳2,30,163).
  - Whole taka on screen, always via the domain `Money` formatter.
  - A true minus sign (U+2212).
  - The currency symbol is smaller and in `ink-2`.
  - Debt is written in words ("৳6,000 owed"). Signs appear only in flows and changes.
- **Amounts in lists:** right-aligned, `body` at 600. Money coming in shows a green "+"; everything else is `ink`.

## 4. Space, surfaces, shape

- **Grid:** 4px base.
  - Panel padding: 20px.
  - Gaps: 16px (dense) / 20px (default).
  - List rows: 44px desktop / 52px touch.
  - Page width: max 1120px.
- **Density:** compact but comfortable. Density comes from layout, never from type below 12px.
- **Panels:** white, 1px `line`, **radius 12px**, shadow at most `0 1px 2px rgb(23 32 51 / .04)`. Inside a panel, use rules and whitespace, never nested cards.
  - A panel's title row is `PanelHeader` (the question, a short note); a labelled group of rows inside it is `PanelBand`.
  - A panel that holds sticky rows clips its overflow (`overflow-clip`), never hides it: a hidden overflow makes the panel their scroll container.
- **Controls:** radius 8px. Chips and badges are pills.
- **Overlays** (dialog, sheet, popover): one soft shadow `0 12px 32px rgb(23 32 51 / .14)` over a scrim of `ink` at 30%.
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
  - **Soft tint + outline** = spoken for or expected (commitments, goal reserves); their hues are decided in Stages 6 and 8 (§2).
  - **Empty with a red outline** = missing (shortfall, over-committed).
  - Expected amounts always carry a date or a purpose in their label.
- **Categories:** colour never identifies a category; the text label does.
  - Charts show the top 5 by amount plus "Other".
  - Ranked bars use one hue.
  - Composition is shown as one-hue share bars (`tide` on a `mist` track) beside the exact share and amount, never instead of them. "Where it went" is the first: a 4px bar under each category, drawn to the domain's Ratio; a share shown as "<1%" keeps a 2px sliver, a true zero draws nothing, and the bars are hidden from assistive technology.
  - This keeps user-created categories correct with no manual colour assignment.
- **Charts are hand-built (CSS or SVG), with no chart library** ([tech-stack.md](tech-stack.md)). Only derived values are rendered; no chart ever contains illustrative data.

## 6. Interaction states

| State | Treatment |
|---|---|
| Hover | `surface-hover` background; control edges darken to `ink-2` |
| Focus | 2px `ocean` outline, 2px offset; inputs and selects: an `ocean` edge and 1px ring. Always visible on keyboard focus. |
| Active nav | `ink` text + 2px `navy` underline; on phones, a `navy` mark and icon on the tab |
| Selected (chip, segment, active filter) | `mist` background, `ocean` text, `ocean` edge |
| Primary / secondary / ghost button | `navy` fill / white with a `line-strong` edge / text only |
| Destructive | inline: `negative` text; the confirming button of a destructive dialog: a filled `negative` button, never navy |
| Evidence link | an `ocean` underline (50%, full on hover) on an amount or phrase that opens the rows behind it |
| Disabled | 45% opacity, no pointer |
| Pending (server action) | the button keeps its width and shows a spinner; no layout shift |
| Success | a toast stating the effect, with **Undo** where the action is reversible ("Saved −৳450 · Cash") |
| Error | an inline message under the field in plain language; no apology |
| Empty | one sentence on what would appear, plus one action. No illustration. |

- **Quick Add is the primary global action** (`N` / **+ Add**): a dialog on desktop and a bottom sheet on mobile.
- **Motion:** at most 150–250ms, and only for meaning (the new number after a save, a sheet opening). `prefers-reduced-motion` is respected.

## 7. Responsive

- **Checked at 390, 820 and 1280px** for every change to Accounts, Activity, Cash flow and their overlays.
- **Desktop (≥1024px):** top navigation, side panels for editing; Accounts puts Net worth in a right-hand column.
- **Tablet (768–1023px):** top navigation; panels stack in one column; Activity's search takes its own line.
- **Mobile (<768px):**
  - Bottom tab bar with a centred **+**.
  - Quick Add as a bottom sheet with the keypad first.
  - Lists become two-line rows; charts stay horizontal-first.
  - A row's actions share its second line and wrap below its details when both do not fit; they keep their words ("Verify") and a 40px touch height.
- **Mobile first screen:** on data pages, the first viewport must state the page's primary answer (on Accounts, Net worth leads).
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
| 2026-09-27 | **Visual system replaced (§2–§7):** navy and cream palette (wine, blush and sky retired; coral kept only as the logo accent); seven type steps; one selected state; ocean focus; a filled destructive confirmation; `PanelHeader` and `PanelBand`; composition bars in "Where it went"; page width 1120px; responsive checks at 390/820/1280 | Milestone B review: the navy direction was approved conceptually, then frozen against the real product in the visual-system boundary. The wine identity read as a neutral template with an accent; 13px panel titles left no tier between the page title and metadata; readable text used `ink-3` (about 3:1); control edges were 1.6:1. |
