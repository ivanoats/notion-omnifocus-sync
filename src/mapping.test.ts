import assert from "node:assert/strict";
import { test } from "node:test";
import type { Config } from "./config.ts";
import { projectStatusFromNotion, projectStatusToNotion, projectToNotionProps, richText, splitTags, taskStatusToNotion, taskToNotionProps } from "./mapping.ts";

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

test("richText chunks long notes into 2000-character items", () => {
  const { rich_text } = richText("x".repeat(4500));
  assert.deepEqual(rich_text.map((r) => r.text.content.length), [2000, 2000, 500]);
  assert.deepEqual(richText("").rich_text, []);
  assert.equal(richText("x".repeat(200_000)).rich_text.length, 100);
  assert.throws(() => richText("x".repeat(200_001)), RangeError);
});

test("only allowlisted priority tags become Priority", () => {
  const config = { omnifocus: { priorityTagParent: "Priority" }, tagAllowlist: ["Priority : High"] } as Config;
  assert.deepEqual(splitTags(["Priority : Critical"], config), { tags: [], priority: null });
  assert.deepEqual(splitTags(["Priority : Critical", "Priority : High"], config), { tags: [], priority: "High" });
});

test("task status keeps Notion's finer active states", () => {
  assert.equal(taskStatusToNotion("active"), "To Do");
  assert.equal(taskStatusToNotion("active", "Blocked"), "Blocked");
  assert.equal(taskStatusToNotion("completed", "In Progress"), "Done");
  assert.equal(taskStatusToNotion("dropped"), "Dropped");
});

test("taskToNotionProps maps allowlisted tags, priority tag, relations and OF ID", () => {
  const config = {
    omnifocus: { priorityTagParent: "Priority" },
    tagAllowlist: ["website", "Priority : High"],
  } as Config;
  const props = taskToNotionProps(
    {
      id: "t1", name: "Fix header", note: "see issue", status: "active", flagged: true,
      dueDate: "2026-10-01T00:00:00.000Z", deferDate: null, completedAt: null, estimatedMinutes: 30,
      tags: ["website", "Priority : High", "Mac : Online"], projectId: "p1", parentTaskId: null, repeatRule: null, modifiedAt: null,
    },
    config,
    { projectPageId: "np1", parentPageId: null },
  );
  assert.deepEqual(props.Tags, { multi_select: [{ name: "website" }] });
  assert.deepEqual(props.Priority, { select: { name: "High" } });
  assert.deepEqual(props.Project, { relation: [{ id: "np1" }] });
  assert.deepEqual(props["Parent Task"], { relation: [] });
  assert.deepEqual(props.Flagged, { checkbox: true });
  assert.deepEqual(props["Estimate (min)"], { number: 30 });
  assert.deepEqual(props["OF ID"], { rich_text: [{ text: { content: "t1" } }] });
});
