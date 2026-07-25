# Daily Mod Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a day, post a "🗒️ Daily digest (last 24h)" card (backlog activity, mod actions, membership) to a staff channel, restart-safe via a persisted 24h gate.

**Architecture:** New aggregate queries on existing repos → a pure card builder + a pure due-check → a testable `runDigestTick` orchestrator (gate → gather → post → save timestamp) → a thin `setInterval` scheduler + `index.ts` wiring. Injectable-seam: discord.js only in `index.ts`. No new table, no migration.

**Tech Stack:** TypeScript (ESM, `.js` specifiers), discord.js v14, pg / pg-mem, vitest, tsc.

**Repo:** `collapsedstargames-bot`.

## Global Constraints

- ESM: every relative import uses a `.js` specifier, even from `.ts`.
- Injectable-seam pattern: pure logic returns plain data; discord.js is imported only in `index.ts`.
- TDD: failing test → watch it fail → minimal code → watch it pass → commit.
- vitest does NOT typecheck — after the suite is green, also run `npm run build` (tsc).
- SQL must be pg-mem-safe: `SUM(CASE WHEN … THEN 1 ELSE 0 END)` / `COUNT(*)` with a `created_at >= $sinceIso` predicate; NO interval arithmetic, NO aggregate `FILTER`. Repo tests run on pg-mem via `freshPool()`.
- Config persists as a JSON `data` blob, so new `GuildConfig` fields are additive — no SQL migration.
- Backlog stats count reports of ALL sources (unlike the leaderboard) — no source filter; only `deleted_at IS NULL`.

---

### Task 1: Config fields (`digestChannelId`, `lastDigestAt`)

**Files:**
- Modify: `src/config/guildConfig.ts`
- Test: `tests/config/guildConfig.test.ts`

**Interfaces:**
- Produces: `GuildConfig.digestChannelId: string | null`, `GuildConfig.lastDigestAt: string | null`, both defaulting to `null`.

- [ ] **Step 1: Write the failing test**

Append to `tests/config/guildConfig.test.ts`:

```ts
describe("guildConfig digest fields", () => {
  it("defaults the digest fields to null", () => {
    const c = DEFAULT_CONFIG("g1");
    expect(c.digestChannelId).toBeNull();
    expect(c.lastDigestAt).toBeNull();
  });

  it("mergeConfig can set lastDigestAt", () => {
    const merged = mergeConfig(DEFAULT_CONFIG("g1"), { lastDigestAt: "2026-07-25T00:00:00.000Z" });
    expect(merged.lastDigestAt).toBe("2026-07-25T00:00:00.000Z");
    expect(merged.digestChannelId).toBeNull();
  });
});
```

(The file already imports `DEFAULT_CONFIG` and `mergeConfig`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/config/guildConfig.test.ts`
Expected: FAIL — `digestChannelId`/`lastDigestAt` not on `GuildConfig`.

- [ ] **Step 3: Add the fields**

In `src/config/guildConfig.ts`, add to the `GuildConfig` interface (after `adminRoleId`):

```ts
  digestChannelId: string | null;
  lastDigestAt: string | null;
```

And to `DEFAULT_CONFIG` (after `adminRoleId: null,`):

```ts
    digestChannelId: null,
    lastDigestAt: null,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/config/guildConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git -C /d/Projects/collapsedstargames-bot add src/config/guildConfig.ts tests/config/guildConfig.test.ts
git -C /d/Projects/collapsedstargames-bot commit -m "feat(digest): add digestChannelId + lastDigestAt config fields"
```

---

### Task 2: Pure logic — `dueForDigest` + `buildDigestCard`

**Files:**
- Create: `src/digest/schedule.ts`, `src/digest/card.ts`
- Test: `tests/digest/schedule.test.ts`, `tests/digest/card.test.ts`

**Interfaces:**
- Produces: `dueForDigest(lastIso: string | null, nowMs: number, periodMs: number): boolean`; `DigestStats` interface and `buildDigestCard(stats: DigestStats): { title: string; lines: string[] }`. Tasks 4 and 5 consume these.

- [ ] **Step 1: Write the failing tests**

Create `tests/digest/schedule.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dueForDigest } from "../../src/digest/schedule.js";

