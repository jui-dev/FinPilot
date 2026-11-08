# FinPilot — Mandatory Acceptance Scenarios

**Status:** Frozen — approved 2026-09-22 (including the August prologue correction). Product language and stage mapping updated 2026-09-27 (§9); **no expected value changed**.
**Binding rules:**
- The implementation must reproduce **every number in this document exactly**.
- These scenarios must never be replaced by generic CRUD tests.
- A failing assertion blocks a release.
- An assertion may only change if this document changes first, with the reason recorded in §9.

**Related:** [domain-model.md](domain-model.md) · [roadmap.md](roadmap.md)

---

## 1. How the suite runs

- **Real database.** Each test gets an in-memory SQLite database built from a serialised, fully migrated template. There are no mocked repositories.
- **Injected clock:** today = **2026-09-22**, owner timezone **Asia/Dhaka**.
- **Units:** amounts are written in whole taka (৳). The fixture stores them as **integer poisha (× 100)**, and assertions compare integers exactly.
- **Through services, not SQL:** the fixture is built through application services wherever a service exists at that stage (create transaction, reconcile, pay/link occurrence, add earmark). Constraint tests are the only place raw SQL inserts are used.
- **Independent mutations:** **M1–M3 are each applied independently to the base scenario** (after row 11), never cumulatively.
- **Signal assertions** check that the listed signals are *present*, with the stated parameters. They do not assert the complete signal set.
- **Progress tracking:** the suite is created in roadmap stage **F1** with every assertion as `it.todo`. Each stage turns its assertions green (§8).

## 2. Fixture: owner, categories, accounts

- **Owner:** the demo owner, with base currency BDT and timezone Asia/Dhaka.
- **Categories (seeded defaults):**
  - Income: Salary, Other Income.
  - Expense: Housing, Food & Dining, Groceries, Transport, Shopping, Utilities, Entertainment, Health, Fees & Charges, Other.

| Account | Type | Class | `included_in_available` | Opening balance (**Aug 1**) |
|---|---|---|---|---|
| Bank | bank | asset | yes | 20,000 |
| Cash | cash | asset | yes | 2,200 |
| bKash | mobile_wallet | asset | yes | 9,537 |
| Savings | savings | asset | **no** | 120,000 |
| Visa | credit_card | liability | yes (always, for a liability; [domain-model.md §5](domain-model.md)) | −3,200 (owed) |

## 3. Fixture: commitments, Monthly Plan intention, protected money

| Commitment | Category | Expected amount | Schedule | Start (anchor) | Expected account |
|---|---|---|---|---|---|
| Rent | Housing | 30,000 | monthly, the 1st | **Aug 1** | Bank |
| Internet | Utilities | 1,500 | monthly, the 25th | **Aug 25** | bKash |
| Streaming | Entertainment | 700 | monthly, the 3rd | **Oct 3** (a new subscription) | Visa |

- **Monthly Plan intention** (formerly *Budget*; used only by A-40 and M1-4, Stage 13): Housing, 30,000, from **August 2026**. Whether Stage 13 stores it as an effective-dated intention or as a September plan line is open; either reproduces A-40 and M1-4 exactly.
- **Protected money** (formerly *Goal*): *Laptop*: target 150,000, no target date, active.

| Earmark entry | Protected-money item | Account | Amount | Balance at that time | Valid? |
|---|---|---|---|---|---|
| Aug 10 | Laptop | Savings | +100,000 | 120,000 | yes (100,000 ≤ 120,000) |
| Sep 3 | Laptop | Bank | +20,000 | 150,000 | yes (20,000 ≤ 150,000) |

## 4. The ledger

### 4.1 August prologue

| # | Date | Event | Row(s) | Bank | Cash | bKash | Savings | Visa |
|---|---|---|---|---|---|---|---|---|
| P0 | Aug 1 | opening balances | 5 × `opening_balance` | 20,000 | 2,200 | 9,537 | 120,000 | −3,200 |
| P1 | Aug 1 | salary | income +95,000 Bank, Salary | 115,000 | | | | |
| P2 | Aug 2 | rent | expense −30,000 Bank, Housing; **pays the Rent Aug 1 occurrence** | 85,000 | | | | |
| P3 | Aug 6 | groceries on card | expense −5,000 Visa, Groceries | | | | | −8,200 |
| P4 | Aug 9 | shopping on card | expense −3,800 Visa, Shopping | | | | | −12,000 |
| P5 | Aug 13 | cash-out with fee | group: transfer −2,000 bKash→Cash + expense −37 bKash, Fees & Charges | | 4,200 | 7,500 | | |
| P6 | Aug 15 | food | expense −1,200 Cash, Food & Dining | | 3,000 | | | |
| P7 | Aug 25 | internet | expense −1,500 bKash, Utilities; **pays the Internet Aug 25 occurrence** | | | 6,000 | | |

