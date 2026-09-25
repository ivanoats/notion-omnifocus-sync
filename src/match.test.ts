import assert from "node:assert/strict";
import { test } from "node:test";
import { matchByName, normalizeName, similarity } from "./match.ts";

test("normalizeName strips emoji, punctuation and case", () => {
  assert.equal(normalizeName("⛵ Blue Star!"), "blue star");
  assert.equal(normalizeName("StorckPhotos.com"), "storckphotos com");
});

test("similarity is token Jaccard", () => {
  assert.equal(similarity("Blue Star", "blue star"), 1);
  assert.equal(similarity("Blue Star refit", "Blue Star"), 2 / 3);
  assert.equal(similarity("", "anything"), 0);
});

test("matchByName prefers OF ID links, then exact, then best fuzzy, one-to-one", () => {
  const of = [
    { id: "a", name: "Website redesign" },
    { id: "b", name: "Rendition" },
    { id: "c", name: "Blue Star refit" },
    { id: "d", name: "Taxes 2026" },
  ];
  const notion = [
    { id: "n1", name: "Totally renamed", ofId: "a" },
    { id: "n2", name: "rendition" },
    { id: "n3", name: "⛵ Blue Star" },
    { id: "n4", name: "Ballard Elks" },
  ];
  const r = matchByName(of, notion);
  assert.deepEqual(
    r.pairs.map((p) => [p.of.id, p.notion.id, p.method]),
    [["a", "n1", "ofId"], ["b", "n2", "exact"], ["c", "n3", "fuzzy"]],
  );
  assert.deepEqual(r.ofOnly.map((x) => x.id), ["d"]);
  assert.deepEqual(r.notionOnly.map((x) => x.id), ["n4"]);
});

test("a fuzzy candidate is not reused once taken", () => {
  const r = matchByName(
    [{ id: "a", name: "Blue Star" }, { id: "b", name: "Blue Star engine" }],
    [{ id: "n", name: "Blue Star boat" }],
  );
  assert.equal(r.pairs.length, 1);
  assert.equal(r.ofOnly.length, 1);
});
