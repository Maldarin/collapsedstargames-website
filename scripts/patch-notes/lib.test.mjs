import { test } from "node:test";
import assert from "node:assert/strict";
import { INITIAL_START, readCoveredThrough, findStart, unreadableCoveredThrough, isInternalPath, classifyPr, selectPrs, suggestedCoveredThrough } from "./lib.mjs";

const file = (ct, extra = "") => `---\nversion: "x"\ntitle: "t"\ndate: 2026-10-10\nsummary: "s"\nprs: [1]\ncoveredThrough: ${ct}\n${extra}---\n\nbody\n`;

test("reads quoted and unquoted coveredThrough", () => {
  assert.equal(readCoveredThrough(file('"2026-10-10T18:42:00Z"')), "2026-10-10T18:42:00Z");
  assert.equal(readCoveredThrough(file("2026-10-10T18:42:00Z")), "2026-10-10T18:42:00Z");
  assert.equal(readCoveredThrough(file("'2026-10-10T18:42:00Z'")), "2026-10-10T18:42:00Z");
  assert.equal(readCoveredThrough("no frontmatter here"), null);
});

test("reads coveredThrough from a CRLF file (Windows checkouts)", () => {
  assert.equal(readCoveredThrough(file('"2026-10-10T18:42:00Z"').replace(/\n/g, "\r\n")), "2026-10-10T18:42:00Z");
});

test("start is the max coveredThrough, drafts included; initial when none", () => {
  assert.equal(findStart([]), INITIAL_START);
  assert.equal(findStart([file('"2026-10-11T00:00:00Z"'), file('"2026-10-12T05:00:00Z"', "draft: true\n"), file("2026-10-10T00:00:00Z")]), "2026-10-12T05:00:00.000Z");
});

test("internal vs player-facing paths", () => {
  for (const p of ["tests/a.spec.luau", "docs/x.md", "design docs/y.md", ".claude/memory/m.md", ".agents/skills/s.md", "tools/progress-wipe/x.mjs", ".github/workflows/ci.yml", "README.md", ".gitignore"]) assert.equal(isInternalPath(p), true, p);
  for (const p of ["src/server/Systems/X.luau", "default.project.json", "assets/thing.rbxm"]) assert.equal(isInternalPath(p), false, p);
});

test("a PR is player-facing if ANY path is; internal only if ALL are; no files = player (be safe)", () => {
  assert.equal(classifyPr({ files: [{ path: "docs/a.md" }, { path: "src/x.luau" }] }), "player");
  assert.equal(classifyPr({ files: [{ path: "docs/a.md" }, { path: "tests/b.luau" }] }), "internal");
  assert.equal(classifyPr({ files: [] }), "player");
});

test("selects PRs strictly after start and not after now, oldest first", () => {
  const prs = [
    { number: 3, mergedAt: "2026-10-10T03:00:00Z" },
    { number: 1, mergedAt: "2026-10-10T01:00:00Z" }, // exactly at start: belongs to the previous patch
    { number: 2, mergedAt: "2026-10-10T02:00:00Z" },
    { number: 4, mergedAt: "2026-10-11T00:00:00Z" }, // after now
  ];
  assert.deepEqual(selectPrs(prs, "2026-10-10T01:00:00Z", "2026-10-10T12:00:00Z").map((p) => p.number), [2, 3]);
});

test("suggested coveredThrough is the newest mergedAt, null when none", () => {
  assert.equal(suggestedCoveredThrough([]), null);
  assert.equal(suggestedCoveredThrough([{ mergedAt: "2026-10-10T02:00:00Z" }, { mergedAt: "2026-10-10T03:00:00Z" }]), "2026-10-10T03:00:00Z");
});

test("reads coveredThrough with a trailing YAML comment (the spec's own template has one)", () => {
  assert.equal(readCoveredThrough(file('"2026-10-10T18:42:00Z"    # newest mergedAt included')), "2026-10-10T18:42:00Z");
  assert.equal(readCoveredThrough(file("2026-10-10T18:42:00Z # note")), "2026-10-10T18:42:00Z");
});

test("names every patch file whose coveredThrough is missing or not a time, so gather can stop", () => {
  const files = [
    { name: "ok.md", text: file('"2026-10-10T18:42:00Z"') },
    { name: "missing.md", text: '---\nversion: "x"\n---\nbody' },
    { name: "garbage.md", text: file('"next tuesday"') },
  ];
  assert.deepEqual(unreadableCoveredThrough(files), ["missing.md", "garbage.md"]);
  assert.deepEqual(unreadableCoveredThrough([files[0]]), []);
});
