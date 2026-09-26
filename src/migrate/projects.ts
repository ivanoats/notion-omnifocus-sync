import { parse, stringify } from "yaml";
import { matchByName, normalizeName } from "../match.ts";
import type { NotionProjectRow, NotionSnapshot, OFProject, OFSnapshot } from "../model.ts";

// Pure half of `migrate match-projects`: build a reviewable proposal, then turn a
// reviewed proposal into operations. Idempotent: the OF ID stored on the Notion page
// is the durable link, so re-running skips anything already done.

interface Ref { id: string; name: string }

export interface Proposal {
  link: { omnifocus: Ref; notion: Ref; method: string }[];
  createInNotion: Ref[];
  createInOmniFocus: Ref[];
}

export type ProjectOp =
  | { kind: "link"; of: OFProject; notion: NotionProjectRow }
  | { kind: "createInNotion"; of: OFProject }
  | { kind: "createInOmniFocus"; notion: NotionProjectRow };

export interface ApplyPlan {
  ops: ProjectOp[];
  alreadyDone: string[];
  errors: string[];
}

const liveProjects = (n: NotionSnapshot) => n.projects.filter((p) => !p.inTrash);

export function propose(of: OFSnapshot, notion: NotionSnapshot, overrides: { omnifocus: string; notion: string }[]): Proposal {
  const m = matchByName(of.projects, liveProjects(notion).map((p) => ({ ...p, id: p.pageId, name: p.title })), overrides);
  return {
    link: m.pairs.map((p) => ({
      omnifocus: { id: p.of.id, name: p.of.name },
      notion: { id: p.notion.id, name: p.notion.name },
      method: p.method === "fuzzy" ? `fuzzy ${p.score.toFixed(2)}` : p.method,
    })),
    createInNotion: m.ofOnly.map((p) => ({ id: p.id, name: p.name })),
    createInOmniFocus: m.notionOnly.map((p) => ({ id: p.id, name: p.name })),
  };
}

const HEADER = `# Project matching proposal. Review before applying:
#   - delete a "link" entry that is wrong (then list each side under a create list, or leave it out to skip)
#   - move entries between lists as needed; anything not listed is left alone
# Apply on taxus-brevifolia with:
#   npm run nos migrate match-projects -- --apply links.proposed.yaml --write
`;

export const formatProposal = (p: Proposal) => HEADER + stringify(p);

export function parseProposal(text: string): Proposal {
  const p = parse(text) ?? {};
  return { link: p.link ?? [], createInNotion: p.createInNotion ?? [], createInOmniFocus: p.createInOmniFocus ?? [] };
}

export function planApply(proposal: Proposal, of: OFSnapshot, notion: NotionSnapshot): ApplyPlan {
  const ofById = new Map(of.projects.map((p) => [p.id, p]));
  const notionById = new Map(liveProjects(notion).map((p) => [p.pageId, p]));
  const linkedOfIds = new Map(liveProjects(notion).filter((p) => p.ofId).map((p) => [p.ofId!, p]));
  const plan: ApplyPlan = { ops: [], alreadyDone: [], errors: [] };

  const seenOf = new Set<string>();
  const seenNotion = new Set<string>();
  const claim = (set: Set<string>, id: string, label: string) => {
    if (set.has(id)) plan.errors.push(`${label} appears more than once in the proposal`);
    set.add(id);
  };

  for (const { omnifocus, notion: n } of proposal.link) {
    const a = ofById.get(omnifocus.id);
    const b = notionById.get(n.id);
    if (!a) { plan.errors.push(`OmniFocus project "${omnifocus.name}" (${omnifocus.id}) not found`); continue; }
    if (!b) { plan.errors.push(`Notion project "${n.name}" (${n.id}) not found`); continue; }
    claim(seenOf, a.id, `OmniFocus project "${a.name}"`);
    claim(seenNotion, b.pageId, `Notion project "${b.title}"`);
    if (b.ofId === a.id) plan.alreadyDone.push(`${a.name} ↔ ${b.title}`);
    else if (b.ofId) plan.errors.push(`Notion "${b.title}" is already linked to a different OF ID (${b.ofId})`);
    else if (linkedOfIds.has(a.id)) plan.errors.push(`OmniFocus "${a.name}" is already linked to Notion "${linkedOfIds.get(a.id)!.title}"`);
    else plan.ops.push({ kind: "link", of: a, notion: b });
  }

  for (const ref of proposal.createInNotion) {
    const a = ofById.get(ref.id);
    if (!a) { plan.errors.push(`OmniFocus project "${ref.name}" (${ref.id}) not found`); continue; }
    claim(seenOf, a.id, `OmniFocus project "${a.name}"`);
    if (linkedOfIds.has(a.id)) plan.alreadyDone.push(`${a.name} (already in Notion)`);
    else plan.ops.push({ kind: "createInNotion", of: a });
  }

  for (const ref of proposal.createInOmniFocus) {
    const b = notionById.get(ref.id);
    if (!b) { plan.errors.push(`Notion project "${ref.name}" (${ref.id}) not found`); continue; }
    claim(seenNotion, b.pageId, `Notion project "${b.title}"`);
    if (b.ofId) { plan.alreadyDone.push(`${b.title} (already in OmniFocus)`); continue; }

    // A same-name OmniFocus project means either a wrong proposal or a run that created the
    // project but died before writing its OF ID to Notion. Never create a duplicate.
    const sameName = of.projects.filter((a) => normalizeName(a.name) === normalizeName(b.title));
    const linked = sameName.find((a) => linkedOfIds.has(a.id));
    const recoverable = sameName.filter((a) => !linkedOfIds.has(a.id) && !a.folderPath.length && !seenOf.has(a.id));
    if (linked) {
      plan.errors.push(`OmniFocus already has "${linked.name}", linked to Notion "${linkedOfIds.get(linked.id)!.title}"; can't also create it for Notion "${b.title}"`);
    } else if (sameName.length === 1 && recoverable.length === 1) {
      claim(seenOf, recoverable[0].id, `OmniFocus project "${recoverable[0].name}"`);
      plan.ops.push({ kind: "link", of: recoverable[0], notion: b });
    } else if (sameName.length) {
      plan.errors.push(`OmniFocus already has project(s) named "${b.title}"; list the right one under "link" instead`);
    } else {
      plan.ops.push({ kind: "createInOmniFocus", notion: b });
    }
  }

  return plan;
}

export function describeOp(op: ProjectOp): string {
  switch (op.kind) {
    case "link": return `link          ${op.of.name}  ↔  ${op.notion.title}  (write OF ID to Notion)`;
    case "createInNotion": return `create Notion ${op.of.name}${op.of.folderPath.length ? `  [${op.of.folderPath.join(" / ")}]` : ""}`;
    case "createInOmniFocus": return `create OF     ${op.notion.title}  (${op.notion.status ?? "no status"})`;
  }
}
