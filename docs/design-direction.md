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
5. **Financial direction is not an error state.** Spending more is not "wrong"; `negative` (berry) is kept for what is.
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
| `navy` / `navy-hover` | `#1F385A` / `#182D49` | identity and the strongest emphasis | logo, page and panel titles, key figures, the primary button, the active destination; **higher** in a change explanation; the Overview's Available band, the product's one navy surface (Stage 10) | status |
| `ocean` | `#46678D` | interaction and analysis | focus, the selected state, evidence links, info text; ranked bars; **lower** in a change explanation | status |
| `mist` | `#D8F3F5` | a quiet highlighted surface | the hero of a page (Left over, Net worth; the Overview's hero is navy), selected backgrounds, info tags, icon wells; the free arc of the Overview's gauge, on navy | text |
| `tide` | `#96BED4` | supporting marks | lighter segments of the composition strip | text or anything that must be read (2.0:1 on white) |
| `coral` | `#F06A4E` | the brand and the one global action | the logo stripe, **+ Add** and the phone **+** (ink label, 5.3:1) | spending, higher spending, any financial direction, totals, status, warnings, errors, text |
| `positive` / `-soft` | `#2B6F4F` / `#E4F1EA` | money arrived / verified | "+" on income and refunds, the Verified tag | "spending went down" |
| `warning` / `-soft` | `#9A5B0B` / `#FBF0DC` | needs a look | a changed checkpoint | spending increases |
| `negative` / `-hover` / `-soft` | `#A33A62` / `#8A2F52` / `#F8EAF0` | wrong, broken or destructive (a muted berry) | errors and invalid fields, Delete, a failed toast, the destructive confirmation (hover: `-hover`), a shortfall and its amount | spending or any outflow, a balance or Left over merely below zero, "higher", deterioration, Cancel, decoration |

**Rules:**
- **Coral is a brand and action accent, never a meaning.** It is not spending, higher spending, a negative direction, a warning or an error. Coral and `negative` are only 2.1:1 apart in lightness; they are kept apart by hue (berry about 337°, coral about 10°) and by role, and `negative` always comes with a word and an icon.
- **`negative` colours the gap, not the number line.** It marks the amount by which something is short or over-committed ("৳4,000 short"), never an amount just because it is below zero or leaves an account.
- **In a destructive dialog only the action that destroys is `negative`.** Cancel stays ghost: it is the safe choice, and colouring it would hide which button does the damage. Archive, Release, Skip and Refund are not destructive.
- **Analytical direction uses the blue family:** navy for higher, ocean for lower. Direction is always carried by the word, the sign and the arrow; colour only repeats it.
- **Error and destructive semantics stay separate** from direction: `negative` means a plan is broken, data is wrong or something is being deleted.
- **Spending is never `negative` and never green.**
- **Navy is identity and emphasis, never status.** The header stays white; navy is not a page background. **One card-level exception (Stage 10):** the Overview's Available band, because it holds the product's single headline. On it, figures and text are white, graphics are mist, and tags keep their own chips; `negative` never sits directly on navy. No other card or section is navy.
- **One selected state:** `mist` background, `ocean` text, `ocean` edge, for chips, segmented controls and active filters.
- **Status is always icon + word + colour,** never colour alone.
- **Contrast (measured):** ink 16.3 and ink-2 7.2 on white; ink-2 6.7 on canvas and 6.2 on mist; navy 11.9 on white and 10.2 on mist; ocean 5.9 on white and 5.0 on mist; ink on coral 5.3; `negative` 6.3 on white, 5.9 on canvas, 5.4 on `negative-soft` and on mist; white 6.3 on `negative` and 8.1 on `negative-hover`. Control edges, focus and the navy tab mark are ≥ 3:1.
- **Set aside (protected money) has no dedicated hue in V1** (2026-09-28): covered money is navy, the rest of a target is a mist track, and a shortfall is a `negative` *short* tag, its amount in `negative`, and a `negative`-outlined gap in the target bar. Overdue commitments stay `warning` (a decision is needed; nothing is broken). The colour of commitments is not decided; no hue is reserved for it.

## 3. Typography and numbers

- **Faces:** **Hanken Grotesk** (400/500/600/700) for the whole interface, with **Noto Sans Bengali** for the ৳ glyph, both through `next/font`. **Source Serif 4** sets the FinPilot wordmark and nothing else.
- **Scale:** eight steps and no others; the stock and arbitrary sizes are removed from the theme. Weight is chosen separately.

  | Step | Size / line height | Used for |
  |---|---|---|
  | `hero` | 48 (40 on phones) / 1.0 | the Overview's Available figure, and nothing else: FinPilot's one hero number (Stage 10) |
  | `display` | 32 (28 on phones) / 1.1 | a page's hero figure: Left over, Net worth, Available on its own page, the Quick Add amount |
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
- **Fact vs expectation** (for Commitments, Protected money, Available and Monthly Plan): **filled** = has happened; **soft tint + outline** = spoken for or expected; **empty with a `negative` outline** = missing (shortfall, over-committed). Expected amounts always carry a date or a purpose.
- **`negative` in future charts (guidance only; nothing is built):** it marks only the missing part, drawn as a surface or `negative-soft` fill with a 1–1.5px `negative` edge and a word ("Short", "Over-committed"). Never a solid `negative` segment that relies on colour alone: `negative` and ocean are 1.07:1 apart in luminance. On the Available bridge, an over-commitment is an outlined gap while the figure keeps navy and a true minus. On Trends, Income and Spending stay in the blue family and only the gap of a month that spent more than it earned is outlined; the figure stays `ink` with its sign and words. Deterioration and "over plan" are direction (navy/ocean, arrow, word), never `negative`.
- **Hand-built in CSS (SVG where a shape needs it), with no chart library** ([tech-stack.md](tech-stack.md)). A new chart is added only when its concept exists and its question isn't already answered.
- **Approved future directions** (2026-09-27; recorded because their owning concepts are now decided, not yet designed):

  | Owner | Visual | The one question it answers |
  |---|---|---|
  | Available (Stage 8) | one explainable segmented bar / bridge: what is spoken for (credit owed, payments due, set aside from Available) and what remains | How much of my money is already spoken for, and by what? |
  | Protected money (Stage 7) | a progress bar **only when a target exists**; covered and short stay distinguishable | How close am I, and is it all still really there? |
  | Trends (Stage 12, **built**) | **the Journey**, its one longitudinal visual: Came in (navy) and Went out (ocean) as one flat step per complete month, the gap between them mist where money was left over and an outlined, hatched ocean gap where more went out than came in (never berry); a Left over lane sets every month on one zero line; only amounts are labelled (each line's latest value, a peak only when it rises above the latest month), never an event. What changed draws each driver's move from the earlier half (an open ring) to the recent half (a dot) on one scale. No category sparkline | What shape has my money taken over time? |
  | Monthly Plan (Stage 13) | actual vs intention / projection per planned line | Am I on pace against what I intended? |
  | Overview (Stage 10) | a **free-share ring** on the Available panel: one arc of `available` against the pool (the money **on hand**: the counted balances plus any card credit), with the pool beside it ("of ৳Y on hand"; "Nothing free" above it when Available is ≤ 0). The drawing and its short words are hidden from assistive technology; one sentence reads in their place ("Free: ৳X of the ৳Y on hand in the accounts and cards that count toward Available"). No percentage, no score, no thresholds or colour bands. No ring when the pool is ≤ 0 (the words "Nothing on hand" take its place); an empty track when Available is ≤ 0, the over-commitment tag carrying the rest. It is FinPilot's **only ring**. The pool is never called "counted": with card credit it is larger than what counts toward Available. | How much of the money on hand is still free? |
  | Overview (Stage 10) | **This month's flow:** Came in and Went out as two bars on one scale, the longer full length. Came in is tide for the part that went out again and navy for the part left over, the navy of the Left over figure; a short navy piece of bar beside "Left over" ties the row to it. When more went out than came in, the part of Went out past Came in is outlined in ocean, never filled and never berry, and the piece beside "Left over" is outlined to match. No bars before anything moves, or when refunds make a total negative. Only the three amounts are shown: never a rate, a percentage or a threshold. | Did more come in than went out this month, and by how much? |
  | Overview (Stage 10) | a two-part rail of what you own: **Counts toward Available** (navy) and **Outside Available** (tide), each named directly under its end of the rail with its amount, the outside accounts named after the amount ("Savings", "Savings and 2 more"); drawn only when both parts are ≥ 0 and assets are above zero. What you owe is never drawn on it. | How much of what I own counts toward Available? |

  Cash flow's ranked bars never gain plan markers; plans keep their own visual. The Overview doesn't redraw the Available bridge or the spoken-for bar: its gauge answers a narrower question (how much is free, not what it is spoken for by), and Signals have no charts.
- **Rejected for now:** a savings-rate line (it redraws Income vs Spending); a net-worth line (its monthly change is essentially Left over, A-14); a category donut; an assets-vs-liabilities ring or chart; any second ring; month-progress ticks, until they would carry financially useful information; a savings rate, percentage or month comparison on the Overview *(superseded 2026-09-29, Stage 10: This month's in/out flow is allowed, drawn from amounts only)*; any time series on the Overview; Sankey; stacked category area; heatmap calendar; a commitment calendar; any category colour system; charts on Signals; duplicate charts on the Overview.

## 6. Screens

Each core page answers one question. Keeping them distinct is what prevents features and charts from being duplicated across pages.

### Cash flow: "What happened to my money this month?"

Outcome-first, read in one order:
1. **The month:** navigation and its period ("1–27 Sep 2026, so far" or "Full month").
2. **The outcome:** **Left over** as the hero, with the **savings rate**; **Income** and **Spending** beside it, each opening the transactions behind it.
3. **Where it went** — *composition:* where did the spending go?
4. **What changed** — *explanation:* why is this month different from the comparison period? The direction and size first, both totals, then the drivers, each opening both sides as evidence.

Where it went and What changed are different analytical jobs, not interchangeable widgets.

### Trends: "How is my money changing over time, and what is driving it?"

The other page of the Cash flow area (Stage 12), behind a **Cash flow · Trends** switch; Cash flow stays the current destination. Complete months only: **6 months** (default) or **12 months**, as links, and the subtitle leads to the current month on Cash flow. Three areas, each with its own question:
1. **The Journey** — *what shape has my money taken?* One month's statement above the drawing (§5): Left over on mist, then Came in and Went out, and **Open on Cash flow**. The latest complete month is shown until another is chosen; the months are a radio group, so focus and arrow keys choose one, as do a tap and, on desktop, the pointer. The statement never depends on hover, and the drawing is hidden from assistive technology.
2. **What changed** — *why is the recent half different?* The exact difference ("৳51,120 less went out"), both half totals (which key the ring and the dot), then the higher and lower drivers with their exact change and both halves as evidence; smaller changes fold away; unchanged categories are named. No percentages, shares, averages or judgement.
3. **Month by month** — *what exactly happened each month?* The exact record, newest first, each month opening its Cash flow page. A month in the minus keeps its signed figure and the words "More went out", never a warning colour.

No scores, rates or invented labels such as "raise" or "bonus": the ledger knows what moved, not what it meant. Fewer than three complete months shows an empty state that leads to Cash flow.

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

### Available: "How much can I actually use right now, and why?"

The landing page of the Available area (Available · Commitments · Set aside). Every figure is the Available read model's; the page adds nothing up.

1. **The answer card:** **Available now** as the hero on mist, the figure in navy (a true minus when negative), a *Before new income* tag, and one sentence naming only what actually stands between the balances and the answer ("What's left of ৳1,46,163 in your accounts after what you owe on cards, payments due by 22 Oct and money set aside"). When negative, an *Over-committed by ৳X* tag in `negative` (icon + words); the figure stays navy.
2. **The bridge,** beside the hero on desktop and under it on phones: a table with a quiet rail joining each step and a navy node on each running total. In your accounts → Owed on cards / Credit on cards → *After cards* → Due by ‹date› → *After upcoming payments* → Set aside from Available → **Available**. The card rows are left out without a card account.
3. **The spoken-for bar,** across the card: owed (`ink-3`), payments due (mist with an ocean edge: expected), set aside from Available (`tide`), Available (navy: money that exists and is free), each labelled with its amount. An over-commitment is an outlined `negative` gap past the balances. There is no bar when nothing is in the pool; the bridge explains alone. Hidden from assistive technology: the bridge carries every figure.
4. **Behind the numbers:** three short sections, one per deduction, listing only the rows behind each figure — the counted accounts and cards (with *Not part of Available* for excluded accounts holding money), the payments due (with *Overdue* / *Due today*), and the set-aside money deducted (a shortfall reads "৳300 short — not deducted"; money on an excluded account reads "Not deducted — Savings isn't part of Available"). Each links to the page that owns it; the page never repeats Accounts, Commitments or Set aside.

### Set aside: "What am I keeping money for, and is it still really there?"

A page of the Available area, reached through its local switch (Available · Commitments · Set aside; roadmap §8.3). One card of items, no metric cards; a one-line total only when there are two or more.

1. **Each item:** its name; **one number** ("৳1,20,000 set aside") while everything set aside is covered, or "৳1,10,000 of ৳1,20,000 still covered" with a *short* tag when a balance has fallen.
2. **A target line and bar only when a target exists:** target, still needed (from what is covered) and progress; *Target reached* when covered meets it.
3. **Held in:** the accounts behind it, with any shortfall named on its account.
4. **Actions:** Set aside (more), Release (explicit, never pre-filled), Edit; Archive lives in Edit, final, and refused with its reason while money is set aside. Archived items are listed read-only.

### Overview: "What can I use right now, what needs me, and how does that sit against this month and where I stand?"

The page at `/`, where the logo leads (Stage 10). It owns no financial truth: every figure is the Available read model's, Attention's, Cash flow's or the position's, and each zone leads to the page that explains it. It is the first global destination, **Overview**, on desktop and as a phone tab (P-3), current on exactly `/`. The page title **Overview**, then four zones in one fixed order, the same in the DOM and on screen at every width:

**A spread.** From 1024px the answer sits on a navy page at the left and the context on one white surface at the right, holding three bands separated by hairlines rather than three cards. Below 1024px the four zones stack in the same order. Every band uses the same padding, the three zones of the context surface share one header pattern (name, a quieter line under it, one way on at the right), and their figures end on one right edge.

1. **Available, on the navy panel** (the product's one navy surface, §2), in three groups: the answer — *Available now*, the figure in white `hero` with a true minus when negative, *Before new income* and, when negative, *Over-committed by ৳X* (both keep their own chips); the **free-share ring** (§5) with the money on hand beside it; and the explanation — Available's own sentence, shared with the Available page rather than copied, and **See how it's worked out**, which opens `/available`. The groups follow each other closely, as parts of one answer: the panel is only as tall as they need, and in the spread it shares the context column's top edge but not its height. Focus outlines are mist on navy. The panel never shows the bridge or the spoken-for bar.
2. **Attention:** a compact queue of at most the **first 3** signals, each with a tone stripe, its tag, title and figure on one line, its sentence and its evidence link under them, and no Hide. The count sits under the heading as a quieter line. **View all N** opens the complete Attention list (below) in a side panel, a bottom sheet on phones, when there are more than 3 signals; with 3 or fewer the action reads **Open Attention**, offered only when one of them can be hidden, since Hide lives only there; otherwise there is none. After Hide the next signal moves up and focus goes to the sheet's heading ("6 things need a look"); Undo keeps the sheet open; closing it returns focus to the action, or to the Attention heading when hiding removed the reason for it. With nothing to show, one line: "Nothing needs your attention" and its sentence, with no action. There is no Attention route, inbox or "View all" page.
3. **This month:** the month so far (its period under the name), drawn as a flow (§5) — Came in and Went out on one scale with their amounts, and **Left over** (`figure`, navy, a true minus when more went out; never berry). Came in and Went out open their Activity rows; **Where it went in Cash flow** leads on. No savings rate, percentage or comparison.
4. **Where you stand,** secondary: **Net worth** (`figure`, never a hero), **You own** and its rail (§5), then **You owe on cards** (or **Credit on cards** when the cards hold credit) on its own line. **Your accounts** leads on.

No metric cards, charts beyond the ring, the flow and the rail, recent activity, or commitment and set-aside widgets.

**The Attention list** (the complete list, in the View all sheet; the rows are unchanged from Stage 9):

1. **One list, one row pattern for every kind,** in the fixed priority order ([domain-model.md §11](domain-model.md)). Each row reads, top to bottom: a **tag** (icon + word) with the **figure** it is about on the right; the **title** (what happened, `body` 600); one **sentence** (why it matters, `meta`, `ink-2`); then the **evidence link** (`ocean`, with an arrow) to the page that owns the explanation and the action, and **Hide** on the right only where a signal can be hidden. Internal names (kind, key, occurrence, checkpoint, earmark) never appear.
2. **Tags use the shared Tag tones, never a new colour:** *Overdue* and *Due today* `warning`; *Short* `negative` (berry), with its amount in `negative` and "short"; *Doesn't match* `warning`, with "৳450 off"; *In 3 days* / *Tomorrow* `ocean` on `mist`; *Spending up* and *Adjusted* neutral. Spending more is direction, not a problem: its tag and "+৳26,450" stay neutral. Coral never marks attention.
3. **Evidence links name where they lead:** "Pay or skip in Commitments", "Open Commitments", "Refill or release in Set aside", "Review entries through 20 Sep" (Activity, that account through that day), "See the adjustment" (Activity, that account on that day), "See what changed" (Cash flow's What changed for the month). Each link's accessible name adds the row's title, after the visible label, because rows can share a label.
4. **Hide** (only on a month's spending increase and an unexplained adjustment) is a ghost button beside the link, never competing with it. It hides the row at once, the next one moves up, and it says "Hidden for September." or "Hidden." in a toast with **Undo**; focus returns to the Attention heading. There is no confirmation, no hidden-items view and no history.
5. **Empty:** "Nothing needs your attention" and one sentence ("No payment, money set aside, verified balance or change in spending needs a look right now."), with no action. It never says the finances are good, safe or healthy.

## 7. Interaction states

| State | Treatment |
|---|---|
| Hover | `surface-hover` background; control edges darken to `ink-2` |
| Focus | 2px `ocean` outline, 2px offset; inputs and selects: an `ocean` edge and 1px ring. Always visible on keyboard focus. Closing a dialog, side panel or sheet returns focus to the control that opened it, when that control is still there. |
| Active nav | `navy` text + 2px `navy` underline; on phones, a `navy` mark and icon on the tab |
| Selected (chip, segment, active filter) | `mist` background, `ocean` text, `ocean` edge |
| Buttons | primary: `navy` fill · the global Add: `coral` fill, `ink` label · secondary: white with a `line-strong` edge · ghost: text only |
| Destructive | inline: `negative` text, `negative-soft` on hover; the confirming button of a destructive dialog: a filled `negative` button (`negative-hover` on hover), never the brand colour; Cancel beside it stays ghost |
| Evidence link | an `ocean` underline (50%, full on hover) on an amount or phrase that opens the rows behind it; a whole row when the row is the evidence |
| Disabled | 45% opacity, no pointer |
| Pending | the control keeps its size and shows a spinner; no layout shift |
| Success | a toast stating the effect, with **Undo** where the action is reversible ("Saved −৳450 · Cash"). It rests above the phone tab bar, or near the bottom from 768px. While a dialog, side panel or sheet is open it moves to the top, beside the 440px side panel from 768px, so it never sits over the overlay; using its Undo never closes that overlay. *Known limit:* on a phone about 667px tall, a two-line toast over a full-height sheet reaches about 20px into the sheet's top padding. |
| Error | an inline message under the field in plain language; no apology |
| Empty | one sentence on what would appear, plus one action. No illustration. |

- **Quick Add is the one global action** (`N` / **+ Add**): a dialog on desktop and a bottom sheet on mobile.
- **Motion:** at most 150–250ms, and only for meaning. `prefers-reduced-motion` is respected.

## 8. Responsive

- **Recompose, don't shrink.** Each core page changes its information hierarchy across phone, tablet and desktop rather than squeezing desktop columns:
  - **Cash flow:** on phones the month leads, then Left over with Income and Spending side by side under it; on wider screens they sit beside the outcome, and Where it went and What changed sit side by side on desktop.
  - **Trends:** the Journey spans the page at every width and is drawn at its measured width, so its text never scales; on phones the statement stacks (Left over, then Came in and Went out side by side), the end labels give way to the legend, "Left over" moves above its lane, and 12 months use initials. From 1024px What changed (5 parts) sits beside Month by month (7 parts). Month by month is a table from 768px and, below it, calm rows (month; Left over; in and out), never the table squeezed.
  - **Activity:** phones show two-line rows (description and details, amount); tablets add a Category column and move the account under the description; desktops show all four columns.
  - **Available:** the answer leads at every width; the bridge sits beside it from 1024px and under it below that; the bar spans the card; Behind the numbers is three columns from 1024px and stacked below.
  - **Accounts:** Net worth leads at every width, Own and Owe beside or under it; on desktop the ledger aligns balances, verifications and Verify in shared columns; on phones a row's actions wrap onto its own lines, keep their words and a 40px touch height.
  - **Overview:** Available leads at every width. From 1024px, the spread: the navy panel (5 parts, only as tall as its content) beside the context surface (7 parts), sharing one top edge, the ring 192px (240px from 1280px) with the money on hand beside it. At 768px, one column: the panel becomes a wide band, the answer and explanation on the left and the ring (144px) on the right; This month and Where you stand sit side by side inside the context surface. On phones everything stacks, the ring (112px) beside its words; View all opens a bottom sheet. The page's height does not follow the number of signals: the preview holds at most 3. Attention rows keep a 40px touch height for their link on phones.
- **Navigation:** top navigation from 768px, with five destinations: **Overview · Activity · Accounts · Cash flow · Available**. Below 768px, a bottom tab bar with four around a centred coral **+**: **Overview · Activity · + · Accounts · Available**. Cash flow has no phone tab (P-3, [roadmap.md §8.5](roadmap.md)): on phones it is reached from the Overview's This month, Attention and Activity, and on `/cash-flow` and `/trends` no tab is current; on desktop Cash flow is current on both. The logo leads to `/`.
- **Editing:** side panels on desktop; Quick Add as a bottom sheet with the keypad first on phones.
- **The first viewport states the page's primary answer** (Available on the Overview, with its free share; Left over on Cash flow, Net worth on Accounts, Available on Available).
- **No horizontal page scroll at 390px.** Checked at 390, 820 and 1280px for every change to the core pages and their overlays (the Overview also at 1024 and 1920px).

## 9. Open decisions (raised by the reference images)

| # | Topic | Conflict with a frozen decision | Default until resolved |
|---|---|---|---|
| D1 | Overview gains secondary panels (category composition, income vs spending, budgets, goals, upcoming, recent) | [product-baseline.md §6](product-baseline.md) caps the Overview at 4–5 zones | **Resolved 2026-09-27: no secondary panels.** The Overview (Stage 10) is narrowed to Available, Attention and a concise current-month outcome; composition, commitments, protected money and recent activity stay with their owning pages. *(2026-09-28, Stage 10 Slice 0: Where you stand is added as secondary context, not a panel; [product-baseline.md §6](product-baseline.md).)* |
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
| 2026-09-28 | **Negative becomes berry:** `negative` `#B42318` → `#A33A62`, `negative-soft` `#FBE9E6` → `#F8EAF0`, new `negative-hover` `#8A2F52` for the destructive confirmation; the Set aside shortfall (tag and amounts) moves from `warning` to `negative`; §2 records where `negative` is never used, and §5 records chart guidance for it (not built). | The red sat on coral's hue (about 4° vs 10°), so errors read as a darker brand accent. A shortfall was two colours for one fact (a warning tag beside a red-outlined gap); set-aside money that is no longer there is a broken plan, which is what `negative` means. |
| 2026-09-28 | **Stage 8 Slice 2B:** §6 adds the Available screen; §5's Available visual names its segments (owed, payments due, set aside from Available, Available) and the set-aside deduction reads "Set aside from Available"; §8 adds Available's responsive order. | Built in Stage 8 Slice 2B; "Covered set aside" was provisional and read as jargon. |
| 2026-09-28 | **Stage 9 (Attention UI):** §6 adds the Attention screen at `/` — one list with one row pattern (tag and figure, title, sentence, evidence link, Hide where a signal can be hidden), tags in the shared tones (warning; berry only for *Short*; ocean on mist for payments coming up; neutral for spending up and an adjustment), evidence links named for where they lead, Hide → toast with Undo, and a plain empty state; §8 adds its responsive order and first-viewport answer. | Built in Stage 9; the list is reused by the Overview in Stage 10. |
| 2026-09-29 | **Stage 10 Overview redesign ("the Spread"):** §3 adds the `hero` step (48/40) for the Overview's Available figure only, making eight steps. §5: the ring's words name the pool as the money **on hand** ("of ৳Y on hand"), never "counted"; This month becomes a proportional in/out **flow**, which revises the rejected "savings-rate or month-comparison visual on the Overview" to amounts only, never a rate; the rail is labelled directly and what you owe is never drawn on it. §6: the Overview becomes a spread (the navy panel beside one context surface with three bands); Attention shows at most 3 in a compact queue without Hide, and **View all** opens the complete list, with Hide, in a sheet. §8: its responsive order. | The first Overview read as four boxes arranged on a page: a sparse navy block, an Attention column that grew with every signal and outweighed the headline, and two questions in one accounting-style table. |
| 2026-09-29 | **Stage 10 Slice 5 (overlays):** §7 records that closing an overlay returns focus to its opener, that a toast moves to the top (beside a side panel from 768px) while an overlay is open, and that its Undo never closes that overlay, with the measured short-phone limit. | Two V1 UX blockers: focus fell to the page after every panel, and a toast could cover a phone sheet or a tablet side panel. Undo inside Quick Add's save & add another closed Quick Add and lost the next entry. |
| 2026-09-29 | **Stage 10 Slice 4 (P-3 navigation):** §6 makes the Overview the first global destination; §8 records the desktop destinations (Overview · Activity · Accounts · Cash flow · Available) and the phone tabs (Overview · Activity · + · Accounts · Available), with no tab current on `/cash-flow` at phone width. | Built as decided in P-3 ([roadmap.md §8.5](roadmap.md)). |
| 2026-09-29 | **Stage 10 Slice 3 (the Overview):** §6 replaces the Attention screen with the Overview at `/` — the navy Available band with its free-share ring and words ("Free ৳X of ৳Y", "Nothing free"), Attention's first 3 with Show N more / Show fewer in place and a compact empty strip with no action, This month as a statement, and Where you stand with Own, Owe or Credit on cards and the Counts toward / Outside Available rail; the Attention list's rows are unchanged. §8 adds the Overview's responsive order and first-viewport answer. | Built in Stage 10 Slice 3; the Attention page's empty action and 880px cap belonged to a page that no longer exists. |
| 2026-09-28 | **Stage 10 Slice 0 (decisions, not yet built):** §2 makes the Overview's Available band the one card-level navy surface, with mist as its gauge colour; §5 adds the Overview's free-share gauge (the only ring) and the Counts toward / Outside Available rail, drops "the Overview reuses the Available visual" and "(and the Overview, which reuses it)", and narrows "donut" to a category donut, an assets-vs-liabilities ring and any second ring, adding month-progress ticks and Overview time series, savings-rate and comparison visuals to the rejected list; §6 notes that Attention becomes a section of the Overview. The Overview screen and its responsive order are recorded in §6 and §8 when built. | The Overview's approved design ([roadmap.md Stage 10](roadmap.md)) needed a headline surface and one visual of its own; the old rules would have forbidden both, or forced it to copy Available's bar. |
| 2026-09-29 | **Stage 12 (Trends), built:** §5 records the Journey (step lines, the gap as Left over, an outlined hatched gap for a month in the minus, a Left over lane) and What changed's ring-to-dot tracks; §6 adds the Trends screen (the Journey with its month statement, What changed across the halves, Month by month); §8 adds its responsive order and keeps no phone tab current on `/trends`. | Trends was built; the approved single longitudinal visual became the Journey, chosen from three directions drawn on the real demo data. |
