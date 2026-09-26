#!/usr/bin/env node
import { statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Client } from "@notionhq/client";
import { assertWriteHost, loadConfig, type Config } from "./config.ts";
import { applyProjects, migrateSchema, migrateTasks, proposeProjects } from "./migrate/run.ts";
import { exportNotion, notionClient } from "./notion/client.ts";
import { exportOmniFocus } from "./omnifocus/bridge.ts";
import { buildStatus, formatStatus } from "./report.ts";

const USAGE = `Usage: nos <command> [options]

Read-only:
  status [--json]                   Compare both sides; list the migration work still to do
  backup                            Write OmniFocus and Notion snapshots to backups/<timestamp>/

Migrations (dry-run unless --write; --write only runs on the sync host and backs up first):
  migrate schema [--write]          Add the Notion properties/options the sync needs
  migrate match-projects            Write links.proposed.yaml for review
  migrate match-projects --apply <file> [--write]
                                    Link, or create, projects from a reviewed proposal
  migrate tasks [--write]           Create Notion pages for in-scope OmniFocus tasks (after projects)`;

const isFile = (path: string) => statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;

async function snapshots(notion: Client, config: Config) {
  const [of, n] = await Promise.all([
    exportOmniFocus({
      excludeFolders: config.omnifocus.excludeFolders,
      completedWithinDays: config.importCompletedWithinDays,
    }),
    exportNotion(notion, config),
  ]);
  return { of, notion: n };
}

async function backup(notion: Client, config: Config): Promise<string> {
  const { of, notion: n } = await snapshots(notion, config);
  const dir = join("backups", new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(dir, { recursive: true });
  const { raw, ...rows } = n;
  await Promise.all([
    writeFile(join(dir, "omnifocus.json"), JSON.stringify(of, null, 2)),
    writeFile(join(dir, "notion.json"), JSON.stringify(rows, null, 2)),
    writeFile(join(dir, "notion-raw.json"), JSON.stringify(raw, null, 2)),
  ]);
  console.log(`Backed up ${of.projects.length} OF projects, ${of.tasks.length} OF tasks, ` +
    `${n.projects.length} Notion projects, ${n.tasks.length} Notion tasks to ${dir}/`);
  return dir;
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: "boolean", default: false },
      write: { type: "boolean", default: false },
      apply: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, sub] = positionals;
  if (values.help || !command) return console.log(USAGE);

  if (values.write && command === "migrate" && sub === "match-projects" && !values.apply) {
    throw new Error("--write needs --apply <reviewed proposal file>");
  }
  if (command === "migrate" && sub === "match-projects" && values.apply && !isFile(values.apply)) {
    throw new Error(`${values.apply} is not a proposal file. Create it first with: npm run nos migrate match-projects`);
  }
  const config = loadConfig();
  const notion = await notionClient(config);
  if (values.write) {
    assertWriteHost(config);
    await backup(notion, config);
  }

  switch (`${command} ${sub ?? ""}`.trim()) {
    case "status": {
      const { of, notion: n } = await snapshots(notion, config);
      const report = buildStatus(of, n, config);
      return console.log(values.json ? JSON.stringify(report, null, 2) : formatStatus(report));
    }
    case "backup":
      if (!values.write) await backup(notion, config); // --write already backed up above
      return;
    case "migrate schema": {
      const { of } = await snapshots(notion, config);
      return migrateSchema(notion, config, of, values.write);
    }
    case "migrate match-projects": {
      const { of, notion: n } = await snapshots(notion, config);
      if (!values.apply) return proposeProjects(of, n, config, "links.proposed.yaml");
      return applyProjects(notion, config, of, n, values.apply, values.write);
    }
    case "migrate tasks": {
      const { of, notion: n } = await snapshots(notion, config);
      return migrateTasks(notion, config, of, n, values.write);
    }
    default:
      console.error(`Unknown command: ${command} ${sub ?? ""}\n\n${USAGE}`);
      process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
