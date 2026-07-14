# Backlog Purge — Targeted (per-id) Mode (Design Spec)

**Date:** 2026-07-14
**Status:** Approved design, pending implementation plan
**Scope:** One repo — `collapsedstargames-mcp` (assistant bot). A single param addition to the existing `backlog_purge` tool. No DB migration, no mod-bot change, no new tool.
**Amends:** [Backlog Soft-Delete + Lifecycle + Recovery](2026-07-14-backlog-soft-delete-design.md) §5.3. That spec's principles, data model, FK/CASCADE handling, and the 45-day reaper are unchanged and assumed here.

Guild: `1512237266800742570` (NOPAS).

## 1. Purpose

The soft-delete spec made `backlog_purge` **bulk-by-age only**: candidates are every soft-deleted row older than `olderThanDays`. There is no way to hard-delete one specific known item. To purge a single fresh row (e.g. a test artifact) you must pass `olderThanDays: 0`, which selects **every** soft-deleted row in the guild — safe only when that row happens to be the sole candidate. A smoke test on 2026-07-14 confirmed the hazard: purging test item #7 required `olderThanDays:0`, which would have caught any other soft-deleted row too.

This adds a **safe targeted purge**: destroy exactly the id(s) you name, with zero chance of catching others, while preserving the lifecycle's core guarantee — you can never hard-delete a *live* row in one shot.

## 2. Design principles (inherited + reaffirmed)

- **Soft first, hard last.** Targeted purge refuses any id that is still live (`deleted_at IS NULL`). You must soft-delete first; the reversible window is never skippable.
- **No surprise destruction.** Targeted mode keeps the dry-run/confirm gate: default is a dry-run that deletes nothing; only `confirm:true` destroys.
- **Fail-closed.** If any named id does not qualify, the whole call is rejected and nothing is deleted — "I meant exactly these" is honored literally.
- **MCP stays DB-only / guild-scoped.** As in the parent spec: no Discord side effects, every query filtered by `guild_id`.

## 3. Tool change (`collapsedstargames-mcp`, `src/tools/backlog.ts`)

Modify the existing `backlog_purge`; **no new tool** — count stays 23.

### 3.1 Signature

```
backlog_purge({ ids?: number[], olderThanDays = 30, confirm = false })
```

`ids` is optional. `olderThanDays` and `confirm` are unchanged.

### 3.2 Mode selection

- `ids` **absent or empty (`[]`)** → **age mode**. Exactly today's behavior; `olderThanDays` drives candidate selection.
- `ids` **present and non-empty** → **targeted mode**. Candidate set is exactly those ids. `olderThanDays` is **ignored** — targeted means "these rows, regardless of age."

An empty array deliberately falls through to age mode rather than erroring, so a caller that computes `ids` and gets none simply behaves like an untargeted purge.

### 3.3 Validation (targeted mode, fail-closed)

Runs in **both** dry-run and confirm, before any delete. Resolve each id against the guild. An id is **invalid** if it is:

- **not found** (no such report), or
- **another guild's** row (guild-scoped lookup misses it → treated as not found), or
- **live** (`deleted_at IS NULL`).

If **any** id is invalid, delete nothing and return a rejection listing every bad id with its reason:

```
REJECTED — nothing purged. 2 id(s) cannot be purged:
  #8: live — soft-delete it first
  #99: not found
```

Only when **all** named ids resolve to soft-deleted rows in this guild does the call proceed.

### 3.4 Dry-run (default, `confirm` falsy)

After validation passes, deletes nothing. Echoes the exact target set using the existing per-candidate line format, so age mode and targeted mode read identically:

```
DRY RUN — would purge 2 item(s). Re-run with confirm:true to delete.
  #7 [new] [SMOKE TEST] lifecycle verification …
  #12 [triaged] …
```

### 3.5 Confirmed (`confirm:true`)

After validation passes, the same transaction as the parent spec's bulk purge (§5.3), scoped to the id set:

1. `UPDATE reports SET duplicate_of = NULL WHERE guild_id = $1 AND duplicate_of = ANY($ids)` — clears the RESTRICT self-FK from any row pointing into the purge set.
2. `DELETE FROM reports WHERE id = ANY($ids) AND guild_id = $1` — `report_notes` CASCADE away.

Returns `Purged N item(s).`

## 4. What is explicitly unchanged

- Age-mode selection, the dry-run/confirm gate, the candidate line format, and the empty-set message.
- Guild scoping on every query.
- The 45-day retention reaper in `collapsedstargames-bot` (untouched — it is age-based by nature).
- `backlog_delete`, `backlog_restore`, `backlog_list` (`includeDeleted`), `backlog_get`.
- The `reports` schema — **no migration**.

## 5. Edge cases

- **`duplicate_of` RESTRICT FK.** Same hazard and handling as the parent §5.3/§8: a live or soft-deleted row may point at a targeted id; step 3.5.1 nulls those pointers first, or the `DELETE` fails.
- **Mixed valid/invalid list.** Fail-closed (§3.3): one live or unknown id rejects the entire call; no partial purge.
- **`ids` + `olderThanDays` both supplied.** `ids` wins; the age bound is ignored (§3.2). No error.
- **Empty `ids: []`.** Falls through to age mode (§3.2).
- **Duplicate ids in the list.** De-duplicated before validation/delete; `ANY($ids)` makes repeats harmless either way.
- **Auto-ingest resurrection.** Unchanged from parent §8: purging a `bug_forum` row frees its `(guild_id, source, source_ref)` slot, so ingest may re-add it later if the thread still exists. Targeted mode does not alter this.

## 6. Testing (adds to parent §9 MCP suite; TDD against pg-mem)

- Targeted **dry-run** lists the named ids and deletes nothing.
- Targeted **confirm** deletes only the named ids and leaves other soft-deleted rows intact.
- **Fail-closed:** a list containing a **live** id is rejected, deletes nothing, and names the live id; likewise for a **not-found** id and an **other-guild** id.
- **`duplicate_of`** pointer into a targeted id is nulled; the delete succeeds.
- **Empty `ids: []`** behaves as age mode (delegates to the existing age path).
- **Age-mode regression:** existing age-mode tests still pass unchanged.

## 7. Rollout

Single repo, no migration:

1. Land the `backlog_purge` change (+ tests) in `collapsedstargames-mcp`; rebuild `dist`.
2. User restarts Claude Code to respawn the MCP.
3. Verify against live tools: soft-delete two throwaway items → `backlog_purge({ ids:[a,b] })` dry-run lists exactly those → add a live id and confirm the call is rejected → `backlog_purge({ ids:[a,b], confirm:true })` deletes only those, other soft-deleted rows untouched.

## 8. Out of scope (YAGNI)

- No new `backlog_purge_one` tool (considered; the `ids[]` param subsumes single-id and covers small batches with one code path).
- No skip-and-proceed / partial-purge mode (fail-closed chosen deliberately).
- No change to the age-based on-demand default (30d) or the reaper floor (45d).
- No per-id targeting in the mod-bot reaper — it stays purely age-based.
