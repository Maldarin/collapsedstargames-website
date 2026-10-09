/*
 * End-to-end check for /nopas/patch-notes/ — builds the site twice against fixture patches
 * (scripts/fixtures/patch-notes/{published,empty}) and drives the built pages in a browser.
 *
 * Usage:  node scripts/e2e-patch-notes.mjs      (Requires: npx playwright install chromium)
 * Leaves dist/ holding the EMPTY-fixture build; run `npm run build` afterwards if you need a real
 * local dist. Production deploys build from git on Cloudflare, so this never affects the live site.
 */
import { createServer } from "node:http";
import { readFile, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const SITE_PORT = 8793;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const site = createServer(async (req, res) => {
  let p = new URL(req.url, "http://x").pathname;
  if (p.endsWith("/")) p += "index.html";
  try {
    const buf = await readFile(join("dist", decodeURIComponent(p)));
    res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => site.listen(SITE_PORT, r));
const base = `http://127.0.0.1:${SITE_PORT}`;
const local = (url) => url.replace("https://collapsedstargames.com", base);

const fails = [];
const check = (label, cond) => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) fails.push(label); };
// Astro's content cache keeps stale entries when the collection directory has no .md files, so a
// fixture build followed by an empty build would still show the fixtures. Clear it every time.
const build = async (dir) => {
  await rm("node_modules/.astro/data-store.json", { force: true });
  execSync("npm run build", { stdio: "ignore", env: { ...process.env, PATCH_NOTES_DIR: dir } });
};

const browser = await chromium.launch();
const page = await browser.newPage();

console.log("== build: published fixtures ==");
await build("./scripts/fixtures/patch-notes/published");

console.log("== list page ==");
await page.goto(`${base}/nopas/patch-notes/`);
check("hero says PATCH NOTES", ((await page.textContent("h1")) ?? "").includes("PATCH NOTES"));
check("featured patch is the newest", ((await page.textContent(".patch-feature")) ?? "").includes("Beta Fixture Pants"));
check("older patch listed", ((await page.textContent(".patch-older")) ?? "").includes("Alpha Fixture Pants"));
check("draft absent from list", !(await page.content()).includes("Draft Fixture Pants"));
check("nav links to patch notes", (await page.locator('nav a[href="/nopas/patch-notes/"]').count()) >= 1);

console.log("== detail page ==");
await page.goto(`${base}/nopas/patch-notes/2026-10-12-beta-fixture/`);
check("detail title", ((await page.textContent("h1")) ?? "").includes("Beta Fixture Pants"));
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
  check(`feed url resolves: ${p.id}`, ((await page.textContent("h1")) ?? "").includes(p.title));
}

console.log("== /nopas/ teaser ==");
await page.goto(`${base}/nopas/`);
check("teaser shows latest patch", (await page.locator(".patch-teaser").count()) === 1 && ((await page.textContent(".patch-teaser")) ?? "").includes("Beta Fixture Pants"));

console.log("== build: empty ==");
await build("./scripts/fixtures/patch-notes/empty");
await page.goto(`${base}/nopas/patch-notes/`);
check("empty state", (await page.content()).includes("No patches yet. The pants are still in the wash."));
check("empty feed", JSON.parse(await readFile("dist/nopas/patch-notes/feed.json", "utf8")).patches.length === 0);
await page.goto(`${base}/nopas/`);
check("no teaser when empty", (await page.locator(".patch-teaser").count()) === 0);

await browser.close();
site.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASS");
process.exit(fails.length ? 1 : 0);
