import type { Config } from "./config.ts";
import type { NotionSchema } from "./model.ts";

// Additive Notion schema the sync needs (docs/plan.md → Field mapping).
// `migrate schema` creates whatever is missing; nothing is ever renamed or removed.

export interface RequiredProp {
  name: string;
  type: string;
  /** Options that must exist (select, multi_select, status). Existing extra options are kept. */
  options?: string[];
  /** For relations: the data source the property points at. */
  relationTo?: string;
}

export function requiredTaskProps(config: Config): RequiredProp[] {
  const priorityPrefix = `${config.omnifocus.priorityTagParent} : `;
  return [
    { name: "OF ID", type: "rich_text" },
    { name: "Defer Date", type: "date" },
    { name: "Flagged", type: "checkbox" },
    { name: "Tags", type: "multi_select", options: config.tagAllowlist.filter((t) => !t.startsWith(priorityPrefix)) },
    { name: "Estimate (min)", type: "number" },
    { name: "Parent Task", type: "relation", relationTo: config.notion.tasksDataSourceId },
    { name: "Repeats", type: "rich_text" },
    { name: "Status", type: "select", options: ["To Do", "In Progress", "Done", "Blocked", "Dropped"] },
  ];
}

export function requiredProjectProps(folders: string[] = []): RequiredProp[] {
  return [
    { name: "OF ID", type: "rich_text" },
    { name: "Folder", type: "select", options: folders },
    { name: "Status", type: "status", options: ["Not started", "In progress", "Done", "On hold", "Dropped"] },
  ];
}

export interface SchemaGap {
  missing: RequiredProp[];
  missingOptions: { name: string; type: string; options: string[] }[];
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
    } else if (req.relationTo && normalizeId(have.relationTo) !== normalizeId(req.relationTo)) {
      gap.wrongType.push({
        name: req.name,
        expected: `relation → ${req.relationTo}`,
        actual: `relation → ${have.relationTo ?? "unknown"}`,
      });
    } else if (req.options?.length) {
      const absent = req.options.filter((o) => !have.options?.includes(o));
      if (absent.length) gap.missingOptions.push({ name: req.name, type: req.type, options: absent });
    }
  }
  return gap;
}

const normalizeId = (id: string | undefined) => id?.replace(/-/g, "").toLowerCase();

export const hasGap = (g: SchemaGap) => g.missing.length + g.missingOptions.length + g.wrongType.length > 0;

type RawProps = Record<string, { type: string; [config: string]: any }>;

function newPropConfig(req: RequiredProp): Record<string, unknown> {
  switch (req.type) {
    case "select":
    case "multi_select":
    case "status":
      return { [req.type]: { options: (req.options ?? []).map((name) => ({ name })) } };
    case "number":
      return { number: { format: "number" } };
    case "relation":
      if (!req.relationTo) throw new Error(`Relation "${req.name}" needs a target data source`);
      return { relation: { data_source_id: req.relationTo, single_property: {} } };
    default:
      return { [req.type]: {} };
  }
}

/**
 * The `properties` body for PATCH /v1/data_sources/{id}.
 * Adding options to an existing select/status must resend every existing option (by id),
 * because Notion deletes any option left out of the list.
 * Type clashes are never patched; they are returned for a human decision.
 */
export function schemaPatch(raw: RawProps, gap: SchemaGap): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const req of gap.missing) patch[req.name] = newPropConfig(req);
  for (const { name, type, options } of gap.missingOptions) {
    const existing = (raw[name]?.[type]?.options ?? []) as { id: string }[];
    patch[name] = { [type]: { options: [...existing.map((o) => ({ id: o.id })), ...options.map((n) => ({ name: n }))] } };
  }
  return patch;
}
