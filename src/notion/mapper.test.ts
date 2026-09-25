import assert from "node:assert/strict";
import { test } from "node:test";
import { toProjectRow, toSchema, toTaskRow } from "./mapper.ts";

const text = (s: string) => [{ plain_text: s }];

test("toTaskRow reads the current Tasks schema and tolerates missing new props", () => {
  const row = toTaskRow({
    id: "p1",
    url: "https://notion.so/p1",
    last_edited_time: "2026-09-22T10:00:00.000Z",
    properties: {
      Task: { type: "title", title: text("Verify wsg-check") },
      Status: { type: "select", select: { name: "To Do" } },
      Priority: { type: "select", select: null },
      "Due Date": { type: "date", date: { start: "2026-09-30" } },
      Notes: { type: "rich_text", rich_text: text("a "), },
      Project: { type: "relation", relation: [{ id: "proj1" }] },
    },
  });
  assert.deepEqual(row, {
    pageId: "p1",
    url: "https://notion.so/p1",
    title: "Verify wsg-check",
    status: "To Do",
    priority: null,
    dueDate: "2026-09-30",
    deferDate: null,
    notes: "a ",
    flagged: null,
    tags: [],
    projectPageIds: ["proj1"],
    ofId: null,
    lastEditedAt: "2026-09-22T10:00:00.000Z",
    inTrash: false,
  });
});

test("toProjectRow reads status-type Status and OF ID", () => {
  const row = toProjectRow({
    id: "p2",
    url: "u",
    last_edited_time: "t",
    in_trash: true,
    properties: {
      "Project name": { type: "title", title: text("Rendition") },
      Status: { type: "status", status: { name: "In progress" } },
      "OF ID": { type: "rich_text", rich_text: text("abc123") },
    },
  });
  assert.equal(row.status, "In progress");
  assert.equal(row.ofId, "abc123");
  assert.equal(row.inTrash, true);
});

test("toSchema keeps option names for select and status", () => {
  assert.deepEqual(
    toSchema({
      Status: { type: "select", select: { options: [{ name: "To Do" }, { name: "Done" }] } },
      Notes: { type: "rich_text", rich_text: {} },
    }),
    { Status: { type: "select", options: ["To Do", "Done"] }, Notes: { type: "rich_text" } },
  );
});
