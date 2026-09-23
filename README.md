# FinPilot

Personal finance built on a derived ledger: where your money stands, why it changed, and how much of it is actually free.

> **Status:** Stage 3 — a usable manual ledger: accounts, the Activity list with search and filters, and keyboard-first Quick Add. Reconciliation, analysis, plans and the Overview come in later stages. See [docs/roadmap.md](docs/roadmap.md).

## Documentation

- [Product baseline](docs/product-baseline.md)
- [Domain model](docs/domain-model.md)
- [Technology stack](docs/tech-stack.md)
- [Design direction](docs/design-direction.md)
- [Acceptance scenarios](docs/acceptance-scenarios.md)
- [Roadmap](docs/roadmap.md)

## Running it

```bash
npm install
npm run db:reset   # creates data/finpilot.sqlite with a demo ledger dated relative to today
npm run dev        # http://localhost:3000
```

## Requirements

- Node.js **22 (≥ 22.12) or 24 LTS** — 24 recommended (see `.nvmrc`). `npm install` refuses other versions (`engine-strict`).
- npm

## Scripts

| Command                | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `npm run dev`          | Start the development server                   |
| `npm run build`        | Production build                               |
| `npm test`             | Run the test suite (Vitest)                    |
| `npm run lint`         | ESLint, including the `src/domain` protections |
| `npm run typecheck`    | TypeScript (strict)                            |
| `npm run format:check` | Prettier check                                 |
| `npm run check`        | Format check, lint, typecheck and tests        |
| `npm run db:reset`     | Recreate the database with the demo ledger     |
| `npm run test:e2e`     | End-to-end flows (Playwright)                  |

The end-to-end run needs its browser once: `npx playwright install chromium`. It uses its own
database (`data/e2e.sqlite`) and server, so it never touches your local ledger.
