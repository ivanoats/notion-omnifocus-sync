import { MAX_RICH_TEXT_CHARS } from "../mapping.ts";
import { normalizeName } from "../match.ts";
import type { NotionSnapshot, NotionTaskRow, OFSnapshot, OFTask } from "../model.ts";

// Pure half of `migrate tasks`: decide which OmniFocus tasks become Notion pages, in an order
// where parents are created before their subtasks. Idempotent via the OF ID on Notion pages.

export interface TaskCreate {
  task: OFTask;
  /** Notion page of the task's project, or null if that project isn't linked yet. */
  projectPageId: string | null;
  /** OF id of the parent task when that parent is also being created in this run. */
  parentOfId: string | null;
  /** Notion page of the parent task when it already exists in Notion. */
  parentPageId: string | null;
}

export interface TaskPlan {
  creates: TaskCreate[];
  /** Existing Notion tasks without an OF ID whose name matches exactly one OmniFocus task. */
  links: { task: OFTask; notion: NotionTaskRow }[];
  /** Notion tasks with no OmniFocus counterpart; the sync engine will create them in OmniFocus. */
  notionOnly: NotionTaskRow[];
  alreadyDone: number;
  /** Projects (by name) whose tasks can't get a Project relation until match-projects has run. */
  unlinkedProjects: string[];
  /** Problems that block --write (ambiguous names, notes too long for Notion). */
  errors: string[];
}

export function planTasks(of: OFSnapshot, notion: NotionSnapshot): TaskPlan {
  const liveTasks = notion.tasks.filter((t) => !t.inTrash);
  const pageByOfId = new Map(liveTasks.filter((t) => t.ofId).map((t) => [t.ofId!, t.pageId]));
  const projectPageByOfId = new Map(notion.projects.filter((p) => p.ofId && !p.inTrash).map((p) => [p.ofId!, p.pageId]));
  const projectName = new Map(of.projects.map((p) => [p.id, p.name]));
  const errors: string[] = [];

  // Every in-scope task's project must be linked, including tasks already in Notion.
  const unlinkedProjects = new Set<string>();
  for (const t of of.tasks) {
    if (!projectPageByOfId.has(t.projectId)) unlinkedProjects.add(projectName.get(t.projectId) ?? t.projectId);
  }

  // Never truncate: a note Notion can't hold stops the migration before anything is written.
  for (const t of of.tasks) {
    if (t.note.length > MAX_RICH_TEXT_CHARS) errors.push(`"${t.name}" has a ${t.note.length}-character note; Notion holds at most ${MAX_RICH_TEXT_CHARS}`);
  }

  // Link existing Notion tasks only on an exact (normalized) name that is unique on both sides.
  const pending = of.tasks.filter((t) => !pageByOfId.has(t.id));
  const unlinkedNotion = liveTasks.filter((t) => !t.ofId);
  const groupBy = <T,>(items: T[], name: (x: T) => string) => {
    const groups = new Map<string, T[]>();
    for (const x of items) groups.set(normalizeName(name(x)), [...(groups.get(normalizeName(name(x))) ?? []), x]);
    return groups;
  };
  const ofByName = groupBy(pending, (t) => t.name);
  const links: TaskPlan["links"] = [];
  const notionOnly: NotionTaskRow[] = [];
  for (const [key, rows] of groupBy(unlinkedNotion, (t) => t.title)) {
    const candidates = ofByName.get(key) ?? [];
    if (rows.length === 1 && candidates.length === 1) links.push({ task: candidates[0], notion: rows[0] });
    else if (candidates.length) errors.push(`Ambiguous name "${rows[0].title}": ${rows.length} Notion and ${candidates.length} OmniFocus tasks; set OF ID by hand`);
    else notionOnly.push(...rows);
  }
  for (const l of links) pageByOfId.set(l.task.id, l.notion.pageId);

  const toCreate = pending.filter((t) => !pageByOfId.has(t.id));
  const creatingIds = new Set(toCreate.map((t) => t.id));
  const byId = new Map(toCreate.map((t) => [t.id, t]));

  // Parents first: depth-first so every parent precedes its subtasks.
  const ordered: OFTask[] = [];
  const visited = new Set<string>();
  const visit = (t: OFTask) => {
    if (visited.has(t.id)) return;
    visited.add(t.id);
    const parent = t.parentTaskId ? byId.get(t.parentTaskId) : undefined;
    if (parent) visit(parent);
    ordered.push(t);
  };
  toCreate.forEach(visit);

  const creates = ordered.map((task): TaskCreate => {
    const parentId = task.parentTaskId;
    return {
      task,
      projectPageId: projectPageByOfId.get(task.projectId) ?? null,
      parentOfId: parentId && creatingIds.has(parentId) ? parentId : null,
      // Includes parents that exist in Notion already or are being linked in this run.
      parentPageId: parentId ? pageByOfId.get(parentId) ?? null : null,
    };
  });

  return {
    creates,
    links,
    notionOnly,
    alreadyDone: of.tasks.length - pending.length,
    unlinkedProjects: [...unlinkedProjects].sort(),
    errors,
  };
}
