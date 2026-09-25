#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, type Config } from "./config.ts";
import { notionClient, exportNotion } from "./notion/client.ts";
import { exportOmniFocus } from "./omnifocus/bridge.ts";
import { buildStatus, formatStatus } from "./report.ts";

const USAGE = `Usage: nos <command> [--json]

Commands (all read-only):
  backup   Write OmniFocus and Notion snapshots to backups/<timestamp>/
  status   Compare both sides and list the migration work still to do`;

async function snapshots(config: Config) {
  const notion = await notionClient(config);
  const [of, n] = await Promise.all([
    exportOmniFocus({
      excludeFolders: config.omnifocus.excludeFolders,
      completedWithinDays: config.importCompletedWithinDays,
    }),
    exportNotion(notion, config),
  ]);
  return { of, notion: n };
}

async function backup(config: Config) {
  const { of, notion } = await snapshots(config);
  const dir = join("backups", new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(dir, { recursive: true });
  const { raw, ...rows } = notion;
  await Promise.all([
    writeFile(join(dir, "omnifocus.json"), JSON.stringify(of, null, 2)),
    writeFile(join(dir, "notion.json"), JSON.stringify(rows, null, 2)),
    writeFile(join(dir, "notion-raw.json"), JSON.stringify(raw, null, 2)),
  ]);
  console.log(`Wrote ${of.projects.length} OF projects, ${of.tasks.length} OF tasks, ` +
    `${notion.projects.length} Notion projects, ${notion.tasks.length} Notion tasks to ${dir}/`);
  console.log("OmniFocus keeps its own database backups too: File ▸ Back Up Database / Help ▸ Backups.");
}

async function status(config: Config, json: boolean) {
  const { of, notion } = await snapshots(config);
  const report = buildStatus(of, notion, config);
  console.log(json ? JSON.stringify(report, null, 2) : formatStatus(report));
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { json: { type: "boolean", default: false }, help: { type: "boolean", short: "h" } },
  });
  const [command] = positionals;
  if (values.help || !command) return console.log(USAGE);
  const config = loadConfig();
  switch (command) {
    case "backup": return backup(config);
    case "status": return status(config, values.json);
    default:
      console.error(`Unknown command: ${command}\n\n${USAGE}`);
      process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
