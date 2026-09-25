import type { Config } from "./config.ts";
import { matchByName } from "./match.ts";
import type { NotionSnapshot, OFSnapshot } from "./model.ts";
import { missingSchema, REQUIRED_PROJECT_PROPS, REQUIRED_TASK_PROPS, type SchemaGap } from "./schema.ts";

// Pure pre-migration status report. Once the state DB exists this grows a drift section.

export interface StatusReport {
  omnifocus: { projects: number; tasks: number; openTasks: number; subtasks: number; repeating: number };
  notion: { projects: number; tasks: number; linkedTasks: number; linkedProjects: number };
  projects: {
    matched: { of: string; notion: string; method: string; score: number }[];
    ofOnly: string[];
    notionOnly: string[];
  };
  tags: { openTasksWithAllowlistedTag: number; unlistedTagsInUse: string[]; allowlistedUnused: string[] };
  schema: { tasks: SchemaGap; projects: SchemaGap };
  warnings: string[];
}

export function buildStatus(of: OFSnapshot, notion: NotionSnapshot, config: Config): StatusReport {
  const open = of.tasks.filter((t) => t.status === "active");
  const allow = new Set(config.tagAllowlist);
  const inUse = new Set(open.flatMap((t) => t.tags));

  const liveNotionProjects = notion.projects.filter((p) => !p.inTrash);
  const m = matchByName(
    of.projects,
    liveNotionProjects.map((p) => ({ ...p, id: p.pageId, name: p.title })),
    config.projectMatchOverrides,
  );

  const warnings: string[] = [];
  const emptyTagged = open.filter((t) => t.tags.some((g) => g.split(" : ").some((part) => part === ""))).length;
  if (emptyTagged) warnings.push(`${emptyTagged} open OmniFocus tasks use a tag with an empty name.`);
  const untitled = notion.projects.filter((p) => !p.title.trim()).length;
  if (untitled) warnings.push(`${untitled} Notion project(s) have no title.`);

  return {
    omnifocus: {
      projects: of.projects.length,
      tasks: of.tasks.length,
      openTasks: open.length,
      subtasks: open.filter((t) => t.parentTaskId).length,
      repeating: open.filter((t) => t.repeatRule).length,
    },
    notion: {
      projects: liveNotionProjects.length,
      tasks: notion.tasks.filter((t) => !t.inTrash).length,
      linkedTasks: notion.tasks.filter((t) => t.ofId).length,
      linkedProjects: notion.projects.filter((p) => p.ofId).length,
    },
    projects: {
      matched: m.pairs.map((p) => ({ of: p.of.name, notion: p.notion.name, method: p.method, score: p.score })),
      ofOnly: m.ofOnly.map((p) => p.name),
      notionOnly: m.notionOnly.map((p) => p.name),
    },
    tags: {
      openTasksWithAllowlistedTag: open.filter((t) => t.tags.some((g) => allow.has(g))).length,
      unlistedTagsInUse: [...inUse].filter((g) => !allow.has(g)).sort(),
      allowlistedUnused: config.tagAllowlist.filter((g) => !inUse.has(g)),
    },
    schema: {
      tasks: missingSchema(notion.tasksSchema, REQUIRED_TASK_PROPS),
      projects: missingSchema(notion.projectsSchema, REQUIRED_PROJECT_PROPS),
    },
    warnings,
  };
}

const gapLines = (label: string, gap: SchemaGap) => [
  ...gap.missing.map((p) => `  ${label}: add property "${p.name}" (${p.type})`),
  ...gap.missingOptions.map((o) => `  ${label}: add ${o.name} option(s) ${o.options.join(", ")}`),
  ...gap.wrongType.map((w) => `  ${label}: "${w.name}" is ${w.actual}, expected ${w.expected}  ⚠ needs a decision`),
];

export function formatStatus(r: StatusReport): string {
  const o = r.omnifocus;
  const n = r.notion;
  const lines = [
    "OmniFocus (in scope)",
    `  ${o.projects} projects, ${o.openTasks} open tasks (${o.subtasks} subtasks, ${o.repeating} repeating; inbox excluded)`,
    "Notion",
    `  ${n.projects} projects (${n.linkedProjects} linked), ${n.tasks} tasks (${n.linkedTasks} linked)`,
    "",
    `Project matches (${r.projects.matched.length})`,
    ...r.projects.matched.map((p) => `  ${p.of}  ↔  ${p.notion}  [${p.method}${p.method === "fuzzy" ? ` ${p.score.toFixed(2)}` : ""}]`),
    `OmniFocus-only projects (${r.projects.ofOnly.length}) → would be created in Notion`,
    ...r.projects.ofOnly.map((n) => `  ${n}`),
    `Notion-only projects (${r.projects.notionOnly.length}) → would be created in OmniFocus`,
    ...r.projects.notionOnly.map((n) => `  ${n}`),
    "",
    "Tags",
    `  ${r.tags.openTasksWithAllowlistedTag} open tasks carry an allowlisted tag`,
    `  ${r.tags.unlistedTagsInUse.length} other tags in use stay OmniFocus-only`,
    ...(r.tags.allowlistedUnused.length ? [`  allowlisted but unused: ${r.tags.allowlistedUnused.join(", ")}`] : []),
    "",
    "Notion schema changes needed",
    ...gapLines("Tasks", r.schema.tasks),
    ...gapLines("Projects", r.schema.projects),
  ];
  if (r.warnings.length) lines.push("", "Warnings", ...r.warnings.map((w) => `  ⚠ ${w}`));
  return lines.join("\n");
}
