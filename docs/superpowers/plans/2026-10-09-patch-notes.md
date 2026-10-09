# Patch Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Approved NOPAS patch notes live as markdown files on the website. The build produces themed pages and a JSON feed. The Discord bot posts each new patch to `#patch-notes` exactly once.

**Architecture:** The website repo is the source of truth:
- An Astro content collection holds the patch files.
- The build renders `/nopas/patch-notes/` and a prerendered `feed.json`.
- A read-only `gather.mjs` turns merged game PRs into a digest the drafter writes from.

The bot polls the feed every 5 minutes. Before sending a patch it records a claim row in Postgres, so the same patch is never posted twice.

**Tech Stack:**
- Website: Astro 6.3.3 (content layer, `astro/zod`, `astro/loaders`), plain CSS, Node `node:test` for pure logic, Playwright for e2e.
- Bot: TypeScript ESM, discord.js 14, `pg`, Vitest + pg-mem.
- Tooling: GitHub CLI `gh`.

**Spec:** `docs/superpowers/specs/2026-10-09-patch-notes-design.md` (website repo).

## Global Constraints

- Repos and branches:
  - Website: `D:\Projects\collapsedstargames-website`, branch `feat/patch-notes` off `main`.
  - Bot: `D:\Projects\collapsedstargames-bot`, branch `feat/patch-notes` off `master`.
  - **Don't push either branch until Task 9 or 10.** A push to website `main` deploys the site; a push to bot `master` deploys the bot.
- Game repo for PRs: `Maldarin/not-my-pants-alien-scum`, base `main`. Read only.
- Initial start time: `2026-10-10T01:00:00Z`.
- Patch file path: `src/content/patch-notes/<YYYY-MM-DD>-<slug>.md`, lowercase letters, digits and dashes only. The file name without `.md` is the patch id and never changes after publish.
- Feed URL: `https://collapsedstargames.com/nopas/patch-notes/feed.json`. Page URL: `https://collapsedstargames.com/nopas/patch-notes/<id>/`.
- Discord:
  - `#patch-notes` id `1558224477131907165`.
  - `#admin` id `1528829084552134848` (smoke test only).
  - Guild id `1512237266800742570`.
- Bot poll interval: `300_000` ms. At most 3 posts per tick.
- Embed description limit: `4096` characters. Title limit: `256` characters.
- Never `@everyone`. A ping happens only if `patchNotesRoleId` is set, and `allowedMentions` must allow only that role.
- Bot DB credentials live in `discord-bot.env` (`KEY: value` colon format, gitignored). The bot token is `DISCORD_BOT_TOKEN` in the same file.
- Commit trailers on every commit:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01A8VmYWMJufLy3TU9GmhsMh
  ```

## Review Focus

- **Unquoted `coveredThrough`.** YAML turns `coveredThrough: 2026-10-10T18:42:00Z` (no quotes) into a Date. The schema must accept it, and `gather` must still read it. Tests: Task 2 (an unquoted fixture that must build) and Task 4.
- **One enormous bullet longer than 4096 characters.** The embed must still be ≤ 4096 characters and end with the "read the full patch notes" link. It must not throw or exceed the limit. Test: Task 6.
- **Two patches with the same `date`.** The website (newest first) and the bot (oldest first) must order them deterministically by id, so "newest" on the site is the last one the bot posts. Tests: Task 1 and Task 7.
- **A PR merged exactly at the start time.** It belongs to the previous patch and is excluded (strict `>`). A PR merged after "now" is excluded too. Test: Task 4.
- **A valid feed with one bad entry** (missing url, or `http:`). The whole feed is rejected with `FeedError`, logged at error level, and nothing posts. Partial posting would hide the broken entry. Test: Task 6.

---

## Website repo (`D:\Projects\collapsedstargames-website`)

Before Task 1, run:

```bash
cd /d/Projects/collapsedstargames-website && git checkout -b feat/patch-notes
```

### Task 1: Pure patch-notes helpers

**Files:**
- Create: `src/lib/patch-notes.mjs`
- Create: `src/lib/patch-notes.test.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces (used by Tasks 2–3), where `entry` is a content-collection entry `{ id: string, body?: string, data: { version, title, date: Date, summary, prs, coveredThrough: Date, draft?: boolean } }`:
  - `SITE: string`
  - `isPublished(entry): boolean`
  - `publishedNewestFirst(entries): entry[]`
  - `neighbors(sorted, id): { newer: entry|null, older: entry|null }`
  - `patchUrl(id): string`
  - `isoDate(d: Date): string`
  - `displayDate(d: Date): string`
  - `toFeedEntry(entry): {id,version,title,date,summary,url,markdown}`
  - `buildFeed(entries): { patches: FeedEntry[] }`

- [ ] **Step 1: Write the failing tests**

`src/lib/patch-notes.test.mjs`:

```js
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
```

- [ ] **Step 2: Add the test script and run it to verify it fails**

In `package.json` `"scripts"`, add:

```json
"test:unit": "node --test \"src/lib/*.test.mjs\" \"scripts/patch-notes/*.test.mjs\""
```

Run: `npm run test:unit`
Expected: FAIL with `Cannot find module` for `./patch-notes.mjs`.

- [ ] **Step 3: Implement**

`src/lib/patch-notes.mjs`:

