# Notion ↔ OmniFocus sync: plan

Two-way sync between OmniFocus and the existing Notion **Tasks** and **Projects** databases. Planned 2026-09-25.

## Decisions

| Question | Decision |
|---|---|
| Direction | True two-way, merged field by field |
| Sync host | `taxis-brevifolia` (the Mac mini at home). Write mode refuses to run on any other host. |
| Scope | All OmniFocus projects except those in the `Lululemon` folder. All 41 sync, including life-area projects (Home, Family, …). The OmniFocus inbox is **not** synced: it's for triage, and its notes often hold forwarded email. |
| Priority | Notion `Priority` ↔ OmniFocus tags `Priority : High / Medium / Low` |
| Tags | Top 20 only (see [Tag allowlist](#tag-allowlist)). OmniFocus tags outside the list are never touched. |
| Notion schema | Additive changes only: no renames, no deletions, existing views keep working |
| Stack | TypeScript on Node 22+, `node:sqlite`, `@notionhq/client`, Omni Automation via `evaluateJavascript` |
| Notion API version | `2026-03-11` (data sources, not databases) |

## Baseline (2026-09-25)

| | OmniFocus (in scope) | Notion |
|---|---|---|
| Projects | 37 active (44 total, including `Lululemon`) | 12 |
| Open tasks | 255 (133 untagged) | 2 |
| Open repeating tasks | 0 | — |
| Action groups | 58 across the whole database | — |
| Tags in use | 53 of 114 | — |

No open repeating tasks are in scope, so repeats drop from a blocker to a defensive case. The 273 tasks with a repetition rule are all completed occurrences. We still mirror `Repeats` as read-only text and complete tasks through `markComplete()` so OmniFocus rolls any future repeats forward correctly.

## Notion data sources

- Tasks: `collection://364f0de1-d4db-48d9-844b-5230e96c216d`
- Projects: `collection://31b7cf8d-ff85-8040-a125-000b0e6ba1d0`

## Field mapping

### Tasks

| OmniFocus | Notion | Schema change |
|---|---|---|
| `id.primaryKey` | `OF ID` (text) | add |
| name | `Task` (title) | — |
| note | `Notes` (text) | — |
| dueDate | `Due Date` | — |
| deferDate | `Defer Date` | add |
| flagged | `Flagged` (checkbox) | add |
| tags (allowlisted) | `Tags` (multi-select) | add |
| `Priority : *` tag | `Priority` (select) | — |
| estimatedMinutes | `Estimate (min)` (number) | add |
| parent task | `Parent Task` (self-relation) | add |
| repetitionRule | `Repeats` (text, written only by the OmniFocus side) | add |
| containingProject | `Project` (relation) | — |
| completed | `Status = Done` | — |
| dropped | `Status = Dropped` | add option |
| active | `To Do` / `In Progress` / `Blocked` | never downgrade Notion's finer status |
| — | `GitHub Issue URL` | Notion-only |

### Projects

| OmniFocus | Notion | Schema change |
|---|---|---|
| `id.primaryKey` | `OF ID` (text) | add |
| name | `Project name` (title) | — |
| parentFolder | `Folder` (select) | add |
| active | `Not started` / `In progress` | keep Notion's choice |
| onHold | `On hold` | add option (the API can add status options but can't move them between groups, so drag `Dropped` into Complete by hand) |
| done | `Done` | — |
| dropped | `Dropped` | add option |
| deferDate / dueDate | `Start date` / `End date` | — |
| — | `Health`, `Assignee`, `GitHub URL`, `Team`, `Attach file` | Notion-only |

## Tag allowlist

Ranked by use on open in-scope tasks. Every tag used on two or more tasks makes the cut (17), plus the three priority tags, for 20 in total:

1. `Mac : Online` (41)
2. `website` (24)
3. `to-read` (10)
4. `javascript` (5)
5. `to-watch` (5)
6. `reactjs` (4)
7. `css` (3)
8. `writing` · `programming` · `to-write` · `mandolin` · `webgis` · `video-production` · `shopping` · `elks` · `volunteering` · `taxes` (2 each)
18. `Priority : High` · `Priority : Medium` · `Priority : Low` (new)

There's also a tag with an empty name on 10 tasks. Rename or delete it in OmniFocus before migrating.

**Merge rule:** when Notion changes `Tags`, the sync adds or removes only allowlisted tags on the OmniFocus task. Any other tags the task has are left alone.

## Architecture

```text
src/
  omnifocus/   export.omnijs.js, apply.omnijs.js, bridge.ts (osascript → JSON)
  notion/      client.ts (rate-limited, ~3 req/s), mapper.ts
  model.ts     canonical Task / Project
  mapping.ts   field mapping + allowlists, driven by sync.config.json
  state.ts     SQLite: links(of_id, notion_id, kind, last_snapshot, last_hash, synced_at)
  engine.ts    pure three-way diff/merge → plan of operations (no I/O, most tests here)
  cli.ts       backup | migrate schema | migrate match-projects | migrate tasks | status | sync
```

**Conflicts:** if both sides changed the same field since the last sync, the later side wins (OmniFocus `modified` against Notion `last_edited_time`). Every conflict is logged.

**Deletions:** nothing is ever hard-deleted. If an item goes missing on one side, it's marked dropped on the other.

## Migration steps

Every step runs with `--dry-run` by default and is idempotent.

1. `backup`: dump both sides to `backups/<timestamp>/*.json` and make an OmniFocus backup.
2. `migrate schema`: add the properties and options above if they're missing.
3. `migrate match-projects`: match by `OF ID`, then `projectMatchOverrides` from config (e.g. `SustainableWebsites` ↔ `sustainablewebsites2`), then exact and fuzzy names. Writes `links.proposed.yaml` for review. Confirmed pairs get linked and their `OF ID` written. Unmatched items on either side are created on the other.
4. `migrate tasks`: create Notion pages for open in-scope OmniFocus tasks (plus anything completed in the last 30 days). The 2 existing Notion tasks are linked by hand.
5. `status`: must report zero drift before `sync` is enabled.

## Running on taxis-brevifolia

- Use a LaunchAgent (not a LaunchDaemon) in the logged-in GUI session, running every 10 minutes. OmniFocus opens at login.
- Grant the TCC Automation permission (node/osascript → OmniFocus) once, in person at the mini.
- Keep the Notion token in the Keychain (`security find-generic-password -s notion-omnifocus-sync`).
- Put the state DB in `~/Library/Application Support/notion-omnifocus-sync/`.
- Set `syncHost` in config. Other machines, such as `tupso`, can only run in `--dry-run` mode.
- **Ivan, one time:** create a Notion internal integration and share both databases with it.

## Milestones

0. Spikes: time a bulk Omni Automation export. Check whether a completed repeating task keeps its `id.primaryKey` (now low priority). Confirm Notion rate-limit behaviour.
1. Read-only: `backup` + `status`.
2. Migration: `migrate schema`, `migrate match-projects`, `migrate tasks`.
3. Two-way `sync` engine with tests.
4. LaunchAgent, logging, error notifications on taxis-brevifolia.
