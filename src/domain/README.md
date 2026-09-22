# src/domain

The framework-free financial core: pure TypeScript rules and calculations.

- Imports allowed: `./…` modules, `@/domain/…`, and approved pure libraries (`zod`, `date-fns`, `@date-fns/tz`).
- Everything else is rejected by ESLint (Next.js, React, persistence, Node built-ins, outer layers, other packages).
- Cross-module imports inside the domain use `@/domain/…`, never `../`.

See [docs/tech-stack.md §1](../../docs/tech-stack.md).
