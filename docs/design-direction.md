# FinPilot — Design Direction

**Status:** Describes the visual system and every core screen as implemented on 2026-10-01, after the Overview redesign and the UI refinement pass (§10). Where this file and the committed UI disagree, the UI is the truth and this file is corrected. The open decisions in §9 stay open until they are resolved.
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
5. **Financial direction is not an error state.** Spending more is not "wrong"; `negative` (berry) is kept for what is.
6. **Responsive layouts recompose rather than shrink** (§8).
7. **Dense ledger information stays scannable:** aligned columns, fixed-width amounts, day grouping.
8. **No duplicate features, metrics or charts** answering the same question.
9. **Polish never obscures ledger correctness.** The domain stays rigorous and the UI stays simple ([domain-model.md §14](domain-model.md) is binding).
10. **Shared visual language, not identical layouts.** Each screen is composed around its own question (§6).

- **Numbers first.** Copy is a short label or a single sentence, never a paragraph.
- **Not:** a newspaper, an ERP, a trading terminal, an admin template, a stock shadcn look, a lifestyle or motivational site, or a playful budgeting app.
- **Banned:** greetings or quotes that take space from the first screen; photos and illustrations; merchant logos (FinPilot has no merchant entity); glassmorphism, neon, loud or decorative gradients (the quiet surface washes in §4 are the only gradients); decorative charts.

## 2. Colour: semantic tokens

These tokens are the whole palette: the default Tailwind palette is removed ([globals.css](../src/app/globals.css)), so a component cannot drift off it.

| Token | Hex | Means | Used for | Never |
|---|---|---|---|---|
| `canvas` | `#FCFBF9` | the foundation | app background | panels |
| `surface` / `surface-subtle` / `surface-hover` | `#FFFFFF` / `#FAF7F2` / `#F1ECE3` | cards and overlays / bands and wells / hover | | |
| `line-soft` / `line` / `line-strong` | `#F1EDE6` / `#E7E1D6` / `#9C9485` | card edges and row dividers / inner rules and quiet edges / control edges (3.0:1 on white) | | a divider in `line-strong` |
| `line-control` | `#8193A8` | a softer, cooler control edge, still ≥ 3:1 on white | the filter toolbar's search and selects (Activity) | dividers, decoration |
| `ink` / `ink-2` | `#172033` / `#4F5869` | text and figures / labels and metadata | | |
| `ink-3` | `#8B919C` | quiet marks | icons, placeholders | **any text a person must read** |
| `navy` / `navy-hover` | `#1F385A` / `#182D49` | identity and the strongest emphasis | logo, page and panel titles, key figures, the primary button, the active destination; **higher** in a change explanation; money that exists and is free in Available's marks; Went out in the month bars | status, a card or page background |
| `ocean` | `#46678D` | interaction and analysis | focus, the selected state, evidence links, info text; share bars | status |
| `mist` | `#D8F3F5` | a quiet highlighted surface | a light tint for a page's hero card and for the outcome of an equation (Left over, Net worth, what is still due), the quiet washes of §4, selected backgrounds, info tags, icon wells, the soft primary button | text |
| `tide` | `#96BED4` | supporting marks | Came in in the month bars, set aside in Available's marks, **lower** in a change explanation, the third tone of the concentration ring | text or anything that must be read (2.0:1 on white) |
| `coral` | `#F06A4E` | the brand, the one global action and orientation | **solid:** the logo stripe, **+ Add** and the phone **+** (ink label, 5.3:1), today in the Overview's month glance. **Soft tints:** the warm spending family in visualisations (This month's category lines and month bar, the part of a month's spending beyond what came in on Trends) | solid coral for spending or any financial figure; higher spending as a direction, totals, status, warnings, errors, text |
| `positive` / `-soft` | `#2B6F4F` / `#E4F1EA` | money arrived / verified | "+" on income and refunds, the Verified tag | "spending went down" |
| `warning` / `-soft` | `#9A5B0B` / `#FBF0DC` | needs a look | a changed checkpoint; overdue, due today and needs-attention states, used sparingly (ink and icon on a white chip, or a small tinted chip or icon tile) | spending increases; large yellow-filled surfaces |
| `negative` / `-hover` / `-soft` | `#A33A62` / `#8A2F52` / `#F8EAF0` | wrong, broken or destructive (a muted berry) | errors and invalid fields, Delete, a failed toast, the destructive confirmation (hover: `-hover`), a shortfall and its amount | spending or any outflow, a balance or Left over merely below zero, "higher", deterioration, Cancel, decoration |

