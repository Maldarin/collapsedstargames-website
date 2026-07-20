# Bug-Report Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public `/leaderboard` command ranks bug/playtest reporters by all-time points (accepted +1, resolved +3), derived from the existing `reports` table.

**Architecture:** One aggregate query (`reportsRepo.leaderboardCounts`) → a pure `computeLeaderboard` (points, sort, tie-break, topN, caller rank) → a thin router branch that renders a public embed. Injectable-seam pattern: discord.js only in the router. No new table, migration, config, or secret.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), discord.js v14, pg / pg-mem, vitest, tsc.

**Repo:** `collapsedstargames-bot` (the mod bot).

## Global Constraints

- ESM: every relative import uses a `.js` specifier, even from `.ts`.
- Injectable-seam pattern: pure logic returns plain data; discord.js is imported only in `router.ts` / `registerCommands.ts`.
- TDD: failing test → watch it fail → minimal code → watch it pass → commit.
- vitest does NOT typecheck — after the suite is green, also run `npm run build` (tsc).
- SQL must be pg-mem-safe: use `SUM(CASE WHEN … THEN 1 ELSE 0 END)` (NOT aggregate `FILTER`), no interval arithmetic. Repo tests run on pg-mem via `freshPool()`.
- Scoring: `points = accepted*1 + resolved*3`, scored by each report's CURRENT status; a `resolved` report counts only in `resolved` (worth 3, never also +1).
- Counted sources: `bug_forum`, `playtest` only. Excluded: `security`, `manual`, `deleted_at IS NOT NULL`, `author_id IS NULL`.

---

### Task 1: `reportsRepo.leaderboardCounts` aggregate query

**Files:**
- Modify: `src/db/repositories/reportsRepo.ts`
- Test: `tests/db/reportsRepo.test.ts`

**Interfaces:**
- Produces: `reportsRepo(pool).leaderboardCounts(guildId: string): Promise<Array<{ authorId: string; accepted: number; resolved: number }>>`. Task 2 consumes this shape as `AuthorCount`.

- [ ] **Step 1: Write the failing test**

Append to `tests/db/reportsRepo.test.ts` (inside the existing file; it already imports `freshPool` and `reportsRepo`, and defines `base`):

```ts
describe("reportsRepo.leaderboardCounts", () => {
  it("aggregates accepted/resolved per author and excludes security/manual/deleted/null-author", async () => {
    const pool = await freshPool();
    const repo = reportsRepo(pool);
    // u1 (bug_forum): one triaged (+accepted) + one resolved (+resolved)
    const a = (await repo.ingest({ ...base, sourceRef: "a", threadId: "a", authorId: "u1" }))!;
    await repo.setStatus("g1", a, "triaged", "mod");
    const b = (await repo.ingest({ ...base, sourceRef: "b", threadId: "b", authorId: "u1" }))!;
    await repo.setStatus("g1", b, "resolved", "mod");
    // u2 (playtest): one in_progress (+accepted)
    const c = (await repo.ingest({ ...base, source: "playtest", sourceRef: "c", threadId: "c", authorId: "u2" }))!;
    await repo.setStatus("g1", c, "in_progress", "mod");
    // excluded — security (u3, resolved): source excluded
    const s = (await repo.ingest({ ...base, source: "security", sourceRef: "s", threadId: "s", authorId: "u3" }))!;
    await repo.setStatus("g1", s, "resolved", "mod");
    // excluded — manual (u4, resolved): source excluded
    const m = (await repo.ingest({ ...base, source: "manual", sourceRef: null, threadId: null, authorId: "u4" }))!;
    await repo.setStatus("g1", m, "resolved", "mod");
    // excluded — soft-deleted (u5, resolved)
    const d = (await repo.ingest({ ...base, sourceRef: "d", threadId: "d", authorId: "u5" }))!;
    await repo.setStatus("g1", d, "resolved", "mod");
    await pool.query("UPDATE reports SET deleted_at = now() WHERE id = $1", [d]);
    // excluded — null author
    await repo.ingest({ ...base, sourceRef: "n", threadId: "n", authorId: null });

    const rows = await repo.leaderboardCounts("g1");
    const by = Object.fromEntries(rows.map((r) => [r.authorId, r]));
    expect(by["u1"]).toEqual({ authorId: "u1", accepted: 1, resolved: 1 });
    expect(by["u2"]).toEqual({ authorId: "u2", accepted: 1, resolved: 0 });
    expect(by["u3"]).toBeUndefined();
    expect(by["u4"]).toBeUndefined();
    expect(by["u5"]).toBeUndefined();
    expect(rows.every((r) => r.authorId !== null)).toBe(true);
  });

  it("is guild-scoped", async () => {
    const pool = await freshPool();
    const repo = reportsRepo(pool);
    const x = (await repo.ingest({ ...base, guildId: "g1", sourceRef: "x", threadId: "x", authorId: "u1" }))!;
    await repo.setStatus("g1", x, "resolved", "mod");
    expect(await repo.leaderboardCounts("OTHER")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/db/reportsRepo.test.ts`
