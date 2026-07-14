# Backlog Soft-Delete + Lifecycle + Recovery (Design Spec)

**Date:** 2026-07-14
**Status:** Approved design, pending implementation plan
**Scope:** Two repos — `collapsedstargames-mcp` (assistant bot, adds the delete/restore/purge tools) and `collapsedstargames-bot` (always-on mod bot, DB owner — adds the migration + the automated retention job). Shared Neon Postgres.
**Builds on:** Round 2 report backlog (`2026-07-13-round2-backlog-design.md`). Assumes migrations `002_reports.sql` / `003_report_notify.sql` are already live.

## 1. Purpose

The Round 2 backlog has no way to remove an item. Manual mistakes, test artifacts, and stale/irrelevant reports accumulate forever, and the only terminal states (`resolved`, `wont_fix`) still show in the backlog. This adds a **deletion lifecycle** with a safe, recoverable path:

- **soft delete** — hide an item, fully reversible;
- **restore** — bring a soft-deleted item back (Layer-1 recovery);
- **purge** — the actual irreversible hard-delete, gated behind a dry-run confirm and a time threshold, with an unattended retention safety-net.

Guild: `1512237266800742570` (NOPAS).

## 2. Design principles

- **Soft first, hard last.** Deletion is a two-phase lifecycle: a reversible soft-delete window, then an explicit/aged-out hard purge. Nothing is destroyed on the first action.
- **MCP stays DB-only.** As in Round 2, the MCP never touches Discord forum tags or threads — it only reads/writes the shared DB. The mod bot remains the sole Discord side-effector. Deleting a backlog row does **not** delete or close its Discord thread; that is a separate, explicit action via the existing `close_thread` tool.
- **`deleted_at` is orthogonal to `status`.** Deletion is a nullable timestamp, not a status enum value. Because the forum-tag mirror keys off `status`, deletion is completely invisible to the tag pipeline — a soft-deleted `in_progress` bug keeps its `in_progress` tag until purged.
- **Least-privilege / no surprise destruction.** The on-demand purge is a dry-run by default; only an explicit `confirm:true` deletes. The one unattended destroyer (the 45-day reaper) emits a forensic log of every row before deleting it.

## 3. Data model

New migration `004_report_soft_delete.sql` in the **mod bot** (the DB owner — the MCP does not run migrations).

```sql
ALTER TABLE reports ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reports_deleted
  ON reports (guild_id, deleted_at)
  WHERE deleted_at IS NOT NULL;
```

| column | type | notes |
|---|---|---|
| `deleted_at` | TIMESTAMPTZ NULL | NULL = live; non-NULL = soft-deleted at that time. Drives visibility, the on-demand purge threshold, and the retention reaper. |

No change to `report_notes`; its `ON DELETE CASCADE` on `report_id` means a hard purge cleans up notes automatically. No change to `status` and no new status value — the forum-tag mirror is untouched.

## 4. State model

```
        backlog_delete                 backlog_purge(confirm:true)
 live ──────────────────▶ soft-deleted ───────────────────────────▶ (gone)
   ▲                        │  │                                       ▲
   └── backlog_restore ─────┘  └── 45-day retention reaper ────────────┘
      (Layer-1 recovery)          (unattended; logs JSON first)
```

- **live** — `deleted_at IS NULL`. Normal backlog item.
- **soft-deleted** — `deleted_at IS NOT NULL`. Hidden from default `list`/`get`; still inspectable and restorable.
- **gone** — hard-deleted row (+ CASCADE notes). Only reachable from soft-deleted, and only when older than the applicable threshold.

## 5. MCP tools (`collapsedstargames-mcp`, `src/tools/backlog.ts`)

All guild-scoped (filter `guild_id = ctx.guildId`), DB-only, following the existing `toolTry` / `ok` / `asCallResult` patterns. Three new tools (delete/restore/purge); list/get are modified, not new. Tool count 20 → 23.

### 5.1 `backlog_delete(id)` — soft delete
- Guild-scoped lookup. Not found → `Report #<id> not found.`
- Already soft-deleted → no-op message `Report #<id> is already deleted.`
- Else, in a transaction: `UPDATE reports SET deleted_at = now(), updated_at = now()` + insert a `report_notes` row `kind = 'deleted'`, `body = 'soft-deleted'`.
- Returns `Report #<id> deleted (soft — restorable until purged).`

### 5.2 `backlog_restore(id)` — Layer-1 recovery
- Not found → not-found message.
- Not currently deleted → no-op `Report #<id> is not deleted.`
- Else, in a transaction: `UPDATE reports SET deleted_at = NULL, updated_at = now()` + `report_notes` row `kind = 'restored'`, `body = 'restored'`.
- Returns `Report #<id> restored.`

### 5.3 `backlog_purge(olderThanDays = 30, confirm = false)` — irreversible hard delete
- Selects candidate rows: `guild_id = $1 AND deleted_at IS NOT NULL AND deleted_at < now() - ($2 * interval '1 day')`.
  (Interval built as `make_interval(days => $2)` or `now() - ($2 || ' days')::interval` — whichever pg-mem tolerates; see §8.)
- **Dry-run (default, `confirm` falsy):** deletes nothing. Returns the candidate count and a line per candidate (`#id [status] title — deleted <age>`), prefixed `DRY RUN — would purge N item(s). Re-run with confirm:true to delete.` Empty set → `Nothing to purge (0 items older than <N>d).`
- **Confirmed (`confirm:true`):** in a transaction —
  1. `UPDATE reports SET duplicate_of = NULL WHERE guild_id = $1 AND duplicate_of = ANY($candidateIds)` — clears the RESTRICT self-FK from *any* row (live or deleted) pointing at a purge target.
  2. `DELETE FROM reports WHERE id = ANY($candidateIds) AND guild_id = $1` — notes CASCADE away.
  - Returns `Purged N item(s).`
