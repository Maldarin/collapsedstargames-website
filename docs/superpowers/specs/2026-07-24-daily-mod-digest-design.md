# Spec — Daily mod digest

Status: designed (brainstormed 2026-07-24), not yet implemented.
Repo: `collapsedstargames-bot` (the mod bot). No website or MCP changes.

## 1. Goal

Once a day, post a compact "🗒️ Daily digest (last 24h)" card to a staff channel so the three-person mod team (two of them teenagers) can catch up in ~30 seconds instead of scrolling. Roadmap item #14 (top admin-burden reducer). Reuses existing repos; **no new tracking, no migration**.

## 2. Non-goals (v1, YAGNI)

- No per-leave tracking / net-change line (uses the live `guild.memberCount` + joins instead — no `guildMemberRemove` handler, no new table).
- No fixed-time-of-day scheduling (a rolling 24h gate instead).
- No configurable metric set or per-metric drill-downs.
- No new table or SQL migration (config additions are JSON; the gate timestamp is JSON).

## 3. Card contents

A single embed titled "🗒️ Daily digest (last 24h)" with:

- **Backlog:** count of reports created in the last 24h, plus current open counts by status (`new`, `triaged`, `in_progress`).
- **Mod actions (24h):** counts by action from `mod_log` (`warn`, `kick`, `ban`, `mute`). Only non-zero actions are listed; "none" when empty.
- **Members:** current total from the live `guild.memberCount`, plus joins in the last 24h (`join_events`).

**Escalations are excluded**: the escalate-to-admin feature posts a content-free line to the mod-log *channel* via `sendToChannel`, never to the `mod_log` *table*, so it does not appear in these counts. This is intentional — sensitive escalations stay in the admin channel, out of the shared staff digest.

## 4. Cadence (restart-safe)

The bot restarts on every Railway deploy, and a digest *posts a message*, so a naive boot-run would spam a digest on each redeploy. Instead:

- An **hourly tick** calls `runDigestTick`.
- It posts **only when `now - lastDigestAt >= 24h`**, where `lastDigestAt` is a per-guild ISO timestamp stored in `guild_config`.
- After a successful post it saves the new `lastDigestAt`.
- A `null` `lastDigestAt` (never posted) counts as due, so the first digest fires on the first tick after the channel is configured.

This survives restarts with no double-posts and fires roughly once per day (time-of-day drifts slightly over long runs — acceptable for v1). The feature is **inert until `digestChannelId` is set** (no channel → tick returns immediately, nothing posted, timestamp untouched).

## 5. Config additions (`src/config/guildConfig.ts`)

Two new nullable fields on `GuildConfig` / `DEFAULT_CONFIG`. Config persists as a JSON `data` blob, so this needs **no migration** (absent keys default via `DEFAULT_CONFIG`).

```ts
digestChannelId: string | null;   // where the digest posts; null = feature off
lastDigestAt: string | null;      // ISO timestamp of the last successful post (the gate)
```

`lastDigestAt` is written back via the existing `configRepo.save` (which busts the config cache). Because `save` persists the whole config blob, `runDigestTick` reads the current config, sets `lastDigestAt`, and saves — no separate column or query.

## 6. Data layer (pg-mem-safe queries)

New methods on existing repos:

```ts
// reportsRepo
digestReportStats(guildId: string, sinceIso: string): Promise<{
  newCount: number;                                   // reports created >= sinceIso, excluding soft-deleted
  open: { new: number; triaged: number; in_progress: number };  // current counts by status, excluding soft-deleted
}>

// modLogRepo
countByActionSince(guildId: string, sinceIso: string): Promise<Record<string, number>>  // { warn: n, kick: n, ... } for created_at >= sinceIso
```

- `antiRaidRepo.joinsSince(guildId, sinceIso)` already exists — reused for the joins count.
- All new queries use `SUM(CASE …)` / `COUNT(*)` with a `created_at >= $sinceIso` predicate (no interval arithmetic; pg-mem-safe). `digestReportStats.newCount` and `open` exclude `deleted_at IS NOT NULL`.
- `countByActionSince` uses `GROUP BY action`; the pure card builder decides which actions to show and in what order.

## 7. Pure logic (`src/digest/`)

Injectable-seam pattern; no discord.js.

```ts
// src/digest/schedule.ts
export function dueForDigest(lastIso: string | null, nowMs: number, periodMs: number): boolean;
//   null → true; else (nowMs - Date.parse(lastIso)) >= periodMs

// src/digest/card.ts
export interface DigestStats {
  newReports: number;
  open: { new: number; triaged: number; in_progress: number };
  modActions: Record<string, number>;  // action → count (only relevant actions)
  memberCount: number | null;          // null if the guild/member count is unavailable
  joins: number;
}
export function buildDigestCard(stats: DigestStats): { title: string; lines: string[] };
//   title = "🗒️ Daily digest (last 24h)"
//   lines: Backlog / Mod actions / Members, formatted; "none" fallbacks where empty
```

