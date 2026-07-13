# Round 2 — Report Backlog: Persistence + Auto-Ingest (Design Spec)

**Date:** 2026-07-13
**Status:** Approved design, pending implementation plan
**Scope:** Two repos — `collapsedstargames-bot` (always-on mod bot, DB owner) and `collapsedstargames-mcp` (assistant bot). Shared Neon Postgres.

## 1. Purpose

Turn Discord reports into a **persistent, status-tracked backlog** that is both:

- a **living issue tracker** — reports carry a status through their lifecycle, mirrored onto forum tags; and
- a **queryable feed** — the assistant bot (MCP) can read and update the same backlog directly.

Today reports live only as Discord messages/threads with no persistence, no status, and no way for the assistant to query them. Round 2 fixes that. It builds on Phase 1 (the live mod bot) and the Round 1 content/triage MCP (the assistant bot, 14 REST tools).

Guild: `1512237266800742570` (NOPAS).

## 2. Architecture at a glance

```
 #bug-reports (forum)   #security-and-exploits      MCP tools / slash commands
        │ threadCreate         │ messageCreate                │ writes
        ▼                      ▼                              ▼
   ┌──────────────────────────────────────┐        ┌──────────────────────┐
   │  Mod bot (always-on gateway)          │        │  reports / report_   │
   │   ingest → reportsRepo.ingest()  ─────┼───────▶│  notes  (Neon)       │
   │   LISTEN report_status  ◀─────────────┼── NOTIFY (Postgres trigger)   │
   │   reconcileReport() → apply forum tag │        └──────────┬───────────┘
   └──────────────────────────────────────┘                   │ read/write
                                                    ┌──────────▼───────────┐
                                                    │ Assistant bot (MCP)  │
                                                    │  backlog_* tools      │
                                                    └──────────────────────┘
```

**Ownership split:**

- The **mod bot** owns the DB schema/migrations, all auto-ingest (it has the always-on gateway connection), and is the **sole applier of forum tags**.
- The **MCP** gains its first non-REST capability: a thin `pg` layer to read/write the shared backlog. It never touches forum tags for the backlog — it only writes the DB and lets the mod bot mirror. This keeps its trust boundary minimal (DB read/write, no new Discord side-effects).
- The **shared `reports` table + the status→tag name map** are the entire contract between the two repos. There is no direct cross-repo coupling beyond the schema.

**Approach B (chosen) — central tag-writer via Postgres LISTEN/NOTIFY.** A DB trigger fires `NOTIFY` on any status change, regardless of which app wrote it; the always-on bot listens and is the single authority that mutates Discord forum tags. A startup reconcile is the safety net for any notification missed while the bot was down. (Rejected: dual-writer — duplicated tag logic + two Discord writers; polling — lag + wasted queries.)

## 3. Data model

New migration `002_reports.sql` in the mod bot (the DB owner). Two tables.

### `reports` — one row per backlog item

| column | type | notes |
|---|---|---|
| `id` | BIGSERIAL PRIMARY KEY | backlog item id, used everywhere |
| `guild_id` | TEXT NOT NULL | |
| `source` | TEXT NOT NULL | `bug_forum` \| `security` \| `manual` |
| `source_ref` | TEXT | forum thread id / origin message id / NULL for manual |
| `thread_id` | TEXT | forum thread id — tag-mirroring target (bug_forum only) |
| `title` | TEXT NOT NULL | forum post title, or first line of a security/manual report |
| `body` | TEXT | full report text |
| `author_id` | TEXT | reporter's Discord user id (NULL for manual) |
| `status` | TEXT NOT NULL DEFAULT `'new'` | `new`\|`triaged`\|`in_progress`\|`resolved`\|`duplicate`\|`wont_fix` |
| `priority` | TEXT NOT NULL DEFAULT `'normal'` | `low`\|`normal`\|`high` (security defaults `high`) |
| `duplicate_of` | BIGINT REFERENCES reports(id) | set when merged into another item |
| `tag_synced_status` | TEXT | last status successfully mirrored to the forum; reconcile fixes drift |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Constraints / indexes:

- `UNIQUE (guild_id, source, source_ref)` — idempotent ingest; re-seeing a thread/message is a no-op via `ON CONFLICT DO NOTHING`. Manual items have `source_ref = NULL` and never collide (NULLs are distinct in a UNIQUE index).
- `INDEX (guild_id, status)`, `INDEX (guild_id, source)`.