**Balances carried into Sep 1:** Bank **85,000** · Cash **3,000** · bKash **6,000** · Savings **120,000** · Visa **−12,000**. Net worth 202,000.

### 4.2 September

| # | Date | Event | Row(s) | Bank | Cash | bKash | Savings | Visa |
|---|---|---|---|---|---|---|---|---|
| 0 | Sep 1 | balances carried in | — | 85,000 | 3,000 | 6,000 | 120,000 | −12,000 |
| 1 | Sep 1 | salary | income +95,000 Bank, Salary | 180,000 | | | | |
| 2 | Sep 2 | rent | expense −30,000 Bank, Housing; **pays the Rent Sep 1 occurrence** | 150,000 | | | | |
| 3 | Sep 5 | groceries on card | expense −4,200 Visa, Groceries | | | | | −16,200 |
| 4 | Sep 8 | jacket on card | expense −3,000 Visa, Shopping | | | | | −19,200 |
| 5 | Sep 10 | **card payment** | transfer −12,000 Bank→Visa | 138,000 | | | | −7,200 |
| 6 | Sep 12 | top up bKash | transfer −5,000 Bank→bKash | 133,000 | | 11,000 | | |
| 7 | Sep 14 | **cash-out with fee** | group: transfer −2,000 bKash→Cash + expense −37 bKash, Fees & Charges | | 5,000 | 8,963 | | |
| 8 | Sep 15 | lunch | expense −450 Cash, Food & Dining | | 4,550 | | | |
| 9 | Sep 16 | **jacket refund** | refund +1,200 Visa, Shopping (`refund_of` → row 4) | | | | | −6,000 |
| 10 | Sep 20 | **reconcile Cash**: counted 4,200 | the reconcile service posts adjustment −350 and a checkpoint (as of Sep 20, stated 4,200) | | 4,200 | | | |
| 11 | Sep 21 | medical | expense −30,000 Savings, Health | | | | 90,000 | |

## 5. Expected results on 2026-09-22 (base scenario)

### 5.1 Ledger and position
| ID | Assertion | Expected |
|---|---|---|
| A-01 | Balances at the end of Aug 31 | Bank 85,000 · Cash 3,000 · bKash 6,000 · Savings 120,000 · Visa −12,000 |
| A-02 | Current balances (excluding Cash) | Bank **133,000** · bKash **8,963** · Savings **90,000** · Visa **−6,000** |
| A-03 | Spending Sep 1–22, by category | Housing 30,000 · Health 30,000 · Groceries 4,200 · Shopping 1,800 · Food & Dining 450 · Fees & Charges 37 · **total 66,487** |
| A-04 | Income Sep 1–22 | **95,000** (the refund is not income) |
| A-05 | Savings rate Sep 1–22 | (95,000 − 66,487) / 95,000 = 28,513 / 95,000 → **30.0%** |
| A-06 | Transfers (12,000 card payment, 5,000 top-up, 2,000 cash-out) | contribute **0** to income and to spending; the Σ of all transfer entries = **0** |
| A-07 | Spending Aug 1–22, by category | Housing 30,000 · Groceries 5,000 · Shopping 3,800 · Food & Dining 1,200 · Fees & Charges 37 · **total 40,037** (Utilities 0: Aug 25 falls outside the window) |
| A-08 | What a naive tracker would show (documented contrast, asserted as *not* equal) | Spending ≠ 78,487 (card payment counted as an expense); income ≠ 96,200 (refund counted as income) |
| A-10 | Reconciliation | adjustment **−350** posted; Cash **4,200** |
| A-11 | Net worth | 133,000 + 4,200 + 8,963 + 90,000 − 6,000 = **230,163**; assets **236,163**; liabilities **6,000** |
| A-12 | The adjustment is excluded from analytics | Spending remains **66,487** |
| A-13 | Checkpoint (Cash, Sep 20) | status **matches** (the derived balance as of Sep 20 = 4,200) |
| A-14 | Net worth reconciles with flows | 230,163 − 202,000 = 28,163 = income 95,000 − spending 66,487 − adjustment 350 |