- `olderThanDays` accepts `0` (purge all soft-deleted immediately) for deliberate full cleanup; still requires `confirm:true`.

### 5.4 `backlog_list` — add `includeDeleted?: boolean` (default false)
- Default: append `AND deleted_at IS NULL` to the existing WHERE. Deleted rows stay hidden.
- `includeDeleted:true`: no such filter; deleted rows render with a leading `🗑 ` marker so restore/purge targets are visible. Line format otherwise unchanged (`#id [status/priority] title`).

### 5.5 `backlog_get` — inspect deleted rows
- No filter change (it already fetches by id regardless of `deleted_at`). Add a `deleted: <timestamp>` field to the rendered header when `deleted_at` is set, so you can see an item is deleted before restoring/purging.

## 6. Mod-bot automated retention (`collapsedstargames-bot`)

A daily job, run once on startup and then on a fixed interval, colocated with the existing DB/listener code.

- Query: rows where `deleted_at IS NOT NULL AND deleted_at < now() - interval '45 days'` (all guilds, or per `guild_config` — single-guild today, so either is fine).
- For each row: **emit a forensic log line** at `info` containing the full row serialized as JSON (`id`, `guild_id`, `source`, `source_ref`, `thread_id`, `title`, `body`, `author_id`, `status`, `priority`, `deleted_at`) — this is the post-purge recovery trail (hand-recoverable from Railway logs, not queryable).
- Then, in a transaction: null `duplicate_of` pointers into the set (same RESTRICT handling as §5.3), then `DELETE`.
- Log the total purged count (`retention: purged N backlog rows soft-deleted > 45d`).
- The 45-day floor sits above the on-demand default of 30 days, so the two paths compose: purge the 30–45d window early by hand; anything missed is reaped at 45d.

## 7. Recovery model (summary)

| When | Mechanism | Reversible? |
|---|---|---|
| Within soft-delete window (up to 30–45d) | `backlog_restore(id)`; targets found via `backlog_list includeDeleted:true` + `backlog_get` | Yes, one call |
| On-demand purge | Dry-run by default; `confirm:true` required to delete | Final once confirmed |
| 45-day reaper | Unattended; full-row JSON logged before delete | Hand-recoverable from logs only |

Restore is deliberately **explicit, not automatic** — an item was deleted on purpose, so auto-undelete would be wrong. The design instead makes recovery *discoverable and one-call*.

## 8. Edge cases

- **`duplicate_of` RESTRICT FK.** `reports.duplicate_of REFERENCES reports(id)` has no cascade. Any hard delete (on-demand or reaper) must null pointers into the purged set first, or the `DELETE` fails. Handled in both purge paths. (Example live today: #6 is `duplicate_of #4`, so purging #4 requires clearing #6's pointer.)
- **Auto-ingest resurrection.** A soft-deleted `bug_forum` row keeps its unique `(guild_id, source, source_ref)` slot, so the mod bot's ingest dedup will **not** recreate it while soft-deleted. The slot frees only at purge — so purging a `bug_forum` row whose Discord thread still exists can let ingest re-add it later. Acceptable and documented; users purge such rows knowing the thread is the source of truth.
- **Idempotency.** delete/restore are no-ops with clear messages when already in the target state.
- **Guild isolation.** Every query is guild-scoped; no tool can touch another guild's rows.

## 9. Testing

TDD in both repos against pg-mem, matching existing suites (MCP 58 tests, bot 74 tests).

- **MCP:** delete (happy, already-deleted no-op, not-found), restore (happy, not-deleted no-op, not-found), purge (dry-run lists without deleting, confirm deletes, threshold excludes too-recent rows, `duplicate_of` pointer cleared, notes CASCADE gone), list `includeDeleted` visibility both ways, get shows `deleted`.
- **Bot:** retention job selects only rows older than 45d, logs JSON before delete, clears `duplicate_of`, deletes, leaves newer soft-deleted rows.
- **pg-mem accommodations (flag for the plan):** interval arithmetic (`now() - interval`) and partial indexes may need the same kind of workaround the Round 2 notes call out for `ON CONFLICT` / `IS DISTINCT FROM`. If pg-mem rejects the interval expression, compute the cutoff timestamp in JS and pass it as a bound parameter; if it rejects the partial index predicate, fall back to a plain index in the test path. Real Postgres uses the spec'd form.

## 10. Rollout ordering

1. **Mod bot first** — land + deploy `004_report_soft_delete.sql` (Railway auto-applies on deploy) and the retention job. The `deleted_at` column must exist before the MCP writes to it.
2. **MCP second** — land the tool changes (3 new + list/get edits); rebuild `dist`; user restarts Claude Code to respawn the MCP (23 tools).
3. Verify: soft-delete an item → hidden from `list`, visible with `includeDeleted` → restore → reappears; `purge` dry-run lists, `confirm:true` deletes; confirm the live #4/#5/#6 `wont_fix` smoke-test rows can be soft-deleted and purged.

## 11. Out of scope (YAGNI)

- No archive table (chosen: dry-run confirm + forensic log, per approved design).
- No deletion of Discord threads/messages from the backlog tools (use `close_thread`).
- No mod-bot `/backlog` slash-command surface for delete/restore/purge in this round (MCP-only); can follow later if wanted.
- No per-guild configurable thresholds; 30d on-demand default / 45d reaper are constants.
