/*
 * End-to-end check for /nopas/stats/ — drives the built page in a real browser.
 *
 * The page is ~150 lines of hand-written DOM code that no unit test covers, and its failure mode
 * is a blank panel rather than an exception, so it needs to actually be driven.
 *
 * The API is STUBBED here on purpose. The real endpoints have their own vitest coverage in
 * collapsedstargames-bot; the seam this exercises is the client JS: rendering, the metric tabs,
 * the 404 path, and the offline fallback.
 *
 * Usage:
 *   PUBLIC_STATS_API="http://127.0.0.1:8791" npm run build
 *   node scripts/e2e-stats.mjs
 *
 * Requires a browser: npx playwright install chromium
 * Remember to rebuild WITHOUT PUBLIC_STATS_API afterwards, or dist/ points at localhost.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const API_PORT = 8791, SITE_PORT = 8792;
let apiUp = true;

// Stub API. The real endpoints have 11 vitest tests; this seam exists to exercise the CLIENT js.
const api = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const send = (code, body) => {
    res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(body));
  };
  if (!apiUp) { res.destroy(); return; }
  if (u.pathname === "/nmpa/public/leaderboard") {
    return send(200, { metric: u.searchParams.get("metric") ?? "xp", rows: [
      { robloxUserId: 23374549, username: "Maldarin", value: 29600 },
      { robloxUserId: 2, username: null, value: 12000 },
    ]});
  }
  if (u.pathname === "/nmpa/public/player") {
    const name = (u.searchParams.get("name") ?? "").toLowerCase();
    if (name !== "maldarin") return send(404, { error: "not found" });
    return send(200, { robloxUserId: 23374549, username: "Maldarin", stats: {
      matchesPlayed: 37, wins: 20, losses: 17, kills: 148, npcKills: 812, deaths: 96,
      pantsStolen: 4, pantsLost: 61, objectivesCapped: 22, xpEarned: 29600, coinsEarned: 2450,
      playtimeSeconds: 26640,
      mainClass: { classId: "Overlord", matches: 14, wins: 8 },
      xpBySource: [
        { source: "_challenge_weekly_mothership_kill", xp: 5120 },
        { source: "mothershipDestroyed", xp: 4633 },
        { source: "npcDefeated", xp: 3097 },
        { source: "_challenge_daily_play_match", xp: 667 },
      ],
      lastPlayed: "2026-08-05T23:28:33.000Z" }});
  }
  send(404, { error: "not found" });
});

const TYPES = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".png":"image/png", ".webp":"image/webp", ".ico":"image/x-icon", ".svg":"image/svg+xml" };
const site = createServer(async (req, res) => {
  let p = new URL(req.url, "http://x").pathname;
  if (p.endsWith("/")) p += "index.html";
  try {
    const buf = await readFile(join("dist", p));
    res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("nf"); }
});

await new Promise(r => api.listen(API_PORT, r));
await new Promise(r => site.listen(SITE_PORT, r));

const browser = await chromium.launch();
const page = await browser.newPage();
const fails = [];
const check = (label, cond) => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) fails.push(label); };

await page.goto(`http://127.0.0.1:${SITE_PORT}/nopas/stats/`);

console.log("== leaderboard ==");
await page.waitForSelector("#board li", { timeout: 5000 }).catch(() => {});
const boardText = await page.locator("#board").innerText();
check("renders top row", boardText.includes("Maldarin"));
check("formats value with separators", boardText.includes("29,600"));
check("nameless row falls back to id, not 'null'", boardText.includes("Roblox 2") && !boardText.includes("null"));

console.log("== metric tabs ==");
await page.getByRole("tab", { name: "Pants Stolen" }).click();
await page.waitForTimeout(300);
check("tab switches aria-selected", await page.getByRole("tab", { name: "Pants Stolen" }).getAttribute("aria-selected") === "true");
check("previous tab deselected", await page.getByRole("tab", { name: "XP Earned" }).getAttribute("aria-selected") === "false");

console.log("== player lookup ==");
await page.fill("#lookup-name", "MALDARIN");
await page.click("button[type=submit]");
await page.waitForSelector("#lookup-result h3", { timeout: 5000 }).catch(() => {});
const r = await page.locator("#lookup-result").innerText();
check("shows the player", r.includes("Maldarin"));
check("shows pants lost (the comedy stat)", r.includes("Pants lost") && r.includes("61"));
check("computes K/D", r.includes("1.54"));
check("shows win rate", r.includes("54%"));

console.log("== P1 card fields ==");
check("renders playtime as a duration", r.includes("7h 24m"));
check("renders main class with its record", r.includes("Overlord") && r.includes("57%"));
check("prettifies ledger keys instead of showing raw camelCase", r.includes("Mothership destroyed"));
check("groups challenge payouts into one bucket", r.includes("Challenges") && r.includes("5,787"));
check("does not rank challenge keys inline", !r.includes("_challenge_"));

console.log("== playtime board ==");
await page.getByRole("tab", { name: "Playtime" }).click();
await page.waitForTimeout(300);
check("board formats seconds as a duration", (await page.locator("#board").innerText()).includes("8h 13m"));

console.log("== unknown player ==");
await page.fill("#lookup-name", "nobody-here");
await page.click("button[type=submit]");
await page.waitForTimeout(400);
check("404 gets a specific message", (await page.locator("#lookup-result").innerText()).includes("No player found"));

console.log("== API offline ==");
apiUp = false;
await page.getByRole("tab", { name: "Matches Won" }).click();
await page.waitForTimeout(600);
check("degrades to a friendly notice", (await page.locator("#board").innerText()).includes("aren't live yet"));

await browser.close(); api.close(); site.close();
console.log(fails.length ? `\nFAILED: ${fails.join(" | ")}` : "\nALL PASS");
process.exit(fails.length ? 1 : 0);
