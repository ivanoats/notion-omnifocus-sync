import assert from "node:assert/strict";
import { test } from "node:test";
import { assertWriteHost, type Config } from "./config.ts";
import { missingSchema, requiredTaskProps, schemaPatch } from "./schema.ts";

test("missingSchema reports missing props, missing options and type clashes", () => {
  const gap = missingSchema(
    { Status: { type: "select", options: ["To Do", "Done"] }, Flagged: { type: "rich_text" } },
    [
      { name: "Status", type: "select", options: ["To Do", "Done", "Dropped"] },
      { name: "Flagged", type: "checkbox" },
      { name: "OF ID", type: "rich_text" },
    ],
  );
  assert.deepEqual(gap.missing.map((p) => p.name), ["OF ID"]);
  assert.deepEqual(gap.missingOptions, [{ name: "Status", type: "select", options: ["Dropped"] }]);
  assert.deepEqual(gap.wrongType, [{ name: "Flagged", expected: "checkbox", actual: "rich_text" }]);
});

test("schemaPatch resends every existing option by id so Notion doesn't delete them", () => {
  const raw = {
    Status: { type: "status", status: { options: [{ id: "s1", name: "Not started" }, { id: "s2", name: "Done" }] } },
  };
  const gap = missingSchema(
    { Status: { type: "status", options: ["Not started", "Done"] } },
    [{ name: "Status", type: "status", options: ["Not started", "Done", "On hold", "Dropped"] }],
  );
  assert.deepEqual(schemaPatch(raw, gap), {
    Status: { status: { options: [{ id: "s1" }, { id: "s2" }, { name: "On hold" }, { name: "Dropped" }] } },
  });
});

test("schemaPatch builds configs for new properties and never patches type clashes", () => {
  const config = {
    notion: { tasksDataSourceId: "tasks-ds" },
    omnifocus: { priorityTagParent: "Priority" },
    tagAllowlist: ["website", "Priority : High"],
  } as Config;
  const gap = missingSchema({ Flagged: { type: "rich_text" } }, requiredTaskProps(config));
  const patch = schemaPatch({}, gap);
  assert.deepEqual(patch["OF ID"], { rich_text: {} });
  assert.deepEqual(patch["Tags"], { multi_select: { options: [{ name: "website" }] } });
  assert.deepEqual(patch["Parent Task"], { relation: { data_source_id: "tasks-ds", single_property: {} } });
  assert.deepEqual(patch["Estimate (min)"], { number: { format: "number" } });
  assert.equal(patch["Flagged"], undefined);
  assert.deepEqual(gap.wrongType, [{ name: "Flagged", expected: "checkbox", actual: "rich_text" }]);
});

test("missingSchema flags a relation that points at the wrong data source", () => {
  const req = [{ name: "Parent Task", type: "relation", relationTo: "364f0de1-d4db-48d9-844b-5230e96c216d" }];
  assert.equal(missingSchema({ "Parent Task": { type: "relation", relationTo: "364f0de1d4db48d9844b5230e96c216d" } }, req).wrongType.length, 0);
  assert.deepEqual(missingSchema({ "Parent Task": { type: "relation", relationTo: "other" } }, req).wrongType, [
    { name: "Parent Task", expected: "relation → 364f0de1-d4db-48d9-844b-5230e96c216d", actual: "relation → other" },
  ]);
});

test("assertWriteHost only allows the configured sync host", () => {
  const config = { syncHost: "taxus-brevifolia" } as Config;
  assert.doesNotThrow(() => assertWriteHost(config, "taxus-brevifolia"));
  assert.throws(() => assertWriteHost(config, "tupso"), /only runs on taxus-brevifolia/);
});