**Rules:**
- **Solid coral is a brand, action and orientation accent, never a meaning.** It is not spending, a negative direction, a warning or an error. **Soft coral tints** are the warm spending family in visualisations: spending drawn as a mark is warm, never berry and never green. Coral and `negative` are only 2.1:1 apart in lightness; they are kept apart by hue (berry about 337°, coral about 10°) and by role, and `negative` always comes with a word and an icon.
- **`negative` colours the gap, not the number line.** It marks the amount by which something is short or over-committed ("৳4,000 short"), never an amount just because it is below zero or leaves an account.
- **In a destructive dialog only the action that destroys is `negative`.** Cancel stays ghost: it is the safe choice, and colouring it would hide which button does the damage. Archive, Release, Skip and Refund are not destructive.
- **Entry types reuse the money-direction families, as small marks only** (2026-10-01, Quick Add): Expense the warm spending family (a soft coral tint, as Expense Categories draw it), Income `mist` with an `ocean` mark (as Income Categories), Transfer `ocean` mixed into white with a `navy` mark. The type is carried by its word and its direction mark (↗ out, ↙ in, ⇄ between your own accounts); the tint appears only on the chosen type's mark and on the category's icon well, never as a surface, on a figure or on the Save button, which stays navy for every type. No hue was added. *Activity does not follow this yet (it draws transfers in mist and income in green): a known follow-up ([roadmap.md §8.5](roadmap.md)).*
- **Analytical direction uses the blue family:** in What changed (Cash flow and Trends) navy is higher, drawn to the right of a centre line, and tide is lower, drawn to the left. Direction is always carried by the word, the sign and the side; colour only repeats it.
- **Error and destructive semantics stay separate** from direction: `negative` means a plan is broken, data is wrong or something is being deleted.
- **Spending is never `negative` and never green.** `negative` stays with what is genuinely short, broken, owed as debt on a card, or being destroyed.
- **No large yellow-filled surfaces.** Amber (`warning`) is used sparingly, for states that ask for a look: overdue, due today, a changed checkpoint, a needs-attention day.
- **Navy is identity and emphasis, never status.** The header stays white; navy is never a page, card or section background. *(Until the Overview redesign of 2026-09-29 the Overview's Available band was navy; it is now a white card.)*
- **One selected state:** `mist` background, `ocean` text, `ocean` edge, for chips, segmented controls and active filters. *One exception (2026-10-01): Quick Add's type switch shows the chosen type as a raised white tab in bold, so the type's own mark can carry its meaning (§6).*
- **Status is always icon + word + colour,** never colour alone.
- **Contrast (measured):** ink 16.3 and ink-2 7.2 on white; ink-2 6.7 on canvas and 6.2 on mist; navy 11.9 on white and 10.2 on mist; ocean 5.9 on white and 5.0 on mist; ink on coral 5.3; `negative` 6.3 on white, 5.9 on canvas, 5.4 on `negative-soft` and on mist; white 6.3 on `negative` and 8.1 on `negative-hover`. Control edges (including the softer `line-control` edge, 3.1 on white), focus and the navy tab mark are ≥ 3:1.
- **Set aside (protected money) has no dedicated hue in V1** (2026-09-28): covered money is navy, the rest of a target is a quiet track, and a shortfall is a `negative` *short* tag, its amount in `negative`, and a `negative`-outlined gap in the target bar. Overdue commitments stay `warning` (a decision is needed; nothing is broken). The colour of commitments is not decided; no hue is reserved for it.

## 3. Typography and numbers

- **Faces:** **Hanken Grotesk** (400/500/600/700) for the whole interface, with **Noto Sans Bengali** for the ৳ glyph, both through `next/font`. **Source Serif 4** sets the FinPilot wordmark and nothing else.
- **Scale:** eight steps and no others; the stock and arbitrary sizes are removed from the theme. Weight is chosen separately.

  | Step | Size / line height | Used for |
  |---|---|---|
  | `hero` | 48 (40 on phones) / 1.0 | the one headline figure of a hero card: Available (on the Overview and on its own page), Due now (Commitments), Kept aside (Set aside); and the Quick Add amount, centred, the dialog's one large figure (2026-10-01) |
  | `display` | 32 (28 on phones) / 1.1 | the figures of an equation card (Came in, Went out, Left over on Cash flow), a change headline |
  | `title` | 28 (24 on phones) / 1.15 | page titles |
  | `figure` | 20 (18 on phones) / 1.2 | headline figures and the change headline |
  | `heading` | 16 / 1.35 | panel titles, overlay titles, the month, empty-state titles, Activity's scope |
  | `body` | 14 / 1.45 | copy, row names, **list amounts at 600** |
  | `meta` | 13 / 1.4 | labels, metadata, notes, day headers, hints, compact controls |
  | `micro` | 12 / 1.25 | tags, tab labels, column headers, key hints |

  Relative sizes are allowed only for a glyph inside a figure (the smaller ৳). The only sizes between steps are a few summary figures on wider screens: the amounts of the Trends, Accounts and Calendar summary cards, and the Overview's Net worth.
- **Figures** use tabular lining numerals.
- **Money formatting:**
  - South Asian grouping (৳2,30,163), whole taka, always via the domain `Money` formatter.
  - A true minus sign (U+2212); the currency symbol is smaller and in `ink-2`.
  - Debt is written in words ("৳6,000 owed"). Signs appear only in flows and changes.
- **Amounts in lists:** right-aligned in a fixed-width column, `body` at 600. Money coming in shows a green "+"; everything else is `ink`. One exception: on desktop, Accounts' balances sit centred in pills of one width, so the column keeps one edge whatever the amount.

## 4. Workspace, surfaces, shape

- **Workspace:** one width shared by the navigation and every page: at most **1360px**, with 16 / 24 / 32px gutters on phones / tablets / desktops (1296px of content on a desktop).
- **Grid:** 4px base. Card padding 20px; gaps 16px (dense) / 20px (default). Density comes from layout, never from type below 12px.
- **Cards:** white, a soft `line-soft` edge, radius 12px, a soft `shadow-card`. The core pages compose their own cards around their question; secondary pages (Settings) use the shared `Panel` with `PanelHeader` and `PanelBand`.
- **Nesting:** cards with their own elevation never nest. **Flat inset surfaces** (a tint or a quiet wash, a hairline inset edge, no shadow) may sit inside a card when they group evidence or supporting information: the panels of an equation card, Available's Behind the numbers parts, Set aside's purposes, fact tiles.
- **Hero cards and washes:** a page's hero card (Available now, Due now, Kept aside) is a flat, light mist tint, never a gradient. A secondary card may carry **one quiet wash** from its top-left corner: mist for answers and analysis, warm sand for evidence. No other gradients.
- **Equation cards:** where a page's outcome is a sum, it is written as one: the parts side by side with − / + and = chips between them from 1024px, stacked below, and the result on mist (Came in − Went out = Left over on Cash flow and Trends; You own − You owe = Net worth on Accounts and the Overview).
- **Tables:** a column head is a light-blue band fading across the table, with blue capitals; group and day bands are warm sand fading across. Rows are separated by `line-soft` hairlines and take a faint mist on hover.
- **A card that holds sticky rows clips its overflow** (`overflow-clip`), never hides it: a hidden overflow makes the card their scroll container.
- **List height:** lists that sit side by side may share one fixed height so the grid stays aligned, their rows scrolling inside; once they stack, they take their natural height, so a page never scrolls inside a page on a phone.
- **Controls:** radius 8px. Chips and badges are pills. A toolbar may use the softer `line-control` edge, which still meets 3:1.
- **Overlays** (dialog, sheet, side panel): one soft shadow over a scrim of `ink` at 30%.
- **Icons:** lucide, 1.75 stroke, 16–20px. Seeded categories and account types have fixed icons; **user-created categories get a generic tag icon**, so correctness never depends on hand-assigning icons or colours.

## 5. Visualisation

- **Each visualisation answers one named question**, stated by its title or headline. Only derived values are drawn; no chart ever contains illustrative data.
- **Bars sit beside the exact figure, never instead of it,** and are hidden from assistive technology. The figure and the row carry the meaning; the row, not the mark, opens the evidence.
- **Colour never identifies a category;** the text label does. Where tones follow size (the concentration ring, This month's warm category lines), they only repeat the order the labels already show. This keeps user-created categories correct with no manual colour assignment.
- **Rings answer a composition or concentration question, or none is drawn.** A ring divides one whole into a few named parts; it is never decorative and never a conventional one-slice-per-category donut. Two exist: the Overview's ring of the money on hand and Cash flow's concentration ring.
- **Built:**
  - **Cash flow — the concentration ring:** the month's spending as one ring, the three largest categories in navy, ocean and tide and every other category as one neutral remainder, the total in its middle and a sentence under it ("Housing, Health and Groceries take 70% of what went out"). Beside it, every category's **share bar** in one ocean, drawn against the largest.
  - **What changed (Cash flow and Trends):** a bar per material driver from a **centre line**, navy to the right for higher and tide to the left for lower, drawn against the largest change.
  - **Available — the waterfall:** each step of the bridge has a mark on one shared scale showing the slice it takes: In your accounts as the whole, owed in `ink-3`, payments due as mist with an ocean edge (expected), set aside from Available in tide, Available in navy. An over-commitment is a `negative`-edged gap.
  - **Trends — Month by month:** each month's Came in (tide) and Went out (navy) as two bars on one scale; the part of Went out beyond Came in is a **warm hatched** segment. The exact figures sit under the bars in the same columns.
  - **Set aside:** a target bar per purpose only when a target exists; Where it's held draws each account's set-aside money (tide where covered, a `negative`-edged gap where short) against what is still free.
  - **Overview:** the ring of the money on hand and This month's bars are described with the screen (§6).
  - **Savings rate:** where a rate is printed beside Left over (Cash flow, Trends), a thin navy bar repeats it.
- **Fact vs expectation** (for Commitments, Protected money, Available and Monthly Plan): **filled** = has happened; **soft tint + outline** = spoken for or expected; **empty with a `negative` outline** = missing (shortfall, over-committed). Expected amounts always carry a date or a purpose.
- **`negative` in charts** marks only the missing part, drawn as a surface or `negative-soft` fill with a 1–1.5px `negative` edge and a word ("Short", "Over-committed"). Never a solid `negative` segment that relies on colour alone: `negative` and ocean are 1.07:1 apart in luminance. A month that spent more than it earned is direction, not a fault: its overflow is warm and hatched, and its Left over stays navy with a true minus. Deterioration and "over plan" are direction (navy/tide, side, word), never `negative`.
- **Hand-built in CSS (SVG where a shape needs it), with no chart library** ([tech-stack.md](tech-stack.md)). A new chart is added only when its concept exists and its question isn't already answered.
- **Future directions** (2026-09-27; recorded because their owning concepts are decided, not yet designed):

  | Owner | Visual | The one question it answers |
  |---|---|---|
  | Monthly Plan (Stage 13) | actual vs intention / projection per planned line | Am I on pace against what I intended? |

  Cash flow's share bars never gain plan markers; plans keep their own visual. The Overview doesn't redraw the Available waterfall: its ring answers a narrower question (how the money on hand divides), and Signals have no charts.
- **Rejected for now:** a savings-rate line (it redraws Income vs Spending); a net-worth line (its monthly change is essentially Left over, A-14); a conventional category donut and any decorative ring; an assets-vs-liabilities ring or chart; month-progress ticks, until they would carry financially useful information; a savings rate, percentage or month comparison on the Overview; any time series on the Overview; Sankey; stacked category area; heatmap calendar; a commitment calendar; any category colour system; charts on Signals; duplicate charts on the Overview.

## 6. Screens

Each core page answers one question. Keeping them distinct is what prevents features and charts from being duplicated across pages.

**Every page opens the same way:** the title and one line under it on the left; on the right, the area's local switch (Cash flow · Trends · Calendar, or Available · Commitments · Set aside), the page's own period control, and its one primary action (**New commitment**, **New purpose**, **New account**, always the navy primary button).

### Cash flow: "What happened to my money this month?"

Outcome-first, read in one order:
1. **The month,** in the header: the month between its neighbours, with its period ("1–30 Sep 2026, so far" or "Full month").
2. **The outcome, as one equation (§4):** **Came in** (with where it came from) − **Went out** (with its largest category and how many categories) = **Left over**, on mist, with the savings rate as a figure, a thin bar and words ("You kept about ৳19 of every ৳100 that came in"). Came in and Went out open the transactions behind them.
3. **Where it went** — *composition and concentration:* the concentration ring (§5) beside every category with its share bar, percentage and amount, ending with All spending; each category opens its transactions. Categories refunded more than spent are listed apart.
4. **What changed** — *explanation:* the headline first ("Spending ৳18,760 higher", a direction mark, what it is compared with, both periods' totals), then a table of the material drivers: both periods (each opening its own transactions), the change, its share of the increase and its bar from the centre line (§5). Smaller changes fold away; All spending closes the table.

Where it went and What changed are different analytical jobs, not interchangeable widgets.

### Trends: "How is my money changing over time, and what is driving it?"

The second page of the Cash flow area (**Cash flow · Trends · Calendar**); Cash flow stays the current destination. Complete months only: **6 months** (default) or **12 months**, as links, and the subtitle leads to the current month on Cash flow. Three cards, each answering its own question and showing each figure once:
1. **The months added up** — *how did the window add up?* One equation (§4): Came in − Went out = Left over over the whole window, with each side's monthly average and the share of Came in that was left over.
2. **Month by month** — *how did each month go?* One table that is also the chart: each month's two bars (§5) and, in the same column, its exact Came in, Went out and Left over. Each month opens its Cash flow page. A month in the minus keeps navy and a true minus. On phones, the months as rows, newest first.
3. **What changed** — *why is the recent half different?* Cash flow's What changed across the earlier and recent halves, with exact totals and no percentages, shares or averages; unchanged categories are named.

No scores or invented labels such as "raise" or "bonus": the ledger knows what moved, not what it meant. Fewer than three complete months shows an empty state that leads to Cash flow.

### Calendar: "When did money move, and when do payments fall due?"

The third page of the Cash flow area; Cash flow stays the current destination. Cash flow reads one month; Trends reads change across months; the Calendar reads *when*. It is neither a heatmap nor a commitment calendar (§5): it shows recorded money first and known payments due second, and nothing else.
1. **The month:** Came in and Went out (Cash flow's figures, to date) and, apart from them on mist, what is still due this month with its number of payments; **Open in Cash flow**. A future month says "Nothing has come in or gone out yet" and shows only what is due; the last month with scheduled payments says how far they are known.
2. **The grid (from 1024px),** across the page: a Saturday-first week (a presentation convention, not an accounting rule) with a **Week out** column set apart as a summary. After the date, a day shows its money: Came in with its "+", Went out in bold, "in" and "out" named only on a day that has both. Then, secondary, at most two named payments due and "+N due". Today has the navy numeral and "Today"; later days carry no money.
3. **A chosen day opens in a drawer** from the right (a bottom sheet on phones), never on arrival: its Came in and Went out, each opening Activity for that day, then only the groups it holds: **Money activity**, **Moved between accounts** and **Balance adjustments** (both "Not spending"), **Commitments due** (a paid one says when it was paid) and **Verifications** ("Review entries through …"). Only the open day is marked in the grid.

Payment states keep Commitments' treatment: overdue is a warning, due today info, upcoming an outline, paid and skipped quiet. The month and the day are in the URL (`?month=`, `?day=`); closing the drawer leaves the day out of it. Months reach back to the first account and forward only as far as payments are scheduled. No set-aside entries (they have no business date), balances or Available by day, projections, expected income, category colours, dots or badges.

### Activity: "What exactly happened in the ledger?"

The evidence workspace, not a dashboard. Three cards, apart:
1. **Filters:** search, Period, Account, Category, Type, Clear. They live in the URL, so any view can be linked to and reloaded.
2. **Scope:** what the filters select, the number of entries, Spent and Income for the whole view, and a link to Cash flow when the view has a month's shape.
3. **Rows,** grouped by day under sticky day bands with each day's count: **Description · Category · Account · Amount** on desktop. A row opens its transaction in a side panel, marked as current while open. **Pages of 25**, the page in the URL (`?page=`): the count and the totals always cover the whole view, a filter starts again at the first page, and an open transaction keeps its page.

It has no metric cards.

### Accounts: "What do I have, what do I owe, and can I trust those balances?"

1. **Position, as one equation (§4):** **You own** − **You owe** = **Net worth**, on mist. A card holding credit reads **+ Credit on cards**.
2. **One ledger of accounts,** grouped by purpose (Everyday money, Savings, Credit cards, then Archived), each group with its count and total, not separate cards. Each row reads: account, balance, verification, **Action**. On desktop the four columns are evenly spaced.
3. **Verification is a first-class trust state:** *Not verified yet* (neutral), *Verified* with its date (positive), *Changed · ৳X off* (warning). The changed tag opens a dialog with the evidence written neutrally: what the ledger records for that day, what was verified, how far apart, and a link to the entries through that day. It never claims which entry changed.
4. **Action:** **Verify**, the soft primary only on a changed account; **Archive / Restore / Delete** beside it, shown only when allowed.

### Available: "How much can I actually use right now, and why?"

The landing page of the Available area (Available · Commitments · Set aside). Every figure is the Available read model's; the page only restates its terms.

1. **The answer card:** **Available now** as the hero (navy, a true minus when negative), a *Before new income* tag, and one sentence naming only what actually stands between the balances and the answer ("What's left of ৳1,52,419 in your accounts after what you owe on cards, payments due by 30 Oct and money set aside"). When negative, an *Over-committed by ৳X* tag in `negative` (icon + words); the figure stays navy. Under it, three facts: **Left free** (Available's share of the money on hand), **Spoken for**, **Counted until**.
2. **How it's worked out,** beside it from 1024px: the bridge as a waterfall table. In your accounts → Owed on cards / Credit on cards → Due by ‹date› → Set aside from Available → **= Available**, each step with its amount, what is **Left** after it, and its mark (§5). The card rows are left out without a card account.
3. **Behind the numbers:** three parts, each headed by the step it explains (*Step 1 · In your accounts*, with Owed on cards inside it; *Step 2 · Due by ‹date›*; *Step 3 · Set aside*), listing only the rows behind each figure: the counted accounts and cards, the payments due with their dates (*Overdue* / *Due today*), and the set-aside money deducted (a shortfall reads "৳300 short — not deducted"). A **Not part of Available** strip names the excluded accounts and the money set aside in them. Each part links to the page that owns it; the page never repeats Accounts, Commitments or Set aside.

### Commitments: "What am I committed to paying, what needs me now, and what is coming?"

A page of the Available area. Every state and date is the domain's; nothing is paid by reaching a date.
1. **Due now,** the hero: what is overdue or due today, with *Overdue* / *Due today*, or *All clear*.
2. **Looking ahead:** the next payment, everything due through the forecast window, and how that divides by month.
3. **Four lists,** two by two from 1024px at one height (§4): **Needs attention** (Pay or Skip; Pay records the expense in Activity, Skip records nothing), **Coming up** (by month, each with its count and subtotal), **Your commitments** (next due first; selecting one edits it) and **Recently paid or skipped** (a paid one opens the expense it recorded). Pay is the soft primary action, Skip the quiet one.

### Set aside: "What am I keeping money for, and is it still really there?"

A page of the Available area, reached through its local switch (roadmap §8.3).

1. **Kept aside,** the hero: what is still really set aside (when part of it is short, the covered amount, with a *short* tag), with the number of purposes and accounts and what is still needed toward targets.
2. **Where it's held:** each account holding set-aside money, for which purposes, with what is set aside against what is still free (§5).
3. **Your purposes,** one card each: its name; **one number** ("৳1,20,000 set aside") while everything set aside is covered, or "৳1,10,000 of ৳1,20,000 still covered" with a *short* tag; a target line and bar only when a target exists (target, still needed from what is covered, progress, *Target reached*); **Held in**, with any shortfall named on its account; and its actions: Set aside more, Release (explicit, never pre-filled), Edit. Archive lives in Edit, final, and refused with its reason while money is set aside. Archived items are listed read-only.

### Overview: "What can I use right now, what needs me, and how does that sit against this month and where I stand?"

The page at `/`, where the logo leads (Stage 10). It owns no financial truth: every figure is Available's, the Calendar's, Attention's, Cash flow's or the position's, and each zone leads to the page that explains it. It is the first global destination, **Overview**, on desktop and as a phone tab (P-3), current on exactly `/`. The page title **Overview**, then five zones in one fixed order, the same in the DOM and on screen at every width:

1. **Available now,** the one headline: the figure in `hero` with a true minus when negative, *Before new income* and, when negative, *Over-committed by ৳X*; Available's own sentence, shared with the Available page rather than copied, and **See how it's worked out**. Then a **ring of the money on hand**, divided as the Available page divides it (Available in navy, owed, payments due, set aside; an over-commitment as a `negative`-edged gap), with the money on hand in its middle and a legend of the parts. The drawing is hidden from assistive technology; one sentence states what is free. No ring when nothing is on hand.
2. **Month at a glance:** the current month as a small grid: today in solid coral (orientation, never a financial meaning), a small ocean dot on each day money moved, and a ring on a day still owed a payment (mist with an ocean edge when expected, amber when overdue or due today); what is still due this month; **Open Calendar**. No day shows an amount. Each day opens the Calendar's own evidence for it in a drawer (`/?day=`).
3. **Attention:** at most the **first 3** signals as small neutral cards (an icon tile and the tag, what it is about, the figure), each one link to the page that owns it. **View all N** opens the complete list (below) in a side panel, a bottom sheet on phones, when there are more than 3; with 3 or fewer the action reads **Open Attention**, offered only when one of them can be hidden, since Hide lives only there. With nothing to show, one line: "Nothing needs your attention" and its sentence, with no action. There is no Attention route, inbox or "View all" page.
4. **This month:** built like Where you stand. **Left over** leads on a mist panel (navy, a true minus when more went out, when the panel is outlined in dashed ocean instead; never berry), with one sentence, "Of ৳X that came in, ৳Y went out, net of refunds", the income sources under it, and one bar of the month: where it went in warm tones, then what is left in navy. Beside it, **Where it went** as a statement: one line per category, each measured against what came in (against what went out when more did), the largest the warmest and the smallest grouped as "N more" after five, closing on **Went out** above a navy rule. Came in, Went out, each source and each category open their Activity rows; **Where it went in Cash flow** leads on. No savings rate, percentage or comparison.
5. **Where you stand,** secondary: **Net worth** in its own panel (never the hero), then the statement **You own** (its accounts) − **You owe** (its cards, in a soft berry) = **Net worth**; a card holding credit reads **+ Credit on cards**. **Your accounts** leads on.

No metric cards, charts beyond the ring, the month glance and the journey, recent activity, or commitment and set-aside widgets.

**The Attention list** (the complete list, in the View all sheet; the rows are unchanged from Stage 9):

1. **One list, one row pattern for every kind,** in the fixed priority order ([domain-model.md §11](domain-model.md)). Each row reads, top to bottom: a **tag** (icon + word) with the **figure** it is about on the right; the **title** (what happened, `body` 600); one **sentence** (why it matters, `meta`, `ink-2`); then the **evidence link** (`ocean`, with an arrow) to the page that owns the explanation and the action, and **Hide** on the right only where a signal can be hidden. Internal names (kind, key, occurrence, checkpoint, earmark) never appear.
2. **Tags use the shared Tag tones, never a new colour:** *Overdue* and *Due today* `warning`; *Short* `negative` (berry), with its amount in `negative` and "short"; *Doesn't match* `warning`, with "৳450 off"; *In 3 days* / *Tomorrow* `ocean` on `mist`; *Spending up* and *Adjusted* neutral. Spending more is direction, not a problem: its tag and "+৳26,450" stay neutral. Coral never marks attention.
3. **Evidence links name where they lead:** "Pay or skip in Commitments", "Open Commitments", "Refill or release in Set aside", "Review entries through 20 Sep" (Activity, that account through that day), "See the adjustment" (Activity, that account on that day), "See what changed" (Cash flow's What changed for the month). Each link's accessible name adds the row's title, after the visible label, because rows can share a label.
4. **Hide** (only on a month's spending increase and an unexplained adjustment) is a ghost button beside the link, never competing with it. It hides the row at once, the next one moves up, and it says "Hidden for September." or "Hidden." in a toast with **Undo**; focus returns to the Attention heading. There is no confirmation, no hidden-items view and no history.
5. **Empty:** "Nothing needs your attention" and one sentence ("No payment, money set aside, verified balance or change in spending needs a look right now."), with no action. It never says the finances are good, safe or healthy.

### Quick Add: "What am I recording, and what will it do to my money?"

One dialog (a bottom sheet on phones) with **one structure for Expense, Income and Transfer**; only the words, the marks and the relationship rows change. Top to bottom:

1. **Type:** Expense · Income · Transfer, each with its direction mark, in the raised switch (§2). Changing type keeps the amount and loads that type's remembered account and category.
2. **Amount:** the dialog's one large figure (`hero`), centred, focused when Quick Add opens, regrouped (1,50,000) when it loses focus.
3. **What it will do:** under the amount, each account the entry touches, its name over *before › after*. A transfer shows both accounts and takes a fee from From; a card reads as owed; poisha appear only where they exist. It shows only once the amount is positive and every account it needs is chosen; until then the space stays empty, with no filler copy. The figures restate the ledger's own sign rule ([domain-model.md §5](domain-model.md)).
4. **The relationship:** one box of rows, each a quiet label over its value with an icon: **Category** (its well in the type's tint) and **Paid from** (**Received in** for income); for a transfer, **From** over **To** with a swap button on the line between them, and a *Card payment* tag when To is a card. A row opens a **searchable list in place of the form** (a back arrow; Escape returns to the row): the type's categories with **Recent** first (the last used, then the most used, from the remembered defaults; nothing new is stored), then the rest by name; accounts with their type and balance. Only active categories are offered; Quick Add never manages them.
5. **Fee (transfer only):** "+ Add a fee" opens its amount and a **Fee category** row (any active expense category, starting at the last fee's).
6. **Date and description:** **Today · Yesterday · Earlier**, where Earlier opens the native date field (never a future date); **"+ Add description"** opens the description, the entry's title in Activity (not its note).
7. **Save:** one full-width navy button named for what it records: Save expense, Save income, Save transfer, Save card payment. Enter saves; Ctrl+Enter saves and starts another of the same type; the toast states the effect, with Undo. There is no keyboard-hint line.

## 7. Interaction states

| State | Treatment |
|---|---|
| Hover | `surface-hover` background (table rows: a faint mist); control edges darken to `ink-2` (the soft toolbar edge turns `ocean`) |
| Focus | 2px `ocean` outline, 2px offset; inputs and selects: an `ocean` edge and 1px ring. Always visible on keyboard focus. Closing a dialog, side panel or sheet returns focus to the control that opened it, when that control is still there. |
| Active nav | `navy` text + 2px `navy` underline; on phones, a `navy` mark and icon on the tab |
| Selected (chip, segment, active filter) | `mist` background, `ocean` text, `ocean` edge |
| Buttons | primary: `navy` fill, used for a page's one primary action · the global Add: `coral` fill, `ink` label · secondary: white with a `line-strong` edge · **soft**: `mist` fill, `ocean` label, for a row's main action (Pay, Set aside more, Verify on a changed account) · **quiet**: a neutral chip, for a row's secondary action (Skip, Release) · ghost: text only |
| Destructive | inline: `negative` text, `negative-soft` on hover; the confirming button of a destructive dialog: a filled `negative` button (`negative-hover` on hover), never the brand colour; Cancel beside it stays ghost |
| Evidence link | an `ocean` underline (50%, full on hover) on an amount or phrase that opens the rows behind it; a whole row when the row is the evidence |
| Disabled | 45% opacity, no pointer |
| Pending | the control keeps its size and shows a spinner; no layout shift |
| Success | a toast stating the effect, with **Undo** where the action is reversible ("Saved −৳450 · Cash"). It rests above the phone tab bar, or near the bottom from 768px. While a dialog, side panel or sheet is open it moves to the top, beside the 440px side panel from 768px, so it never sits over the overlay; using its Undo never closes that overlay. *Known limit:* on a phone about 667px tall, a two-line toast over a full-height sheet reaches about 20px into the sheet's top padding. |
| Error | an inline message under the field in plain language; no apology |
| Empty | one sentence on what would appear, plus one action. No illustration. |

- **Quick Add is the one global action** (`N` / **+ Add**): a dialog on desktop and a bottom sheet on mobile (§6). Its lists open inside it rather than as a second overlay, and the ledger's rules, not the browser's, explain a bad amount or date under the field.
- **Motion:** at most 150–250ms, and only for meaning. `prefers-reduced-motion` is respected.

## 8. Responsive

- **Recompose, don't shrink.** Each core page changes its information hierarchy across phone, tablet and desktop rather than squeezing desktop columns:
  - **Page headers:** the title leads; the local switch, period control and primary action follow it on the right where there is room, and wrap under it on phones.
  - **Equation cards:** from 1024px the parts sit side by side with their − / = chips; below that they stack, the result last.
  - **Cash flow:** the outcome leads; Where it went and What changed each span the page. Below 1024px the concentration ring sits above its categories; on phones each category reads name and amount over its bar, and each What changed driver reads its name and change, then its bar, then both periods.
  - **Calendar:** from 1024px the grid spans the page. Below that, never the grid squeezed: a strip of the month's days (bold where something was recorded, a short line where a payment falls due), then the month week by week, each week's Went out in its sticky header and only the days that hold something (date, then money, then payments due). A chosen day opens as a side panel from 768px and a bottom sheet below, only when the URL names it.
  - **Trends:** the three cards span the page at every width. Month by month is the chart-table from 768px (scrolling sideways inside its card when 12 months don't fit) and, below it, calm rows (month; Left over; in and out), never the table squeezed.
  - **Activity:** the three cards stack at every width; phones show two-line rows (description and details, amount); tablets add a Category column and move the account under the description; desktops show all four columns. The page control shows its words from 640px and arrows below.
  - **Available:** the answer leads at every width; How it's worked out sits beside it from 1024px and under it below that, its marks hidden on phones; Behind the numbers is three columns from 1024px and stacked below.
  - **Commitments:** Due now leads, Looking ahead beside it from 1024px; the four lists are two by two at one height from 1024px and stack at their natural height below.
  - **Set aside:** Kept aside leads, Where it's held beside it from 1024px; the purposes are two columns from 1024px and one below.
  - **Accounts:** Where you stand leads at every width; on desktop the ledger aligns account, balance, verification and Action in shared, evenly spaced columns; on phones a row's actions wrap onto their own lines, keep their words and a 40px touch height.
  - **Overview:** Available now leads at every width. From 1024px, Available now and Month at a glance sit side by side, sharing one top edge, with Attention, This month and Where you stand each spanning the page under them. Below 1024px the five zones stack in the same order; at 768px Available now and Month at a glance each keep their figure beside their drawing. This month sets Left over beside Where it went from 1024px and stacks them below; on phones each category's line sits under its name. The page's height does not follow the number of signals: the preview holds at most 3. Attention's links keep a 40px touch height on phones.
- **Navigation:** top navigation from 768px, with five destinations: **Overview · Activity · Accounts · Cash flow · Available**. Below 768px, a bottom tab bar with four around a centred coral **+**: **Overview · Activity · + · Accounts · Available**. Cash flow has no phone tab (P-3, [roadmap.md §8.5](roadmap.md)): on phones it is reached from the Overview's This month, Attention and Activity, and on `/cash-flow`, `/trends` and `/calendar` no tab is current; on desktop Cash flow is current on all three. The logo leads to `/`.
- **Editing:** side panels on desktop; Quick Add as a bottom sheet on phones, the amount focused first (a decimal keypad) and its lists opening inside the sheet; below 640px a transfer fee's amount sits over its category.
- **The first viewport states the page's primary answer** (Available on the Overview and on Available, Left over on Cash flow, Net worth on Accounts, Due now on Commitments, Kept aside on Set aside).
- **No horizontal page scroll at 390px.** Checked at 390, 820 and 1280px for every change to the core pages and their overlays (the Overview also at 1024 and 1920px).

## 9. Open decisions (raised by the reference images)

| # | Topic | Conflict with a frozen decision | Default until resolved |
|---|---|---|---|
| D1 | Overview gains secondary panels (category composition, income vs spending, budgets, goals, upcoming, recent) | [product-baseline.md §6](product-baseline.md) caps the Overview at 4–5 zones | **Resolved 2026-09-27: no secondary panels.** The Overview (Stage 10) is narrowed to Available, Attention and a concise current-month outcome; composition, commitments, protected money and recent activity stay with their owning pages. *(2026-09-28, Stage 10 Slice 0: Where you stand is added as secondary context, not a panel; [product-baseline.md §6](product-baseline.md).)* |
| D2 | Net worth trend line | Net worth over time is **V1.1** (baseline §9; tech-stack change log) | **Resolved 2026-09-27: rejected for now.** It would largely redraw Trends' Income vs Spending (A-14). Net worth stays a figure with You own and You owe. |
| D3 | A "Next income" card | Available is "before new income"; expected income is **V1.1** (runway) | Not shown |
| D4 | Donut chart for categories | Baseline §4.2 names the category donut as part of the generic tracker set | **Resolved 2026-10-01:** no conventional category donut. Cash flow has a **concentration ring** (the three largest categories and one neutral remainder) beside every category's share bar (§5). |
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
| 2026-09-28 | **Negative becomes berry:** `negative` `#B42318` → `#A33A62`, `negative-soft` `#FBE9E6` → `#F8EAF0`, new `negative-hover` `#8A2F52` for the destructive confirmation; the Set aside shortfall (tag and amounts) moves from `warning` to `negative`; §2 records where `negative` is never used, and §5 records chart guidance for it (not built). | The red sat on coral's hue (about 4° vs 10°), so errors read as a darker brand accent. A shortfall was two colours for one fact (a warning tag beside a red-outlined gap); set-aside money that is no longer there is a broken plan, which is what `negative` means. |
| 2026-09-28 | **Stage 8 Slice 2B:** §6 adds the Available screen; §5's Available visual names its segments (owed, payments due, set aside from Available, Available) and the set-aside deduction reads "Set aside from Available"; §8 adds Available's responsive order. | Built in Stage 8 Slice 2B; "Covered set aside" was provisional and read as jargon. |
| 2026-09-28 | **Stage 9 (Attention UI):** §6 adds the Attention screen at `/` — one list with one row pattern (tag and figure, title, sentence, evidence link, Hide where a signal can be hidden), tags in the shared tones (warning; berry only for *Short*; ocean on mist for payments coming up; neutral for spending up and an adjustment), evidence links named for where they lead, Hide → toast with Undo, and a plain empty state; §8 adds its responsive order and first-viewport answer. | Built in Stage 9; the list is reused by the Overview in Stage 10. |
| 2026-09-29 | **Stage 10 Overview redesign ("the Spread"):** §3 adds the `hero` step (48/40) for the Overview's Available figure only, making eight steps. §5: the ring's words name the pool as the money **on hand** ("of ৳Y on hand"), never "counted"; This month becomes a proportional in/out **flow**, which revises the rejected "savings-rate or month-comparison visual on the Overview" to amounts only, never a rate; the rail is labelled directly and what you owe is never drawn on it. §6: the Overview becomes a spread (the navy panel beside one context surface with three bands); Attention shows at most 3 in a compact queue without Hide, and **View all** opens the complete list, with Hide, in a sheet. §8: its responsive order. | The first Overview read as four boxes arranged on a page: a sparse navy block, an Attention column that grew with every signal and outweighed the headline, and two questions in one accounting-style table. |
| 2026-09-29 | **Stage 10 Slice 5 (overlays):** §7 records that closing an overlay returns focus to its opener, that a toast moves to the top (beside a side panel from 768px) while an overlay is open, and that its Undo never closes that overlay, with the measured short-phone limit. | Two V1 UX blockers: focus fell to the page after every panel, and a toast could cover a phone sheet or a tablet side panel. Undo inside Quick Add's save & add another closed Quick Add and lost the next entry. |
| 2026-09-29 | **Stage 10 Slice 4 (P-3 navigation):** §6 makes the Overview the first global destination; §8 records the desktop destinations (Overview · Activity · Accounts · Cash flow · Available) and the phone tabs (Overview · Activity · + · Accounts · Available), with no tab current on `/cash-flow` at phone width. | Built as decided in P-3 ([roadmap.md §8.5](roadmap.md)). |
| 2026-09-29 | **Stage 10 Slice 3 (the Overview):** §6 replaces the Attention screen with the Overview at `/` — the navy Available band with its free-share ring and words ("Free ৳X of ৳Y", "Nothing free"), Attention's first 3 with Show N more / Show fewer in place and a compact empty strip with no action, This month as a statement, and Where you stand with Own, Owe or Credit on cards and the Counts toward / Outside Available rail; the Attention list's rows are unchanged. §8 adds the Overview's responsive order and first-viewport answer. | Built in Stage 10 Slice 3; the Attention page's empty action and 880px cap belonged to a page that no longer exists. |
| 2026-09-28 | **Stage 10 Slice 0 (decisions, not yet built):** §2 makes the Overview's Available band the one card-level navy surface, with mist as its gauge colour; §5 adds the Overview's free-share gauge (the only ring) and the Counts toward / Outside Available rail, drops "the Overview reuses the Available visual" and "(and the Overview, which reuses it)", and narrows "donut" to a category donut, an assets-vs-liabilities ring and any second ring, adding month-progress ticks and Overview time series, savings-rate and comparison visuals to the rejected list; §6 notes that Attention becomes a section of the Overview. The Overview screen and its responsive order are recorded in §6 and §8 when built. | The Overview's approved design ([roadmap.md Stage 10](roadmap.md)) needed a headline surface and one visual of its own; the old rules would have forbidden both, or forced it to copy Available's bar. |
| 2026-09-29 | **Stage 12 (Trends), built:** §5 records the Journey (step lines, the gap as Left over, an outlined hatched gap for a month in the minus, a Left over lane) and What changed's ring-to-dot tracks; §6 adds the Trends screen (the Journey with its month statement, What changed across the halves, Month by month); §8 adds its responsive order and keeps no phone tab current on `/trends`. | Trends was built; the approved single longitudinal visual became the Journey, chosen from three directions drawn on the real demo data. |
| 2026-09-29 | **Calendar, built:** §6 adds the Calendar screen (the month line, the Saturday-first grid with its Week out column, the chosen day's evidence) as the third page of the Cash flow area; §8 adds its responsive order (strip, weekly agenda, bottom sheet below 1024px) and keeps no phone tab current on `/calendar`. | A new feature: when money moved and when payments fall due, drawn on the real demo data before it was built. |
| 2026-09-29 | **Overview redesign** (`5b536f2`, `b8e14f4`; recorded on 2026-10-01): §2 the Overview's Available is a white card, so navy is never a card background, and `canvas` is `#FCFBF9`; §5 the Overview's ring divides the money on hand as the Available page does, and the asset rail and the in/out flow are gone; §6 the Overview has five zones (Available now, Month at a glance, Attention, This month as a journey with Where it went as warm columns, and Where you stand as a statement); §8 its responsive order. | Approved by the owner after several rejected concepts (2026-09-29); this file was not updated at the time. |
| 2026-10-01 | **UI refinement pass** (`c35d777`, `c81ab59`, `46925d1`, `8538d40`, `3bb2c1f`, `88705a8`, `2993c6b`): §2 adds `line-soft` (card edges) and `line-control` (a softer toolbar control edge, still ≥ 3:1), and records that solid coral stays brand, action and orientation while **soft coral tints are the warm spending family** in visualisations, that What changed draws **navy higher to the right and tide lower to the left**, and that amber is used sparingly with **no large yellow-filled surfaces**; §3 `hero` is the headline figure of a hero card; §4 replaces "never nested cards" with: **elevated cards never nest; flat inset surfaces may group evidence**, and records hero cards, quiet washes, equation cards, table bands and list heights; §5 replaces "the only ring" with **rings only for a composition or concentration question**, recording Cash flow's concentration ring (top three plus one neutral remainder), the shared What changed bars, Available's waterfall and Trends' Month by month; §6 records every core screen as built, adds Commitments, and records Activity's pages of 25; §7 adds the soft and quiet buttons; §8 the responsive order of every core page; §9 D4 resolved. | The pages were refined one by one against review and mocks; this file had fallen behind them. The owner asked for a simpler Trends with each figure shown once, so the Journey and its separate table became one chart-table; its totals card may show monthly averages and the share of Came in left over, while What changed stays exact. |
| 2026-10-01 | **This month redesigned:** §6 replaces the journey (Came in → Went out → Left over with warm columns rising to a line) with Left over on a mist panel, the month in one sentence and one bar, beside Where it went as a statement of category lines measured against what came in, five before "N more"; §8 its responsive order. §2 and §4 name the category lines and month bar instead of columns. | The owner's review: the journey misread the month — spending filled two thirds of the width while most of the money was left, the columns were scaled to the largest category instead of to what came in, and the drawing needed a caption to explain it. |
| 2026-10-01 | **Quick Add redesigned** (`8d42599`, `ee2beb2`, `2790ede`): §2 entry types reuse the money-direction families as small marks, and Quick Add's type switch is the one raised selected state; §3 `hero` also sets the Quick Add amount (`display` no longer does); §6 adds Quick Add (type → amount → what it will do → the relationship rows and their in-dialog lists → date and description → Save); §7 and §8 its overlay and phone behaviour. No dependency was added. | Categories and accounts were two identical walls of chips, Transfer switched to dropdowns, and nothing showed what an entry would do before saving. The three types now share one structure, and the effect is shown before it is recorded. |
