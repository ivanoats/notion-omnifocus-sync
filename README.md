# notion-omnifocus-sync

Two-way sync between OmniFocus and Notion Tasks/Projects. It runs on a Mac (OmniFocus has no cloud API). See [docs/plan.md](docs/plan.md) for the design and decisions.

## Setup

Requires Node 24+ (runs TypeScript directly) and OmniFocus 4.

```sh
npm install
cp sync.config.example.json sync.config.json
security add-generic-password -s notion-omnifocus-sync -a notion -w   # paste the Notion integration secret
```

The first run triggers a macOS Automation prompt ("… wants to control OmniFocus"). Allow it.

## Commands

All commands are read-only for now.

```sh
npm run nos status          # compare both sides; lists matches, gaps, and schema changes needed
npm run nos status -- --json
npm run nos backup          # snapshots to backups/<timestamp>/
npm test
npm run typecheck
```
