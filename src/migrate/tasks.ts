import { matchByName } from "../match.ts";
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
  /** Existing Notion tasks without an OF ID that match an OmniFocus task by name. */
  links: { task: OFTask; notion: NotionTaskRow }[];
  /** Notion tasks with no OmniFocus counterpart; the sync engine will create them in OmniFocus. */
  notionOnly: NotionTaskRow[];
  alreadyDone: number;
  /** Projects (by name) whose tasks can't get a Project relation until match-projects has run. */
  unlinkedProjects: string[];
}

export function planTasks(of: OFSnapshot, notion: NotionSnapshot): TaskPlan {
  const liveTasks = notion.tasks.filter((t) => !t.inTrash);
  const pageByOfId = new Map(liveTasks.filter((t) => t.ofId).map((t) => [t.ofId!, t.pageId]));
  const projectPageByOfId = new Map(notion.projects.filter((p) => p.ofId && !p.inTrash).map((p) => [p.ofId!, p.pageId]));
  const projectName = new Map(of.projects.map((p) => [p.id, p.name]));

  const pending = of.tasks.filter((t) => !pageByOfId.has(t.id));
  const unlinkedNotion = liveTasks.filter((t) => !t.ofId);
  const m = matchByName(pending, unlinkedNotion.map((t) => ({ ...t, id: t.pageId, name: t.title })), [], 0.8);
  const linkedOfIds = new Set(m.pairs.map((p) => p.of.id));

  const toCreate = pending.filter((t) => !linkedOfIds.has(t.id));
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

  const unlinkedProjects = new Set<string>();
  const creates = ordered.map((task): TaskCreate => {
    const projectPageId = projectPageByOfId.get(task.projectId) ?? null;
    if (!projectPageId) unlinkedProjects.add(projectName.get(task.projectId) ?? task.projectId);
    const parentId = task.parentTaskId;
    return {
      task,
      projectPageId,
      parentOfId: parentId && creatingIds.has(parentId) ? parentId : null,
      parentPageId: parentId ? pageByOfId.get(parentId) ?? null : null,
    };
  });

  return {
    creates,
    links: m.pairs.map((p) => ({ task: p.of, notion: p.notion })),
    notionOnly: m.notionOnly,
    alreadyDone: of.tasks.length - pending.length,
    unlinkedProjects: [...unlinkedProjects].sort(),
  };
}
