# src/server

Application services and repositories: owner scoping, synchronous DB transaction scripts, signal-context building. Services call `src/domain`; they never open transactions themselves.

See [docs/tech-stack.md §1 and §4](../../docs/tech-stack.md).