### `report_notes` — activity log / triage trail

| column | type | notes |
|---|---|---|
| `id` | BIGSERIAL PRIMARY KEY | |
| `report_id` | BIGINT REFERENCES reports(id) ON DELETE CASCADE | |
| `author_id` | TEXT NOT NULL | Discord user id, `'assistant'`, or `'system'` |
| `kind` | TEXT NOT NULL DEFAULT `'note'` | `note` \| `status_change` |
| `body` | TEXT NOT NULL | free text, or e.g. `"new → triaged"` |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Every status change appends a `status_change` row, so each item carries its own audit trail without a separate history table.

## 4. Ingest (mod bot)

New ingest module wired into `router.ts`. Three entry points funnel to one idempotent `reportsRepo.ingest()`.

**Bug forum → `threadCreate`.** New thread under #bug-reports (`parent_id = 1512241971710660879`): fetch starter message; insert `bug_forum` item — `title` = thread name, `body` = starter message, `author_id` = thread owner, `thread_id` = thread id, status `new`, priority `normal`. The `new` tag is mirrored onto the thread via the standard NOTIFY path (§5).

**Security channel → `messageCreate`.** New **top-level, non-reply, non-bot** message in #security-and-exploits (`1512242984069103696`): insert `security` item — `title` = first line (truncated), `body` = full content, `author_id` = sender, `source_ref` = message id, no `thread_id`, priority `high`. Reply messages and bot messages are ignored (the noise filter). Follow-on (not built now): if still too noisy, gate behind a 🐛 reaction.

**Manual / assistant-created.** No event. Created via MCP `backlog_add` or `/backlog add`. `source = manual`, `thread_id = NULL` (nothing to tag).

**Startup reconcile (catch-up).** On `ready`, scan active threads under #bug-reports and ingest any not already present — covers posts created while the bot was offline. The forum is empty today, so this is a safety net, not a historical backfill.

**Intents.** No new privileged intents: `MessageContent` (already used by auto-filter) and `Guilds` (thread events) suffice. The starter-message fetch is a REST call guarded like the existing `sendToChannel` helper.

## 5. Status → forum tag mirroring (approach B)

