#!/usr/bin/env node
// Gathers the game PRs merged since the last patch and prints a digest to draft from.
// Read-only: never writes a patch file. Style rules: docs/patch-notes-style.md
//
//   npm run patch-notes:gather                       (start = newest coveredThrough in src/content/patch-notes)
//   npm run patch-notes:gather -- --since <ISO>      (override the start, e.g. to preview or re-draft)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { findStart, classifyPr, selectPrs, suggestedCoveredThrough, isInternalPath } from "./lib.mjs";

const REPO = "Maldarin/not-my-pants-alien-scum";
const DIR = "src/content/patch-notes";

const sinceArg = process.argv.indexOf("--since");
const texts = readdirSync(DIR).filter((f) => f.endsWith(".md")).map((f) => readFileSync(join(DIR, f), "utf8"));
const start = sinceArg > 0 ? new Date(process.argv[sinceArg + 1]).toISOString() : findStart(texts);
const now = new Date().toISOString();

let raw;
try {
  raw = execFileSync("gh", ["pr", "list", "-R", REPO, "--base", "main", "--state", "merged",
    "--search", `merged:>=${start}`, "--json", "number,title,body,mergedAt,files", "--limit", "200"], { encoding: "utf8" });
} catch (e) {
  console.error(`STOPPED: gh failed — is it installed and logged in (gh auth status)?\n${e.message}`);
  process.exit(1);
}

const prs = selectPrs(JSON.parse(raw), start, now);
console.log(`Patch-notes digest for ${REPO}\nMerged after ${start} through ${now}\n`);
if (!prs.length) { console.log("Nothing to draft — no PRs merged in that window."); process.exit(0); }

const player = prs.filter((p) => classifyPr(p) === "player");
const internal = prs.filter((p) => classifyPr(p) === "internal");

console.log(`== PLAYER-FACING (${player.length}) ==`);
for (const p of player) {
  const byTop = {};
  for (const f of p.files ?? []) { const top = f.path.split("/").slice(0, 3).join("/"); (byTop[top] ??= []).push(f.path); }
  console.log(`\n#${p.number}  ${p.title}\n  merged ${p.mergedAt}`);
  const body = (p.body ?? "").trim().replace(/\r/g, "");
  if (body) console.log("  " + body.slice(0, 1200).split("\n").join("\n  ") + (body.length > 1200 ? "\n  …(truncated)" : ""));
  for (const [top, paths] of Object.entries(byTop)) console.log(`  [${top}] ${paths.length} file(s)${paths.every(isInternalPath) ? " (internal)" : ""}`);
}

console.log(`\n== SKIPPED AS INTERNAL (${internal.length}) ==`);
for (const p of internal) console.log(`#${p.number}  ${p.title}  — only touches: ${[...new Set((p.files ?? []).map((f) => f.path.split("/")[0]))].join(", ")}`);

console.log(`\nSuggested coveredThrough: "${suggestedCoveredThrough(prs)}"`);
