@AGENTS.md

# FinPilot: working notes

A personal-finance app built on a derived ledger. The product rules are in `docs/`; read the
relevant section before changing behaviour, and update it in the same change.

## Commands

- `npm run dev`: development server on http://localhost:3000 (database `data/finpilot.sqlite`)
- `npm run db:reset`: recreate the database with the demo ledger, dated relative to today
- `npm run check`: format check, lint, typecheck, `db:check` and unit tests (run before committing)
- `npm test`: Vitest (unit, component, server, architecture and acceptance tests)
- End-to-end tests: build, start the app on port 3100 with its own database, then run Playwright
  (it reuses the running server):
  ```bash
  npm run build
  DATABASE_PATH=./data/e2e.sqlite FINPILOT_DATA_CONTROLS=enabled npx next start --port 3100
  npm run test:e2e
  ```
  Run the focused spec for a change; the full suite before a milestone. Stop the server afterwards.
- Schema changes: edit `src/db/schema.ts`, then `npm run db:generate`; never edit applied migrations.

## Architecture rules (enforced by lint and `tests/architecture/`)

- `src/domain` is pure and deterministic: no framework, database or Node imports, no `Date.now()`
  or randomness ("today" comes from the injected clock). `eslint-disable` has no effect there.
- Only `src/server/repositories` may open `db.transaction`. Services stay async and call them.
- Money is integer minor units (`Money`), never floats. Dates are ISO `CalendarDate` strings.
- Balances, Available, signals and analytics are derived on every read, never stored.
- Liability balances are negative when money is owed. Every stored table carries `owner_id`.
- Entries are soft-deleted. Entries on archived accounts are frozen (no edit or delete).

## Design rules (`docs/design-direction.md`)

- Use the tokens in `src/app/globals.css`; no raw hex values in components.
- Coral is for the brand mark and the Add action only. Berry marks negative states.
- No red or green to show direction; spending uses the warm family.
- Check every layout at 390, 820 and 1280 px wide: no horizontal page scroll, one `h1` per page.
- Mockups go in `design-study/` (git-ignored), built with the real tokens.

## Process

- Docs follow the committed UI: record a decision in `docs/` with a change-log row and its reason.
- Conventional commit prefixes (`feat`, `fix`, `polish`, `docs`, `chore`, `test`), scoped by area.
- Machine-specific notes belong in `CLAUDE.local.md` (git-ignored).