Expected: FAIL — `repo.leaderboardCounts is not a function`.

- [ ] **Step 3: Add the method**

In `src/db/repositories/reportsRepo.ts`, add this method to the returned object (e.g. immediately after the `list(...)` method):

```ts
    async leaderboardCounts(guildId: string): Promise<Array<{ authorId: string; accepted: number; resolved: number }>> {
      // Player-submitted reports only (bug_forum/playtest); security is private and
      // manual is staff-authored. SUM(CASE …) not COUNT(*) FILTER (pg-mem can't parse
      // FILTER). A resolved report is counted only under `resolved`, so scoring by
      // current status never double-counts it.
      const r = await pool.query(
        `SELECT author_id,
                SUM(CASE WHEN status IN ('triaged','in_progress') THEN 1 ELSE 0 END) AS accepted,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved
         FROM reports
         WHERE guild_id = $1
           AND deleted_at IS NULL
           AND author_id IS NOT NULL
           AND source IN ('bug_forum','playtest')
         GROUP BY author_id`,
        [guildId]
      );
      return r.rows.map((x: any) => ({
        authorId: x.author_id,
        accepted: Number(x.accepted),
        resolved: Number(x.resolved),
      }));
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/db/reportsRepo.test.ts`
Expected: PASS (both new cases + all pre-existing reportsRepo tests).

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git -C /d/Projects/collapsedstargames-bot add src/db/repositories/reportsRepo.ts tests/db/reportsRepo.test.ts
git -C /d/Projects/collapsedstargames-bot commit -m "feat(leaderboard): reportsRepo.leaderboardCounts aggregate query"
```

---

### Task 2: Pure `computeLeaderboard`

**Files:**
- Create: `src/leaderboard/leaderboard.ts`
- Test: `tests/leaderboard/leaderboard.test.ts`

**Interfaces:**
- Consumes: `AuthorCount` = the row shape from Task 1 (`{ authorId, accepted, resolved }`).
- Produces: `computeLeaderboard(counts: AuthorCount[], opts: { topN?: number; callerId?: string | null }): LeaderboardResult`, with `LeaderRow` (`{ authorId, points, accepted, resolved, rank }`) and `LeaderboardResult` (`{ top: LeaderRow[]; callerRank: LeaderRow | null; totalRanked: number }`). Task 4 consumes these.

- [ ] **Step 1: Write the failing test**

Create `tests/leaderboard/leaderboard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeLeaderboard } from "../../src/leaderboard/leaderboard.js";

const c = (authorId: string, accepted: number, resolved: number) => ({ authorId, accepted, resolved });

