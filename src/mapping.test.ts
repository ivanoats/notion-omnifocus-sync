import assert from "node:assert/strict";
import { test } from "node:test";
import { projectStatusFromNotion, projectStatusToNotion, projectToNotionProps } from "./mapping.ts";

test("project status maps both ways and keeps Notion's finer active state", () => {
  assert.equal(projectStatusToNotion("active"), "In progress");
  assert.equal(projectStatusToNotion("active", "Not started"), "Not started");
  assert.equal(projectStatusToNotion("onHold", "Not started"), "On hold");
  assert.equal(projectStatusToNotion("dropped"), "Dropped");
  for (const s of ["active", "onHold", "done", "dropped"] as const) {
    assert.equal(projectStatusFromNotion(projectStatusToNotion(s)), s);
  }
  assert.equal(projectStatusFromNotion(null), "active");
});

test("projectToNotionProps fills title, status, folder, dates and OF ID", () => {
  const props = projectToNotionProps({
    id: "abc", name: "Blue Star", note: "", status: "onHold", folderPath: ["nerd"],
    deferDate: "2026-10-01T07:00:00.000Z", dueDate: null, completedAt: null, modifiedAt: null,
  });
  assert.deepEqual(props, {
    "Project name": { title: [{ text: { content: "Blue Star" } }] },
    Status: { status: { name: "On hold" } },
    Folder: { select: { name: "nerd" } },
    "Start date": { date: { start: "2026-10-01T07:00:00.000Z" } },
    "End date": { date: null },
    "OF ID": { rich_text: [{ text: { content: "abc" } }] },
  });
});
