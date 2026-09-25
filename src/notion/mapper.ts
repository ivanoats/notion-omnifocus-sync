import type { NotionProjectRow, NotionSchema, NotionTaskRow } from "../model.ts";

// Pure mapping from Notion API page/data-source JSON to per-side rows.
// Property names follow docs/plan.md; properties that don't exist yet (pre-migration) read as empty.

type Props = Record<string, any>;

export interface NotionPage {
  id: string;
  url: string;
  last_edited_time: string;
  in_trash?: boolean;
  properties: Props;
}

const plain = (parts: { plain_text: string }[] | undefined) => (parts ?? []).map((p) => p.plain_text).join("");

export function readProp(props: Props, name: string): any {
  const p = props[name];
  if (!p) return undefined;
  switch (p.type) {
    case "title": return plain(p.title);
    case "rich_text": return plain(p.rich_text);
    case "select": return p.select?.name ?? null;
    case "status": return p.status?.name ?? null;
    case "multi_select": return p.multi_select.map((o: { name: string }) => o.name);
    case "date": return p.date?.start ?? null;
    case "relation": return p.relation.map((r: { id: string }) => r.id);
    case "checkbox": return p.checkbox;
    case "number": return p.number;
    case "url": return p.url;
    default: return undefined;
  }
}

export function toTaskRow(page: NotionPage): NotionTaskRow {
  const p = page.properties;
  return {
    pageId: page.id,
    url: page.url,
    title: readProp(p, "Task") ?? "",
    status: readProp(p, "Status") ?? null,
    priority: readProp(p, "Priority") ?? null,
    dueDate: readProp(p, "Due Date") ?? null,
    deferDate: readProp(p, "Defer Date") ?? null,
    notes: readProp(p, "Notes") ?? "",
    flagged: readProp(p, "Flagged") ?? null,
    tags: readProp(p, "Tags") ?? [],
    projectPageIds: readProp(p, "Project") ?? [],
    ofId: readProp(p, "OF ID") || null,
    lastEditedAt: page.last_edited_time,
    inTrash: page.in_trash ?? false,
  };
}

export function toProjectRow(page: NotionPage): NotionProjectRow {
  const p = page.properties;
  return {
    pageId: page.id,
    url: page.url,
    title: readProp(p, "Project name") ?? "",
    status: readProp(p, "Status") ?? null,
    startDate: readProp(p, "Start date") ?? null,
    endDate: readProp(p, "End date") ?? null,
    ofId: readProp(p, "OF ID") || null,
    lastEditedAt: page.last_edited_time,
    inTrash: page.in_trash ?? false,
  };
}

export function toSchema(properties: Props): NotionSchema {
  const schema: NotionSchema = {};
  for (const [name, prop] of Object.entries(properties)) {
    const opts = prop[prop.type]?.options as { name: string }[] | undefined;
    schema[name] = opts ? { type: prop.type, options: opts.map((o) => o.name) } : { type: prop.type };
  }
  return schema;
}
