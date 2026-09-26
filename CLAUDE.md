# notion-omnifocus-sync

Two-way sync between OmniFocus and Ivan's Notion Tasks/Projects databases. The plan and all decisions are in `docs/plan.md`. Read it before changing behaviour.

## Rules

- **Nothing writes to OmniFocus or Notion without `--write`.** Dry-run is the default for every command.
- **Write mode runs only on `taxus-brevifolia`.** Keep the host guard in place.
- **Notion schema changes are additive only.** Never rename or delete existing properties or options.
- **Never hard-delete.** Missing items become dropped on the other side.
- **OmniFocus tags outside the allowlist are never modified.**
- **The sync engine (`src/engine.ts`) stays pure.** No I/O, and it's covered by tests.
- Use Omni Automation (`evaluateJavascript`) for bulk reads and writes. Use JXA only as the bridge.
- Notion API version `2026-03-11`: query data sources, not databases.
