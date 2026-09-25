import assert from "node:assert/strict";
import { test } from "node:test";
import { assertWriteHost, type Config } from "./config.ts";
import { missingSchema } from "./schema.ts";

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
  assert.deepEqual(gap.missingOptions, [{ name: "Status", options: ["Dropped"] }]);
  assert.deepEqual(gap.wrongType, [{ name: "Flagged", expected: "checkbox", actual: "rich_text" }]);
});

test("assertWriteHost only allows the configured sync host", () => {
  const config = { syncHost: "taxis-brevifolia" } as Config;
  assert.doesNotThrow(() => assertWriteHost(config, "taxis-brevifolia"));
  assert.throws(() => assertWriteHost(config, "tupso"), /only runs on taxis-brevifolia/);
});