describe("computeLeaderboard", () => {
  it("scores accepted*1 + resolved*3 and ranks descending", () => {
    const r = computeLeaderboard([c("a", 0, 2), c("b", 3, 0), c("d", 1, 1)], {});
    expect(r.top.map((x) => [x.authorId, x.points])).toEqual([["a", 6], ["d", 4], ["b", 3]]);
    expect(r.top.map((x) => x.rank)).toEqual([1, 2, 3]);
    expect(r.totalRanked).toBe(3);
  });

  it("drops zero-point authors", () => {
    const r = computeLeaderboard([c("a", 0, 0), c("b", 0, 1)], {});
    expect(r.top.map((x) => x.authorId)).toEqual(["b"]);
    expect(r.totalRanked).toBe(1);
  });

  it("tie-breaks by resolved desc, then authorId asc", () => {
    // x and y both 6 pts; x has 2 resolved, y has 0 → x first
    const r = computeLeaderboard([c("y", 6, 0), c("x", 0, 2)], {});
    expect(r.top.map((x) => x.authorId)).toEqual(["x", "y"]);
    // p and q both 3 pts and 1 resolved → authorId ascending
    const r2 = computeLeaderboard([c("q", 0, 1), c("p", 0, 1)], {});
    expect(r2.top.map((x) => x.authorId)).toEqual(["p", "q"]);
  });

  it("respects topN but still counts everyone in totalRanked", () => {
    const r = computeLeaderboard([c("a", 0, 4), c("b", 0, 3), c("d", 0, 2)], { topN: 2 });
    expect(r.top.map((x) => x.authorId)).toEqual(["a", "b"]);
    expect(r.totalRanked).toBe(3);
  });

  it("includes callerRank when the caller is outside the shown top", () => {
    const r = computeLeaderboard([c("a", 0, 4), c("b", 0, 3), c("me", 0, 1)], { topN: 2, callerId: "me" });
    expect(r.top.map((x) => x.authorId)).toEqual(["a", "b"]);
    expect(r.callerRank?.authorId).toBe("me");
    expect(r.callerRank?.rank).toBe(3);
  });

  it("callerRank is null when the caller is already in the top", () => {
    const r = computeLeaderboard([c("a", 0, 4), c("me", 0, 3)], { topN: 5, callerId: "me" });
    expect(r.callerRank).toBeNull();
  });

  it("callerRank is null when the caller has zero points", () => {
    const r = computeLeaderboard([c("a", 0, 4), c("me", 0, 0)], { topN: 5, callerId: "me" });
    expect(r.callerRank).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/leaderboard/leaderboard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/leaderboard/leaderboard.ts`:

```ts
export interface AuthorCount {
  authorId: string;
  accepted: number;
  resolved: number;
}

export interface LeaderRow {
  authorId: string;
  points: number;
  accepted: number;
  resolved: number;
  rank: number; // 1-based ordinal position in the sorted list
}

export interface LeaderboardResult {
  top: LeaderRow[];
  callerRank: LeaderRow | null;
  totalRanked: number;
}

const ACCEPTED_PTS = 1;
const RESOLVED_PTS = 3;

export function computeLeaderboard(
  counts: AuthorCount[],
  opts: { topN?: number; callerId?: string | null },
): LeaderboardResult {
  const topN = opts.topN ?? 10;
  const ranked: LeaderRow[] = counts
    .map((c) => ({
      authorId: c.authorId,
      accepted: c.accepted,
      resolved: c.resolved,
      points: c.accepted * ACCEPTED_PTS + c.resolved * RESOLVED_PTS,
      rank: 0,
    }))
    .filter((r) => r.points > 0)
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.resolved - a.resolved ||
        (a.authorId < b.authorId ? -1 : a.authorId > b.authorId ? 1 : 0),
    );
  ranked.forEach((r, idx) => {
    r.rank = idx + 1;
  });

  const top = ranked.slice(0, topN);
  let callerRank: LeaderRow | null = null;
  if (opts.callerId != null) {
    const found = ranked.find((r) => r.authorId === opts.callerId);
    if (found && !top.some((r) => r.authorId === found.authorId)) callerRank = found;
  }
  return { top, callerRank, totalRanked: ranked.length };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/leaderboard/leaderboard.test.ts`
Expected: PASS (all 7).

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git -C /d/Projects/collapsedstargames-bot add src/leaderboard/leaderboard.ts tests/leaderboard/leaderboard.test.ts
git -C /d/Projects/collapsedstargames-bot commit -m "feat(leaderboard): pure computeLeaderboard logic + tests"
```

---

### Task 3: Register the `/leaderboard` command

**Files:**
- Modify: `src/bot/registerCommands.ts`
- Test: `tests/bot/registerCommands.test.ts`

**Interfaces:**
- Produces: `buildCommandData()` now also includes a `leaderboard` slash command (no options).

- [ ] **Step 1: Update the failing tests**

In `tests/bot/registerCommands.test.ts`:

(a) Extend the name-set assertion to include `"leaderboard"` (sorted position is after `"kick"`, before `"mute"`):

```ts
    expect(names).toEqual(["Escalate to admin", "ask", "backlog", "ban", "kb", "kick", "leaderboard", "mute", "roblox", "warn"]);
```

(b) Add `"leaderboard"` to the skip list in the per-command "requires a target user option" loop:

```ts
      if (["backlog", "ask", "kb", "roblox", "Escalate to admin", "leaderboard"].includes(cmd.name)) continue;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/bot/registerCommands.test.ts`
Expected: FAIL — name set missing `"leaderboard"`.

- [ ] **Step 3: Add the command**

In `src/bot/registerCommands.ts`, inside `buildCommandData`, define the command near the other `SlashCommandBuilder`s (e.g. after the `roblox` builder):

```ts
  const leaderboard = new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the top bug reporters");
```

Then add `leaderboard` to the slash array so it is built. The current line is:

```ts
  const slash = [warn, mute, kick, ban, backlog, ask, kb, roblox].map((b) => b.toJSON());
```

Change it to:

```ts
  const slash = [warn, mute, kick, ban, backlog, ask, kb, roblox, leaderboard].map((b) => b.toJSON());
```

(Leave the `escalate` context-menu command append untouched.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/bot/registerCommands.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite**

Run: `npm run build && npm test`
Expected: build clean; full suite green (nothing else pins the command set).

- [ ] **Step 6: Commit**

```bash
git -C /d/Projects/collapsedstargames-bot add src/bot/registerCommands.ts tests/bot/registerCommands.test.ts
git -C /d/Projects/collapsedstargames-bot commit -m "feat(leaderboard): register /leaderboard command"
```

---

### Task 4: Wire the `/leaderboard` router branch

**Files:**
- Modify: `src/bot/router.ts`

**Interfaces:**
- Consumes: `computeLeaderboard` from `../leaderboard/leaderboard.js`; the existing `reports` repo instance (`const reports = reportsRepo(ctx.pool)` in `attachRouter`) now has `leaderboardCounts`; existing `EmbedBuilder`, `MessageFlags`, `ctx.log`.
- Produces: no new exports. Thin glue over tested units; no unit test (consistent with the rest of `router.ts`), verified by build + full suite + manual smoke.

- [ ] **Step 1: Add the import**

Near the other feature imports (after `import { runRoblox } from "../roblox/robloxCommand.js";`):

```ts
import { computeLeaderboard } from "../leaderboard/leaderboard.js";
```

- [ ] **Step 2: Add the router branch (pre-mod-gate)**

In the chat-input `interactionCreate` handler, `/leaderboard` is a PUBLIC command, so its branch goes BEFORE the mod-permission gate (`if (!gi.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) { … }`). Insert it right AFTER the `if (gi.commandName === "roblox") { … return; }` block and BEFORE that mod-gate check:

```ts
    if (gi.commandName === "leaderboard") {
      try {
        const counts = await reports.leaderboardCounts(i.guildId);
        const board = computeLeaderboard(counts, { topN: 10, callerId: gi.user.id });
        if (board.totalRanked === 0) {
          await gi.reply({
            content: "No ranked reporters yet — file a bug or playtest report to get on the board.",
            allowedMentions: { parse: [] },
          }).catch(() => {});
          return;
        }
        const lines = board.top.map(
          (r) => `\`#${r.rank}\` <@${r.authorId}> — **${r.points}** pts (${r.resolved}✅ ${r.accepted}☑️)`,
        );
        const embed = new EmbedBuilder().setTitle("🐛 Top Bug Hunters").setDescription(lines.join("\n"));
        if (board.callerRank) {
          embed.setFooter({ text: `You're #${board.callerRank.rank} · ${board.callerRank.points} pts` });
        }
        await gi.reply({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
      } catch (e) {
        ctx.log.error(e);
        await gi.reply({ content: "Couldn't load the leaderboard right now.", flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      return;
    }
```

Note: the board reply is PUBLIC (no `Ephemeral` flag) so it can be shared; only the error path is ephemeral. `allowedMentions: { parse: [] }` makes the `<@id>` names render without pinging the listed players.

- [ ] **Step 3: Typecheck + full suite**

Run: `npm run build && npm test`
Expected: build clean; full suite green (no test regressions; the branch is thin glue over tested units).

- [ ] **Step 4: Commit**

```bash
git -C /d/Projects/collapsedstargames-bot add src/bot/router.ts
git -C /d/Projects/collapsedstargames-bot commit -m "feat(leaderboard): wire public /leaderboard router branch"
```

- [ ] **Step 5: Manual smoke (post-deploy)**

- `/leaderboard` with existing resolved/accepted player reports → public "🐛 Top Bug Hunters" card, correct ordering, no mass ping.
- A player outside the top 10 runs it → sees the board + a "You're #N · X pts" footer.
- On a fresh guild with no qualifying reports → the empty-state message.
- Confirm a `security` report's author does NOT appear.

---

## Self-Review

**Spec coverage:**
- §3 scoring (accepted +1 / resolved +3, by current status) → Task 1 query (`accepted`/`resolved` split) + Task 2 point formula. ✓
- §4 counted/excluded sources + deleted + null author → Task 1 `WHERE` clause + test assertions. ✓
- §6 pg-mem-safe aggregate → Task 1 (`SUM(CASE …)`). ✓
- §7 pure logic (points, drop-zero, sort/tie-break, topN, callerRank, totalRanked) → Task 2 + 7 tests. ✓
- §8 public command, pre-mod-gate, embed + footer + empty state + `allowedMentions` → Task 3 (register) + Task 4 (branch). ✓
- §9 testing → Tasks 1–3 have unit tests; Task 4 is glue (documented). ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**Type consistency:** Task 1 returns `{ authorId, accepted, resolved }`; Task 2 `AuthorCount` is exactly that shape and its `LeaderboardResult`/`LeaderRow` are consumed unchanged in Task 4 (`board.top`, `board.callerRank`, `board.totalRanked`, `r.rank`/`r.points`/`r.resolved`/`r.accepted`). ✓

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-20-bug-report-leaderboard.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