```js
// Pure helpers for the patch-notes collection. Plain .mjs so `node --test` exercises the exact
// code the Astro pages and feed import — the pages stay thin, the logic stays tested.
export const SITE = "https://collapsedstargames.com";

export function isPublished(entry) {
  return entry.data.draft !== true;
}

// Newest first; the same date breaks ties by id DESCENDING. The bot posts oldest first with the
// mirror-image rule (date asc, id asc), so the patch shown on top here is the last one posted.
export function publishedNewestFirst(entries) {
  return entries
    .filter(isPublished)
    .sort((a, b) => b.data.date - a.data.date || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

export function neighbors(sorted, id) {
  const i = sorted.findIndex((x) => x.id === id);
  return {
    newer: i > 0 ? sorted[i - 1] : null,
    older: i >= 0 && i < sorted.length - 1 ? sorted[i + 1] : null,
  };
}

export function patchUrl(id) {
  return `${SITE}/nopas/patch-notes/${id}/`;
}

// Frontmatter dates parse as UTC midnight; format in UTC so a viewer west of Greenwich does not
// see the day before.
export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function displayDate(d) {
  return d.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" });
}

export function toFeedEntry(entry) {
  return {
    id: entry.id,
    version: entry.data.version,
    title: entry.data.title,
    date: isoDate(entry.data.date),
    summary: entry.data.summary,
    url: patchUrl(entry.id),
    markdown: (entry.body ?? "").trim(),
  };
}

export function buildFeed(entries) {
  return { patches: publishedNewestFirst(entries).map(toFeedEntry) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS, 7 tests. (The `scripts/patch-notes/*.test.mjs` glob matches nothing yet. If Node errors on an unmatched pattern, temporarily run `node --test "src/lib/*.test.mjs"`; Task 4 adds the second file.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/patch-notes.mjs src/lib/patch-notes.test.mjs package.json
git commit -m "feat(patch-notes): pure helpers — publish filter, ordering, feed shape" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A8VmYWMJufLy3TU9GmhsMh"
```

### Task 2: Content collection, feed endpoint, fixtures

**Files:**
- Create: `src/content.config.ts`
- Create: `src/content/patch-notes/.gitkeep` (empty)
- Create: `src/pages/nopas/patch-notes/feed.json.ts`
- Create: `scripts/fixtures/patch-notes/published/2026-10-10-alpha-fixture.md`
- Create: `scripts/fixtures/patch-notes/published/2026-10-12-beta-fixture.md`
- Create: `scripts/fixtures/patch-notes/published/2026-10-13-draft-fixture.md`
- Create: `scripts/fixtures/patch-notes/empty/.gitkeep` (empty)

**Interfaces:**
- Consumes: `buildFeed` (Task 1).
- Produces:
  - The `patchNotes` collection, read with `getCollection("patchNotes")`.
  - The env var `PATCH_NOTES_DIR`, which overrides the collection directory (used by e2e).
  - The fixture ids `2026-10-10-alpha-fixture`, `2026-10-12-beta-fixture` and `2026-10-13-draft-fixture`, with titles "Alpha Fixture Pants", "Beta Fixture Pants" and "Draft Fixture Pants".

- [ ] **Step 1: Write the collection config**

`src/content.config.ts`:

```ts
import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

// One markdown file per patch. The file name (without .md) is the patch id; the Discord bot
// remembers ids, so a published file must never be renamed. PATCH_NOTES_DIR lets the e2e script
// build against fixtures instead of real patches.
const patchNotes = defineCollection({
  loader: glob({ pattern: "*.md", base: process.env.PATCH_NOTES_DIR ?? "./src/content/patch-notes" }),
  schema: z.object({
    version: z.string().min(1),
    title: z.string().min(1),
    date: z.coerce.date(),
    summary: z.string().min(1),
    prs: z.array(z.number().int().positive()),
    // coerce: an unquoted YAML timestamp arrives as a Date, a quoted one as a string. Both are valid.
    coveredThrough: z.coerce.date(),
    draft: z.boolean().optional(),
  }),
});

export const collections = { patchNotes };
```

- [ ] **Step 2: Write the feed endpoint**

`src/pages/nopas/patch-notes/feed.json.ts`:

```ts
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { buildFeed } from "../../../lib/patch-notes.mjs";

// Read by the Discord bot every 5 minutes. Published patches only, newest first.
export const prerender = true;

export const GET: APIRoute = async () => {
  const entries = await getCollection("patchNotes");
  return new Response(JSON.stringify(buildFeed(entries), null, 1), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
```

- [ ] **Step 3: Write the fixtures**

`scripts/fixtures/patch-notes/published/2026-10-10-alpha-fixture.md`:

```markdown
---
version: "Beta 1.1"
title: "Alpha Fixture Pants"
date: 2026-10-10
summary: "The older fixture patch."
prs: [1]
coveredThrough: "2026-10-10T18:00:00Z"
---

## 🆕 New
- **Alpha thing.** It exists now.

## 🐛 Fixes
- **Alpha bug.** It no longer exists.
```

`scripts/fixtures/patch-notes/published/2026-10-12-beta-fixture.md`. Its `coveredThrough` is deliberately unquoted to cover the Review Focus case:

```markdown
---
version: "Beta 1.2"
title: "Beta Fixture Pants"
date: 2026-10-12
summary: "The newer fixture patch."
prs: [2, 3]
coveredThrough: 2026-10-12T09:30:00Z
---

## 🆕 New
- **Beta thing.** Shinier than alpha.

## 🔧 Changes
- **Beta tweak.** Slightly different.

## 🐛 Fixes
- **Beta bug.** Squashed.
```

`scripts/fixtures/patch-notes/published/2026-10-13-draft-fixture.md`:

```markdown
---
version: "Beta 1.3"
title: "Draft Fixture Pants"
date: 2026-10-13
summary: "Must never appear anywhere."
prs: [4]
coveredThrough: "2026-10-13T00:00:00Z"
draft: true
---

## 🆕 New
- **Secret thing.** Shh.
```

Create empty files `src/content/patch-notes/.gitkeep` and `scripts/fixtures/patch-notes/empty/.gitkeep`.

- [ ] **Step 4: Build against the fixtures and verify the feed**

Run:

```bash
PATCH_NOTES_DIR=./scripts/fixtures/patch-notes/published npm run build && node -e 'const f=require("./dist/nopas/patch-notes/feed.json"); console.log(f.patches.map(p=>p.id+" "+p.date).join("\n"))'
```

Expected output, exactly:

```
2026-10-12-beta-fixture 2026-10-12
2026-10-10-alpha-fixture 2026-10-10
```

There's no draft line. If the build fails with a schema error about `coveredThrough`, the coerce is missing.

Then: `npm run build && cat dist/nopas/patch-notes/feed.json`
Expected: `{"patches": []}`, possibly with whitespace. The build may warn that the collection is empty; that's fine.

- [ ] **Step 5: Commit**

```bash
git add src/content.config.ts src/content/patch-notes/.gitkeep src/pages/nopas/patch-notes/feed.json.ts scripts/fixtures/patch-notes
git commit -m "feat(patch-notes): content collection, build-time JSON feed, fixtures" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A8VmYWMJufLy3TU9GmhsMh"
```

### Task 3: Pages, styles, navigation, teaser, e2e

**Files:**
- Create: `src/pages/nopas/patch-notes/index.astro`
- Create: `src/pages/nopas/patch-notes/[id].astro`
- Create: `src/styles/nopas-patch-notes.css`
- Modify: `src/layouts/BaseLayout.astro`. After the Stats link at line 72 (desktop nav) and line 150 (mobile menu), add a Patch Notes link in the same markup style.
- Modify: `src/pages/nopas/index.astro`. Add the imports and a `latest` lookup in the frontmatter; insert the teaser section right after the intro `</section>` at line 37.
- Create: `scripts/e2e-patch-notes.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `publishedNewestFirst`, `neighbors`, `displayDate` (Task 1); the `patchNotes` collection and the fixture ids and titles (Task 2).

- [ ] **Step 1: Write the e2e check (it fails first, since the pages don't exist yet)**

`scripts/e2e-patch-notes.mjs`:

```js
/*
 * End-to-end check for /nopas/patch-notes/ — builds the site twice against fixture patches
 * (scripts/fixtures/patch-notes/{published,empty}) and drives the built pages in a browser.
 *
 * Usage:  node scripts/e2e-patch-notes.mjs      (Requires: npx playwright install chromium)
 * Leaves dist/ holding the EMPTY-fixture build; run `npm run build` afterwards if you need a real
 * local dist. Production deploys build from git on Cloudflare, so this never affects the live site.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const SITE_PORT = 8793;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const site = createServer(async (req, res) => {
  let p = new URL(req.url, "http://x").pathname;
  if (p.endsWith("/")) p += "index.html";
  try {
    const buf = await readFile(join("dist", p));
    res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => site.listen(SITE_PORT, r));
const base = `http://127.0.0.1:${SITE_PORT}`;
const local = (url) => url.replace("https://collapsedstargames.com", base);

const fails = [];
const check = (label, cond) => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) fails.push(label); };
const build = (dir) => execSync("npm run build", { stdio: "inherit", env: { ...process.env, PATCH_NOTES_DIR: dir } });

const browser = await chromium.launch();
const page = await browser.newPage();

console.log("== build: published fixtures ==");
build("./scripts/fixtures/patch-notes/published");

console.log("== list page ==");
await page.goto(`${base}/nopas/patch-notes/`);
check("hero says PATCH NOTES", (await page.textContent("h1")).includes("PATCH NOTES"));
check("featured patch is the newest", (await page.textContent(".patch-feature")).includes("Beta Fixture Pants"));
check("older patch listed", (await page.textContent(".patch-older")).includes("Alpha Fixture Pants"));
check("draft absent from list", !(await page.content()).includes("Draft Fixture Pants"));
check("nav links to patch notes", (await page.locator('nav a[href="/nopas/patch-notes/"]').count()) >= 1);

console.log("== detail page ==");
await page.goto(`${base}/nopas/patch-notes/2026-10-12-beta-fixture/`);
check("detail title", (await page.textContent("h1")).includes("Beta Fixture Pants"));
check("New tag styled", (await page.locator('.patch-body h2[id$="new"]').count()) === 1);
check("Changes tag styled", (await page.locator('.patch-body h2[id$="changes"]').count()) === 1);
check("Fixes tag styled", (await page.locator('.patch-body h2[id$="fixes"]').count()) === 1);
check("links to older patch", (await page.locator('a[href="/nopas/patch-notes/2026-10-10-alpha-fixture/"]').count()) >= 1);
const draftRes = await page.goto(`${base}/nopas/patch-notes/2026-10-13-draft-fixture/`);
check("draft detail page not built", draftRes.status() === 404);

console.log("== feed ==");
const feed = JSON.parse(await readFile("dist/nopas/patch-notes/feed.json", "utf8"));
check("feed has 2 published patches, newest first", feed.patches.map((p) => p.id).join(",") === "2026-10-12-beta-fixture,2026-10-10-alpha-fixture");
for (const p of feed.patches) {
  await page.goto(local(p.url));
  check(`feed url resolves: ${p.id}`, (await page.textContent("h1")).includes(p.title));
}

console.log("== /nopas/ teaser ==");
await page.goto(`${base}/nopas/`);
check("teaser shows latest patch", (await page.textContent(".patch-teaser")).includes("Beta Fixture Pants"));

console.log("== build: empty ==");
build("./scripts/fixtures/patch-notes/empty");
await page.goto(`${base}/nopas/patch-notes/`);
check("empty state", (await page.content()).includes("No patches yet. The pants are still in the wash."));
check("empty feed", JSON.parse(await readFile("dist/nopas/patch-notes/feed.json", "utf8")).patches.length === 0);
await page.goto(`${base}/nopas/`);
check("no teaser when empty", (await page.locator(".patch-teaser").count()) === 0);

await browser.close();
site.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASS");
process.exit(fails.length ? 1 : 0);
```

In `package.json` `"scripts"`, add `"test:patch-notes": "node scripts/e2e-patch-notes.mjs"`.

Run: `npm run test:patch-notes`
Expected: FAIL. The build succeeds, but `/nopas/patch-notes/` returns 404, so `page.textContent("h1")` throws.

- [ ] **Step 2: Write the styles**

`src/styles/nopas-patch-notes.css`:

```css
/* Patch notes: same comic system as nopas-overview (ink borders, hard drop shadows, cream paper),
   with the three section headings drawn as laundry tags. Tags are keyed off the heading ids Astro
   generates ("🆕 New" -> id ending "new"), so colors follow meaning even when a section is omitted. */
