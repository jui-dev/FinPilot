# FinPilot

Personal finance built on a derived ledger: where your money stands, why it changed, and how much of it is actually free.

> **Status:** F1 — domain primitives (money, calendar dates, clock, IDs) and the acceptance-scenario skeleton. No product features yet. See [docs/roadmap.md](docs/roadmap.md).

## Documentation

- [Product baseline](docs/product-baseline.md)
- [Domain model](docs/domain-model.md)
- [Technology stack](docs/tech-stack.md)
- [Acceptance scenarios](docs/acceptance-scenarios.md)
- [Roadmap](docs/roadmap.md)

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
