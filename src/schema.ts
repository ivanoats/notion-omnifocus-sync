import type { NotionSchema } from "./model.ts";

// Additive Notion schema the sync needs (docs/plan.md → Field mapping).
// `migrate schema` will create whatever `missingSchema` reports; nothing is ever renamed or removed.

export interface RequiredProp {
  name: string;
  type: string;
  options?: string[];
}

export const REQUIRED_TASK_PROPS: RequiredProp[] = [
  { name: "OF ID", type: "rich_text" },
  { name: "Defer Date", type: "date" },
  { name: "Flagged", type: "checkbox" },
  { name: "Tags", type: "multi_select" },
  { name: "Estimate (min)", type: "number" },
  { name: "Parent Task", type: "relation" },
  { name: "Repeats", type: "rich_text" },
  { name: "Status", type: "select", options: ["To Do", "In Progress", "Done", "Blocked", "Dropped"] },
];

export const REQUIRED_PROJECT_PROPS: RequiredProp[] = [
  { name: "OF ID", type: "rich_text" },
  { name: "Folder", type: "select" },
  { name: "Status", type: "status", options: ["Not started", "In progress", "Done", "On hold", "Dropped"] },
];

export interface SchemaGap {
  missing: RequiredProp[];
  missingOptions: { name: string; options: string[] }[];
  wrongType: { name: string; expected: string; actual: string }[];
}

export function missingSchema(actual: NotionSchema, required: RequiredProp[]): SchemaGap {
  const gap: SchemaGap = { missing: [], missingOptions: [], wrongType: [] };
  for (const req of required) {
    const have = actual[req.name];
    if (!have) {
      gap.missing.push(req);
    } else if (have.type !== req.type) {
      gap.wrongType.push({ name: req.name, expected: req.type, actual: have.type });
    } else if (req.options) {
      const absent = req.options.filter((o) => !have.options?.includes(o));
      if (absent.length) gap.missingOptions.push({ name: req.name, options: absent });
    }
  }
  return gap;
}
