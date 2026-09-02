/*
 * End-to-end check for the /nopas/ Gameplay section — click-to-play YouTube facades.
 *
 * The facade contract: NOTHING loads from YouTube until a card is clicked (page speed is the whole
 * point of the pattern), thumbnails come from i.ytimg.com, and a click swaps the facade for a
 * youtube-nocookie.com embed. All external hosts are STUBBED so the check is hermetic; assertions
 * are on the DOM and on which requests the page attempted.
 *
 * Usage:
 *   npm run build
 *   node scripts/e2e-videos.mjs
 *
 * Requires a browser: npx playwright install chromium
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const SITE_PORT = 8793;

const VIDEOS = [
  { id: "kSqdf0DlD8s", title: "Commander Depantsing" },
  { id: "-fuITOqPR1Q", title: "The Commander Attacks" },
  { id: "CQkpU3rfi1E", title: "Defender Gets Ballooninated" },
];

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".svg": "image/svg+xml" };
const site = createServer(async (req, res) => {
  let p = new URL(req.url, "http://x").pathname;
  if (p.endsWith("/")) p += "index.html";
  try {
    const buf = await readFile(join("dist", p));
    res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise(r => site.listen(SITE_PORT, r));

const browser = await chromium.launch();
const page = await browser.newPage();
const fails = [];
const check = (label, cond) => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) fails.push(label); };

// Hermetic stubs + request log. A 1x1 GIF keeps <img onerror> fallbacks from firing.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
const requested = [];
await page.route(/i\.ytimg\.com/, r => { requested.push(r.request().url()); r.fulfill({ contentType: "image/gif", body: PIXEL }); });
await page.route(/youtube(-nocookie)?\.com/, r => { requested.push(r.request().url()); r.fulfill({ contentType: "text/html", body: "stub" }); });

await page.goto(`http://127.0.0.1:${SITE_PORT}/nopas/`);

console.log("== facades render ==");
for (const v of VIDEOS) {
  check(`card for "${v.title}"`, await page.locator(`[data-video-id="${v.id}"]`).count() === 1);
  const thumb = await page.locator(`[data-video-id="${v.id}"] img`).getAttribute("src").catch(() => null);
  check(`  thumbnail from i.ytimg.com/vi/${v.id}`, (thumb ?? "").includes(`i.ytimg.com/vi/${v.id}/`));
}

console.log("== nothing loads from YouTube before a click ==");
check("no iframes on initial load", await page.locator("iframe").count() === 0);
check("no requests to youtube domains yet", !requested.some(u => u.includes("youtube")));

console.log("== click-to-play ==");
const first = VIDEOS[0];
await page.locator(`[data-video-id="${first.id}"]`).click({ timeout: 3000 }).catch(() => {});
await page.waitForSelector("iframe", { timeout: 3000 }).catch(() => {});
const src = await page.locator("iframe").first().getAttribute("src").catch(() => null) ?? "";
check("clicked card swaps in an embed iframe", await page.locator("iframe").count() === 1);
check("embed uses youtube-nocookie.com", src.includes(`youtube-nocookie.com/embed/${first.id}`));
check("embed autoplays (facade already took the click)", src.includes("autoplay=1"));
check("iframe is titled for screen readers", ((await page.locator("iframe").first().getAttribute("title").catch(() => null)) ?? "").length > 0);
check("other cards stay facades", await page.locator(`[data-video-id="${VIDEOS[1].id}"]`).count() === 1);

await browser.close(); site.close();
console.log(fails.length ? `\nFAILED: ${fails.join(" | ")}` : "\nALL PASS");
process.exit(fails.length ? 1 : 0);
