import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublished, publishedNewestFirst, neighbors, patchUrl, isoDate, displayDate, toFeedEntry, buildFeed } from "./patch-notes.mjs";

const e = (id, date, extra = {}) => ({
  id,
  body: `## 🆕 New\n- **Thing ${id}.**\n`,
  data: { version: `v-${id}`, title: `T ${id}`, date: new Date(`${date}T00:00:00Z`), summary: `S ${id}`, prs: [1], coveredThrough: new Date(`${date}T12:00:00Z`), ...extra },
});

test("drafts are not published; missing or false draft is published", () => {
  assert.equal(isPublished(e("a", "2026-10-10", { draft: true })), false);
  assert.equal(isPublished(e("a", "2026-10-10", { draft: false })), true);
  assert.equal(isPublished(e("a", "2026-10-10")), true);
});

test("newest first, drafts removed", () => {
  const out = publishedNewestFirst([e("2026-10-10-a", "2026-10-10"), e("2026-10-12-c", "2026-10-12", { draft: true }), e("2026-10-11-b", "2026-10-11")]);
  assert.deepEqual(out.map((x) => x.id), ["2026-10-11-b", "2026-10-10-a"]);
});

test("same date breaks ties by id descending (deterministic)", () => {
  const out = publishedNewestFirst([e("2026-10-10-a", "2026-10-10"), e("2026-10-10-b", "2026-10-10")]);
  assert.deepEqual(out.map((x) => x.id), ["2026-10-10-b", "2026-10-10-a"]);
});

test("neighbors: newer is earlier in the newest-first list", () => {
  const sorted = publishedNewestFirst([e("x1", "2026-10-10"), e("x2", "2026-10-11"), e("x3", "2026-10-12")]);
  const n = neighbors(sorted, "x2");
  assert.equal(n.newer.id, "x3");
  assert.equal(n.older.id, "x1");
  assert.equal(neighbors(sorted, "x3").newer, null);
  assert.equal(neighbors(sorted, "x1").older, null);
});

test("urls and dates", () => {
  assert.equal(patchUrl("2026-10-10-a"), "https://collapsedstargames.com/nopas/patch-notes/2026-10-10-a/");
  assert.equal(isoDate(new Date("2026-10-10T00:00:00Z")), "2026-10-10");
  assert.equal(displayDate(new Date("2026-10-10T00:00:00Z")), "October 10, 2026");
});

test("feed entry shape and markdown trimmed", () => {
  assert.deepEqual(toFeedEntry(e("2026-10-10-a", "2026-10-10")), {
    id: "2026-10-10-a", version: "v-2026-10-10-a", title: "T 2026-10-10-a", date: "2026-10-10",
    summary: "S 2026-10-10-a", url: "https://collapsedstargames.com/nopas/patch-notes/2026-10-10-a/",
    markdown: "## 🆕 New\n- **Thing 2026-10-10-a.**",
  });
});

test("feed: published only, newest first; empty collection gives empty list", () => {
  assert.deepEqual(buildFeed([]), { patches: [] });
  const f = buildFeed([e("a", "2026-10-10"), e("b", "2026-10-11", { draft: true }), e("c", "2026-10-12")]);
  assert.deepEqual(f.patches.map((p) => p.id), ["c", "a"]);
});
