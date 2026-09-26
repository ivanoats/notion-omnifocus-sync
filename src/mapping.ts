import type { OFProject, OFProjectStatus } from "./model.ts";

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

const richText = (content: string) => ({ rich_text: content ? [{ text: { content: content.slice(0, 2000) } }] : [] });
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
