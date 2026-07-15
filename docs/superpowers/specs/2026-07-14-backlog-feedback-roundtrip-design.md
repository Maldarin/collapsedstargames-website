# Backlog — Playtest Ingest + Fix Round-Trip (Design Spec)

**Date:** 2026-07-14
**Status:** Approved design, pending implementation plan
**Scope:** Two repos — `collapsedstargames-bot` (owns migrations + all Discord I/O) and `collapsedstargames-mcp` (DB-only tools). The NOPAS game repo (`Maldarin/not-my-pants-alien-scum`) stores nothing; it only *references* report ids.
**Amends:** The Round 2 / 2.5 / 2.6 backlog specs. Their data model, guild scoping, `NOTIFY`-driven one-way tag mirror, soft-delete/lifecycle, and FK/CASCADE handling are unchanged and assumed here.

Guild: `1512237266800742570` (NOPAS).

## 1. Purpose

Wire the two open halves of the developer feedback loop:

1. **Playtest feedback intake.** Today only `#bug-reports` (forum) and `#security-and-exploits` (text) feed the Neon `reports` backlog. Playtester feedback has no structured intake.
2. **The fix-side round-trip.** When a bug is fixed in the NOPAS repo there is no way to tell the reporter. The `NOTIFY` mirror flips the forum *tag* but never speaks in the thread, so a reporter never gets closure — the "update back through Discord" the workflow depends on.

Neon stays the single source of truth for a report's status. The NOPAS repo references reports by id (in commit messages); it never holds a second backlog.

## 2. Design principles (inherited + reaffirmed)

- **One Discord-writer.** The mod bot remains the *sole* actor that writes to Discord for report state (tags today; tags + resolution replies after this). The MCP stays **DB-only** — it never posts to Discord.
- **Neon authoritative.** Status lives in `reports.status`; every surface (MCP tools, mod-bot `/backlog`) writes there and the mirror reflects it outward.
- **Least privilege / no leakage.** No new internet-exposed endpoints, no CI→DB path. Security-sourced reports never trigger a public "fixed" announcement (§5).
- **Guild-scoped.** Every query stays filtered by `guild_id`.
- **Idempotent outward effects.** A resolution reply posts exactly once, resilient to `NOTIFY` re-fires and startup reconcile.

## 3. Data model (mod-bot migration `005_report_resolution.sql`)

`reports.source` is a free-text `TEXT` column with **no DB `CHECK`** (see `002_reports.sql`), so the new `playtest` value needs **no column migration** — only the app-level union type widens (§4.1). Migration `005` adds two columns and one guard trigger:

```sql
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_note TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_notified_at TIMESTAMPTZ;

-- Re-arm the reply if a report leaves 'resolved' (reopen), so a genuine
-- re-resolve replies again. Surface-agnostic: fires no matter who writes status.
CREATE OR REPLACE FUNCTION reports_rearm_resolution() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'resolved' THEN
    NEW.resolution_notified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reports_rearm_resolution_trg ON reports;
CREATE TRIGGER reports_rearm_resolution_trg
  BEFORE UPDATE OF status ON reports
  FOR EACH ROW EXECUTE FUNCTION reports_rearm_resolution();
```

- **`resolution_note TEXT NULL`** — the optional custom line shown in the reply; set when a report is resolved.
- **`resolution_notified_at TIMESTAMPTZ NULL`** — idempotency stamp; non-null means the reply has been posted for the current `resolved` episode.

The existing `report_status_notify_trg` (`003`) is **unchanged**: it still fires `AFTER INSERT OR UPDATE OF status` and NOTIFYs only `NEW.id`. Because it is scoped to `UPDATE OF status`, the listener's later write of `resolution_notified_at` (not a status change) does **not** re-fire it — no loop, same pattern as the existing `tag_synced_status` write. Like `003`, the plpgsql in `005` lives in a migration that the pg-mem test suite skips.

## 4. Playtest ingest (mod bot)

### 4.1 New source value

`reportsRepo.ts` `Report.source` union widens to `"bug_forum" | "security" | "manual" | "playtest"`. The MCP `backlog_list` `source` filter (and any zod/enum validation) gains `playtest`. No DB constraint change.

### 4.2 Channel

Create a **new forum channel `#playtest-feedback`** (type 15) under the PLAYTEST category. Discord cannot convert the existing text channel `#playtester-hub` (type 0) to a forum, and it stays the freeform social/chat space. Provision the full lifecycle tag set (`new` / `triaged` / `in_progress` / `resolved` / `duplicate` / `wont_fix`) on the new forum, exactly as `#bug-reports` has them, so the tag mirror works unchanged. Add `playtestForumChannelId` to `guild_config`.

### 4.3 Ingest path

Reuse the `bug_forum` thread path in `ingest.ts` verbatim, only differing in `source` and the config channel id: on `threadCreate` in the playtest forum, upsert

```
{ source: 'playtest', sourceRef: threadId, threadId: threadId, title, body, authorId }
```

Dedup is the existing unique index `(guild_id, source, source_ref)`. Startup reconcile covers threads created while the bot was down, same as `bug_forum`.

## 5. The resolve round-trip

### 5.1 Setting status + note (MCP + mod bot)

- **MCP `backlog_set_status`** gains an optional **`note?: string`** param. It always inserts a `report_notes` row (`kind: 'note'`) when `note` is provided; when the **target status is `resolved`**, it additionally writes that text to `reports.resolution_note` in the same `UPDATE` that sets the status. Status + note land together so the single `NOTIFY` carries a fully-populated row.
- The mod-bot `/backlog` resolve command similarly accepts an optional note, writing `resolution_note` the same way, so both surfaces behave identically.

### 5.2 The reply (mod bot, in `reconcileService.ts`)

