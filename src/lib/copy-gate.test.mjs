import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const roots = ["src/pages", "src/components", "src/layouts"];
const skip = (p) => p.split(String.fromCharCode(92)).join("/").includes("src/content/patch-notes");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (skip(p)) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = roots.flatMap((r) => walk(r));
const COUNT = /\b(three|five) (ways to play|modes|games)\b|all three|3 modes/i;

test("the gate scans source files", () => {
  assert.ok(files.length > 20);
});

test("no copy states a game count", () => {
  const hits = [];
  for (const f of files) {
    const lines = readFileSync(f, "utf8").split(/\r?\n/);
    lines.forEach((l, i) => { if (COUNT.test(l)) hits.push(`${relative(".", f)}:${i + 1}: ${l.trim().slice(0, 100)}`); });
  }
  assert.deepEqual(hits, []);
});

test("no hard-coded roblox.com/games/ links", () => {
  const hits = files.filter((f) => readFileSync(f, "utf8").includes("roblox.com/games/")).map((f) => relative(".", f));
  assert.deepEqual(hits, []);
});
