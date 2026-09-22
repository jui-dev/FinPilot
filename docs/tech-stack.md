# FinPilot — Technology Stack (Decision Record)

**Status:** Frozen — approved 2026-09-22
**Change policy:** Revisit only when implementation exposes a concrete technical problem. Record every change in §9 with its reason.
**Related:** [product-baseline.md](product-baseline.md) · [domain-model.md](domain-model.md) · [acceptance-scenarios.md](acceptance-scenarios.md) · [roadmap.md](roadmap.md)

**Guiding rule:** one deployable Node app, one database file, and no infrastructure that V1 doesn't use. The sophistication lives in a **framework-free domain core**. That core is also what later lets AI, n8n and MCP reuse the same logic without reimplementing it.

---

## 1. Architecture shape

```
src/domain/      pure TypeScript: money, calendar dates, transaction rules, budget projection,
                 earmark backing, Available, signal rules      ← no Next.js, no DB imports (enforced by a lint rule)
src/server/      application services + repositories: owner scoping, DB transactions, signal-context building
src/db/          Drizzle schema, custom SQL migrations (views), seed generator, scenario fixtures
src/app/         Next.js routes: server components read via services; server actions call services
src/components/  UI components + charts
(later) src/mcp/ and src/app/api/ingest/   additional entry points into the same services
```

- **Why:** the domain rules, and the acceptance numbers, are tested without a browser or a framework. Next.js is only a delivery layer.
- Future entry points (ingestion endpoint, MCP server, scripts) call the **same services**, so the logic is never re-implemented.
- **Coupling risk with Next.js** is contained by this boundary.

## 2. Decisions

