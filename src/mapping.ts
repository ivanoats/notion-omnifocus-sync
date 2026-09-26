import type { Config } from "./config.ts";
import type { OFProject, OFProjectStatus, OFTask, OFTaskStatus } from "./model.ts";

// Pure field mapping between OmniFocus and Notion (docs/plan.md → Field mapping).

const PROJECT_STATUS_TO_NOTION: Record<OFProjectStatus, string> = {
  active: "In progress",
  onHold: "On hold",
  done: "Done",
  dropped: "Dropped",
};

/** Notion's "Not started" and "In progress" are both OmniFocus "active"; keep Notion's choice when active. */
export function projectStatusToNotion(status: OFProjectStatus, current: string | null = null): string {
  if (status === "active" && (current === "Not started" || current === "In progress")) return current;
  return PROJECT_STATUS_TO_NOTION[status];
}

export function projectStatusFromNotion(status: string | null): OFProjectStatus {
  switch (status) {
    case "On hold": return "onHold";
    case "Done": return "done";
    case "Dropped": return "dropped";
    default: return "active";
  }
}

// Notion caps each rich-text item at 2000 characters and a property at 100 items.
const RICH_TEXT_ITEM = 2000;
const RICH_TEXT_ITEMS = 100;

export function richText(content: string) {
  const items: { text: { content: string } }[] = [];
  for (let i = 0; i < content.length && items.length < RICH_TEXT_ITEMS; i += RICH_TEXT_ITEM) {
    items.push({ text: { content: content.slice(i, i + RICH_TEXT_ITEM) } });
  }
  return { rich_text: items };
}
const date = (iso: string | null) => ({ date: iso ? { start: iso } : null });

export const ofIdProp = (id: string) => ({ "OF ID": richText(id) });

/** Notion page properties for a new Projects page created from an OmniFocus project. */
export function projectToNotionProps(p: OFProject): Record<string, unknown> {
  return {
    "Project name": { title: [{ text: { content: p.name } }] },
    Status: { status: { name: projectStatusToNotion(p.status) } },
    Folder: { select: p.folderPath.length ? { name: p.folderPath.join(" / ") } : null },
    "Start date": date(p.deferDate),
    "End date": date(p.dueDate),
    ...ofIdProp(p.id),
  };
}

const TASK_STATUS_TO_NOTION: Record<OFTaskStatus, string> = {
  active: "To Do",
  completed: "Done",
  dropped: "Dropped",
};

/** Notion's To Do / In Progress / Blocked are all OmniFocus "active"; keep Notion's choice when active. */
export function taskStatusToNotion(status: OFTaskStatus, current: string | null = null): string {
  if (status === "active" && (current === "To Do" || current === "In Progress" || current === "Blocked")) return current;
  return TASK_STATUS_TO_NOTION[status];
}

/** Split OmniFocus tags into the Notion Tags value (allowlisted only) and Priority (from the priority tag group). */
export function splitTags(tags: string[], config: Config): { tags: string[]; priority: string | null } {
  const prefix = `${config.omnifocus.priorityTagParent} : `;
  const allow = new Set(config.tagAllowlist);
  const priority = tags.find((t) => t.startsWith(prefix))?.slice(prefix.length) ?? null;
  return { tags: tags.filter((t) => allow.has(t) && !t.startsWith(prefix)), priority };
}

/** Notion page properties for a new Tasks page created from an OmniFocus task. */
export function taskToNotionProps(
  t: OFTask,
  config: Config,
  links: { projectPageId: string | null; parentPageId: string | null },
): Record<string, unknown> {
  const { tags, priority } = splitTags(t.tags, config);
  return {
    Task: { title: [{ text: { content: t.name } }] },
    Status: { select: { name: taskStatusToNotion(t.status) } },
    Priority: { select: priority ? { name: priority } : null },
    "Due Date": date(t.dueDate),
    "Defer Date": date(t.deferDate),
    Notes: richText(t.note),
    Flagged: { checkbox: t.flagged },
    Tags: { multi_select: tags.map((name) => ({ name })) },
    "Estimate (min)": { number: t.estimatedMinutes },
    Repeats: richText(t.repeatRule ?? ""),
    Project: { relation: links.projectPageId ? [{ id: links.projectPageId }] : [] },
    "Parent Task": { relation: links.parentPageId ? [{ id: links.parentPageId }] : [] },
    ...ofIdProp(t.id),
  };
}
