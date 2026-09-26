import { readFile, writeFile } from "node:fs/promises";
import type { Client } from "@notionhq/client";
import type { Config } from "../config.ts";
import { ofIdProp, projectStatusFromNotion, projectToNotionProps } from "../mapping.ts";
import type { NotionSnapshot, OFSnapshot } from "../model.ts";
import { toSchema } from "../notion/mapper.ts";
import { createOmniFocusProjects } from "../omnifocus/bridge.ts";
import { folderNames } from "../report.ts";
import { hasGap, missingSchema, requiredProjectProps, requiredTaskProps, schemaPatch, type SchemaGap } from "../schema.ts";
import { describeOp, formatProposal, parseProposal, planApply, propose } from "./projects.ts";

// I/O half of the migrations. Every function prints its plan; it only writes when `write`
// is true, and the CLI only passes write=true after the host guard and a fresh backup.

function describeGap(label: string, gap: SchemaGap): string[] {
  return [
    ...gap.missing.map((p) => `  ${label}: add "${p.name}" (${p.type})${p.options?.length ? ` with ${p.options.length} options` : ""}`),
    ...gap.missingOptions.map((o) => `  ${label}: add ${o.name} option(s): ${o.options.join(", ")}`),
    ...gap.wrongType.map((w) => `  ${label}: ⚠ "${w.name}" is ${w.actual}, expected ${w.expected}; not touched, needs a decision`),
  ];
}

export async function migrateSchema(notion: Client, config: Config, of: OFSnapshot, write: boolean): Promise<void> {
  const targets = [
    { label: "Tasks", id: config.notion.tasksDataSourceId, required: requiredTaskProps(config) },
    { label: "Projects", id: config.notion.projectsDataSourceId, required: requiredProjectProps(folderNames(of)) },
  ];
  for (const t of targets) {
    const ds = await notion.dataSources.retrieve({ data_source_id: t.id });
    const gap = missingSchema(toSchema(ds.properties), t.required);
    if (!hasGap(gap)) {
      console.log(`${t.label}: schema already complete`);
      continue;
    }
    console.log(describeGap(t.label, gap).join("\n"));
    const patch = schemaPatch(ds.properties as any, gap);
    if (!Object.keys(patch).length) continue;
    if (!write) continue;
    await notion.dataSources.update({ data_source_id: t.id, properties: patch as any });
    console.log(`  ✓ ${t.label} updated`);
  }
  if (!write) console.log("\nDry run. Re-run with --write on the sync host to apply.");
  else console.log('\nIn Notion, drag the Projects status option "Dropped" into the Complete group (the API can\'t move groups).');
}

export async function proposeProjects(of: OFSnapshot, n: NotionSnapshot, config: Config, file: string): Promise<void> {
  const proposal = propose(of, n, config.projectMatchOverrides);
  await writeFile(file, formatProposal(proposal));
  console.log(`Wrote ${file}: ${proposal.link.length} links, ${proposal.createInNotion.length} to create in Notion, ` +
    `${proposal.createInOmniFocus.length} to create in OmniFocus. Review it, then run with --apply ${file}.`);
}

export async function applyProjects(
  notion: Client, config: Config, of: OFSnapshot, n: NotionSnapshot, file: string, write: boolean,
): Promise<void> {
  const schemaGap = missingSchema(n.projectsSchema, requiredProjectProps(folderNames(of)));
  if (write && hasGap(schemaGap)) throw new Error("Projects schema is incomplete. Run `migrate schema --write` first.");

  const plan = planApply(parseProposal(await readFile(file, "utf8")), of, n);
  if (plan.errors.length) {
    console.error(["Proposal has problems; nothing applied:", ...plan.errors.map((e) => `  ✗ ${e}`)].join("\n"));
    process.exitCode = 1;
    return;
  }
  if (plan.alreadyDone.length) console.log(`Already done (${plan.alreadyDone.length}), skipping:\n${plan.alreadyDone.map((d) => `  ${d}`).join("\n")}`);
  console.log(`Planned (${plan.ops.length}):\n${plan.ops.map((op) => `  ${describeOp(op)}`).join("\n")}`);
  if (!write) return console.log("\nDry run. Re-run with --write on the sync host to apply.");

  const dataSourceId = config.notion.projectsDataSourceId;
  for (const op of plan.ops) {
    if (op.kind === "link") {
      await notion.pages.update({ page_id: op.notion.pageId, properties: ofIdProp(op.of.id) as any });
    } else if (op.kind === "createInNotion") {
      await notion.pages.create({ parent: { data_source_id: dataSourceId }, properties: projectToNotionProps(op.of) as any });
    }
    if (op.kind !== "createInOmniFocus") console.log(`  ✓ ${describeOp(op)}`);
  }

  const toCreate = plan.ops.flatMap((op) => (op.kind === "createInOmniFocus" ? [op.notion] : []));
  const created = await createOmniFocusProjects(toCreate.map((p) => ({
    key: p.pageId,
    name: p.title,
    status: projectStatusFromNotion(p.status),
    deferDate: p.startDate,
    dueDate: p.endDate,
  })));
  for (const p of toCreate) {
    const ofId = created[p.pageId];
    if (!ofId) throw new Error(`OmniFocus did not return an id for "${p.title}"`);
    await notion.pages.update({ page_id: p.pageId, properties: ofIdProp(ofId) as any });
    console.log(`  ✓ create OF     ${p.title}  (OF ID ${ofId})`);
  }
}