On a `report_status` notification (or during startup reconcile), for the changed report the listener already flips the forum tag. It then evaluates the resolution reply:

**Post the templated reply iff all hold:**
- `status = 'resolved'`, and
- `source ∈ { 'bug_forum', 'playtest' }`, and
- `thread_id IS NOT NULL`, and
- `resolution_notified_at IS NULL`.

When it posts, it stamps `resolution_notified_at = now()` (a non-status write, so no re-fire). The stamp makes the reply exactly-once across `NOTIFY` duplicates and reconcile passes.

**Template** (posted in the origin thread, pinging the report author when `author_id` is known):

```
✅ Fixed in an upcoming build — thanks for the report, <@author_id>!
<resolution_note, if present>
```

"Upcoming build" deliberately hedges the Roblox gap between *code fixed* (report `resolved`) and *published to players*.

## 6. Security & non-forum handling (security-conscious default)

`security`-sourced and `manual` reports receive **status + tag changes only — never an auto-reply**. This is enforced structurally by the §5.2 guard (`source ∈ {bug_forum, playtest}` and `thread_id NOT NULL`; security is a text-channel message with no thread, manual has neither). Rationale: never auto-announce "fixed" against a security/exploit report — it tips off exploiters and breaks the discretion those reports depend on. This is the same no-leakage constraint that governs the (separately specced) verified-user Q&A.

## 7. Repo linkage / workflow (human side — no new tooling)

- **Commit convention.** Fixes reference the report id, e.g. `fix(overlord): solid beam-down landing (report #42)`. The NOPAS repo history links to the backlog without storing it.
- **Working sessions.** Claude pulls context via `backlog_get`, sets `in_progress` when work starts, fixes in the NOPAS repo, then `backlog_set_status(42, 'resolved', note: '…')` on completion. Triage (`new` → `triaged`, priority, `duplicate`/`wont_fix`) stays the user's call; Claude drives status only during fix work.

## 8. Testing (TDD, pg-mem; plpgsql triggers stay in the skip-in-tests migration)

- **Ingest:** a playtest-forum `threadCreate` creates a `source='playtest'` report; a duplicate thread id is deduped.
- **Round-trip happy path:** resolving a `bug_forum`/`playtest` report with a thread posts the reply **once** and stamps `resolution_notified_at`; the note appears in the body.
- **Idempotency:** a second `NOTIFY` for the same id, and a startup reconcile pass, do **not** re-post (stamp guard).
- **Reopen → re-resolve:** moving a resolved report to another status clears the stamp (rearm trigger) so a subsequent re-resolve replies again.
- **Silent paths:** resolving a `security` or `manual` report posts **no** reply; the tag still flips.
- **MCP:** `backlog_set_status` with `note` persists `resolution_note` + a `report_notes` row on resolve, and records only a note (no `resolution_note`) for non-resolved statuses; the `source` filter accepts `playtest`; guild scoping intact.

## 9. Rollout (ordered — migration before MCP resolve-with-note is used)

1. Land migration `005` + ingest/listener changes in `collapsedstargames-bot`; merge to `master` → Railway deploy applies `005` to Neon and picks up the new ingest/reply logic.
2. Create the `#playtest-feedback` forum, provision its lifecycle tags (direct REST PATCH, as with `#bug-reports` — the MCP `edit_channel` only does name/topic), and set `guild_config.playtestForumChannelId`.
3. Land the MCP `backlog_set_status` `note` param + `playtest` source filter; rebuild `dist`; user restarts Claude Code.
4. Verify live: post a `#playtest-feedback` thread → a `playtest` report appears; resolve a bug report with a note → one in-thread reply pinging the author; resolve a `security` report → tag flips, no reply.

## 10. Out of scope (YAGNI)

- **`wont_fix` / `duplicate` closure replies** — the same round-trip could tell a reporter "we won't change this" or "tracked in #N". Deferred; the resolved reply is the focused first step.
- **Commit-driven CI automation** (Approach C) — parsing `report #N` on push to auto-resolve. Needs an exposed write endpoint; revisit only if manual triage outgrows the session workflow.
- **Verified-user Q&A knowledge base** — the separately-planned Spec 2.
- **Two-way GitHub Issues sync** and converting `#playtester-hub` to a forum.

## 11. Addendum — as-built refinements (2026-07-15)

Implemented and reviewed; these refine §3/§5 without changing the design's intent:

- **Reply is dedup-guarded, "effectively once."** True exactly-once across Discord + DB is impossible without an idempotency key. `maybePostResolution` now calls `hasResolutionReply(threadId)` before posting: if the bot's `✅ Fixed…` reply is already in the thread (a prior pass posted it but a DB drop lost the stamp), it skips the post and just (re)stamps. This closes the sequential post-succeeds/stamp-fails window. A narrow **concurrent** window remains (a NOTIFY overlapping a reconnect sweep for the same id) — a pre-existing reconcile-architecture property; follow-up is a per-report-id in-flight guard in `reconcileService`.
- **Migration `005` backfills `resolution_notified_at = now()`** for all pre-existing resolved rows, so the first deploy's startup reconcile does **not** retroactively reply-and-ping every historically-resolved thread.
- **Rearm trigger (`006`) also nulls `resolution_note`** when a report leaves `resolved`, so a reopen → re-resolve-*without*-note can't re-post a stale note (the note text is preserved in `report_notes`).
- **`RESOLUTION_REPLY_PREFIX`** is a single exported constant used both to build the reply and to detect it — no template/detector drift.
- **Deferred (per decision):** the `/backlog` slash-command note field. The MCP `backlog_set_status` `note` is the resolving surface; `reportsRepo.setStatus` already supports the note, so exposing it on the slash command later is trivial.