.patch-hero { color: #fff; background: #211646 radial-gradient(circle, #ffffff10 1px, transparent 1.5px); background-size: 9px 9px; border-bottom: 4px solid var(--overview-ink); }
.patch-hero .overview-eyebrow { color: #cbb7eb; margin-bottom: 12px; }
.patch-hero h1 span { color: #ffdb56; }
.patch-hero p.patch-hero-lede { color: #e8ddf8; font-size: 16px; line-height: 1.65; margin-top: 16px; max-width: 640px; }

.patch-feature, .patch-card { display: block; background: #fff; border: 3px solid var(--overview-ink); box-shadow: 6px 6px 0 var(--overview-ink); padding: 24px 26px; transition: transform .16s, box-shadow .16s; }
.patch-feature:hover, .patch-card:hover { transform: translate(-2px,-2px); box-shadow: 8px 8px 0 var(--overview-ink); }
.patch-feature { background: #ffdb56; margin-bottom: 34px; }
.patch-feature h2 { margin: 6px 0 10px; }
.patch-meta { font-size: 12px; letter-spacing: 1px; color: #64418b; font-weight: 700; }
.patch-feature .patch-meta { color: var(--overview-ink); }
.patch-summary { font-size: 15px; line-height: 1.6; }
.patch-older { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 22px; }
.patch-card h3 { margin: 6px 0 8px; }
.patch-empty { font-size: 18px; text-align: center; padding: 40px 0; }

.patch-body { max-width: 760px; }
.patch-body h2 { display: inline-block; font-size: 18px; margin: 34px 0 14px; padding: 6px 16px 6px 26px; border: 2px solid var(--overview-ink); box-shadow: 3px 3px 0 var(--overview-ink); position: relative; transform: rotate(-1.5deg); background: #fff; }
.patch-body h2::before { content: ""; position: absolute; left: 9px; top: 50%; width: 8px; height: 8px; margin-top: -4px; border-radius: 50%; border: 2px solid var(--overview-ink); background: #fff9e9; }
.patch-body h2[id$="new"] { background: #a9ef79; }
.patch-body h2[id$="changes"] { background: #8fd3ff; transform: rotate(1deg); }
.patch-body h2[id$="fixes"] { background: #ffb36b; transform: rotate(-.5deg); }
.patch-body ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.patch-body li { background: #fff; border: 2px solid var(--overview-ink); padding: 12px 16px; font-size: 15px; line-height: 1.6; }
.patch-body li strong { font-weight: 700; }

.patch-nav { display: flex; justify-content: space-between; gap: 16px; margin-top: 44px; flex-wrap: wrap; }
.patch-teaser { display: flex; align-items: center; justify-content: space-between; gap: 18px; background: #ffdb56; border-bottom: 4px solid var(--overview-ink); padding-top: 22px; padding-bottom: 22px; }
.patch-teaser p { margin: 0; }

@media (max-width: 700px) {
  .patch-teaser { flex-direction: column; align-items: flex-start; }
  .patch-feature, .patch-card { padding: 18px; }
}
```

- [ ] **Step 3: Write the list page**

`src/pages/nopas/patch-notes/index.astro`:

```astro
---
import BaseLayout from "../../../layouts/BaseLayout.astro";
import { getCollection } from "astro:content";
import { publishedNewestFirst, displayDate } from "../../../lib/patch-notes.mjs";
import "../../../styles/nopas-overview.css";
import "../../../styles/nopas-patch-notes.css";

const patches = publishedNewestFirst(await getCollection("patchNotes"));
const [latest, ...older] = patches;
---

<BaseLayout title="Patch Notes — NOPAS" description="Every change to Not Our Pants, Alien Swine!, freshly laundered: new things, tweaks, and the bugs we finally caught.">
  <div class="nopas-overview">
    <section class="overview-pad patch-hero" aria-labelledby="patch-title">
      <a class="overview-back" href="/nopas/">← Back to NOPAS</a>
      <p class="overview-eyebrow">FRESHLY LAUNDERED CHANGES</p>
      <h1 id="patch-title">PATCH <span>NOTES</span></h1>
      <p class="patch-hero-lede">Everything that changed in Not Our Pants, Alien Swine!, newest on top. Folded, pressed, and only slightly singed.</p>
    </section>

    <section class="overview-pad" aria-label="Patches">
      {!latest && <p class="patch-empty">No patches yet. The pants are still in the wash.</p>}
      {latest && (
        <a class="patch-feature" href={`/nopas/patch-notes/${latest.id}/`}>
          <p class="patch-meta">LATEST · {latest.data.version.toUpperCase()} · {displayDate(latest.data.date)}</p>
          <h2>{latest.data.title}</h2>
          <p class="patch-summary">{latest.data.summary}</p>
          <p class="patch-meta">Read the full notes →</p>
        </a>
      )}
      {older.length > 0 && (
        <div class="patch-older">
          {older.map((p) => (
            <a class="patch-card" href={`/nopas/patch-notes/${p.id}/`}>
              <p class="patch-meta">{p.data.version.toUpperCase()} · {displayDate(p.data.date)}</p>
              <h3>{p.data.title}</h3>
              <p class="patch-summary">{p.data.summary}</p>
            </a>
          ))}
        </div>
      )}
    </section>
  </div>
</BaseLayout>
```

- [ ] **Step 4: Write the detail page**

`src/pages/nopas/patch-notes/[id].astro`:

```astro
---
import BaseLayout from "../../../layouts/BaseLayout.astro";
import { getCollection, render } from "astro:content";
import { publishedNewestFirst, neighbors, displayDate } from "../../../lib/patch-notes.mjs";
import "../../../styles/nopas-overview.css";
import "../../../styles/nopas-patch-notes.css";

export async function getStaticPaths() {
  const sorted = publishedNewestFirst(await getCollection("patchNotes"));
  return sorted.map((entry) => ({ params: { id: entry.id }, props: { entry, ...neighbors(sorted, entry.id) } }));
}

const { entry, newer, older } = Astro.props;
const { Content } = await render(entry);
---

<BaseLayout title={`${entry.data.version}: ${entry.data.title} — NOPAS Patch Notes`} description={entry.data.summary}>
  <div class="nopas-overview">
    <section class="overview-pad patch-hero" aria-labelledby="patch-title">
      <a class="overview-back" href="/nopas/patch-notes/">← All patch notes</a>
      <p class="overview-eyebrow">{entry.data.version.toUpperCase()} · {displayDate(entry.data.date).toUpperCase()}</p>
      <h1 id="patch-title">{entry.data.title}</h1>
      <p class="patch-hero-lede">{entry.data.summary}</p>
    </section>

    <section class="overview-pad">
      <div class="patch-body"><Content /></div>
      <nav class="patch-nav" aria-label="More patches">
        {older ? <a class="overview-button" href={`/nopas/patch-notes/${older.id}/`}>← {older.data.version}</a> : <span></span>}
        {newer && <a class="overview-button" href={`/nopas/patch-notes/${newer.id}/`}>{newer.data.version} →</a>}
      </nav>
    </section>
  </div>
</BaseLayout>
```

- [ ] **Step 5: Add the navigation links**

In `src/layouts/BaseLayout.astro`, after line 72 (`<li><a href="/nopas/stats/" ...>Stats</a></li>`), insert:

```astro
                        <li><a href="/nopas/patch-notes/" class="hover:text-[var(--color-golden-400)] transition">Patch Notes</a></li>
```

After line 150 (the mobile Stats link; it is line 151 once the insert above shifts it), insert:

```astro
                    <li><a href="/nopas/patch-notes/" class="block py-2.5 hover:text-[var(--color-golden-400)] transition">Patch Notes</a></li>
```

- [ ] **Step 6: Add the teaser to `/nopas/`**

In the `src/pages/nopas/index.astro` frontmatter, after line 11 (`import "../../styles/nopas-overview.css";`), add:

```astro
import "../../styles/nopas-patch-notes.css";
import { getCollection } from "astro:content";
import { publishedNewestFirst } from "../../lib/patch-notes.mjs";
const latestPatch = publishedNewestFirst(await getCollection("patchNotes"))[0];
```

Directly after the intro section's closing `</section>` (originally line 37), insert:

```astro
    {latestPatch && (
      <section class="overview-pad patch-teaser" aria-label="Latest patch">
        <p><span class="overview-eyebrow">LATEST PATCH · {latestPatch.data.version.toUpperCase()}</span><br/><strong>{latestPatch.data.title}</strong> — {latestPatch.data.summary}</p>
        <a class="overview-button" href={`/nopas/patch-notes/${latestPatch.id}/`}>Read the notes →</a>
      </section>
    )}
```

- [ ] **Step 7: Run e2e and unit tests**

Run: `npm run test:patch-notes`
Expected: every line `PASS`, ending `ALL PASS`.

Run: `npm run test:unit`
Expected: PASS.

Then run `npm run build` and check the build log for errors.

- [ ] **Step 8: Look at it**

Run: `PATCH_NOTES_DIR=./scripts/fixtures/patch-notes/published npm run dev`. Open `http://localhost:4321/nopas/patch-notes/` and the beta fixture page. Check:
- Light and dark theme.
- A phone-width viewport.

Fix anything that overflows, then stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add src/pages/nopas/patch-notes src/styles/nopas-patch-notes.css src/layouts/BaseLayout.astro src/pages/nopas/index.astro scripts/e2e-patch-notes.mjs package.json
git commit -m "feat(patch-notes): list + detail pages, laundry-tag styling, nav link, /nopas teaser, e2e" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A8VmYWMJufLy3TU9GmhsMh"
```

### Task 4: PR gathering script and style guide

**Files:**
- Create: `scripts/patch-notes/lib.mjs`
- Create: `scripts/patch-notes/lib.test.mjs`
- Create: `scripts/patch-notes/gather.mjs`
- Create: `docs/patch-notes-style.md`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces:
  - `INITIAL_START = "2026-10-10T01:00:00Z"`
  - `INTERNAL_PREFIXES: string[]`
  - `readCoveredThrough(text: string): string|null`
  - `findStart(fileTexts: string[]): string`
  - `isInternalPath(path: string): boolean`
  - `classifyPr(pr: {files:{path:string}[]}): "player"|"internal"`
  - `selectPrs(prs, startIso, nowIso): pr[]`
  - `suggestedCoveredThrough(prs): string|null`

- [ ] **Step 1: Write the failing tests**

`scripts/patch-notes/lib.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { INITIAL_START, readCoveredThrough, findStart, isInternalPath, classifyPr, selectPrs, suggestedCoveredThrough } from "./lib.mjs";

const file = (ct, extra = "") => `---\nversion: "x"\ntitle: "t"\ndate: 2026-10-10\nsummary: "s"\nprs: [1]\ncoveredThrough: ${ct}\n${extra}---\n\nbody\n`;

test("reads quoted and unquoted coveredThrough", () => {
  assert.equal(readCoveredThrough(file('"2026-10-10T18:42:00Z"')), "2026-10-10T18:42:00Z");
  assert.equal(readCoveredThrough(file("2026-10-10T18:42:00Z")), "2026-10-10T18:42:00Z");
  assert.equal(readCoveredThrough(file("'2026-10-10T18:42:00Z'")), "2026-10-10T18:42:00Z");
  assert.equal(readCoveredThrough("no frontmatter here"), null);
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
```

Run: `npm run test:unit`
Expected: FAIL with `Cannot find module` for `./lib.mjs`.

- [ ] **Step 2: Implement the pure library**

`scripts/patch-notes/lib.mjs`:

```js
// Pure logic for gather.mjs, kept separate so it is tested without GitHub.
export const INITIAL_START = "2026-10-10T01:00:00Z"; // 8:00 PM CDT 2026-10-09: post-beta-launch

export const INTERNAL_PREFIXES = ["tests/", "docs/", "design docs/", ".claude/", ".agents/", "tools/", ".github/"];

// Reads coveredThrough from raw frontmatter text, quoted or not. Raw text, not a YAML parser: an
// unquoted timestamp is a Date to YAML, and this script only ever needs the string.
export function readCoveredThrough(text) {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^coveredThrough:\s*["']?([^"'\r\n]+?)["']?\s*$/m);
  return m ? m[1] : null;
}

// Drafts count: a pending draft already covers its PRs, so the next gather must not repeat them.
export function findStart(fileTexts) {
  const times = fileTexts.map(readCoveredThrough).filter(Boolean).map((s) => Date.parse(s)).filter((n) => !Number.isNaN(n));
  return times.length ? new Date(Math.max(...times)).toISOString() : INITIAL_START;
}

export function isInternalPath(p) {
  if (INTERNAL_PREFIXES.some((pre) => p.startsWith(pre))) return true;
  return !p.includes("/") && (p.startsWith(".") || p.endsWith(".md"));
}

export function classifyPr(pr) {
  const files = pr.files ?? [];
  if (!files.length) return "player"; // unknown: show it to the drafter rather than hide it
  return files.every((f) => isInternalPath(f.path)) ? "internal" : "player";
}

export function selectPrs(prs, startIso, nowIso) {
  const start = Date.parse(startIso), now = Date.parse(nowIso);
  return prs
    .filter((p) => { const t = Date.parse(p.mergedAt); return t > start && t <= now; })
    .sort((a, b) => Date.parse(a.mergedAt) - Date.parse(b.mergedAt));
}

export function suggestedCoveredThrough(prs) {
  if (!prs.length) return null;
  return prs.reduce((max, p) => (Date.parse(p.mergedAt) > Date.parse(max) ? p.mergedAt : max), prs[0].mergedAt);
}
```

Run: `npm run test:unit`
Expected: PASS, all tests from Tasks 1 and 4.

- [ ] **Step 3: Write the CLI**

`scripts/patch-notes/gather.mjs`:

```js
#!/usr/bin/env node
// Gathers the game PRs merged since the last patch and prints a digest to draft from.
// Read-only: never writes a patch file. Style rules: docs/patch-notes-style.md
//
//   npm run patch-notes:gather
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { findStart, classifyPr, selectPrs, suggestedCoveredThrough, isInternalPath } from "./lib.mjs";

const REPO = "Maldarin/not-my-pants-alien-scum";
const DIR = "src/content/patch-notes";

const texts = readdirSync(DIR).filter((f) => f.endsWith(".md")).map((f) => readFileSync(join(DIR, f), "utf8"));
const start = findStart(texts);
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
```

In `package.json` `"scripts"`, add `"patch-notes:gather": "node scripts/patch-notes/gather.mjs"`.

Run: `npm run patch-notes:gather`
Expected: it exits 0 and prints either a digest or "Nothing to draft". Before 01:00 UTC on Oct 10 it is always "Nothing to draft".

- [ ] **Step 4: Write the style guide**

`docs/patch-notes-style.md`:

```markdown
# NOPAS patch notes: style and workflow

The spec is `docs/superpowers/specs/2026-10-09-patch-notes-design.md`.

## Workflow
1. Publish the game from Studio.
2. Run `npm run patch-notes:gather`.
3. Write `src/content/patch-notes/<YYYY-MM-DD>-<slug>.md` with `draft: true`.
   - The date is the day it went live.
   - The slug is the punny title in lowercase-dashes.
4. Hand the owner three things: the draft, the skipped list, and the PRs behind each item.
5. When the owner approves, delete the `draft: true` line and commit: `patch-notes: <version> — <title>`. Push `main`.
6. Cloudflare rebuilds the site in about 90 seconds. The bot posts to #patch-notes within about 5 minutes after that.

Never rename a published file. Its name is the id the bot remembers, so a rename posts the patch again.

## Frontmatter
`version`, `title`, `date`, `summary`, `prs`, `coveredThrough` (quoted ISO UTC; use the
digest's "Suggested coveredThrough"), and `draft`.

The version goes up as Beta 1.1, 1.2, and so on, and the owner confirms it. Use Beta 2.0 only when the owner says so.

## Body
`## 🆕 New`, `## 🔧 Changes`, `## 🐛 Fixes`, in that order, leaving out any that are empty. Each item is:

    - **Plain statement of what changed for players.** Optional short joke.

## Rules
- **Audience:** players, many of them kids. Write about what they'll notice: new things to do, things that feel different, and bugs that stopped.
- **Grouping:** one PR can become several items, and several PRs can merge into one item. Skip PRs with no player-visible effect, even if they touched `src/`.
- **Balance:** give the direction, never the number. "The Needle Eye rifle hits a little harder", not "+12%".
- **Leave out:**
  - Anti-cheat, earn caps, rate limits and server-protection changes.
  - Internal or system names.
  - Features that are built but switched off.
- **Exploits:** at most "Fixed an exploit". Never explain how it worked.
- **No promises.** No "coming soon" and no dates.
- **Voice:** the website's. Dry, pants-obsessed, self-deprecating about the dev team.
  - Never at players' expense.
  - Family-friendly.
  - At most one joke per item; plain items are fine.
  - Every patch gets a punny `title` and a one-sentence `summary`.

## Example
- **The Commander no longer gets stuck on Final Stand cannons.** He was hugging them. We don't know why either.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/patch-notes docs/patch-notes-style.md package.json
git commit -m "feat(patch-notes): gather digest from merged game PRs + drafting style guide" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A8VmYWMJufLy3TU9GmhsMh"
```

---

## Bot repo (`D:\Projects\collapsedstargames-bot`)

Before Task 5, run:

```bash
cd /d/Projects/collapsedstargames-bot && git checkout -b feat/patch-notes
```

### Task 5: Config fields, feed URL env, migration 010, repository

**Files:**
- Modify: `src/config/guildConfig.ts` (interface + `DEFAULT_CONFIG`)
- Modify: `src/config/env.ts`
- Modify: `tests/config/env.test.ts`
- Create: `src/db/migrations/010_patch_notes_posted.sql`
- Create: `src/db/repositories/patchNotesRepo.ts`
- Create: `tests/db/patchNotesRepo.test.ts`

**Interfaces:**
- Produces:
  - `GuildConfig.patchNotesChannelId: string | null` and `GuildConfig.patchNotesRoleId: string | null`, both defaulting to `null`.
  - `Env.patchNotesFeedUrl: string`, with `DEFAULT_PATCH_NOTES_FEED_URL` exported from `env.ts`.
  - `patchNotesRepo(pool)` returning:
    - `postedIds(): Promise<Set<string>>`
    - `claim(patchId: string, guildId: string): Promise<boolean>`
    - `confirm(patchId: string, messageId: string): Promise<void>`
    - `release(patchId: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Append to `tests/config/env.test.ts`:

```ts
describe("loadEnv — patchNotesFeedUrl", () => {
  it("defaults to the production feed", () => {
    expect(loadEnv(baseRequired).patchNotesFeedUrl).toBe("https://collapsedstargames.com/nopas/patch-notes/feed.json");
  });
  it("accepts an override", () => {
    expect(loadEnv({ ...baseRequired, PATCH_NOTES_FEED_URL: " http://127.0.0.1:9/feed.json " }).patchNotesFeedUrl).toBe("http://127.0.0.1:9/feed.json");
  });
  it("refuses a non-URL", () => {
    expect(() => loadEnv({ ...baseRequired, PATCH_NOTES_FEED_URL: "feed.json" })).toThrow(/PATCH_NOTES_FEED_URL/);
  });
});
```

`tests/db/patchNotesRepo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { freshPool } from "./memDb.js";
import { patchNotesRepo } from "../../src/db/repositories/patchNotesRepo.js";
import { DEFAULT_CONFIG } from "../../src/config/guildConfig.js";

describe("patchNotesRepo", () => {
  it("claims once, confirms, and lists posted ids", async () => {
    const repo = patchNotesRepo(await freshPool());
    expect(await repo.postedIds()).toEqual(new Set());
    expect(await repo.claim("p1", "g1")).toBe(true);
    expect(await repo.claim("p1", "g1")).toBe(false); // already claimed
    await repo.confirm("p1", "m1");
    expect(await repo.postedIds()).toEqual(new Set(["p1"]));
  });

  it("release lets a failed post be retried", async () => {
    const repo = patchNotesRepo(await freshPool());
    await repo.claim("p1", "g1");
    await repo.release("p1");
    expect(await repo.postedIds()).toEqual(new Set());
    expect(await repo.claim("p1", "g1")).toBe(true);
  });

  it("guild config defaults leave patch notes off", () => {
    const c = DEFAULT_CONFIG("g");
    expect(c.patchNotesChannelId).toBeNull();
    expect(c.patchNotesRoleId).toBeNull();
  });
});
```

Run: `npx vitest run tests/config/env.test.ts tests/db/patchNotesRepo.test.ts`
Expected: FAIL. The new env tests fail, the repo module is missing, and the config properties are `undefined`.

- [ ] **Step 2: Implement config, env, migration and repo**

In `src/config/guildConfig.ts`, add to the interface after `lastWatchdogAt: string | null;`:

```ts
  // Patch notes (website feed -> Discord). Null channel = feature off; null role = no ping.
  patchNotesChannelId: string | null;
  patchNotesRoleId: string | null;
```

In `DEFAULT_CONFIG`, add after `lastWatchdogAt: null,`:

```ts
    patchNotesChannelId: null,
    patchNotesRoleId: null,
```

In `src/config/env.ts`:
- Add `patchNotesFeedUrl: string;` to `Env`.
- Export the constant and validate before `const port = ...`.
- Return it alongside the other fields.

```ts
export const DEFAULT_PATCH_NOTES_FEED_URL = "https://collapsedstargames.com/nopas/patch-notes/feed.json";
```

```ts
  // Patch notes feed (published by the website build). Overridable for local testing; a malformed
  // value fails startup instead of silently polling nothing.
  const patchNotesFeedUrl = source.PATCH_NOTES_FEED_URL?.trim() || DEFAULT_PATCH_NOTES_FEED_URL;
  try { new URL(patchNotesFeedUrl); } catch {
    throw new Error(`Invalid PATCH_NOTES_FEED_URL: ${patchNotesFeedUrl}`);
  }
```

Then add `patchNotesFeedUrl,` to the returned object.

`src/db/migrations/010_patch_notes_posted.sql`:

```sql
-- Patch notes the bot has posted (or is posting) to Discord, keyed by the website's patch id
-- (the markdown file name). A row is written BEFORE the Discord send and deleted if the send fails,
-- so a patch is posted at most once: a crash mid-send skips a post rather than duplicating it.
CREATE TABLE IF NOT EXISTS patch_notes_posted (
  patch_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  message_id TEXT,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`src/db/repositories/patchNotesRepo.ts`:

```ts
import type { Pool } from "pg";

export function patchNotesRepo(pool: Pool) {
  return {
    async postedIds(): Promise<Set<string>> {
      const r = await pool.query("SELECT patch_id FROM patch_notes_posted");
      return new Set(r.rows.map((x: { patch_id: string }) => x.patch_id));
    },
    // Check-then-insert rather than ON CONFLICT ... RETURNING: pg-mem misreports RETURNING on
    // conflict, and one tick runs at a time, so the primary key is the real guard against races.
    async claim(patchId: string, guildId: string): Promise<boolean> {
      const exists = await pool.query("SELECT 1 FROM patch_notes_posted WHERE patch_id=$1", [patchId]);
      if (exists.rowCount) return false;
      await pool.query("INSERT INTO patch_notes_posted (patch_id, guild_id) VALUES ($1,$2)", [patchId, guildId]);
      return true;
    },
    async confirm(patchId: string, messageId: string): Promise<void> {
      await pool.query("UPDATE patch_notes_posted SET message_id=$2 WHERE patch_id=$1", [patchId, messageId]);
    },
    async release(patchId: string): Promise<void> {
      await pool.query("DELETE FROM patch_notes_posted WHERE patch_id=$1", [patchId]);
    },
  };
}
```

- [ ] **Step 3: Run the tests and the full suite**

Run: `npx vitest run tests/config/env.test.ts tests/db/patchNotesRepo.test.ts tests/db/migrate.test.ts`
Expected: PASS.

Run: `npm test && npx tsc --noEmit -p tsconfig.json`
Expected: all pass, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/config/guildConfig.ts src/config/env.ts tests/config/env.test.ts src/db/migrations/010_patch_notes_posted.sql src/db/repositories/patchNotesRepo.ts tests/db/patchNotesRepo.test.ts
git commit -m "feat(patch-notes): config fields, feed URL env, posted-patches table + repo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A8VmYWMJufLy3TU9GmhsMh"
```

### Task 6: Feed parsing and embed building (pure)

**Files:**
- Create: `src/patchNotes/feed.ts`
- Create: `src/patchNotes/embed.ts`
- Create: `tests/patchNotes/feed.test.ts`
- Create: `tests/patchNotes/embed.test.ts`

**Interfaces:**
- Produces:
  - `interface PatchFeedEntry { id; version; title; date; summary; url; markdown }` (all strings).
  - `class FeedError extends Error`
  - `parseFeed(text: string): PatchFeedEntry[]`
  - `interface PatchEmbed { title: string; url: string; description: string; footer: string }`
  - `buildPatchEmbed(p: PatchFeedEntry): PatchEmbed`
  - `EMBED_DESCRIPTION_MAX = 4096`, `EMBED_TITLE_MAX = 256`

- [ ] **Step 1: Write the failing tests**

`tests/patchNotes/feed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseFeed, FeedError } from "../../src/patchNotes/feed.js";

const entry = (over: Record<string, unknown> = {}) => ({
  id: "2026-10-10-a", version: "Beta 1.1", title: "T", date: "2026-10-10", summary: "S",
  url: "https://collapsedstargames.com/nopas/patch-notes/2026-10-10-a/", markdown: "## 🆕 New\n- **x**", ...over,
});

describe("parseFeed", () => {
  it("accepts a valid feed and an empty one", () => {
    expect(parseFeed(JSON.stringify({ patches: [entry()] }))).toHaveLength(1);
    expect(parseFeed(JSON.stringify({ patches: [] }))).toEqual([]);
  });
  it("rejects invalid JSON", () => {
    expect(() => parseFeed("<html>oops</html>")).toThrow(FeedError);
  });
  it("rejects a missing patches array", () => {
    expect(() => parseFeed(JSON.stringify({ nope: [] }))).toThrow(FeedError);
  });
  it("rejects the WHOLE feed when one entry is bad (missing url / non-https / bad date / empty title)", () => {
    for (const bad of [{ url: undefined }, { url: "http://collapsedstargames.com/x" }, { date: "Oct 10" }, { title: "" }, { id: 7 }]) {
      expect(() => parseFeed(JSON.stringify({ patches: [entry(), entry({ id: "b", ...bad })] }))).toThrow(FeedError);
    }
  });
  it("rejects duplicate ids", () => {
    expect(() => parseFeed(JSON.stringify({ patches: [entry(), entry()] }))).toThrow(/duplicate/);
  });
});
```

`tests/patchNotes/embed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPatchEmbed, EMBED_DESCRIPTION_MAX, EMBED_TITLE_MAX } from "../../src/patchNotes/embed.js";
import type { PatchFeedEntry } from "../../src/patchNotes/feed.js";

const p = (markdown: string, over: Partial<PatchFeedEntry> = {}): PatchFeedEntry => ({
  id: "2026-10-10-a", version: "Beta 1.1", title: "The Pants Strike Back", date: "2026-10-10",
  summary: "Saucers got bouncier.", url: "https://collapsedstargames.com/nopas/patch-notes/2026-10-10-a/", markdown, ...over,
});

describe("buildPatchEmbed", () => {
  it("title, url, footer, italic summary, headings become bold", () => {
    const e = buildPatchEmbed(p("## 🆕 New\n- **Jukebox.** One song.\n\n### Tiny\n- **x**"));
    expect(e.title).toBe("🩳 Beta 1.1 — The Pants Strike Back");
    expect(e.url).toBe("https://collapsedstargames.com/nopas/patch-notes/2026-10-10-a/");
    expect(e.footer).toBe("2026-10-10 · collapsedstargames.com");
    expect(e.description.startsWith("*Saucers got bouncier.*\n\n**🆕 New**\n- **Jukebox.** One song.")).toBe(true);
    expect(e.description).toContain("**Tiny**");
    expect(e.description).not.toMatch(/^#/m);
  });

  it("truncates at a whole bullet and links to the full notes", () => {
    const bullets = Array.from({ length: 200 }, (_, i) => `- **Change number ${i}.** ${"pants ".repeat(8)}`).join("\n");
    const e = buildPatchEmbed(p(`## 🔧 Changes\n${bullets}`));
    expect(e.description.length).toBeLessThanOrEqual(EMBED_DESCRIPTION_MAX);
    expect(e.description).toMatch(/…plus more — \[read the full patch notes →\]\(https:\/\/collapsedstargames\.com\/nopas\/patch-notes\/2026-10-10-a\/\)$/);
    const body = e.description.split("\n\n…plus more")[0];
    expect(body.split("\n").at(-1)).toMatch(/pants$/); // last kept line is a complete bullet (trailing space trimmed)
  });

  it("a single bullet longer than the limit is still capped (hard cut) and linked", () => {
    const e = buildPatchEmbed(p(`## 🆕 New\n- **Huge.** ${"x".repeat(10_000)}`));
    expect(e.description.length).toBeLessThanOrEqual(EMBED_DESCRIPTION_MAX);
    expect(e.description).toContain("read the full patch notes");
  });

  it("drops a heading left dangling with no items after truncation", () => {
    const first = Array.from({ length: 60 }, (_, i) => `- **A${i}.** ${"y".repeat(50)}`).join("\n");
    // Each B bullet is far too big to fit, so the cut lands right after the Fixes heading: that heading must be dropped.
    const second = Array.from({ length: 60 }, (_, i) => `- **B${i}.** ${"y".repeat(500)}`).join("\n");
    const e = buildPatchEmbed(p(`## 🆕 New\n${first}\n\n## 🐛 Fixes\n${second}`));
    const body = e.description.split("\n\n…plus more")[0].trimEnd();
    expect(body.split("\n").at(-1)!.startsWith("**")).toBe(false);
  });

  it("caps an over-long title", () => {
    expect(buildPatchEmbed(p("x", { title: "T".repeat(400) })).title.length).toBeLessThanOrEqual(EMBED_TITLE_MAX);
  });
});
```

Run: `npx vitest run tests/patchNotes`
Expected: FAIL, modules not found.

- [ ] **Step 2: Implement**

`src/patchNotes/feed.ts`:

```ts
// The website's /nopas/patch-notes/feed.json, validated. Strict on purpose: if any entry is
// malformed the whole feed is rejected, so a broken publish surfaces as an error instead of
// some patches quietly posting while one goes missing.
export interface PatchFeedEntry {
  id: string;
  version: string;
  title: string;
  date: string; // YYYY-MM-DD
  summary: string;
  url: string; // https
  markdown: string;
}

export class FeedError extends Error {}

const STRING_FIELDS = ["id", "version", "title", "date", "summary", "url", "markdown"] as const;

export function parseFeed(text: string): PatchFeedEntry[] {
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new FeedError("feed is not valid JSON"); }
  const patches = (body as { patches?: unknown })?.patches;
  if (!Array.isArray(patches)) throw new FeedError("feed has no patches array");
  const seen = new Set<string>();
  return patches.map((raw, i) => {
    if (typeof raw !== "object" || raw === null) throw new FeedError(`patches[${i}] is not an object`);
    const o = raw as Record<string, unknown>;
    for (const f of STRING_FIELDS) {
      if (typeof o[f] !== "string") throw new FeedError(`patches[${i}].${f} must be a string`);
      if (f !== "markdown" && !(o[f] as string).trim()) throw new FeedError(`patches[${i}].${f} is empty`);
    }
    const e = o as unknown as PatchFeedEntry;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new FeedError(`patches[${i}].date must be YYYY-MM-DD`);
    let u: URL;
    try { u = new URL(e.url); } catch { throw new FeedError(`patches[${i}].url is not a URL`); }
    if (u.protocol !== "https:") throw new FeedError(`patches[${i}].url must be https`);
    if (seen.has(e.id)) throw new FeedError(`duplicate patch id ${e.id}`);
    seen.add(e.id);
    return { id: e.id, version: e.version, title: e.title, date: e.date, summary: e.summary, url: e.url, markdown: e.markdown };
  });
}
```

`src/patchNotes/embed.ts`:

```ts
import type { PatchFeedEntry } from "./feed.js";

export const EMBED_DESCRIPTION_MAX = 4096;
export const EMBED_TITLE_MAX = 256;

export interface PatchEmbed {
  title: string;
  url: string;
  description: string;
  footer: string;
}

// Discord does not reliably render "##" headings inside embeds, so section headings become bold
// lines. Over-long notes are cut at a whole line (never mid-bullet) and point to the website.
export function buildPatchEmbed(p: PatchFeedEntry): PatchEmbed {
  const title = clip(`🩳 ${p.version} — ${p.title}`, EMBED_TITLE_MAX);
  const lines = p.markdown.split(/\r?\n/).map((l) => {
    const h = l.match(/^#{1,6}\s+(.*)$/);
    return h ? `**${h[1].trim()}**` : l;
  });
  const head = `*${p.summary}*\n\n`;
  const full = head + lines.join("\n").trim();
  if (full.length <= EMBED_DESCRIPTION_MAX) return { title, url: p.url, description: full, footer: `${p.date} · collapsedstargames.com` };

  const suffix = `\n\n…plus more — [read the full patch notes →](${p.url})`;
  const budget = EMBED_DESCRIPTION_MAX - suffix.length;
  const kept: string[] = [];
  let len = head.length;
  for (const l of lines) {
    if (len + l.length + 1 > budget) break;
    kept.push(l);
    len += l.length + 1;
  }
  // A heading (or blank line) left last has nothing under it; drop it.
  while (kept.length && (kept.at(-1)!.trim() === "" || /^\*\*.*\*\*$/.test(kept.at(-1)!.trim()))) kept.pop();
  let body = head + kept.join("\n");
  if (!kept.length) body = clip(head + lines.join("\n"), budget); // a single line bigger than the budget: hard cut
  return { title, url: p.url, description: body.trimEnd() + suffix, footer: `${p.date} · collapsedstargames.com` };
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/patchNotes`
Expected: PASS, 10 tests.

Note on the dangling-heading rule: a bullet line like `- **A1.** yyy` starts with `-`, so it isn't treated as a heading. Only lines that are entirely bold (converted headings) are popped.

- [ ] **Step 4: Commit**

```bash
git add src/patchNotes/feed.ts src/patchNotes/embed.ts tests/patchNotes
git commit -m "feat(patch-notes): strict feed parser + Discord embed builder with bullet-boundary truncation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A8VmYWMJufLy3TU9GmhsMh"
```

### Task 7: The polling tick

**Files:**
- Create: `src/patchNotes/tick.ts`
- Create: `tests/patchNotes/tick.test.ts`

**Interfaces:**
- Consumes: `parseFeed`, `FeedError`, `PatchFeedEntry` (Task 6); `buildPatchEmbed`, `PatchEmbed` (Task 6); `GuildConfig` (Task 5); the repo method shapes (Task 5).
- Produces:
  - `interface PatchNotesDeps`:
    - `getConfig(guildId): Promise<GuildConfig>`
    - `fetchFeed(): Promise<string>`
    - `postedIds(): Promise<Set<string>>`
    - `claim(id, guildId): Promise<boolean>`
    - `confirm(id, messageId): Promise<void>`
    - `release(id): Promise<void>`
    - `send(channelId, embed: PatchEmbed, roleId: string|null): Promise<string>`
    - `log: { warn(o,m?), error(o,m?) }`
  - `MAX_POSTS_PER_TICK = 3`
  - `runPatchNotesTick(deps, guildId): Promise<{ posted: string[] }>`

- [ ] **Step 1: Write the failing tests**

`tests/patchNotes/tick.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runPatchNotesTick, MAX_POSTS_PER_TICK, type PatchNotesDeps } from "../../src/patchNotes/tick.js";
import { FeedError } from "../../src/patchNotes/feed.js";
import { DEFAULT_CONFIG, type GuildConfig } from "../../src/config/guildConfig.js";

const entry = (id: string, date: string) => ({
  id, version: `v-${id}`, title: `T ${id}`, date, summary: "S",
  url: `https://collapsedstargames.com/nopas/patch-notes/${id}/`, markdown: "- **x**",
});

function harness(opts: { channel?: string | null; role?: string | null; feed?: unknown; feedText?: string; fetchThrows?: boolean; posted?: string[]; sendFails?: (n: number) => boolean } = {}) {
  const cfg: GuildConfig = { ...DEFAULT_CONFIG("g1"), patchNotesChannelId: opts.channel === undefined ? "chan" : opts.channel, patchNotesRoleId: opts.role ?? null };
  const rows = new Map<string, string | null>((opts.posted ?? []).map((id) => [id, "old"]));
  const sends: Array<{ channelId: string; title: string; roleId: string | null }> = [];
  const warns: string[] = [], errors: string[] = [];
  let n = 0;
  const deps: PatchNotesDeps = {
    getConfig: async () => cfg,
    fetchFeed: async () => { if (opts.fetchThrows) throw new Error("ECONNRESET"); return opts.feedText ?? JSON.stringify(opts.feed ?? { patches: [] }); },
    postedIds: async () => new Set(rows.keys()),
    claim: async (id) => { if (rows.has(id)) return false; rows.set(id, null); return true; },
    confirm: async (id, m) => { rows.set(id, m); },
    release: async (id) => { rows.delete(id); },
    send: async (channelId, embed, roleId) => { n++; if (opts.sendFails?.(n)) throw new Error("Missing Access"); sends.push({ channelId, title: embed.title, roleId }); return `msg${n}`; },
    log: { warn: (_o, m) => { warns.push(m ?? ""); }, error: (_o, m) => { errors.push(m ?? ""); } },
  };
  return { deps, rows, sends, warns, errors };
}

describe("runPatchNotesTick", () => {
  it("does nothing when no channel is configured (does not even fetch)", async () => {
    const h = harness({ channel: null, fetchThrows: true });
    expect(await runPatchNotesTick(h.deps, "g1")).toEqual({ posted: [] });
    expect(h.warns).toEqual([]);
  });

  it("posts unposted patches oldest first; ties by id ascending; confirms message ids", async () => {
    const h = harness({ feed: { patches: [entry("2026-10-12-b", "2026-10-12"), entry("2026-10-12-a", "2026-10-12"), entry("2026-10-10-z", "2026-10-10")] }, posted: ["2026-10-10-z"] });
    expect((await runPatchNotesTick(h.deps, "g1")).posted).toEqual(["2026-10-12-a", "2026-10-12-b"]);
    expect(h.rows.get("2026-10-12-a")).toBe("msg1");
    expect(h.rows.get("2026-10-12-b")).toBe("msg2");
  });

  it(`posts at most ${MAX_POSTS_PER_TICK} per tick`, async () => {
    const feed = { patches: ["1", "2", "3", "4", "5"].map((d) => entry(`2026-10-1${d}-p`, `2026-10-1${d}`)) };
    const h = harness({ feed });
    expect((await runPatchNotesTick(h.deps, "g1")).posted).toHaveLength(MAX_POSTS_PER_TICK);
    expect((await runPatchNotesTick(h.deps, "g1")).posted).toEqual(["2026-10-14-p", "2026-10-15-p"]);
  });

  it("releases the claim when the send fails, logs an error, and stops the tick", async () => {
    const h = harness({ feed: { patches: [entry("a", "2026-10-10"), entry("b", "2026-10-11")] }, sendFails: () => true });
    expect((await runPatchNotesTick(h.deps, "g1")).posted).toEqual([]);
    expect(h.rows.size).toBe(0);
    expect(h.errors).toHaveLength(1);
  });

  it("network failure is a warning, not an error", async () => {
    const h = harness({ fetchThrows: true });
    await runPatchNotesTick(h.deps, "g1");
    expect(h.warns).toHaveLength(1);
    expect(h.errors).toEqual([]);
  });

  it("a malformed feed is an error and posts nothing", async () => {
    const h = harness({ feedText: JSON.stringify({ patches: [entry("a", "2026-10-10"), { ...entry("b", "2026-10-11"), url: "http://x" }] }) });
    expect((await runPatchNotesTick(h.deps, "g1")).posted).toEqual([]);
    expect(h.errors).toHaveLength(1);
    expect(h.sends).toEqual([]);
  });

  it("passes the role id through when configured, null otherwise", async () => {
    const h = harness({ role: "role9", feed: { patches: [entry("a", "2026-10-10")] } });
    await runPatchNotesTick(h.deps, "g1");
    expect(h.sends[0].roleId).toBe("role9");
    const h2 = harness({ feed: { patches: [entry("a", "2026-10-10")] } });
    await runPatchNotesTick(h2.deps, "g1");
    expect(h2.sends[0].roleId).toBeNull();
  });

  it("skips a patch someone else already claimed", async () => {
    const h = harness({ feed: { patches: [entry("a", "2026-10-10")] } });
    h.deps.postedIds = async () => new Set(); // stale read: claim is the real guard
    h.rows.set("a", null);
    expect((await runPatchNotesTick(h.deps, "g1")).posted).toEqual([]);
    expect(h.sends).toEqual([]);
  });

  it("FeedError is exported for callers", () => {
    expect(new FeedError("x")).toBeInstanceOf(Error);
  });
});
```

Run: `npx vitest run tests/patchNotes/tick.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement**

`src/patchNotes/tick.ts`:

```ts
import type { GuildConfig } from "../config/guildConfig.js";
import { parseFeed, FeedError, type PatchFeedEntry } from "./feed.js";
import { buildPatchEmbed, type PatchEmbed } from "./embed.js";

export const MAX_POSTS_PER_TICK = 3;

export interface PatchNotesDeps {
  getConfig: (guildId: string) => Promise<GuildConfig>;
  fetchFeed: () => Promise<string>;
  postedIds: () => Promise<Set<string>>;
  claim: (patchId: string, guildId: string) => Promise<boolean>;
  confirm: (patchId: string, messageId: string) => Promise<void>;
  release: (patchId: string) => Promise<void>;
  send: (channelId: string, embed: PatchEmbed, roleId: string | null) => Promise<string>;
  log: { warn: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void };
}

// Oldest first; the same date breaks ties by id ascending. The website lists newest first with the
// mirror rule, so the patch on top of the site is always the last one posted here.
function oldestFirst(a: PatchFeedEntry, b: PatchFeedEntry): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export async function runPatchNotesTick(deps: PatchNotesDeps, guildId: string): Promise<{ posted: string[] }> {
  const posted: string[] = [];
  const cfg = await deps.getConfig(guildId);
  const channelId = cfg.patchNotesChannelId;
  if (!channelId) return { posted };

  let text: string;
  try {
    text = await deps.fetchFeed();
  } catch (e) {
    // Site briefly unreachable or redeploying: retry next tick without paging anyone.
    deps.log.warn({ err: String(e) }, "patch notes: feed fetch failed");
    return { posted };
  }

  let entries: PatchFeedEntry[];
  try {
    entries = parseFeed(text);
  } catch (e) {
    if (!(e instanceof FeedError)) throw e;
    // The site published something malformed. Error level -> reaches #admin via ops alerts.
    deps.log.error({ err: e.message }, "patch notes: feed is invalid");
    return { posted };
  }

  const done = await deps.postedIds();
  const pending = entries.filter((p) => !done.has(p.id)).sort(oldestFirst).slice(0, MAX_POSTS_PER_TICK);

  for (const p of pending) {
    if (!(await deps.claim(p.id, guildId))) continue;
    try {
      const messageId = await deps.send(channelId, buildPatchEmbed(p), cfg.patchNotesRoleId);
      await deps.confirm(p.id, messageId);
      posted.push(p.id);
    } catch (e) {
      await deps.release(p.id);
      deps.log.error({ err: e, patchId: p.id }, "patch notes: post failed");
      break; // a channel problem fails every post the same way; retry all next tick
    }
  }
  return { posted };
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/patchNotes`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/patchNotes/tick.ts tests/patchNotes/tick.test.ts
git commit -m "feat(patch-notes): polling tick — claim-then-send, at-most-once, 3 per tick" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A8VmYWMJufLy3TU9GmhsMh"
```

### Task 8: Wire the job into the bot

**Files:**
- Modify: `src/index.ts`. Add imports at the top; add the job after the economy watchdog block, i.e. after the `log.info("economy watchdog started (hourly check, 6h gate)");` line, still inside `if (conf) { ... }`.

**Interfaces:**
- Consumes: `runPatchNotesTick` (Task 7), `patchNotesRepo` (Task 5), `env.patchNotesFeedUrl` (Task 5), `startDigestJob` (existing: `startDigestJob(runTick: (nowMs) => Promise<unknown>, opts: { checkIntervalMs }, logError)`).

- [ ] **Step 1: Add the imports**

After `import { makeOpsAlerter, shouldAlert, describeLogArgs } from "./bot/opsAlerts.js";`, add:

```ts
import { runPatchNotesTick } from "./patchNotes/tick.js";
import { patchNotesRepo } from "./db/repositories/patchNotesRepo.js";
```

- [ ] **Step 2: Add the job**

After `log.info("economy watchdog started (hourly check, 6h gate)");`, add:

```ts
        // Patch notes: follow the website's feed and post each new patch to #patch-notes once.
        // A no-op until patchNotesChannelId is set.
        const patchRepo = patchNotesRepo(pool);
        startDigestJob(
          () =>
            runPatchNotesTick(
              {
                getConfig: (gid) => digestCfg.get(gid),
                fetchFeed: async () => {
                  const r = await fetch(env.patchNotesFeedUrl, { signal: AbortSignal.timeout(10_000), headers: { "cache-control": "no-cache" } });
                  if (!r.ok) throw new Error(`feed HTTP ${r.status}`);
                  return r.text();
                },
                postedIds: () => patchRepo.postedIds(),
                claim: (id, gid) => patchRepo.claim(id, gid),
                confirm: (id, m) => patchRepo.confirm(id, m),
                release: (id) => patchRepo.release(id),
                send: async (channelId, e, roleId) => {
                  const ch = await c.channels.fetch(channelId).catch(() => null);
                  if (!ch || !ch.isTextBased() || ch.isDMBased()) {
                    throw new Error(`patch notes channel ${channelId} is missing or not sendable`);
                  }
                  const msg = await ch.send({
                    content: roleId ? `<@&${roleId}>` : undefined,
                    embeds: [new EmbedBuilder().setTitle(e.title).setURL(e.url).setDescription(e.description).setFooter({ text: e.footer }).setColor(0xffdb56)],
                    allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
                  });
                  return msg.id;
                },
                log,
              },
              conf.guildId
            ),
          { checkIntervalMs: 300_000 },
          (e) => log.error(e)
        );
        log.info("patch notes job started (5 min poll)");
```

- [ ] **Step 3: Typecheck, test and build**

Run: `npx tsc --noEmit -p tsconfig.json && npm test && npm run build`
Expected: no type errors, all tests pass, the build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(patch-notes): run the patch notes poller every 5 minutes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A8VmYWMJufLy3TU9GmhsMh"
```

---

## Rollout

### Task 9: Ship the website (zero patches)

- [ ] **Step 1: Final checks on the branch**

Run, in `D:\Projects\collapsedstargames-website`:

```bash
npm run test:unit && npm run test:patch-notes && npm run build
```

Expected: all PASS. The last build is the real one, with zero patches.

- [ ] **Step 2: Merge and push.** This deploys the site; the owner has approved the rollout by approving this plan.

```bash
git checkout main && git merge --no-ff feat/patch-notes -m "Merge feat/patch-notes: patch notes pages, feed, gather tooling" && git push origin main
```

- [ ] **Step 3: Verify production** once Cloudflare finishes (about 90 seconds; retry for up to 5 minutes)

```bash
curl -s https://collapsedstargames.com/nopas/patch-notes/feed.json
curl -s https://collapsedstargames.com/nopas/patch-notes/ | grep -c "No patches yet. The pants are still in the wash."
curl -s https://collapsedstargames.com/ | grep -c 'href="/nopas/patch-notes/"'
```

Expected:
- The first command prints `{"patches": []}`, possibly with whitespace.
- The second prints `1`.
- The third prints `2` or more (desktop and mobile nav).

### Task 10: Ship the bot, configure, smoke test

- [ ] **Step 1: Merge and push the bot.** This deploys the bot.

```bash
cd /d/Projects/collapsedstargames-bot && git checkout master && git merge --no-ff feat/patch-notes -m "Merge feat/patch-notes: post website patch notes to Discord" && git push origin master
```

- [ ] **Step 2: Set the channel.** This is a direct SQL edit, which the config cache picks up within 30 seconds. Use a scratch script in the scratchpad and delete it after.

```js
// set-patch-channel.mjs — run from the bot repo root with: node <path>/set-patch-channel.mjs
import fs from "node:fs"; import pg from "pg";
const env = Object.fromEntries(fs.readFileSync("discord-bot.env","utf8").split(/\r?\n/).filter(l=>l.includes(":")).map(l=>{const i=l.indexOf(":");return [l.slice(0,i).trim(), l.slice(i+1).trim()]}));
const u = new URL(env.DATABASE_URL); u.searchParams.delete("sslmode");
const c = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: true } }); await c.connect();
const r = await c.query(`UPDATE guild_config SET data = data || '{"patchNotesChannelId":"1558224477131907165"}'::jsonb WHERE guild_id='1512237266800742570' RETURNING data->'patchNotesChannelId' AS ch`);
console.log(r.rows[0]); await c.end();
```

Expected: `{ ch: '1558224477131907165' }`.

- [ ] **Step 3: Verify the deployed bot**

Wait for Railway to deploy (about 2 minutes). Then run a read-only query confirming migration 010 is applied and the table is empty:

```sql
SELECT name FROM schema_migrations WHERE name='010_patch_notes_posted.sql';  -- 1 row
SELECT count(*) FROM patch_notes_posted;                                      -- 0
```

Nothing has appeared in #patch-notes, and no patch-notes error has reached #admin.

- [ ] **Step 4: Smoke test to #admin.** Run the real embed code; nothing is written to the DB. Create `smoke-patch-notes.ts` in the scratchpad and run it with `npx tsx` from the bot repo root:

```ts
import fs from "node:fs";
import { buildPatchEmbed } from "./src/patchNotes/embed.js";
const token = fs.readFileSync("discord-bot.env", "utf8").match(/^DISCORD_BOT_TOKEN\s*:\s*(\S+)/m)![1];
const e = buildPatchEmbed({
  id: "smoke", version: "Beta 1.1", title: "The Pants Strike Back (SMOKE TEST)", date: "2026-10-10",
  summary: "This is a preview of how patch notes will look in #patch-notes. Not a real patch.",
  url: "https://collapsedstargames.com/nopas/patch-notes/",
  markdown: "## 🆕 New\n- **Bumper Saucers got a jukebox.** It only plays one song. We're working on it.\n\n## 🔧 Changes\n- **The Needle Eye rifle hits a little harder.** Snipers, rejoice quietly.\n\n## 🐛 Fixes\n- **The Commander no longer gets stuck on Final Stand cannons.** He was hugging them. We don't know why either.",
});
const r = await fetch("https://discord.com/api/v10/channels/1528829084552134848/messages", {
  method: "POST",
  headers: { Authorization: `Bot ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ embeds: [{ title: e.title, url: e.url, description: e.description, footer: { text: e.footer }, color: 0xffdb56 }], allowed_mentions: { parse: [] } }),
});
console.log(r.status);
```

Expected: `200`, and the embed appears in #admin. Ask the owner to check the look. Delete the scratch file afterwards. If the owner wants changes, adjust `embed.ts` (with tests) and repeat Steps 1 and 4.

- [ ] **Step 5: Hand-off.** The pipeline is live and idle. The first real patch is the first owner publish after `2026-10-10T01:00:00Z`; follow `docs/patch-notes-style.md`.