### 5.2 Month-over-month (like for like: Sep 1–22 vs Aug 1–22)
| ID | Assertion | Expected |
|---|---|---|
| A-20 | Δ by category | Health **+30,000** · Shopping **−2,000** · Groceries **−800** · Food & Dining **−750** · Housing 0 · Fees & Charges 0 |
| A-21 | Totals | net Δ **+26,450** (66,487 − 40,037); gross increases **30,000** |
| A-22 | Attribution | Health = **100%** of gross increases; Shopping, Groceries and Food & Dining are offsets. (Relative to the net change, Health would be 113%, which is why gross increases is the denominator.) |
| A-23 | Materiality (\|Δ\| ≥ max(500, 10% of the previous-window amount)) | Health, Shopping (vs 3,800), Groceries (vs 5,000) and Food & Dining (vs 1,200) are all **material** |

### 5.3 Commitments
| ID | Assertion | Expected |
|---|---|---|
| A-30 | Occurrences materialised up to today + 60 = Nov 21 | **paid:** Rent Aug 1 (→ P2), Internet Aug 25 (→ P7), Rent Sep 1 (→ row 2) · **pending:** Internet Sep 25, Rent Oct 1, Streaming Oct 3, Internet Oct 25, Rent Nov 1, Streaming Nov 3 · no Streaming occurrence before Oct 3 |
| A-31 | Pending with due date ≤ Oct 22 (the Available horizon) | Internet 1,500 + Rent 30,000 + Streaming 700 = **32,200** |
| A-32 | Materialisation is idempotent | reading twice produces **no duplicate** occurrences |

### 5.4 Monthly Plan (formerly Budget) — Stage 13, deferred beyond the V1 candidate

Kept deliberately, with every value unchanged: this is the commitment-aware projection that Monthly Plan must reproduce. "Limit" reads as the planned intention for the category. A-40 and M1-4 stay `todo` at the V1 candidate.

| ID | Assertion | Expected |
|---|---|---|
| A-40 | Housing, September | limit 30,000 · usage 30,000 · fixed 30,000 · variable 0 · remaining committed 0 · projected **30,000** · status **on_track** |

### 5.5 Protected money and earmarks
| ID | Assertion | Expected |
|---|---|---|
| A-50 | Laptop | reserved **120,000** (Savings 100,000 + Bank 20,000) · covered **110,000** (Savings 90,000 + Bank 20,000) · short **10,000** (Savings) · progress **73%** (110,000 / 150,000) |
| A-51 | Rejected earmarks leave no write (rollback) | +1,000 on Savings on Sep 22 (would make Σ 101,000 > balance 90,000) → **rejected**; an earmark on Visa (a liability) → **rejected**; the number of earmark entries is unchanged |

### 5.6 Available
| ID | Assertion | Expected |
|---|---|---|
| A-60 | Bridge | included asset balances **146,163** (133,000 + 4,200 + 8,963) → − credit owed **6,000** = 140,163 → − commitments due ≤ Oct 22 **32,200** = 107,963 → − covered set aside (protected money backed) on included accounts **20,000** (Bank; the Savings earmark is excluded, A-61) = **Available 87,963** |
| A-61 | Exclusions | the Savings balance (90,000) and the Savings earmark are **not** part of Available; the Oct 1 salary is **not** included (V1 has no expected income) |

### 5.7 Signals (presence and parameters)
| ID | Signal | Parameters |
|---|---|---|
| A-70 | Protected money under-covered (family 5) | Laptop, short **10,000**, account Savings |
| A-71 | Commitment due soon | Internet, due Sep 25, **in 3 days**, 1,500 |
| A-72 | Month-over-month attribution (family 2; `spending_up`, whose trigger was decided in Stage 9: a net increase ≥ max(৳5,000, 20% of the previous same-days total), [domain-model.md §11](domain-model.md)) | Health accounted for **all** of the increase (+30,000); offsets: Shopping −2,000, Groceries −800, Food & Dining −750 (the **material** offsets, as What changed lists them; all three are material, A-23) |
| A-73 | Reconciliation adjustment (info) | Cash, unexplained difference **350**, Sep 20 |

## 6. Mutations (each applied independently to the base scenario)

