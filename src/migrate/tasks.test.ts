import assert from "node:assert/strict";
import { test } from "node:test";
import type { NotionProjectRow, NotionSnapshot, NotionTaskRow, OFSnapshot, OFTask } from "../model.ts";
import { planTasks } from "./tasks.ts";

const task = (id: string, name: string, extra: Partial<OFTask> = {}): OFTask => ({
  id, name, note: "", status: "active", flagged: false, dueDate: null, deferDate: null, completedAt: null,
  estimatedMinutes: null, tags: [], projectId: "p1", parentTaskId: null, repeatRule: null, modifiedAt: null, ...extra,
});
const notionTask = (pageId: string, title: string, ofId: string | null = null): NotionTaskRow => ({
  pageId, url: "", title, status: "To Do", priority: null, dueDate: null, deferDate: null, notes: "", flagged: null,
  tags: [], projectPageIds: [], ofId, lastEditedAt: "", inTrash: false,
});
const project = (pageId: string, ofId: string | null): NotionProjectRow => ({
  pageId, url: "", title: "Blue Star", status: "In progress", startDate: null, endDate: null, ofId, lastEditedAt: "", inTrash: false,
});
const snap = (tasks: OFTask[]): OFSnapshot => ({
  exportedAt: "",
  projects: [{ id: "p1", name: "Blue Star", note: "", status: "active", folderPath: [], deferDate: null, dueDate: null, completedAt: null, modifiedAt: null }],
  tasks,
});
const nsnap = (tasks: NotionTaskRow[], projects: NotionProjectRow[]): NotionSnapshot =>
  ({ exportedAt: "", tasks, projects, tasksSchema: {}, projectsSchema: {} });

test("parents are created before subtasks, and subtasks point at them", () => {
  const plan = planTasks(
    snap([task("c1", "child", { parentTaskId: "g1" }), task("g1", "group"), task("solo", "solo")]),
    nsnap([], [project("np1", "p1")]),
  );
  assert.deepEqual(plan.creates.map((c) => c.task.id), ["g1", "c1", "solo"]);
  assert.equal(plan.creates[1].parentOfId, "g1");
  assert.ok(plan.creates.every((c) => c.projectPageId === "np1"));
  assert.deepEqual(plan.unlinkedProjects, []);
});

test("already-migrated tasks are skipped and existing parents are referenced by page id", () => {
  const plan = planTasks(
    snap([task("g1", "group"), task("c1", "child", { parentTaskId: "g1" })]),
    nsnap([notionTask("ng1", "group", "g1")], [project("np1", "p1")]),
  );
  assert.equal(plan.alreadyDone, 1);
  assert.deepEqual(plan.creates.map((c) => [c.task.id, c.parentOfId, c.parentPageId]), [["c1", null, "ng1"]]);
});

test("existing Notion tasks are linked by name; unmatched ones are left for sync", () => {
  const plan = planTasks(
    snap([task("t1", "Verify wsg-check run on Verdant design system"), task("t2", "Buy rope")]),
    nsnap([notionTask("n1", "Verify wsg-check run on Verdant design system"), notionTask("n2", "Call Discount Tire")], [project("np1", "p1")]),
  );
  assert.deepEqual(plan.links.map((l) => [l.task.id, l.notion.pageId]), [["t1", "n1"]]);
  assert.deepEqual(plan.notionOnly.map((t) => t.pageId), ["n2"]);
  assert.deepEqual(plan.creates.map((c) => c.task.id), ["t2"]);
});

test("tasks whose project isn't linked yet are reported", () => {
  const plan = planTasks(snap([task("t1", "x")]), nsnap([], [project("np1", null)]));
  assert.deepEqual(plan.unlinkedProjects, ["Blue Star"]);
  assert.equal(plan.creates[0].projectPageId, null);
});
