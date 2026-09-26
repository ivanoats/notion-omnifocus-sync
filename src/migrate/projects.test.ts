import assert from "node:assert/strict";
import { test } from "node:test";
import type { NotionProjectRow, NotionSnapshot, OFProject, OFSnapshot } from "../model.ts";
import { formatProposal, parseProposal, planApply, propose } from "./projects.ts";

const ofProject = (id: string, name: string): OFProject => ({
  id, name, note: "", status: "active", folderPath: [], deferDate: null, dueDate: null, completedAt: null, modifiedAt: null,
});
const notionProject = (pageId: string, title: string, ofId: string | null = null): NotionProjectRow => ({
  pageId, url: "", title, status: "In progress", startDate: null, endDate: null, ofId, lastEditedAt: "", inTrash: false,
});
const ofSnap = (projects: OFProject[]): OFSnapshot => ({ exportedAt: "", projects, tasks: [] });
const notionSnap = (projects: NotionProjectRow[]): NotionSnapshot =>
  ({ exportedAt: "", projects, tasks: [], tasksSchema: {}, projectsSchema: {} });

test("propose → YAML → parse round-trips and applies overrides", () => {
  const of = ofSnap([ofProject("o1", "SustainableWebsites"), ofProject("o2", "Home")]);
  const n = notionSnap([notionProject("n1", "sustainablewebsites2"), notionProject("n2", "dotfiles")]);
  const proposal = propose(of, n, [{ omnifocus: "SustainableWebsites", notion: "sustainablewebsites2" }]);
  const text = formatProposal(proposal);
  assert.match(text, /^# Project matching proposal/);
  assert.deepEqual(parseProposal(text), proposal);
  assert.deepEqual(proposal.link.map((l) => [l.omnifocus.id, l.notion.id, l.method]), [["o1", "n1", "override"]]);
  assert.deepEqual(proposal.createInNotion.map((r) => r.id), ["o2"]);
  assert.deepEqual(proposal.createInOmniFocus.map((r) => r.id), ["n2"]);
});

test("planApply is idempotent: work already recorded via OF ID is skipped", () => {
  const of = ofSnap([ofProject("o1", "Rendition"), ofProject("o2", "Home")]);
  const n = notionSnap([notionProject("n1", "Rendition", "o1"), notionProject("n2", "Home", "o2"), notionProject("n3", "dotfiles", "o9")]);
  const plan = planApply(
    {
      link: [{ omnifocus: { id: "o1", name: "Rendition" }, notion: { id: "n1", name: "Rendition" }, method: "exact" }],
      createInNotion: [{ id: "o2", name: "Home" }],
      createInOmniFocus: [{ id: "n3", name: "dotfiles" }],
    },
    of,
    n,
  );
  assert.deepEqual(plan.ops, []);
  assert.equal(plan.alreadyDone.length, 3);
  assert.deepEqual(plan.errors, []);
});

test("planApply rejects stale ids, duplicates and conflicting links", () => {
  const of = ofSnap([ofProject("o1", "Rendition"), ofProject("o2", "Home")]);
  const n = notionSnap([notionProject("n1", "Rendition", "other"), notionProject("n2", "Home")]);
  const plan = planApply(
    {
      link: [
        { omnifocus: { id: "o1", name: "Rendition" }, notion: { id: "n1", name: "Rendition" }, method: "exact" },
        { omnifocus: { id: "gone", name: "Old" }, notion: { id: "n2", name: "Home" }, method: "exact" },
      ],
      createInNotion: [{ id: "o2", name: "Home" }, { id: "o2", name: "Home" }],
      createInOmniFocus: [],
    },
    of,
    n,
  );
  assert.equal(plan.errors.length, 3);
  assert.match(plan.errors.join("\n"), /different OF ID/);
  assert.match(plan.errors.join("\n"), /"Old" \(gone\) not found/);
  assert.match(plan.errors.join("\n"), /more than once/);
});

test("planApply produces link and create ops for fresh items", () => {
  const of = ofSnap([ofProject("o1", "Rendition"), ofProject("o2", "Home")]);
  const n = notionSnap([notionProject("n1", "Rendition"), notionProject("n2", "dotfiles")]);
  const plan = planApply(propose(of, n, []), of, n);
  assert.deepEqual(plan.ops.map((op) => op.kind), ["link", "createInNotion", "createInOmniFocus"]);
});

test("createInOmniFocus never duplicates or steals a same-name OmniFocus project", () => {
  const n = notionSnap([
    notionProject("n1", "Rendition"),
    notionProject("n2", "dotfiles"),
    notionProject("n3", "ivan-jekyll", "o3"),
    notionProject("n4", "ivan-jekyll copy"),
  ]);
  const of = ofSnap([
    ofProject("o1", "Rendition"), // left behind by an interrupted run: top-level, unlinked
    ofProject("o3", "ivan-jekyll"), // already linked to n3
    ofProject("o4", "dotfiles"),
    { ...ofProject("o5", "dotfiles"), folderPath: ["nerd"] }, // two candidates: ambiguous
  ]);
  const plan = planApply(
    {
      link: [],
      createInNotion: [],
      createInOmniFocus: [
        { id: "n1", name: "Rendition" },
        { id: "n2", name: "dotfiles" },
        { id: "n4", name: "ivan-jekyll copy" },
      ],
    },
    of,
    n,
  );
  assert.deepEqual(plan.ops.map((op) => [op.kind, op.kind === "link" ? op.of.id : ""]), [["link", "o1"], ["createInOmniFocus", ""]]);
  assert.equal(plan.errors.length, 1);
  assert.match(plan.errors[0], /named "dotfiles"/);

  const stolen = planApply({ link: [], createInNotion: [], createInOmniFocus: [{ id: "n4", name: "x" }] }, of, {
    ...n,
    projects: [notionProject("n3", "ivan-jekyll", "o3"), notionProject("n4", "ivan-jekyll")],
  });
  assert.match(stolen.errors.join("\n"), /already has "ivan-jekyll", linked to Notion/);
});

test("createInOmniFocus refuses when a same-name project exists outside the sync scope", () => {
  const of = { ...ofSnap([]), outOfScopeProjects: [{ id: "old", name: "dotfiles", status: "done" as const, folderPath: [] }] };
  const plan = planApply({ link: [], createInNotion: [], createInOmniFocus: [{ id: "n1", name: "dotfiles" }] }, of, notionSnap([notionProject("n1", "dotfiles")]));
  assert.deepEqual(plan.ops, []);
  assert.match(plan.errors[0], /already has "dotfiles" \(done\) outside the sync scope/);
});
