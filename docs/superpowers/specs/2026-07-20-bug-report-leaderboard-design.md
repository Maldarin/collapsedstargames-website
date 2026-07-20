# Spec — Bug-report leaderboard (`/leaderboard`)

Status: designed (brainstormed 2026-07-20), not yet implemented.
Repo: `collapsedstargames-bot` (the mod bot). No website or MCP changes.

## 1. Goal

Gamify QA: reward NOPAS players for filing bug/playtest reports that get accepted and fixed. A public `/leaderboard` slash command ranks reporters by all-time points, turning the existing report pipeline into a visible competition. This is roadmap item #13 (highest-engagement item), and it is almost entirely wiring on top of infrastructure already shipped (the `reports` table, status lifecycle, and fix→resolved round-trip).

## 2. Non-goals (v1, YAGNI)

- No weekly / rolling-window board (all-time only). *Deferred; the `report_notes` status-change audit trail makes it feasible later without a new table.*
- No scheduled auto-post (on-demand command only, so no scheduler).
- No "Top Bug Hunter" role reward (wants a scheduler to stay current; bundled with the future weekly auto-post).
- No priority weighting.
- No new table, no migration, no config field, no new secret.

## 3. Scoring

Each of a player's reports is scored by its **current status** (not cumulatively across its lifecycle):

| Current status | Points |
| --- | --- |
| `triaged`, `in_progress` (accepted / valid) | +1 |
| `resolved` (fix shipped) | +3 |
| `new`, `duplicate`, `wont_fix` | 0 |

Total = `accepted × 1 + resolved × 3`, where `accepted` counts reports currently in `triaged`/`in_progress` and `resolved` counts reports currently `resolved`. A resolved report is worth exactly 3 (it is counted in `resolved`, never also in `accepted`).

## 4. What counts

Only **player-submitted** reports contribute:

- Included sources: `bug_forum`, `playtest`.
- Excluded: `security` (private/sensitive — the public board must not advertise who found an exploit) and `manual` (staff-authored; `author_id` is a staff member, not a reporter).
- Also excluded: soft-deleted reports (`deleted_at IS NOT NULL`) and rows with `author_id IS NULL`.

## 5. Placement

Lives in the **mod bot** (owns the slash-command surface and the `reports` repo). `/leaderboard` is a public member command, so its router branch sits in the **pre-mod-gate** section of `interactionCreate`, alongside `/ask` and `/roblox`.

## 6. Data layer — `reportsRepo.leaderboardCounts`

A new method on the existing `reportsRepo` (`src/db/repositories/reportsRepo.ts`):

```ts
leaderboardCounts(guildId: string): Promise<Array<{ authorId: string; accepted: number; resolved: number }>>
```

One `GROUP BY` query, written pg-mem-safe (the repo's tests run on pg-mem):

```sql
SELECT author_id,
       SUM(CASE WHEN status IN ('triaged','in_progress') THEN 1 ELSE 0 END) AS accepted,
       SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved
FROM reports
WHERE guild_id = $1
  AND deleted_at IS NULL
  AND author_id IS NOT NULL
  AND source IN ('bug_forum','playtest')
GROUP BY author_id
```

Rationale: `SUM(CASE …)` instead of `COUNT(*) FILTER (…)` because pg-mem cannot parse aggregate `FILTER`; no interval arithmetic. Returns `authorId` as a string and `accepted`/`resolved` as JS numbers (Postgres returns `SUM` as a string/bigint — map with `Number(...)`). Authors with only zero-point reports still appear here with `accepted=0, resolved=0`; the pure layer drops them (§7).

## 7. Core logic — `src/leaderboard/leaderboard.ts`

Pure, discord.js-free, following the injectable-seam pattern (`runEscalation`/`runRoblox`).

```ts
export interface AuthorCount { authorId: string; accepted: number; resolved: number; }

export interface LeaderRow {
  authorId: string;
  points: number;
  accepted: number;
  resolved: number;
  rank: number;   // 1-based; ties share the query order below
}

export interface LeaderboardResult {
  top: LeaderRow[];          // up to topN, ranked
  callerRank: LeaderRow | null; // the caller's row IF they have >0 points AND are not already in `top`
  totalRanked: number;       // count of authors with > 0 points
}

const ACCEPTED_PTS = 1;
const RESOLVED_PTS = 3;

export function computeLeaderboard(
  counts: AuthorCount[],
  opts: { topN?: number; callerId?: string | null },
): LeaderboardResult
```

Behavior:
- `points = accepted*ACCEPTED_PTS + resolved*RESOLVED_PTS`.
- Drop authors with `points <= 0`.
- Sort: `points` desc, then `resolved` desc, then `authorId` ascending (stable, deterministic).
- Assign `rank` 1..N in sorted order (simple ordinal ranking — position in the sorted list; no dense/standard tie handling in v1).
- `top` = first `topN` (default 10).
- `callerRank`: if `callerId` is given and that author has `points > 0` and is **not** already in `top`, include their `LeaderRow` (with its true rank); otherwise `null`.
- `totalRanked` = number of authors with `points > 0`.

## 8. Command + router

Register `/leaderboard` (no options) in `registerCommands.ts`. Router branch (`src/bot/router.ts`), pre-mod-gate:

- Call `reports.leaderboardCounts(guildId)` → `computeLeaderboard(counts, { topN: 10, callerId: interaction.user.id })`.
- Empty (`totalRanked === 0`): public reply "No ranked reporters yet — file a bug or playtest report to get on the board."
- Otherwise build a "🐛 Top Bug Hunters" embed: numbered lines `\`#{rank}\` <@{authorId}> — {points} pts` (with a small resolved/accepted breakdown, e.g. `({resolved}✅ {accepted}☑️)`), and a footer line "You're #{rank} · {points} pts" when `callerRank` is non-null.
- **Public** reply (not ephemeral — the board is meant to be shared), with `allowedMentions: { parse: [] }` so the `<@id>` names render without pinging everyone listed.
- Wrap the reply in `.catch(() => {})` per the established unguarded-reply hardening.

## 9. Testing

TDD:

- `tests/db/reportsRepo.test.ts` (or the repositories test) — `leaderboardCounts`: aggregates accepted/resolved per author; excludes `security`/`manual`/soft-deleted/null-author rows; scopes by guild.
- `tests/leaderboard/leaderboard.test.ts` — `computeLeaderboard`: point formula; drops zero-point authors; sort + tie-break (points, then resolved, then authorId); topN cut; `callerRank` present-when-outside-top / null-when-in-top / null-when-zero-points; `totalRanked`.
- `tests/bot/registerCommands.test.ts` — add `leaderboard` to the exact command-name set and the per-command skip list (it has no `user` option).

Router branch is thin glue over the tested units (no unit test, consistent with the rest of the router), verified by build + full suite + a manual smoke.

## 10. Open decisions (resolved in brainstorming 2026-07-20)

- Scoring → tiered by lifecycle (accepted +1, resolved +3, by current status).
- Window → all-time cumulative.
- Surface → `/leaderboard` command, public reply, no scheduler.
- Role reward → none in v1.
- Sources → `bug_forum` + `playtest` only.
