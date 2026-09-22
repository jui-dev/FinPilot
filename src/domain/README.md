# src/domain

The framework-free, deterministic financial core: pure TypeScript rules and calculations.

- Imports allowed: `./…` modules, `@/domain/…`, and approved pure libraries (`zod`, `date-fns`). Everything else is rejected by ESLint (Next.js, React, persistence, Node built-ins, outer layers, other packages).
- Cross-module imports inside the domain use `@/domain/…`, never `../`.
- No ambient time or randomness: "today" comes from the injected `Clock`, and IDs from the injected `IdGenerator`. Constructing dates from explicit values is fine.
- `eslint-disable` comments have no effect here; an exception needs a change to `eslint.config.mjs`.
- Tests for domain code live in `tests/domain/`, so test tooling never enters the domain.

See [docs/tech-stack.md §1 and §7.1](../../docs/tech-stack.md).