### M1 — delete the Sep 2 rent transaction (row 2)
| ID | Assertion | Expected |
|---|---|---|
| M1-1 | Occurrence | Rent Sep 1 is back to **pending**, displayed as **overdue** |
| M1-2 | Balances | Bank **163,000**; net worth **260,163**; spending Sep 1–22 **36,487** |
| M1-3 | Available **unchanged** | included assets 176,163 → − 6,000 → − commitments **62,200** (overdue Rent Sep 1 30,000 + 32,200) → − 20,000 = **87,963** |
| M1-4 | Housing Monthly Plan line (formerly budget; Stage 13) | usage 0 · remaining committed 30,000 (the overdue occurrence in the current month) · projected **30,000** · **on_track** |
| M1-5 | Signal | Rent **overdue 21 days** (due Sep 1) |

### M2 — move the Sep 15 lunch (row 8) from Cash to bKash
| ID | Assertion | Expected |
|---|---|---|
| M2-1 | Checkpoint | Cash as of Sep 20 = 3,000 + 2,000 − 350 = **4,650** against the stated 4,200 → status **broken**, difference **450** |
| M2-2 | Balances | Cash **4,650**; bKash **8,513**; net worth **230,163** (unchanged); spending **66,487** (unchanged); Available **87,963** (unchanged) |
| M2-3 | Signal | Cash verification on Sep 20 **no longer matches**, **450**. It replaces the A-73 adjustment signal for that checkpoint (one signal per checkpoint, [domain-model.md §11](domain-model.md)). |

### M3 — the card payment (row 5) wrongly entered as an expense, then corrected
| ID | Assertion | Expected |
|---|---|---|
| M3-1 | Wrong entry | row 5 entered as an expense −12,000 Bank, category Other: Bank 133,000 · Visa **−18,000** · spending **78,487** (Other 12,000) · net worth **218,163** · Available **75,963** |
| M3-2 | Correction | the **same row** is edited to type transfer, counter account Visa, with the category cleared. This is a one-row update, and the row id is unchanged. |
| M3-3 | After correction | every base value is restored: Visa −6,000 · spending 66,487 · net worth 230,163 · Available 87,963 |

## 7. Illustrative unit cases (not part of the fixture)

| Case | Input | Expected |
|---|---|---|
| Dining projection | limit 8,000; 6,200 variable spent; 22 of 30 days elapsed; no commitments | projected 6,200 + 6,200/22 × 8 = **8,455** (rounded once, at presentation) → **at_risk**, over by 455 |
| Naive vs commitment-aware | Housing 30,000 matched rent on day 2; day 22 of 30 | naive linear pace 40,909; FinPilot **30,000** |
| Early month | day 3 | no variable projection; committed overruns are still reported |

## 8. Assertions by roadmap stage

| Stage | Assertions turned green |
|---|---|
| F1 | none. Every assertion exists as `it.todo`. |
| F2 — Ledger persistence | A-01, A-02, A-03, A-04, A-05, A-06, A-07, A-08, M3 ledger values (M3-1 and M3-3: Bank, Visa and spending; M3-2) |
| 4a — Reconciliation write path | A-10, A-11, A-12, A-14, M2-2 (excluding Available), **M3-1 and M3-3 net worth** (218,163 and 230,163 include the row-10 adjustment) |
| 4b — Verification status | A-13, M2-1 |
| 5a — Monthly cash flow foundation | none (A-03, A-04, A-05 are already green) |
| 5b — Month-over-month explanation | A-20, A-21, A-22, A-23 |
| 5c — Evidence drill-down | none |
| 5d — Charts / visual analytics | dropped at the Milestone B review |
| 5e — Evidence & trust close-out | none |
| 6 — Commitments | A-30, A-31, A-32, M1-1, M1-2 |
| 7 — Protected money | A-50, A-51 |
| 8 — Available | A-60, A-61, M1-3, and the Available values in M2-2, M3-1 and M3-3 |
| 9 — Signals | A-70, A-71, A-72, A-73, M1-5, M2-3 |
| 10 — Overview + V1 readiness | none new. **V1 exit criterion:** every assertion is green except A-40 and M1-4, which are deliberately deferred with Monthly Plan. |
| 11 — Extended demo history | none |
| 12 — Trends | none |
| 13 — Monthly Plan | A-40, M1-4 → **full suite green** (no `todo` remaining). *Cut from V1 on 2026-11-08: A-40 and M1-4 stay deferred, as the V1 exit criterion already allows.* |