const DAY = 86_400_000;

describe("dueForDigest", () => {
  it("is due when never posted (null)", () => {
    expect(dueForDigest(null, 1_000_000_000, DAY)).toBe(true);
  });
  it("is due exactly at the period boundary", () => {
    const last = new Date(1_000_000_000).toISOString();
    expect(dueForDigest(last, 1_000_000_000 + DAY, DAY)).toBe(true);
  });
  it("is not due within the period", () => {
    const last = new Date(1_000_000_000).toISOString();
    expect(dueForDigest(last, 1_000_000_000 + DAY - 1, DAY)).toBe(false);
  });
  it("treats an unparseable timestamp as due (self-heal)", () => {
    expect(dueForDigest("not-a-date", 1_000_000_000, DAY)).toBe(true);
  });
});
```

Create `tests/digest/card.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildDigestCard } from "../../src/digest/card.js";
import type { DigestStats } from "../../src/digest/card.js";

const base: DigestStats = {
  newReports: 3,
  open: { new: 2, triaged: 1, in_progress: 1 },
  modActions: { warn: 2, mute: 1 },
  memberCount: 1240,
  joins: 7,
};

describe("buildDigestCard", () => {
  it("has the fixed title", () => {
    expect(buildDigestCard(base).title).toBe("🗒️ Daily digest (last 24h)");
  });
  it("renders backlog, mod actions (fixed order, pluralized), and members", () => {
    const { lines } = buildDigestCard(base);
    expect(lines[0]).toBe("**Backlog:** +3 new · 4 open (2 new, 1 triaged, 1 in-progress)");
    expect(lines[1]).toBe("**Mod actions:** 2 warns, 1 mute");
    expect(lines[2]).toBe("**Members:** 1240 (+7 joined)");
  });
  it("shows 'none' when there were no mod actions", () => {
    const { lines } = buildDigestCard({ ...base, modActions: {} });
    expect(lines[1]).toBe("**Mod actions:** none");
  });
  it("orders mod actions warn, kick, ban, mute and skips zeros", () => {
    const { lines } = buildDigestCard({ ...base, modActions: { mute: 1, ban: 2, warn: 3 } });
    expect(lines[1]).toBe("**Mod actions:** 3 warns, 2 bans, 1 mute");
  });
  it("shows n/a when member count is unavailable", () => {
    const { lines } = buildDigestCard({ ...base, memberCount: null });
    expect(lines[2]).toBe("**Members:** n/a (+7 joined)");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/digest/schedule.test.ts tests/digest/card.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

Create `src/digest/schedule.ts`:

```ts
// Pure due-check for the persisted 24h digest gate. A null (never posted) or
// unparseable timestamp is treated as due, so the gate self-heals rather than
// silently never firing.
export function dueForDigest(lastIso: string | null, nowMs: number, periodMs: number): boolean {
  if (lastIso === null) return true;
  const last = Date.parse(lastIso);
  if (Number.isNaN(last)) return true;
  return nowMs - last >= periodMs;
}
```

Create `src/digest/card.ts`:

```ts
export interface DigestStats {
  newReports: number;
  open: { new: number; triaged: number; in_progress: number };
  modActions: Record<string, number>; // action → count in the window
  memberCount: number | null;
  joins: number;
}

const MOD_ACTION_ORDER = ["warn", "kick", "ban", "mute"] as const;

export function buildDigestCard(stats: DigestStats): { title: string; lines: string[] } {
  const o = stats.open;
  const openTotal = o.new + o.triaged + o.in_progress;
  const backlog = `**Backlog:** +${stats.newReports} new · ${openTotal} open (${o.new} new, ${o.triaged} triaged, ${o.in_progress} in-progress)`;

  const actionParts = MOD_ACTION_ORDER.filter((a) => (stats.modActions[a] ?? 0) > 0).map((a) => {
    const n = stats.modActions[a];
    return `${n} ${a}${n === 1 ? "" : "s"}`;
  });
  const modActions = `**Mod actions:** ${actionParts.length ? actionParts.join(", ") : "none"}`;

  const members = `**Members:** ${stats.memberCount === null ? "n/a" : String(stats.memberCount)} (+${stats.joins} joined)`;

  return { title: "🗒️ Daily digest (last 24h)", lines: [backlog, modActions, members] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/digest/schedule.test.ts tests/digest/card.test.ts`
Expected: PASS (4 + 5).

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git -C /d/Projects/collapsedstargames-bot add src/digest/schedule.ts src/digest/card.ts tests/digest/schedule.test.ts tests/digest/card.test.ts
git -C /d/Projects/collapsedstargames-bot commit -m "feat(digest): pure dueForDigest + buildDigestCard + tests"
```

---

### Task 3: Repo aggregate queries

**Files:**
- Modify: `src/db/repositories/reportsRepo.ts`, `src/db/repositories/modLogRepo.ts`
- Test: `tests/db/reportsRepo.test.ts`, `tests/db/repositories.test.ts`

**Interfaces:**
- Produces: `reportsRepo(pool).digestReportStats(guildId, sinceIso): Promise<{ newCount: number; open: { new: number; triaged: number; in_progress: number } }>` and `modLogRepo(pool).countByActionSince(guildId, sinceIso): Promise<Record<string, number>>`. Task 5 composes these into `DigestStats`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/db/reportsRepo.test.ts` (has `freshPool`, `reportsRepo`, `base`):

```ts
describe("reportsRepo.digestReportStats", () => {
  it("counts new-in-window and current open-by-status, excluding deleted, guild-scoped", async () => {
    const pool = await freshPool();
    const repo = reportsRepo(pool);
    const a = (await repo.ingest({ ...base, sourceRef: "a", threadId: "a" }))!;            // recent 'new'
    const b = (await repo.ingest({ ...base, sourceRef: "b", threadId: "b" }))!;
    await repo.setStatus("g1", b, "triaged", "mod");                                        // recent 'triaged'
    const c = (await repo.ingest({ ...base, sourceRef: "c", threadId: "c" }))!;
    await repo.setStatus("g1", c, "in_progress", "mod");                                     // recent 'in_progress'
    const res = (await repo.ingest({ ...base, sourceRef: "res", threadId: "res" }))!;
    await repo.setStatus("g1", res, "resolved", "mod");                                      // recent 'resolved' (not open)
    const old = (await repo.ingest({ ...base, sourceRef: "old", threadId: "old" }))!;        // OLD 'new' (open, not new-in-window)
    await pool.query("UPDATE reports SET created_at = $1 WHERE id = $2", [new Date(Date.now() - 2 * 86_400_000).toISOString(), old]);
    const del = (await repo.ingest({ ...base, sourceRef: "del", threadId: "del" }))!;        // deleted 'new' (excluded)
    await pool.query("UPDATE reports SET deleted_at = now() WHERE id = $1", [del]);

    const sinceIso = new Date(Date.now() - 86_400_000).toISOString();
    const stats = await repo.digestReportStats("g1", sinceIso);
    expect(stats.newCount).toBe(4); // a, b, c, res (recent, not deleted); old too-old; del deleted
    expect(stats.open).toEqual({ new: 2, triaged: 1, in_progress: 1 }); // open.new = a + old
  });

  it("returns zeros for a guild with no reports", async () => {
    const repo = reportsRepo(await freshPool());
    const sinceIso = new Date(Date.now() - 86_400_000).toISOString();
    expect(await repo.digestReportStats("NONE", sinceIso)).toEqual({ newCount: 0, open: { new: 0, triaged: 0, in_progress: 0 } });
  });
});
```

Append to `tests/db/repositories.test.ts` (has `freshPool`, `modLogRepo`):

```ts
describe("modLogRepo.countByActionSince", () => {
  it("groups counts by action within the window, guild-scoped", async () => {
    const pool = await freshPool();
    const repo = modLogRepo(pool);
    await repo.add({ guildId: "g1", targetUserId: "u1", moderatorId: "m", action: "warn" });
    await repo.add({ guildId: "g1", targetUserId: "u2", moderatorId: "m", action: "warn" });
    await repo.add({ guildId: "g1", targetUserId: "u3", moderatorId: "m", action: "kick" });
    await repo.add({ guildId: "g1", targetUserId: "u4", moderatorId: "m", action: "warn" }); // will be aged out
    await pool.query("UPDATE mod_log SET created_at = $1 WHERE target_user_id = 'u4'", [new Date(Date.now() - 2 * 86_400_000).toISOString()]);
    await repo.add({ guildId: "g2", targetUserId: "x", moderatorId: "m", action: "ban" });   // other guild

    const sinceIso = new Date(Date.now() - 86_400_000).toISOString();
    expect(await repo.countByActionSince("g1", sinceIso)).toEqual({ warn: 2, kick: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/db/reportsRepo.test.ts tests/db/repositories.test.ts`
Expected: FAIL — `digestReportStats` / `countByActionSince` not functions.

- [ ] **Step 3: Add the methods**

In `src/db/repositories/reportsRepo.ts`, add to the returned object (after `leaderboardCounts`):

```ts
    async digestReportStats(
      guildId: string,
      sinceIso: string
    ): Promise<{ newCount: number; open: { new: number; triaged: number; in_progress: number } }> {
      // newCount = reports created in the window; open = current counts by status.
      // All sources (whole team backlog), excluding soft-deleted. SUM(CASE …) is
      // pg-mem-safe; `created_at >= $2` matches the existing joinsSince pattern.
      const r = await pool.query(
        `SELECT
           SUM(CASE WHEN created_at >= $2 THEN 1 ELSE 0 END) AS new_count,
           SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS open_new,
           SUM(CASE WHEN status = 'triaged' THEN 1 ELSE 0 END) AS open_triaged,
           SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS open_in_progress
         FROM reports
         WHERE guild_id = $1 AND deleted_at IS NULL`,
        [guildId, sinceIso]
      );
      const row = r.rows[0] ?? {};
      return {
        newCount: Number(row.new_count ?? 0),
        open: {
          new: Number(row.open_new ?? 0),
          triaged: Number(row.open_triaged ?? 0),
          in_progress: Number(row.open_in_progress ?? 0),
        },
      };
    },
```

In `src/db/repositories/modLogRepo.ts`, add to the returned object (after `recent`):

```ts
    async countByActionSince(guildId: string, sinceIso: string): Promise<Record<string, number>> {
      const r = await pool.query(
        "SELECT action, COUNT(*)::int AS n FROM mod_log WHERE guild_id=$1 AND created_at >= $2 GROUP BY action",
        [guildId, sinceIso]
      );
      const out: Record<string, number> = {};
      for (const row of r.rows) out[row.action] = Number(row.n);
      return out;
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/db/reportsRepo.test.ts tests/db/repositories.test.ts`
Expected: PASS (new + all pre-existing).

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git -C /d/Projects/collapsedstargames-bot add src/db/repositories/reportsRepo.ts src/db/repositories/modLogRepo.ts tests/db/reportsRepo.test.ts tests/db/repositories.test.ts
git -C /d/Projects/collapsedstargames-bot commit -m "feat(digest): digestReportStats + countByActionSince queries"
```

---

### Task 4: Orchestration — `runDigestTick`

**Files:**
- Create: `src/digest/tick.ts`
- Test: `tests/digest/tick.test.ts`

**Interfaces:**
- Consumes: `GuildConfig` (Task 1 fields), `DigestStats` + `buildDigestCard` (Task 2, `./card.js`), `dueForDigest` (Task 2, `./schedule.js`).
- Produces: `DigestTickDeps`, `DigestTickResult`, and `runDigestTick(deps, guildId, nowMs): Promise<DigestTickResult>`. Task 5 wires it.

- [ ] **Step 1: Write the failing test**

Create `tests/digest/tick.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runDigestTick } from "../../src/digest/tick.js";
import type { DigestTickDeps } from "../../src/digest/tick.js";
import type { DigestStats } from "../../src/digest/card.js";
import { DEFAULT_CONFIG, type GuildConfig } from "../../src/config/guildConfig.js";

const DAY = 86_400_000;
const NOW = 1_000_000_000_000;
const stats: DigestStats = { newReports: 1, open: { new: 1, triaged: 0, in_progress: 0 }, modActions: {}, memberCount: 10, joins: 0 };

function makeDeps(cfgPatch: Partial<GuildConfig>, over: Partial<DigestTickDeps> = {}) {
  const saved: GuildConfig[] = [];
  const posts: Array<{ channelId: string; card: { title: string; lines: string[] } }> = [];
  const deps: DigestTickDeps = {
    getConfig: async () => ({ ...DEFAULT_CONFIG("g1"), ...cfgPatch }),
    saveConfig: async (c) => { saved.push(c); },
    gatherStats: async () => stats,
    post: async (channelId, card) => { posts.push({ channelId, card }); },
    periodMs: DAY,
    ...over,
  };
  return { deps, saved, posts };
}

describe("runDigestTick", () => {
  it("posts and saves the timestamp when due (never posted)", async () => {
    const { deps, saved, posts } = makeDeps({ digestChannelId: "chan", lastDigestAt: null });
    const r = await runDigestTick(deps, "g1", NOW);
    expect(r).toBe("posted");
    expect(posts).toHaveLength(1);
    expect(posts[0].channelId).toBe("chan");
    expect(saved).toHaveLength(1);
    expect(saved[0].lastDigestAt).toBe(new Date(NOW).toISOString());
  });

  it("skips (no post, no save) when no channel is configured", async () => {
    const { deps, saved, posts } = makeDeps({ digestChannelId: null, lastDigestAt: null });
    expect(await runDigestTick(deps, "g1", NOW)).toBe("skipped-unconfigured");
    expect(posts).toHaveLength(0);
    expect(saved).toHaveLength(0);
  });

  it("skips (no post, no save) when within the 24h window", async () => {
    const recent = new Date(NOW - 1000).toISOString();
    const { deps, saved, posts } = makeDeps({ digestChannelId: "chan", lastDigestAt: recent });
    expect(await runDigestTick(deps, "g1", NOW)).toBe("skipped-not-due");
    expect(posts).toHaveLength(0);
    expect(saved).toHaveLength(0);
  });

  it("does NOT save the timestamp if posting throws (so the next tick retries)", async () => {
    const { deps, saved } = makeDeps(
      { digestChannelId: "chan", lastDigestAt: null },
      { post: async () => { throw new Error("send failed"); } },
    );
    await expect(runDigestTick(deps, "g1", NOW)).rejects.toThrow("send failed");
    expect(saved).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/digest/tick.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/digest/tick.ts`:

```ts
import type { GuildConfig } from "../config/guildConfig.js";
import type { DigestStats } from "./card.js";
import { buildDigestCard } from "./card.js";
import { dueForDigest } from "./schedule.js";

export interface DigestTickDeps {
  getConfig: (guildId: string) => Promise<GuildConfig>;
  saveConfig: (cfg: GuildConfig) => Promise<void>;
  gatherStats: (guildId: string, sinceIso: string) => Promise<DigestStats>;
  post: (channelId: string, card: { title: string; lines: string[] }) => Promise<void>;
  periodMs: number;
}

export type DigestTickResult = "posted" | "skipped-unconfigured" | "skipped-not-due";

export async function runDigestTick(deps: DigestTickDeps, guildId: string, nowMs: number): Promise<DigestTickResult> {
  const cfg = await deps.getConfig(guildId);
  if (!cfg.digestChannelId) return "skipped-unconfigured";
  if (!dueForDigest(cfg.lastDigestAt, nowMs, deps.periodMs)) return "skipped-not-due";
  const sinceIso = new Date(nowMs - deps.periodMs).toISOString();
  const stats = await deps.gatherStats(guildId, sinceIso);
  const card = buildDigestCard(stats);
  // Post BEFORE saving the timestamp: if post throws, lastDigestAt is not
  // advanced, so the next tick retries rather than silently skipping a day.
  await deps.post(cfg.digestChannelId, card);
  await deps.saveConfig({ ...cfg, lastDigestAt: new Date(nowMs).toISOString() });
  return "posted";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/digest/tick.test.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git -C /d/Projects/collapsedstargames-bot add src/digest/tick.ts tests/digest/tick.test.ts
git -C /d/Projects/collapsedstargames-bot commit -m "feat(digest): runDigestTick orchestration (gate → gather → post → save) + tests"
```

---

### Task 5: Scheduler + `index.ts` wiring

**Files:**
- Create: `src/digest/job.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `runDigestTick` + `DigestTickDeps` (`./tick.js`); `reportsRepo.digestReportStats`, `modLogRepo.countByActionSince`, `antiRaidRepo.joinsSince`, `configRepo.get`/`save` (all existing); the ClientReady bindings `reports`, `conf`, `c` (the Client), `log`, `pool`.
- Produces: `startDigestJob(runTick, opts, logError): () => void`. Integration glue over tested units — `job.ts` is a thin `setInterval` wrapper (mirrors `startRetentionJob`) and the `index.ts` composition has no unit test, consistent with the codebase; verified by build + full suite + a manual smoke.

- [ ] **Step 1: Create the scheduler**

Create `src/digest/job.ts`:

```ts
// Run the digest tick immediately, then on an interval. The persisted 24h gate
// inside runDigestTick decides whether to actually post, so the immediate run
// is safe (it posts at most once per 24h even across frequent restarts) and
// makes the digest fire promptly when due after a redeploy. Mirrors
// startRetentionJob. Returns a stop function.
export function startDigestJob(
  runTick: (nowMs: number) => Promise<unknown>,
  opts: { checkIntervalMs: number },
  logError: (e: unknown) => void
): () => void {
  const run = () => {
    runTick(Date.now()).catch(logError);
  };
  run();
  const timer = setInterval(run, opts.checkIntervalMs);
  if (typeof (timer as { unref?: () => void }).unref === "function") (timer as { unref: () => void }).unref();
  return () => clearInterval(timer);
}
```

(Note: this refines spec §9 — an immediate run IS safe because the persisted gate prevents restart-spam, and it improves responsiveness. Same shape as `startRetentionJob`.)

- [ ] **Step 2: Wire it into `index.ts`**

First READ `src/index.ts` to confirm the imports and the ClientReady block. In the `client.once(Events.ClientReady, ...)` handler there is a `try { const reports = reportsRepo(pool); ... const conf = ... ; if (conf) { startRetentionJob(...); log.info("report retention job started (45d, daily)"); } }` block.

Add imports near the other repo imports at the top of `src/index.ts` (only the ones not already present — check first):

```ts
import { modLogRepo } from "./db/repositories/modLogRepo.js";
import { antiRaidRepo } from "./db/repositories/antiRaidRepo.js";
import { runDigestTick } from "./digest/tick.js";
import { startDigestJob } from "./digest/job.js";
```

Also ensure `EmbedBuilder` is imported from `discord.js` (add it to the existing `discord.js` import if absent) and that `configRepo` is imported (it is — it's used to read `conf`).

Then, inside the `if (conf) { ... }` block, immediately AFTER the `log.info("report retention job started (45d, daily)");` line, add:

```ts
        const modlog = modLogRepo(pool);
        const antiRaid = antiRaidRepo(pool);
        const digestCfg = configRepo(pool);
        startDigestJob(
          (nowMs) =>
            runDigestTick(
              {
                getConfig: (gid) => digestCfg.get(gid),
                saveConfig: (cfgObj) => digestCfg.save(cfgObj),
                gatherStats: async (gid, sinceIso) => {
                  const rs = await reports.digestReportStats(gid, sinceIso);
                  const modActions = await modlog.countByActionSince(gid, sinceIso);
                  const joins = await antiRaid.joinsSince(gid, sinceIso);
                  return {
                    newReports: rs.newCount,
                    open: rs.open,
                    modActions,
                    joins,
                    memberCount: c.guilds.cache.get(gid)?.memberCount ?? null,
                  };
                },
                post: async (channelId, card) => {
                  const ch = await c.channels.fetch(channelId).catch(() => null);
                  if (ch && ch.isTextBased() && !ch.isDMBased()) {
                    await ch.send({
                      embeds: [new EmbedBuilder().setTitle(card.title).setDescription(card.lines.join("\n"))],
                      allowedMentions: { parse: [] },
                    });
                  }
                },
                periodMs: 86_400_000,
              },
              conf.guildId,
              nowMs
            ),
          { checkIntervalMs: 3_600_000 },
          (e) => log.error(e)
        );
        log.info("daily digest job started (hourly check, 24h gate)");
```

(If `reports` is scoped differently or `c` is named otherwise in the actual handler, adapt to the real bindings you see when you read the file. `c` is the `Client` argument of the `ClientReady` callback; `reports = reportsRepo(pool)` and `conf` already exist in this block.)

- [ ] **Step 3: Typecheck + full suite**

Run: `npm run build && npm test`
Expected: build clean; full suite green (no regressions; the new wiring is glue over tested units). Note the ~5 new digest test files add to the count.

- [ ] **Step 4: Commit**

```bash
git -C /d/Projects/collapsedstargames-bot add src/digest/job.ts src/index.ts
git -C /d/Projects/collapsedstargames-bot commit -m "feat(digest): startDigestJob scheduler + wire the per-guild digest in index.ts"
```

- [ ] **Step 5: Manual smoke (post-deploy)**

- With `digestChannelId` unset → nothing posts (tick returns skipped-unconfigured).
- Set `digestChannelId` + `lastDigestAt` to > 24h ago (or null) → within the hour (or immediately on next restart) a "🗒️ Daily digest (last 24h)" card posts to that channel with correct backlog / mod-actions / members lines.
- Confirm `lastDigestAt` advanced in `guild_config` and a second run within 24h does NOT post again.
- Point `digestChannelId` at a bad/missing channel → nothing posts and the tick doesn't crash the loop (post no-ops on a non-text channel; timestamp still advances only after a successful send path — note: a missing channel silently no-ops the send but the tick still saves the timestamp, so a misconfigured channel skips that day; acceptable for v1, and the empty-channel case is a config error surfaced by the digest simply not appearing).

- [ ] **Step 6: Final whole-branch review** (per subagent-driven-development) then finishing-a-development-branch.

---

## Self-Review

**Spec coverage:**
- §3 card contents (backlog / mod actions / members) → Task 2 `buildDigestCard` + Task 3 queries. ✓
- §4 restart-safe 24h gate → Task 2 `dueForDigest` + Task 4 `runDigestTick` + Task 5 scheduler. ✓
- §5 config fields (no migration) → Task 1. ✓
- §6 pg-mem-safe queries (all sources, deleted excluded) → Task 3. ✓
- §7 pure logic → Task 2. ✓
- §8 orchestration (gate → gather → post → save; no-save-on-post-failure) → Task 4 + its 4th test. ✓
- §9 scheduler + wiring (member count, post embed) → Task 5. ✓ (immediate-run refinement noted)
- §10 testing → Tasks 1–4 unit-tested; Task 5 glue (documented). ✓
- §11 enable-config → Task 5 Step 5 smoke + handed to user at rollout. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**Type consistency:** `DigestStats` (Task 2, card.ts) is consumed unchanged by `runDigestTick` (Task 4) and composed in Task 5 (`newReports`/`open`/`modActions`/`joins`/`memberCount`); `digestReportStats` returns `{ newCount, open }` and Task 5 maps `rs.newCount → newReports`, `rs.open → open`; `DigestTickDeps` (Task 4) is satisfied exactly by the Task 5 object; `dueForDigest`/`buildDigestCard` signatures match their Task 2 definitions. ✓

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-24-daily-mod-digest.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
