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

Every command is a dry run unless you pass `--write`. `--write` only runs on the sync host
(`syncHost` in the config), and it takes a fresh backup before changing anything.

```sh
npm run nos status                      # compare both sides; lists matches, gaps, schema changes needed
npm run nos backup                      # snapshots to backups/<timestamp>/
npm run nos migrate schema              # show the Notion properties/options to add
npm run nos migrate match-projects      # write links.proposed.yaml for review
npm run nos migrate match-projects -- --apply links.proposed.yaml   # show what applying would do
npm run nos migrate tasks               # show which OmniFocus tasks would become Notion pages
npm test && npm run typecheck
```

## First-time migration (on taxis-brevifolia)

```sh
git pull && npm ci
npm run nos migrate schema -- --write
# In Notion: drag the Projects status option "Dropped" into the Complete group
npm run nos migrate match-projects      # then review/edit links.proposed.yaml
npm run nos migrate match-projects -- --apply links.proposed.yaml           # check the plan
npm run nos migrate match-projects -- --apply links.proposed.yaml --write
npm run nos status                      # every project should now be linked
npm run nos migrate tasks               # check the plan: 0 unlinked projects
npm run nos migrate tasks -- --write    # ~250 pages at Notion's ~3 req/s, about 2 minutes
```

Re-running any step is safe. Work that's already done is detected through the `OF ID` stored in Notion and skipped.
