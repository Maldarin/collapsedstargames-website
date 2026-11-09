/*
 * End-to-end check for /nopas/stats/ — drives the built page in a real browser.
 *
 * The page is a few hundred lines of hand-written DOM code that no unit test covers, and its
 * failure mode is a blank panel rather than an exception, so it needs to actually be driven.
 *
 * The API is STUBBED here on purpose. The real endpoints have their own vitest coverage in
 * collapsedstargames-bot; the seam this exercises is the client JS. Pants Rush stubs are shaped
 * exactly like the "Public reads" section of collapsedstargames-bot/docs/nmpa-rush-contract.md.
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
// Knobs the cases below flip. `rushBoard` is "rows" | "empty" | "error".
const stub = { summary: "full", rushBoard: "rows" };
const rushBoardQueries = [];

const XSS_NAME = '<img src=x onerror="window.__pwned=1">';

const invasionPlayer = { robloxUserId: 23374549, username: "Maldarin", stats: {
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
  lastPlayed: "2026-08-05T23:28:33.000Z" } };

const rushPlayer = (username) => ({ robloxUserId: 23374549, username, stats: {
  runs: 5, attempts: 12, clears: 9,
  medals: { Gold: 3, Silver: 2, Bronze: 1 },
  pants: 160, defenderKOs: 1230, bossKOs: 9, deaths: 4,
  highestStage: 4, fullClears: 1,
  playtimeSeconds: 2710,
  lastPlayed: "2026-11-08T19:04:00.000Z",
  bestTimes: [
    { stageIndex: 1, stageId: "HighSchool", difficulty: "Normal", party: "solo", seconds: 89.25, medal: "Gold" },
    { stageIndex: 1, stageId: "HighSchool", difficulty: "Hard", party: "coop", seconds: 131.5, medal: "Bronze" },
    { stageIndex: 4, stageId: "GasAndGo", difficulty: "Easy", party: "solo", seconds: 59.996, medal: "Silver" },
    { stageIndex: 5, stageId: "MallMadness", difficulty: "Normal", party: "solo", seconds: 3725.4, medal: null },
  ],
} });

// Player stubs by lowercased name: [rush response, invasion response]; a number is a status.
const PLAYERS = {
  maldarin: [rushPlayer("Maldarin"), invasionPlayer],
  rushonly: [rushPlayer("RushOnly"), 404],
  invonly: [404, { ...invasionPlayer, username: "InvOnly" }],
  rushbroken: [500, { ...invasionPlayer, username: "RushBroken" }],
  bothbroken: [503, 500],
  xss: [rushPlayer(XSS_NAME), 404],
};

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
  if (u.pathname === "/nmpa/public/rush/summary") {
    if (stub.summary === "error") return send(500, { error: "boom" });
    if (stub.summary === "zero") return send(200, { totals: { runs: 0, attempts: 0, clears: 0, players: 0 }, stages: [] });
    return send(200, {
      totals: { runs: 1041, attempts: 2097, clears: 1563, players: 30 },
      stages: [
        { stageIndex: 1, stageId: "HighSchool", attempts: 40, clears: 31 },
        { stageIndex: 5, stageId: "MallMadness", attempts: 3, clears: 1 },
      ],
    });
  }
  if (u.pathname === "/nmpa/public/rush/leaderboard") {
    const q = { stage: u.searchParams.get("stage"), difficulty: u.searchParams.get("difficulty"), party: u.searchParams.get("party"), limit: u.searchParams.get("limit") };
    rushBoardQueries.push(q);
    if (stub.rushBoard === "error") return send(502, { error: "bad gateway" });
    const full = q.stage === "full";
    const rows = stub.rushBoard === "empty" ? [] : [
      { robloxUserId: 23374549, username: "Maldarin", seconds: full ? 812.4 : 89.25, medal: full ? null : "Gold", endedAt: "2026-11-08T19:04:00.000Z" },
      { robloxUserId: 7, username: null, seconds: full ? 905 : 95.5, medal: full ? null : "Silver", endedAt: "2026-11-08T19:05:00.000Z" },
      { robloxUserId: 8, username: "Third", seconds: 101, medal: full ? null : "Bronze", endedAt: "2026-11-08T19:06:00.000Z" },
    ];
    return send(200, { stage: q.stage, difficulty: q.difficulty, party: q.party, rows });
  }
  const pick = (i) => {
    const entry = PLAYERS[(u.searchParams.get("name") ?? "").toLowerCase()];
    const r = entry ? entry[i] : 404;
    return typeof r === "number" ? send(r, { error: "x" }) : send(200, r);
  };
  if (u.pathname === "/nmpa/public/rush/player") return pick(0);
  if (u.pathname === "/nmpa/public/player") return pick(1);
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
const pageErrors = [];
page.on("pageerror", e => pageErrors.push(e.message));
const fails = [];
const check = (label, cond) => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) fails.push(label); };
const URL_ = `http://127.0.0.1:${SITE_PORT}/nopas/stats/`;
const text = (sel) => page.locator(sel).innerText();
const waitText = (sel, s) => page.waitForFunction(([q, t]) => (document.querySelector(q)?.textContent ?? "").includes(t), [sel, s], { timeout: 5000 }).catch(() => {});
const lastQuery = () => rushBoardQueries[rushBoardQueries.length - 1] ?? {};
const rushTab = (name) => page.locator("#rush-stage-tabs").getByRole("tab", { name, exact: true });
const lookup = async (name) => {
  await page.fill("#lookup-name", name);
  await page.click("#lookup-form button[type=submit]");
  await page.waitForFunction(() => !document.querySelector("#lookup-result").textContent.includes("Searching"), null, { timeout: 5000 }).catch(() => {});
};

await page.goto(URL_);

console.log("== page order ==");
const order = await page.locator(".stats-panels h2").allInnerTexts();
check("Pants Rush leads, then lookup, then Invasion", order.join("|") === "Pants Rush|Look up a player|NOPAS: Invasion");

console.log("== rush summary ==");
await waitText("#rush-summary", "1,041");
check("summary strip visible with totals", await page.locator("#rush-summary").isVisible() && (await text("#rush-summary")).includes("1,041") && (await text("#rush-summary")).includes("1,563"));
check("summary shows players", (await text("#rush-summary")).includes("30"));

console.log("== rush board defaults ==");
await page.waitForSelector("#rush-board li", { timeout: 5000 }).catch(() => {});
const q0 = rushBoardQueries[0] ?? {};
check("first board request is stage=1 / Normal / solo", q0.stage === "1" && q0.difficulty === "Normal" && q0.party === "solo" && q0.limit === "10");
const rb = await text("#rush-board");
check("renders rows with rank and name", rb.includes("#1") && rb.includes("Maldarin"));
check("formats seconds as m:ss.cc", rb.includes("1:29.25") && rb.includes("1:35.50") && rb.includes("1:41.00"));
check("shows medals", /gold/i.test(rb) && /silver/i.test(rb) && /bronze/i.test(rb));
check("nameless row falls back to id, not 'null'", rb.includes("Roblox 7") && !rb.includes("null"));
check("Normal and Solo start pressed", await page.locator('[data-difficulty="Normal"]').getAttribute("aria-pressed") === "true" && await page.locator('[data-party="solo"]').getAttribute("aria-pressed") === "true");
check("first phase tab selected", await rushTab("High School").getAttribute("aria-selected") === "true");

console.log("== future stage from summary ==");
const tabNames = await page.locator("#rush-stage-tabs [role=tab]").allInnerTexts();
check("unknown stage gets a tab under its raw id, before Full Run", tabNames.map(s => s.trim()).join("|") === "High School|Garage Alley|Playground Plaza|Gas & Go|MallMadness|Full Run");

console.log("== rush controls ==");
await page.locator('[data-difficulty="Hard"]').click();
await waitText("#rush-board", "Maldarin");
check("difficulty toggle requests Hard", lastQuery().difficulty === "Hard" && lastQuery().stage === "1");
check("difficulty aria-pressed moves", await page.locator('[data-difficulty="Hard"]').getAttribute("aria-pressed") === "true" && await page.locator('[data-difficulty="Normal"]').getAttribute("aria-pressed") === "false");
await page.locator('[data-party="coop"]').click();
await waitText("#rush-board", "Maldarin");
check("party toggle requests coop, keeps difficulty", lastQuery().party === "coop" && lastQuery().difficulty === "Hard");
await rushTab("Gas & Go").click();
await waitText("#rush-board", "Maldarin");
check("phase tab requests its stageIndex", lastQuery().stage === "4" && lastQuery().party === "coop");
check("tabpanel labelled by the selected tab", await page.locator("#rush-board").getAttribute("aria-labelledby") === "rush-stage-4");
await rushTab("Full Run").click();
await page.waitForFunction(() => document.querySelector("#rush-board").textContent.includes("13:32.40"), null, { timeout: 5000 }).catch(() => {});
const fb = await text("#rush-board");
check("Full Run requests stage=full", lastQuery().stage === "full");
check("Full Run formats long times", fb.includes("13:32.40") && fb.includes("15:05.00"));
check("Full Run shows no medals", !/gold|silver|bronze/i.test(fb) && await page.locator("#rush-board .medal-badge").count() === 0);
await rushTab("Full Run").focus();
await page.keyboard.press("ArrowLeft");
await waitText("#rush-board", "Maldarin");
check("ArrowLeft moves to the previous phase tab", await rushTab("MallMadness").getAttribute("aria-selected") === "true" && lastQuery().stage === "5");
check("roving tabindex leaves one tab stop", await page.locator('#rush-stage-tabs [role=tab][tabindex="0"]').count() === 1);

console.log("== rush board empty / error ==");
stub.rushBoard = "empty";
await page.locator('[data-difficulty="Easy"]').click();
await waitText("#rush-board", "No clears");
check("empty board says so", (await text("#rush-board")).includes("No clears on this board yet."));
stub.rushBoard = "error";
await page.locator('[data-party="solo"]').click();
await waitText("#rush-board", "breather");
check("5xx board degrades to the offline notice", (await text("#rush-board")).includes("taking a breather"));
stub.rushBoard = "rows";

console.log("== player lookup: both modes ==");
await lookup("MALDARIN");
const r = await text("#lookup-result");
check("shows the player once", r.includes("Maldarin") && (await page.locator("#lookup-result h3").count()) === 1);
check("Pants Rush card comes first", r.indexOf("Pants Rush") > -1 && r.indexOf("Pants Rush") < r.indexOf("NOPAS: Invasion"));
check("rush clears / attempts", r.includes("Clears / attempts") && r.includes("9 / 12"));
check("rush runs, full clears, highest phase", r.includes("5 runs") && r.includes("Full clears") && /Highest phase\s+Gas & Go/.test(r));
check("rush medals", r.includes("3 gold · 2 silver · 1 bronze"));
check("per-attempt counters sit under a team-totals subhead", /Team totals across their runs\s+Pants banked\s+160\s+Defenders KO'd\s+1,230\s+Bosses depantsed\s+9\s+Team deaths\s+4/i.test(r));
check("team counters aren't labelled as personal stats", !/Pants stolen\s+160/.test(r) && !/(^|\n)Deaths\s+4/.test(r));
check("rush playtime + last played", r.includes("45m") && r.includes("Last played 2026-11-08"));
const bestRows = await page.locator(".rush-best tbody tr").allInnerTexts();
check("best-times table has one row per entry", bestRows.length === 4);
check("best time row: phase, board, time, medal", /High School\s+Normal · Solo\s+1:29\.25\s*Gold/i.test(bestRows[0] ?? ""));
check("co-op party label", /Hard · Co-op/.test(bestRows[1] ?? ""));
check("59.996s rounds to 1:00.00, not 0:60.00", (bestRows[2] ?? "").includes("1:00.00"));
check("unknown stage id falls back to raw id; hour-long time", /MallMadness/.test(bestRows[3] ?? "") && (bestRows[3] ?? "").includes("1:02:05.40"));
check("invasion card still renders", r.includes("Pants lost") && r.includes("61") && r.includes("1.54") && r.includes("54%"));
check("invasion playtime + main class", r.includes("7h 24m") && r.includes("Overlord") && r.includes("57%"));
check("invasion XP breakdown", r.includes("Mothership destroyed") && r.includes("Challenges") && r.includes("5,787") && !r.includes("_challenge_"));

console.log("== player lookup: one mode missing ==");
await lookup("rushonly");
let t = await text("#lookup-result");
check("invasion 404 only: rush card + 'no Invasion stats yet'", t.includes("RushOnly") && t.includes("9 / 12") && t.includes("No NOPAS: Invasion stats yet.") && !t.includes("No player found"));
await lookup("invonly");
t = await text("#lookup-result");
check("rush 404 only: 'no Pants Rush stats yet' + invasion card", t.includes("InvOnly") && t.includes("No Pants Rush stats yet.") && t.includes("Pants lost") && !t.includes("No player found"));

console.log("== player lookup: failures ==");
await lookup("rushbroken");
t = await text("#lookup-result");
check("rush 5xx does not hide the invasion result", t.includes("RushBroken") && t.includes("Pants lost") && t.includes("taking a breather"));
await lookup("bothbroken");
t = await text("#lookup-result");
check("both modes failing shows the offline notice alone", t.trim() === "Stats are taking a breather. Try again in a minute.");
await lookup("nobody-here");
check("both 404 says no player found", (await text("#lookup-result")).includes("No player found"));

console.log("== usernames are text ==");
await lookup("xss");
check("markup in a username renders as text", (await page.locator("#lookup-result h3").innerText()) === XSS_NAME && await page.locator("#lookup-result img").count() === 0 && !(await page.evaluate(() => window.__pwned)));

console.log("== invasion leaderboards (unchanged) ==");
await page.waitForSelector("#board li", { timeout: 5000 }).catch(() => {});
const boardText = await text("#board");
check("renders top row", boardText.includes("Maldarin"));
check("formats value with separators", boardText.includes("29,600"));
check("nameless row falls back to id, not 'null'", boardText.includes("Roblox 2") && !boardText.includes("null"));
await page.getByRole("tab", { name: "Pants Stolen" }).click();
await page.waitForTimeout(300);
check("tab switches aria-selected", await page.getByRole("tab", { name: "Pants Stolen" }).getAttribute("aria-selected") === "true");
check("previous tab deselected", await page.getByRole("tab", { name: "XP Earned" }).getAttribute("aria-selected") === "false");
check("invasion tabs don't touch the rush board", await rushTab("MallMadness").getAttribute("aria-selected") === "true");
await page.getByRole("tab", { name: "Playtime" }).click();
await page.waitForTimeout(300);
check("board formats seconds as a duration", (await text("#board")).includes("8h 13m"));

console.log("== phone width ==");
await page.setViewportSize({ width: 320, height: 800 });
await lookup("maldarin");
await rushTab("High School").click();
await waitText("#rush-board", "Maldarin");
check("no horizontal scroll at 320px with board + both cards", !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
await page.setViewportSize({ width: 1280, height: 900 });

console.log("== summary hidden when zero / unavailable ==");
stub.summary = "zero";
await page.reload();
await page.waitForSelector("#rush-board li", { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(300);
check("all-zero summary stays hidden", !(await page.locator("#rush-summary").isVisible()));
check("no future tab without summary stages", (await page.locator("#rush-stage-tabs [role=tab]").count()) === 5);
stub.summary = "error";
await page.reload();
await page.waitForSelector("#rush-board li", { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(300);
check("failed summary stays hidden, board still loads", !(await page.locator("#rush-summary").isVisible()) && (await text("#rush-board")).includes("Maldarin"));

console.log("== API offline ==");
apiUp = false;
await page.getByRole("tab", { name: "Matches Won" }).click();
await rushTab("Garage Alley").click();
await page.waitForTimeout(600);
check("invasion board degrades to a friendly notice", (await text("#board")).includes("taking a breather"));
check("rush board degrades to a friendly notice", (await text("#rush-board")).includes("taking a breather"));
await lookup("maldarin");
check("lookup degrades to a friendly notice", (await text("#lookup-result")).includes("taking a breather"));

check("no uncaught page errors", pageErrors.length === 0);
if (pageErrors.length) console.log(pageErrors);

await browser.close(); api.close(); site.close();
console.log(fails.length ? `\nFAILED: ${fails.join(" | ")}` : "\nALL PASS");
process.exit(fails.length ? 1 : 0);