`buildDigestCard` renders known mod actions in a fixed order (warn, kick, ban, mute), skipping zero counts; "Mod actions: none" when all zero. Members line omits the joins suffix cleanly and shows "Members: n/a" when `memberCount` is null.

## 8. Orchestration — `runDigestTick`

`src/digest/tick.ts`, unit-tested with fakes (this is the heart of the feature):

```ts
export interface DigestTickDeps {
  getConfig: (guildId: string) => Promise<GuildConfig>;
  saveConfig: (cfg: GuildConfig) => Promise<void>;
  gatherStats: (guildId: string, sinceIso: string) => Promise<DigestStats>;
  post: (channelId: string, card: { title: string; lines: string[] }) => Promise<void>;
  periodMs: number;   // 24h
}
export async function runDigestTick(deps: DigestTickDeps, guildId: string, nowMs: number): Promise<"posted" | "skipped-unconfigured" | "skipped-not-due">;
```

Sequence:
1. `cfg = getConfig(guildId)`. If `!cfg.digestChannelId` → return `"skipped-unconfigured"` (nothing posted, timestamp untouched).
2. If `!dueForDigest(cfg.lastDigestAt, nowMs, periodMs)` → return `"skipped-not-due"`.
3. `sinceIso = new Date(nowMs - periodMs).toISOString()`; `stats = gatherStats(guildId, sinceIso)`; `card = buildDigestCard(stats)`.
4. `post(cfg.digestChannelId, card)`.
5. `saveConfig({ ...cfg, lastDigestAt: new Date(nowMs).toISOString() })`; return `"posted"`.

If `post` throws, the timestamp is NOT saved (so the next tick retries) — `post` runs before `saveConfig`, and an exception propagates out of the tick (the scheduler wrapper logs it).

## 9. Scheduler + wiring

- `src/digest/schedule.ts` also exports `startDigestJob(runTick: (nowMs: number) => Promise<unknown>, opts: { checkIntervalMs: number }, logError): () => void` — `setInterval(checkIntervalMs)` calling `runTick(Date.now())` wrapped in `.catch(logError)`, `unref()`s the timer, returns a stop fn. Mirrors `startRetentionJob`. No immediate boot-run — the persisted gate handles "is it time" on the first tick (avoids restart-spam while still firing when due).
- `src/index.ts`: for each guild, build the deps (repos → `gatherStats` composes `reportsRepo.digestReportStats` + `modLogRepo.countByActionSince` + `antiRaidRepo.joinsSince` + `getMemberCount = () => client.guilds.cache.get(guildId)?.memberCount ?? null`; `post` builds an `EmbedBuilder` from the card and sends to the channel; `getConfig`/`saveConfig` from `configRepo`) and call `startDigestJob(nowMs => runDigestTick(deps, guildId, nowMs), { checkIntervalMs: 3_600_000 }, log.error)`.

## 10. Testing

- `tests/digest/schedule.test.ts` — `dueForDigest`: null → due; exactly-at-period → due; under-period → not due.
- `tests/digest/card.test.ts` — `buildDigestCard`: renders backlog/mod-actions/members lines; skips zero actions; "none"/"n/a" fallbacks; fixed action order.
- `tests/digest/tick.test.ts` — `runDigestTick`: posts + saves timestamp when due; `"skipped-unconfigured"` when no channel (no post, no save); `"skipped-not-due"` when within the window (no post, no save); does NOT save the timestamp if `post` throws.
- `tests/db/reportsRepo.test.ts` / `modLogRepo` — the two new queries (counts, since-window, exclusions, guild scope), pg-mem.
- `index.ts` wiring + the `setInterval` wrapper are glue (no unit test, consistent with the codebase), verified by build + full suite + a manual smoke.

## 11. Companion: config to enable (handed over, not code)

After deploy, set in `guild_config` (Neon, JSON): `digestChannelId` = a staff channel the mod team can see and the bot can post to (View + Send + Embed Links). Optionally seed `lastDigestAt` to control when the first digest fires (omit / null → the next hourly tick posts one immediately).

## 12. Open decisions (resolved in brainstorming 2026-07-24)

- Metrics → DB-ready set + live member count (no per-leave tracking).
- Cadence → persisted 24h gate, hourly check (restart-safe), no fixed time-of-day.
- Channel → dedicated `digestChannelId`, feature inert until set.