| Area | Choice | Why it fits FinPilot | Alternatives considered | Trade-off | Need or fashion? |
|---|---|---|---|---|---|
| Runtime / package manager | **Node 22 (≥ 22.12) or Node 24 LTS**, enforced by `engines` + `engine-strict`; `.nvmrc` recommends 24.21.0. **npm** | Works on both LTS lines. Nothing in the stack needs Node 24: the highest floors are Vitest/Vite ≥ 22.12 and better-sqlite3 ≥ 22. | Node ≥ 24.16 only, to use the built-in `crypto.randomUUIDv7()` (rejected: see the IDs row); pnpm, Bun | Node 22 support ends April 2027; raise the floor to 24 during production evolution | need |
| Language | **TypeScript, `strict`** | Money and type invariants benefit from strict typing; one language across the stack | — | — | need |
| App framework | **Next.js (App Router)**, React 19, **one app** (no separate backend) | Derived numbers are computed on the server next to the DB, with no client-side financial maths. Server actions give fast forms; route handlers are there for later ingestion. One deployable. | Vite SPA + Fastify API (a cleaner API boundary, but two apps and more plumbing); React Router 7; SvelteKit | Coupling risk (contained by §1); some App Router caching complexity | Mostly need. It's also the market default, which helps interview familiarity. |
| Database (V1) | **SQLite** via **`better-sqlite3`** (Drizzle `better-sqlite3` driver) | Zero setup, one file, easy reset. The most mature local SQLite driver, bundling upstream SQLite. Simple, fast test isolation. See §4. | `@libsql/client` (rejected for V1, §4); `node:sqlite` | Transactions must be synchronous (§4) | need |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | SQL-first. CHECK constraints and partial indexes are declared in the schema, views can be declared for typed queries, and typed raw SQL is available. Types are inferred from the schema. | Prisma (excellent DX, but CHECKs and views need hand-edited SQL, and it hides the SQL we want to show); Kysely (a great query builder, but hand-written migrations) | Schemas are dialect-specific, so moving to Postgres means porting the schema file (mechanical; §3). SQLite views need a custom migration (§3). | need |
| Validation | **Zod** | One schema per input (e.g. `TransactionInput`), reused by the UI form, server actions, the future ingestion API and future **MCP tool definitions** (the TS MCP SDK also uses Zod schemas) | Valibot, ArkType | — | need; a strong reuse story |
| Money | **Own small module** over safe integers | Single currency, integer minor units, one rounding point ([domain-model.md §3](domain-model.md)) | dinero.js | We must test it ourselves (unit + property tests) | need; a library would be overkill |
| Dates | Calendar dates as `YYYY-MM-DD` values behind a small `CalendarDate` module using **integer day-number arithmetic** (no JS `Date` objects). "Today in Asia/Dhaka" comes from the server-side Clock using the built-in `Intl.DateTimeFormat`. **date-fns v4** stays approved and allowlisted in the domain, but is installed only when a feature needs it. | The domain works with calendar dates, not instants. Day-number arithmetic can't be affected by the machine's time zone or daylight saving, and is verified against the JS engine's UTC calendar by property tests. | date-fns for calendar arithmetic (it operates on `Date` objects in local time); `@date-fns/tz` (not needed: time zones belong only to the Clock); Temporal (adopt once runtime support is universal); Day.js; Luxon | ~200 lines of our own code, fully property-tested | need |
| IDs | **`uuid` v7** behind a domain `IdGenerator` interface; the implementation lives in `src/server` | Works on Node 22 and 24. Zero dependencies. Its RFC 9562 counter keeps IDs increasing within a millisecond (measured: 10,000/10,000 increasing, vs ~50% out of order for Node 24's built-in). **IDs are opaque: their time-ordering helps index locality but is never a business ordering of financial records.** | Node ≥ 24.16 built-in `crypto.randomUUIDv7()` (no ordering within a millisecond; forces Node 24) | One small dependency | need |
| Styling | **Tailwind CSS v4** with **FinPilot's own design tokens** | Fast iteration; the tokens enforce the palette decided at the design gate | CSS Modules, vanilla-extract | Utility-class noise | need (speed) |
| Components | **Radix primitives** (copied in via shadcn where convenient), **restyled completely** | Accessible dialogs, popovers and the keyboard-first Quick Add combobox | Hand-built components; Mantine; MUI | **Risk:** the default shadcn look is exactly the "generic SaaS dashboard" to avoid. We take the behaviour, not the appearance. | Need for behaviour. The shadcn look itself would be fashion, so it isn't used. |
| Charts | **visx** (D3 scales and shapes for React) + our own SVG chart components. **Per-chart fallback to Recharts** if a chart in visx becomes disproportionately complex. **FinPilot must not become a charting-library project.** | V1 needs a small set of bespoke charts: the cash-flow bridge by category, the Available bridge, diverging month-over-month contribution bars, budget bullet bars and composition bars. Full control is what makes them read as serious financial charts rather than templates. | Recharts (faster, but waterfalls and diverging bars are workarounds, and it looks generic); ECharts (powerful but heavy, canvas-based, less React-native); Tremor (dashboard look, rejected); Observable Plot | More code per chart; tooltips and axes are ours to build | need, since charts are a differentiator |
| Client data | **None.** Server components + server actions + `revalidatePath`; filters live in URL search params | Single user and server-rendered, so there's no client cache to manage | TanStack Query, SWR, Zustand, Redux | Add TanStack Query only if a genuinely client-heavy view appears | deliberately avoiding fashion |
| Unit/domain tests | **Vitest** | Fast and TS-native | Jest | — | need |
| Invariant tests | **fast-check** (property-based) | Random transaction sequences check the invariants: transfers net to zero; net worth = Σ balances; balance = Σ entries; covered ≤ max(balance, 0); the Available bridge adds up; occurrence materialisation is idempotent. This tests financial correctness directly. | only hand-written cases | Learning curve | **need**; a strong interview topic |
| Acceptance tests | **Vitest against a real SQLite DB.** An in-memory database is created per test from a serialised, fully migrated template. The suite runs the [acceptance scenario](acceptance-scenarios.md) and M1–M3. | Exercises constraints, views and services together, with no mocks | mocked repositories | Slower than unit tests (still seconds) | need (the scenario is mandatory) |
| E2E tests | **Playwright**, a small suite of about four flows (Quick Add → balances update; reconcile; pay a commitment; Quick Add → the overview updates) | Proves the UI shows derived state | Cypress | Kept deliberately small | need, in moderation |
| Lint / format | ESLint (+ an import-boundary rule for `src/domain`) + Prettier | The boundary rule protects §1 | Biome | — | need (the boundary) |
| Seed data | **Own deterministic generator**: seeded PRNG, curated Bangladeshi merchants, dates relative to today, and `npm run db:reset` | A realistic, current-looking demo, with anomalies planted so every signal rule fires | Faker | We maintain the lists | need |

**Deliberately not used in V1:** Docker, Redis, queues, tRPC, GraphQL, a monorepo or Turborepo, a client state library, Storybook, an auth library, any AI SDK, n8n, or an MCP implementation.

## 3. Keeping the SQLite → PostgreSQL path cheap

- **SQL does filtering, grouping and sums; TypeScript does calendar logic** (months, windows, horizons). Queries stay free of SQLite-only date functions.
- Money is integers. Dates are ISO `YYYY-MM-DD` text, which sorts correctly in SQLite and becomes `DATE` in Postgres. Booleans are 0/1 in SQLite and `boolean` in Postgres.
- **SQLite gotchas handled on every connection:** `PRAGMA foreign_keys = ON` (it is **off by default**, so foreign keys would silently not be enforced) and WAL journal mode.
- **No STRICT tables,** because Drizzle's schema has no STRICT option. Money columns get `CHECK (typeof(col) = 'integer')` instead. This protects the most important type invariant without breaking migration generation, and the check is dropped in the Postgres port, where column types enforce it.
- **`account_entries` view:** drizzle-kit does not generate SQLite views. The view lives in a **hand-written custom migration**, and the ORM declares it with `.existing()` for typed queries. CHECK constraints and partial indexes (such as "one opening balance per account") are generated from the schema.
- **Migration recipe (later):**
  1. Port the Drizzle schema to `pg-core`.
  2. Generate a fresh baseline Postgres migration (and port the view migration).
  3. Run a data-copy script.
  4. Run **the same acceptance and property suites against Postgres**. Passing them is the definition of "migrated".
- **Interview defense:** *"The engine swap is mechanical because of integer money, ISO dates and calendar logic in TypeScript. The real multi-user work is tenancy, which is why owner scoping exists from day one."*

## 4. SQLite driver: better-sqlite3 vs @libsql/client

The async API was deliberately **not** treated as a reason to pick libSQL, because the repository/service boundary already isolates persistence.

| Criterion | better-sqlite3 | @libsql/client | Edge |
|---|---|---|---|
| Drizzle support | first-class driver | first-class driver | tie |
| Maturity / reliability | since 2016; very widely used; bundles **upstream SQLite** | a client for libSQL, a *fork* of SQLite. It had real local-mode defects: `transaction()` on `:memory:` used to open a fresh empty DB (libsql-client-ts #140 and #229), and 0.17.x leaked a native connection per transaction (fixed in 0.18) | **better-sqlite3** |
| CHECK / views / partial indexes / STRICT | engine features, identical in both. Drizzle generates CHECKs and partial indexes but **not SQLite views or STRICT**, for either driver | same | tie |
| Transactions | **synchronous only.** An `async` callback throws (better-sqlite3 ≥ 11.10) or commits early (Drizzle issue #2275, open) | async interactive transactions | libsql on flexibility; better-sqlite3 on simplicity (one connection, no pooling surprises) |
| Temporary test DBs | `:memory:`, or a serialised migrated template → `new Database(buffer)` per test: instant, single connection | `:memory:` + transactions is exactly the area that historically broke | **better-sqlite3** |
| Next.js | in Next's default `serverExternalPackages` | also in that list | tie |
| Windows / install | native addon with prebuilt binaries (pin a Node LTS version that has prebuilds) | prebuilt platform packages | tie |
| Deployment | needs a Node host with persistent disk | the same locally. It can also target hosted Turso, but libSQL is now in maintenance, with the vendor's new work going into its Rust-based Turso database | the hosted option isn't needed for V1 |
| SQLite → Postgres | the driver is irrelevant; the schema port and repository internals change either way | same | tie |
| Maintenance burden | low; stable API | tied to a vendor whose strategy is changing | **better-sqlite3** |

**Decision: better-sqlite3.** It's simpler and more proven locally, test isolation is trivial, and it tracks upstream SQLite. libSQL's only real advantages are async transactions and a hosted option, and V1 needs neither.

**The rule this creates (binding):** *all multi-step writes run as synchronous transaction scripts inside repository methods.*

- **Example:** "add an earmark entry" reads the account balance, calls the pure domain invariant check and writes the entry, all inside one synchronous `db.transaction(...)`. Write transactions use immediate mode (exact Drizzle API confirmed at scaffold time).
- **Services** stay `async` at their public boundary and **never open transactions themselves**.
- **Moving to Postgres** only turns those repository internals `await`-based.
- **Proof:** a rollback acceptance test checks that a rejected earmark leaves no partial write.

Sources checked on 2026-09-22:
- [Drizzle #2275](https://github.com/drizzle-team/drizzle-orm/issues/2275)
- [better-sqlite3 #1262](https://github.com/WiseLibs/better-sqlite3/issues/1262)
- [libsql-client-ts #229](https://github.com/tursodatabase/libsql-client-ts/issues/229), [#140](https://github.com/tursodatabase/libsql-client-ts/issues/140)
- [Next.js serverExternalPackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages)
- [Drizzle SQLite views](https://orm.drizzle.team/docs/sqlite/views)
- [Drizzle indexes & constraints](https://orm.drizzle.team/docs/sqlite/indexes-constraints)
- [Drizzle STRICT #202](https://github.com/drizzle-team/drizzle-orm/issues/202)
- [Turso libSQL docs](https://docs.turso.tech/libsql)

## 5. Future seams (built later, prepared now at no extra cost)

- **Auth:** all owner resolution goes through one `getCurrentOwner()`, which returns the demo owner in V1. The auth library (Auth.js vs Better Auth) is chosen at the auth stage.
- **AI / n8n ingestion:**
  - `POST /api/ingest` (a route handler) takes the Zod draft schema plus an idempotency key and an HMAC signature, and writes to a `transaction_drafts` table.
  - Confirming a draft goes through the same `createTransaction` service as the UI.
  - Drafts never appear in `account_entries`.
- **MCP:**
  - Later, `src/mcp/server.ts` uses the TypeScript MCP SDK, over stdio locally and HTTP when deployed.
  - It exposes read-only tools and one draft-only tool, built on the existing services and Zod schemas.
  - It lives in the same package: **no monorepo needed**.
- **Deployment (decided later):**
  - Next.js standalone output runs on any Node host with persistent disk for the SQLite file.
  - If a serverless host is chosen, the planned Postgres path applies (or, if needed, a contained driver swap).
  - A Dockerfile appears only if the chosen host requires one.
  - The public demo strategy is decided then (see [product-baseline.md §7](product-baseline.md)).

## 6. Risks to watch

- App Router caching surprises around revalidation. Keep reads of derived data dynamic in V1.
- An `await` inside a SQLite transaction callback. Covered by the §4 rule and the rollback acceptance test.
- The better-sqlite3 native binary. Pin a Node LTS version that has prebuilt Windows binaries, so no C++ build tools are needed.
- Chart effort. Use the per-chart Recharts fallback when visx becomes disproportionate.

## 7. Open checks at scaffold time (F0/F1) — resolved 2026-09-22

1. **Node / better-sqlite3:** Node 24.21.0 is the Active LTS and 22.x is in maintenance; both are supported (see §2). better-sqlite3 13.0.3 bundles a Node-API `win32-x64` prebuild, so nothing is compiled on install. Verified on Node 22.22.0 and 24.21.0: it loads (SQLite 3.53.4), a `typeof` CHECK is enforced, serialise → clone works, and an immediate transaction rolls back. Note for F2: `@types/better-sqlite3` is at 9.6.0, behind the runtime's 13.
2. **Versions:** see `package.json`. TypeScript is pinned to 5.9.x because typescript-eslint requires < 6.1 (TypeScript 7 exists). ESLint is pinned to 9.x because eslint-config-next's bundled plugins don't support ESLint 10. React follows Next's own template (19.2.x).
3. **Transaction behaviour:** Drizzle 0.45.3 SQLite transactions accept `behavior: 'deferred' | 'immediate' | 'exclusive'`.
4. **Views:** `sqliteView(...).existing()` exists; view DDL goes in a custom migration.
5. **Partial indexes:** `index(...).on(...).where(sql)` exists.
6. **UUIDv7:** the `uuid` package (see the IDs row in §2).
7. **Domain protections:** ESLint rules scoped to `src/domain/**` (see §7.1).

### 7.1 Domain protections (ESLint, `src/domain/**` only)

- **Import allowlist:** only `./…` modules, `@/domain/…`, `zod` and `date-fns`. Everything else (frameworks, persistence, Node built-ins, outer layers, `uuid`, `@date-fns/tz`, any new package) is rejected by default. No `../` imports, no dynamic `import()`, no `require()`.
- **Determinism:** the domain may not read ambient time or randomness:
  - `Date.now()`, a zero-argument `new Date()`, and `Date()` called as a function
  - `Math.random()` and `Temporal.Now`
  - the `crypto` and `performance` globals
  - the 22 date-fns functions that read the current time (list derived from the date-fns 4.4.0 source), including their deep and `fp` imports, and namespace imports of date-fns

  Construction and parsing from explicit values stays allowed: `new Date(x)`, `Date.UTC`, `Date.parse`, and pure date-fns functions. "Today" comes only from the injected `Clock`; the real implementation is `src/server/clock.ts`.
- **No local suppression:** `linterOptions.noInlineConfig` makes `eslint-disable` and `/* eslint … */` comments ineffective in the domain; ESLint reports them as warnings, which fail lint because warnings aren't allowed. An exception requires changing `eslint.config.mjs`, which is an architecture decision.
- **Proof:** `tests/architecture/` runs the real ESLint config on forbidden and allowed probes. Removing any protection turns these tests red.

## 8. Explicit non-goals for V1 infrastructure

The public-demo architecture does **not** drive V1. There is no sandbox, per-visitor database, rate limiting or hosting-specific code until the deployment discussion.

## 9. Change log

| Date | Change | Reason |
|---|---|---|
| 2026-09-22 | The chart list no longer includes a net-worth-over-time line | Net worth over time is V1.1 in the product baseline. The stack proposal had listed it among the V1 charts. |
| 2026-09-22 | Acceptance tests use an in-memory DB per test, built from a serialised migrated template (not a temporary file) | Aligns the stack table with the roadmap and the driver analysis |
| 2026-09-22 | The E2E suite is "about four flows", not "2–3" | The approved roadmap defines four Playwright flows |
| 2026-09-22 | UUIDv7 added to the open checks | It was proposed in the domain model and used in roadmap F1, but not listed in the stack table |
| 2026-09-22 | **Runtime: Node 22 (≥ 22.12) or 24**, not 24 only; IDs via the `uuid` package | Approved decision B. Nothing else needs Node 24, cloning works on either LTS, and `uuid` orders IDs within a millisecond where Node's built-in doesn't. |
| 2026-09-22 | UUIDv7 ordering is **not** a business ordering | Approved clarification: financial ordering is modelled explicitly (domain-model §2) |
| 2026-09-22 | `CalendarDate` uses integer day-number arithmetic; date-fns not installed yet; `@date-fns/tz` removed from the domain allowlist | Found during F1: calendar-date arithmetic needs no library, and using `Date` objects would bring in local-time and daylight-saving hazards. Time zones belong only to the Clock (server), which uses `Intl`. date-fns remains approved for later use. |
| 2026-09-22 | Deterministic-domain ESLint rules, and a ban on suppression comments in `src/domain` (§7.1) | Approved for F1 |