Stage numbers changed on 2026-09-27 ([roadmap.md §8](roadmap.md) maps old → new). The change-log entries below keep the numbers they were written with.

## 9. Change log

| Date | Change | Reason |
|---|---|---|
| 2026-09-22 | **August prologue added.** Opening balances moved to Aug 1 with the P1–P7 activity. The Laptop earmark on Savings is dated Aug 10. Streaming starts Oct 3. Housing budget effective August. | The original scenario had an August earmark on an account opened Sep 1 (the write-time invariant would reject it). The month-over-month assertion needed August transactions dated before the opening balances. Streaming active on Sep 3 would have been overdue on Sep 22, making Available 87,263. **Every September number is unchanged.** |
| 2026-09-22 | **D4 (F2):** the net-worth values of M3-1 and M3-3 move from F2 to Stage 4. No expected number changed. | Both figures include row 10's −350 cash adjustment, which exists only once the Stage 4 reconcile service does. |
| 2026-09-22 | Added A-14 (net worth reconciles with flows), A-23 (materiality), A-30/A-32 (occurrence set, idempotency), A-51 (rollback), M1-2/M1-4, and the Available values in M2/M3 | These make explicit what the approved scenario implied, and give the rollback rule from the tech stack decision its test |
| 2026-09-23 | **Stage 4 split into 4a (reconciliation write path) and 4b (verification status)** in §8. No expected value changed; only the stage that turns each assertion green. A-13 and M2-1 move to 4b. | A checkpoint's status is derived from the ledger *after* the fact, so it is a separate boundary from posting the adjustment. Recorded here because §8 otherwise implies every Stage 4 assertion goes green together. |
| 2026-09-24 | **Stage 5 split into 5a–5d** in §8. No expected value changed; A-20…A-23 now go green in 5b. | Monthly analysis is built in its conceptual order (what happened → where it went → what changed → evidence → visuals); a single stage would have combined four boundaries. Recorded here because §8 otherwise implies every Stage 5 assertion goes green together. |
| 2026-09-27 | **§8: Stage 5d dropped and 5e (evidence & trust close-out) added** at the Milestone B review. No expected value changed, and no assertion moved. | 5d had no assertions; charts are now built within the stages that own their concepts. Recorded here so §8 matches [roadmap.md](roadmap.md). |
| 2026-09-27 | **Product-architecture decisions: language and stage mapping only. No expected value changed, and every assertion ID is kept.** §3 and §5.4–§5.7: *Budget* → Monthly Plan intention, *Goal* → Protected money. §8: A-50/A-51 → Stage 7, Available → Stage 8, signals → Stage 9, **A-40 and M1-4 → Stage 13 (Monthly Plan)**, deferred beyond the V1 candidate but not weakened; the V1 exit criterion becomes "all green except A-40 and M1-4". A-72 is kept while family 2's trigger is reconsidered for Stage 9. Visa's `included_in_available` is now required rather than chosen (the liability invariant); its value was already *yes*. A-23: the pipes in `\|Δ\|` are escaped so the table parses (Markdown only; wording and values unchanged). | Budgets are superseded by the optional Monthly Plan and Goals by Protected money ([domain-model.md §7, §9](domain-model.md)); the stages were re-sequenced ([roadmap.md §8](roadmap.md)). |
| 2026-09-28 | **A-60 wording (Stage 8 Slice 0). No expected value changed.** The last bridge term read "protected money **reserved** on included accounts"; it now reads "covered set aside (protected money backed)". It is still **20,000**, and Available is still **87,963**. | Available subtracts covered (backed) set-aside money, never the nominal reserved amount ([domain-model.md §10](domain-model.md)). In the fixture the Bank earmark is fully covered, so the two readings give the same number, but "reserved" named the wrong rule. |
| 2026-09-28 | **Stage 9 Slice 0: clarifications only. No expected value changed, and no assertion was added or removed.** A-72: names the signal and records its trigger, decided in Stage 9 (O-2); its offsets are the **material** offsets, which are all three listed (A-23). M2-3: under M2 the checkpoint signal replaces the A-73 adjustment signal on the same checkpoint (one signal per checkpoint). | O-2 was resolved; "offsets" could have meant every offset, and M2's effect on A-73 was implicit. |