**Canonical forum tag set** (created once on #bug-reports, which currently has `available_tags: []`): `new`, `triaged`, `in-progress`, `resolved`, `duplicate`, `wont-fix`. Provisioning `available_tags` needs Manage Channels on the forum, which the **MCP has** (`edit_channel`) — so tags are provisioned once via the MCP as a setup step. The mod bot only ever *applies existing* tags (Manage Threads, which it has); it is never given forum-editing responsibility.

**Write path (single authority):**

1. Item creation (ingest / `backlog_add`) inserts a row; any status change (MCP tool or `/backlog status`) does `UPDATE reports SET status=…, updated_at=now()` and appends a `status_change` note.
2. A Postgres trigger `AFTER INSERT OR UPDATE OF status ON reports … EXECUTE pg_notify('report_status', NEW.id::text)` fires regardless of which app wrote it. Firing on INSERT means a freshly-ingested bug-forum item (`tag_synced_status = NULL ≠ 'new'`) gets its `new` tag applied immediately by the same path; manual/security items have no `thread_id` and are skipped. Enforcing NOTIFY at the DB means neither repo must remember to emit it — the trigger *is* the contract.
3. The mod bot holds a dedicated `LISTEN report_status` connection. On notification it loads the row and calls `reconcileReport(row)`: if `thread_id` is set and `tag_synced_status ≠ status`, look up the forum's `available_tags` by **name**, swap the thread's applied status-tag to match, and set `tag_synced_status = status`. Items without a `thread_id` (security/manual) are skipped cleanly.

**Reconcile as the safety net.** The same `reconcileReport` runs on startup across every row where `tag_synced_status IS DISTINCT FROM status`, self-healing any NOTIFY missed while the bot was down. NOTIFY is the fast path; startup reconcile is the guarantee.

**Status → tag name map** (the one piece of duplicated knowledge, documented as the contract):

| status | forum tag name |
|---|---|
| `new` | `new` |
| `triaged` | `triaged` |
| `in_progress` | `in-progress` |
| `resolved` | `resolved` |
| `duplicate` | `duplicate` |
| `wont_fix` | `wont-fix` |

## 6. Triage surfaces

Both surfaces write the **same** `reports`/`report_notes` tables, so the NOTIFY→tag path fires no matter which is used.

### A. Assistant bot (MCP) — new backlog tools

The MCP gains a thin `pg` DB layer (`DATABASE_URL` in its gitignored `.env` — its first non-REST capability). Tools are guild-scoped like the existing 14.

| tool | purpose |
|---|---|
| `backlog_list` | filter by status/source/priority, newest first, paginated |
| `backlog_get` | one item with its full note trail |
| `backlog_add` | create a `manual` item (title, body, priority) |
| `backlog_set_status` | change status → fires the trigger → mod bot mirrors the tag |
| `backlog_note` | append a free-text note |
| `backlog_merge` | mark item `duplicate` of another (`status=duplicate`, `duplicate_of`) |

The MCP never touches forum tags for the backlog. Its existing `set_thread_tags` remains for live triage, unrelated to backlog status.

### B. Mod-bot slash commands

Discord-native, gated on `ModerateMembers` like the existing mod commands, replies ephemeral. Registered per-guild (instant) via the existing `registerCommands.ts` pattern.

- `/backlog list [status]` — compact list (id, title, status, priority)
- `/backlog view <id>` — full item + recent notes
- `/backlog status <id> <state>` — change status (fires the same trigger)
- `/backlog note <id> <text>` — append a note
- `/backlog add <title> [priority]` — manual item

## 7. Error handling — degrade, never crash

- **Ingest failures** (starter-message fetch, DB down): logged via existing `ctx.log.error`, wrapped in the same try/catch as every current `router.ts` handler. A missed ingest is recovered by startup reconcile.
- **Duplicate ingest**: silent no-op via `ON CONFLICT DO NOTHING` — not an error.
- **Tag mirror failures** (thread archived/deleted, tag missing, Discord 403): `reconcileReport` catches, logs, leaves `tag_synced_status` unchanged so the next startup retries. Deleted threads are skipped. Respects the pinning/perms gotchas in `discord-server-ops`; mirroring failure never blocks the DB write.
- **LISTEN connection drop**: dedicated client with a reconnect handler; on reconnect, run the startup reconcile once to catch anything missed.
- **MCP DB errors**: tools return a clear error string (matching the existing `403/50001`-style messages), never a raw stack.
- **Invalid input** (bad id, unknown status): validated before write; both surfaces reply with a friendly message.

## 8. Testing

Mirrors the existing suites (vitest + pg-mem; mod bot ~37 tests, MCP ~46 tests).

**Mod bot:**
- `reportsRepo` against pg-mem — ingest idempotency, status update + note append, filters.
- `reconcileReport` logic — drift detection, name→id tag lookup, archived/missing-tag skips — with a faked Discord tag-applier.
- Security-channel noise filter — reply/bot rejection.
- Startup reconcile — missing-thread ingest + drift heal.

**MCP:**
- Each backlog tool against pg-mem — guild-scope guardrail, filters, status write, merge, note; error paths (bad id, DB error). Matches the existing per-tool test style.

**Shared contract:**
- A test asserting the status→tag name map is exhaustive over the status enum (catches drift if a status is added).

**Testing caveat (§5).** `pg-mem` has limited trigger / `pg_notify` support. `reconcileReport` is unit-tested directly with a DB row as input (the real logic); the trigger→LISTEN wire is validated by the startup-reconcile path plus a manual smoke test against real Neon. Called out again in the implementation plan.

## 9. Rollout

1. Apply migration `002_reports.sql` on mod-bot deploy (Railway auto-deploy from `master`).
2. Provision the 6 forum tags on #bug-reports via the MCP (`edit_channel`).
3. Add `DATABASE_URL` (Neon, `?sslmode=require`) to the MCP `.env`.
4. Register the new `/backlog` slash commands (per-guild).
5. No changes to Phase 1 behavior.

## 10. Out of scope (follow-ons)

- Reaction-gated security ingest (only if top-level filter proves noisy).
- Historical backfill (forum is empty today).
- Round 3: scheduled in-game stat/highlight posts (gated on Phase 3 telemetry).
- Bidirectional forum-tag sync (mods editing tags in Discord → DB). Chosen model is one-way DB→forum.
