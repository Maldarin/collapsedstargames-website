# Backlog — Playtest Ingest + Fix Round-Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a playtest-feedback forum ingest source and a fix-side resolve round-trip (a templated in-thread reply + optional note) to the existing Neon-backed backlog, driven by the current `NOTIFY` mirror.

**Architecture:** Neon stays the single source of truth. The mod bot (`collapsedstargames-bot`) owns the migration and remains the *sole* Discord-writer: its existing `report_status` listener flips the forum tag and now also posts a one-time resolution reply. The MCP (`collapsedstargames-mcp`) stays DB-only; its `backlog_set_status` tool gains an optional `note`. Security/manual reports never get a reply — enforced structurally by a source + `thread_id` guard.

**Tech Stack:** TypeScript (ESM, `.js` import suffixes), `pg`, `discord.js` v14, `vitest`, `pg-mem` for DB tests, Postgres/Neon in prod.

## Global Constraints

- **Guild:** `1512237266800742570` (NOPAS). Every query stays `guild_id`-scoped.
- **Two repos:** mod bot at `D:\Projects\collapsedstargames-bot`, MCP at `D:\Projects\collapsedstargames-mcp`. A task names its repo; run its commands from that repo root.
- **Build AND test:** vitest does **not** typecheck. After each repo's tests pass, also run `npm run build` (tsc) before considering a task done — a green test suite can still hide a type error.
- **pg-mem cannot parse plpgsql.** Trigger/function migrations live in their own `*.sql` files that the test harness skips (existing: `_report_notify.sql`; new: `_report_rearm.sql`). Column-only migrations are applied in tests.
- **MCP tool count stays 23** — this modifies `backlog_set_status` and `backlog_list`; it adds no new tool.
- **Reply template (verbatim).** With author: `✅ Fixed in an upcoming build — thanks for the report, <@AUTHOR_ID>!`. Without a known author, drop the `, <@…>` so it reads `…thanks for the report!`. If a `resolution_note` is present, append it on a new line.
- **Reply guard (all must hold):** `status = 'resolved'` AND `source ∈ {bug_forum, playtest}` AND `thread_id` present AND `resolution_notified_at IS NULL`. Security and manual reports therefore never get a reply.
- **Source of truth for status transitions:** MCP tools / mod-bot commands during working sessions. No CI/webhook path.

---

### Task 1: Migration — resolution columns + rearm trigger (mod bot)

**Files:**
- Create: `src/db/migrations/005_report_resolution.sql`
- Create: `src/db/migrations/006_report_rearm.sql`
- Modify: `tests/db/memDb.ts` (extend the skip predicate)
- Test: `tests/db/reportsSchema.test.ts`

**Interfaces:**
- Produces: `reports.resolution_note TEXT NULL`, `reports.resolution_notified_at TIMESTAMPTZ NULL`, and a `BEFORE UPDATE OF status` trigger `reports_rearm_resolution_trg` that nulls `resolution_notified_at` whenever status leaves `'resolved'`.

- [ ] **Step 1: Write the failing test** — append to `tests/db/reportsSchema.test.ts`:

```ts
it("has the resolution columns after migration", async () => {
  const pool = await freshPool();
  // information_schema is reliable in pg-mem for column presence.
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='reports' AND column_name IN ('resolution_note','resolution_notified_at')`
  );
  const cols = r.rows.map((x: any) => x.column_name).sort();
  expect(cols).toEqual(["resolution_note", "resolution_notified_at"]);
});
```

(If `reportsSchema.test.ts` doesn't already import `freshPool`, add `import { freshPool } from "./memDb.js";` at the top — check first; it likely uses it already.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- reportsSchema`
Expected: FAIL — the two columns don't exist yet.

- [ ] **Step 3: Create migration `005_report_resolution.sql`** (columns only — pg-mem-safe, applied in tests):

```sql
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_note TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_notified_at TIMESTAMPTZ;
```

- [ ] **Step 4: Create migration `006_report_rearm.sql`** (plpgsql — skipped in tests, verified on Neon):

```sql
-- Re-arm the resolution reply if a report leaves 'resolved' (reopen), so a
-- genuine re-resolve replies again. Surface-agnostic: fires no matter which
-- code path writes status (MCP, slash command, future paths).
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

- [ ] **Step 5: Extend the test skip predicate** in `tests/db/memDb.ts` so pg-mem skips the new plpgsql file:

```ts
export const TEST_MIGRATION_OPTS = {
  skip: (f: string) => f.endsWith("_report_notify.sql") || f.endsWith("_report_rearm.sql"),
};
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- reportsSchema`
Expected: PASS.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: tsc exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/db/migrations/005_report_resolution.sql src/db/migrations/006_report_rearm.sql tests/db/memDb.ts tests/db/reportsSchema.test.ts
git commit -m "feat(reports): add resolution_note/resolution_notified_at columns + rearm trigger"
```

---

### Task 2: reportsRepo — resolution fields, setStatus note, markResolutionNotified, driftRows (mod bot)

**Files:**
- Modify: `src/db/repositories/reportsRepo.ts`
- Test: `tests/db/reportsRepo.test.ts`

**Interfaces:**
- Consumes: the columns from Task 1.
- Produces:
  - `ReportRow` gains `resolutionNote: string | null; resolutionNotifiedAt: Date | null;`
  - `IngestInput.source` widens to `"bug_forum" | "security" | "manual" | "playtest"`.
  - `setStatus(guildId, id, status, actorId, resolutionNote?)` — when `resolutionNote` is provided it inserts a `kind:'note'` row; when `status === 'resolved'` it also writes `reports.resolution_note`.
  - `markResolutionNotified(id: number): Promise<void>` — sets `resolution_notified_at = now()`.
  - `driftRows()` also returns resolved forum reports whose reply is still pending.

- [ ] **Step 1: Write the failing tests** — add to `tests/db/reportsRepo.test.ts` (follow the file's existing `freshPool()` setup):

```ts
it("setStatus with a resolution note persists resolution_note and a note row on resolve", async () => {
  const pool = await freshPool();
  const repo = reportsRepo(pool);
  const id = await repo.ingest({
    guildId: "g1", source: "bug_forum", sourceRef: "t1", threadId: "t1",
    title: "bug", body: "", authorId: "u1", priority: "normal",
  });
  const res = await repo.setStatus("g1", id!, "resolved", "assistant", "landing is solid now");
  expect(res.ok).toBe(true);
  const row = await pool.query("SELECT resolution_note FROM reports WHERE id=$1", [id]);
  expect(row.rows[0].resolution_note).toBe("landing is solid now");
  const got = await repo.get("g1", id!);
  expect(got!.notes.some((n) => n.kind === "note" && n.body === "landing is solid now")).toBe(true);
  expect(got!.notes.some((n) => n.kind === "status_change")).toBe(true);
});

it("setStatus with a note on a non-resolved status records a note but no resolution_note", async () => {
  const pool = await freshPool();
  const repo = reportsRepo(pool);
  const id = await repo.ingest({
    guildId: "g1", source: "bug_forum", sourceRef: "t2", threadId: "t2",
    title: "bug", body: "", authorId: "u1", priority: "normal",
  });
  await repo.setStatus("g1", id!, "in_progress", "assistant", "on it");
  const row = await pool.query("SELECT resolution_note FROM reports WHERE id=$1", [id]);
  expect(row.rows[0].resolution_note).toBeNull();
});

it("markResolutionNotified stamps resolution_notified_at", async () => {
  const pool = await freshPool();
  const repo = reportsRepo(pool);
  const id = await repo.ingest({
    guildId: "g1", source: "playtest", sourceRef: "t3", threadId: "t3",
    title: "fb", body: "", authorId: "u1", priority: "normal",
  });
  await repo.markResolutionNotified(id!);
  const row = await pool.query("SELECT resolution_notified_at FROM reports WHERE id=$1", [id]);
  expect(row.rows[0].resolution_notified_at).not.toBeNull();
});

it("driftRows returns a resolved forum report whose reply is still pending", async () => {
  const pool = await freshPool();
  const repo = reportsRepo(pool);
  const id = await repo.ingest({
    guildId: "g1", source: "bug_forum", sourceRef: "t4", threadId: "t4",
    title: "bug", body: "", authorId: "u1", priority: "normal",
  });
  // Simulate: tag already synced to 'resolved', but reply not yet sent.
  await pool.query("UPDATE reports SET status='resolved', tag_synced_status='resolved' WHERE id=$1", [id]);
  const drift = await repo.driftRows();
  expect(drift.map((r) => r.id)).toContain(id);
});

it("driftRows excludes a resolved forum report already notified", async () => {
  const pool = await freshPool();
  const repo = reportsRepo(pool);
  const id = await repo.ingest({
    guildId: "g1", source: "bug_forum", sourceRef: "t5", threadId: "t5",
    title: "bug", body: "", authorId: "u1", priority: "normal",
  });
  await pool.query(
    "UPDATE reports SET status='resolved', tag_synced_status='resolved', resolution_notified_at=now() WHERE id=$1",
    [id]
  );
  const drift = await repo.driftRows();
  expect(drift.map((r) => r.id)).not.toContain(id);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- reportsRepo`
Expected: FAIL — `setStatus` takes 4 args / `markResolutionNotified` undefined / driftRows narrower.

- [ ] **Step 3: Implement the changes** in `src/db/repositories/reportsRepo.ts`:

Widen the source union:
```ts
export interface IngestInput {
  guildId: string; source: "bug_forum" | "security" | "manual" | "playtest";
  sourceRef: string | null; threadId: string | null;
  title: string; body: string; authorId: string | null; priority: ReportPriority;
}
```

Add fields to `ReportRow` (after `tagSyncedStatus`):
```ts
  duplicateOf: number | null; tagSyncedStatus: string | null;
  resolutionNote: string | null; resolutionNotifiedAt: Date | null;
  createdAt: Date; updatedAt: Date;
```

Extend `mapRow` (add two lines):
```ts
    duplicateOf: x.duplicate_of === null ? null : Number(x.duplicate_of),
    tagSyncedStatus: x.tag_synced_status,
    resolutionNote: x.resolution_note ?? null,
    resolutionNotifiedAt: x.resolution_notified_at ?? null,
```

Replace `setStatus` signature + body so it threads the optional note:
```ts
    async setStatus(guildId: string, id: number, status: string, actorId: string, resolutionNote?: string): Promise<{ ok: boolean; from?: string }> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const cur = await client.query("SELECT status FROM reports WHERE guild_id=$1 AND id=$2", [guildId, id]);
        if (!cur.rowCount) { await client.query("ROLLBACK"); return { ok: false }; }
        const from = cur.rows[0].status as string;
        if (from === status) { await client.query("ROLLBACK"); return { ok: false }; }
        // On resolve WITH a note, persist resolution_note in the same UPDATE so the
        // single NOTIFY carries a fully-populated row for the listener's reply.
        if (status === "resolved" && resolutionNote != null) {
          await client.query(
            "UPDATE reports SET status=$1, resolution_note=$2, updated_at=now() WHERE guild_id=$3 AND id=$4",
            [status, resolutionNote, guildId, id]
          );
        } else {
          await client.query("UPDATE reports SET status=$1, updated_at=now() WHERE guild_id=$2 AND id=$3", [status, guildId, id]);
        }
        await client.query(
          "INSERT INTO report_notes (report_id, author_id, kind, body) VALUES ($1,$2,'status_change',$3)",
          [id, actorId, `${from} → ${status}`]
        );
        if (resolutionNote != null) {
          await client.query(
            "INSERT INTO report_notes (report_id, author_id, kind, body) VALUES ($1,$2,'note',$3)",
            [id, actorId, resolutionNote]
          );
        }
        await client.query("COMMIT");
        return { ok: true, from };
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
```

Add `markResolutionNotified` (next to `markSynced`):
```ts
    async markResolutionNotified(id: number): Promise<void> {
      await pool.query("UPDATE reports SET resolution_notified_at=now() WHERE id=$1", [id]);
    },
```

Widen `driftRows` (keep the pg-mem-safe form — no `IS DISTINCT FROM`):
```ts
    async driftRows(): Promise<ReportRow[]> {
      const r = await pool.query(
        `SELECT * FROM reports
         WHERE thread_id IS NOT NULL AND (
           (tag_synced_status IS NULL OR tag_synced_status <> status)
           OR (status='resolved' AND resolution_notified_at IS NULL AND source IN ('bug_forum','playtest'))
         )`
      );
      return r.rows.map(mapRow);
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- reportsRepo`
Expected: PASS (existing reportsRepo tests still green).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: tsc exits 0. (If any caller of `setStatus` or consumer of `ReportRow` fails to typecheck, fix per Tasks 4/5 — but those are separate files touched later; a bare column add shouldn't break them.)

- [ ] **Step 6: Commit**

```bash
git add src/db/repositories/reportsRepo.ts tests/db/reportsRepo.test.ts
git commit -m "feat(reports): setStatus resolution note, markResolutionNotified, reply-aware driftRows"
```

---

### Task 3: Ingest — playtest forum source (mod bot)

**Files:**
- Modify: `src/reports/ingest.ts`
- Test: `tests/reports/ingest.test.ts`

**Interfaces:**
- Consumes: `IngestInput` (source now includes `playtest`), `IncomingBugThread`.
- Produces: `playtestThreadToReport(t: IncomingBugThread, playtestForumChannelId: string): IngestInput | null`.

- [ ] **Step 1: Write the failing test** — add to `tests/reports/ingest.test.ts`:

```ts
import { playtestThreadToReport } from "../../src/reports/ingest.js";

describe("playtestThreadToReport", () => {
  const base = {
    guildId: "g1", threadId: "th1", parentId: "PLAYTEST_FORUM",
    name: "Feels grindy", starterContent: "the mid game drags", ownerId: "u9",
  };
  it("maps a thread in the playtest forum to a playtest report", () => {
    const r = playtestThreadToReport(base, "PLAYTEST_FORUM");
    expect(r).toEqual({
      guildId: "g1", source: "playtest", sourceRef: "th1", threadId: "th1",
      title: "Feels grindy", body: "the mid game drags", authorId: "u9", priority: "normal",
    });
  });
  it("ignores a thread from a different parent", () => {
    expect(playtestThreadToReport({ ...base, parentId: "OTHER" }, "PLAYTEST_FORUM")).toBeNull();
  });
  it("defaults body to empty string when there is no starter content", () => {
    const r = playtestThreadToReport({ ...base, starterContent: null }, "PLAYTEST_FORUM");
    expect(r!.body).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ingest`
Expected: FAIL — `playtestThreadToReport` is not exported.

- [ ] **Step 3: Implement** — append to `src/reports/ingest.ts`:

```ts
export function playtestThreadToReport(t: IncomingBugThread, playtestForumChannelId: string): IngestInput | null {
  if (t.parentId !== playtestForumChannelId) return null;
  return {
    guildId: t.guildId, source: "playtest", sourceRef: t.threadId, threadId: t.threadId,
    title: t.name, body: t.starterContent ?? "", authorId: t.ownerId, priority: "normal",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ingest`
Expected: PASS.

- [ ] **Step 5: Build & commit**

```bash
npm run build
git add src/reports/ingest.ts tests/reports/ingest.test.ts
git commit -m "feat(reports): playtestThreadToReport ingest mapper"
```

---

### Task 4: tagSync — resolution reply in reconcileReport (mod bot)

**Files:**
- Modify: `src/reports/tagSync.ts`
- Test: `tests/reports/tagSync.test.ts`

**Interfaces:**
- Consumes: `ReportRow` (with `resolutionNote`, `resolutionNotifiedAt`).
- Produces: `ReconcileDeps` gains `postThreadReply(threadId: string, content: string): Promise<void>` and `markResolutionNotified(id: number): Promise<void>`; `forumTagMap` becomes `(source: string) => Promise<Map<string,string>>`. `reconcileReport` posts the resolution reply exactly once per resolved episode, independent of tag-sync state.

- [ ] **Step 1: Update the test helpers** in `tests/reports/tagSync.test.ts` so the row and deps carry the new shape:

In the `row()` helper add the two fields:
```ts
  duplicateOf: null, tagSyncedStatus: "new",
  resolutionNote: null, resolutionNotifiedAt: null,
  createdAt: new Date(0), updatedAt: new Date(0),
```

In the `deps()` helper add the two new deps (and note `forumTagMap` now ignores its arg harmlessly):
```ts
    markSynced: vi.fn(async () => {}),
    postThreadReply: vi.fn(async () => {}),
    markResolutionNotified: vi.fn(async () => {}),
    isThreadGone: vi.fn(() => false),
```

- [ ] **Step 2: Write the failing tests** — add a describe block to `tests/reports/tagSync.test.ts`:

```ts
describe("reconcileReport resolution reply", () => {
  it("posts the templated reply and stamps on a resolved bug_forum report", async () => {
    const d = deps({ loadReport: vi.fn(async () => row({ status: "resolved", tagSyncedStatus: "resolved", authorId: "u1" })) });
    await reconcileReport(d, 1);
    expect(d.postThreadReply).toHaveBeenCalledWith("t1", "✅ Fixed in an upcoming build — thanks for the report, <@u1>!");
    expect(d.markResolutionNotified).toHaveBeenCalledWith(1);
  });

  it("appends the resolution note when present", async () => {
    const d = deps({ loadReport: vi.fn(async () => row({ status: "resolved", tagSyncedStatus: "resolved", authorId: "u1", resolutionNote: "landing is solid now" })) });
    await reconcileReport(d, 1);
    expect(d.postThreadReply).toHaveBeenCalledWith("t1", "✅ Fixed in an upcoming build — thanks for the report, <@u1>!\nlanding is solid now");
  });

  it("omits the mention when the author is unknown", async () => {
    const d = deps({ loadReport: vi.fn(async () => row({ status: "resolved", tagSyncedStatus: "resolved", authorId: null })) });
    await reconcileReport(d, 1);
    expect(d.postThreadReply).toHaveBeenCalledWith("t1", "✅ Fixed in an upcoming build — thanks for the report!");
  });

  it("does not reply for a security-source report even when resolved with a thread", async () => {
    const d = deps({ loadReport: vi.fn(async () => row({ source: "security", status: "resolved", tagSyncedStatus: "resolved", threadId: "t1" })) });
    await reconcileReport(d, 1);
    expect(d.postThreadReply).not.toHaveBeenCalled();
  });

  it("does not reply when already notified (idempotent)", async () => {
    const d = deps({ loadReport: vi.fn(async () => row({ status: "resolved", tagSyncedStatus: "resolved", resolutionNotifiedAt: new Date(0) })) });
    await reconcileReport(d, 1);
    expect(d.postThreadReply).not.toHaveBeenCalled();
  });

  it("does not stamp when the reply post fails (so it retries)", async () => {
    const d = deps({
      loadReport: vi.fn(async () => row({ status: "resolved", tagSyncedStatus: "resolved", authorId: "u1" })),
      postThreadReply: vi.fn(async () => { throw new Error("500"); }),
    });
    await reconcileReport(d, 1);
    expect(d.markResolutionNotified).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalled();
  });

  it("does not reply for a non-resolved status", async () => {
    const d = deps(); // default row status 'triaged'
    await reconcileReport(d, 1);
    expect(d.postThreadReply).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tagSync`
Expected: FAIL — `postThreadReply` never called (logic not written); type errors resolved by Step 1.

- [ ] **Step 4: Implement** in `src/reports/tagSync.ts`.

Extend `ReconcileDeps` (change `forumTagMap`, add two deps):
```ts
export interface ReconcileDeps {
  loadReport(id: number): Promise<ReportRow | null>;
  forumTagMap(source: string): Promise<Map<string, string>>; // tag name -> tag id, for the report's forum
  getThreadTags(threadId: string): Promise<string[]>;
  applyThreadTags(threadId: string, tagIds: string[]): Promise<void>;
  markSynced(id: number, status: string): Promise<void>;
  postThreadReply(threadId: string, content: string): Promise<void>;
  markResolutionNotified(id: number): Promise<void>;
  isThreadGone(e: unknown): boolean;
  onThreadGone(id: number): Promise<void>;
  log(e: unknown): void;
}
```

Add a helper and call it near the top of `reconcileReport`, before the tag-sync early return. Change the `forumTagMap()` call to pass the source:
```ts
async function maybePostResolution(deps: ReconcileDeps, r: ReportRow): Promise<void> {
  if (r.status !== "resolved") return;
  if (r.source !== "bug_forum" && r.source !== "playtest") return;
  if (r.resolutionNotifiedAt != null) return;
  const note = r.resolutionNote?.trim();
  const mention = r.authorId ? `, <@${r.authorId}>` : "";
  const text = `✅ Fixed in an upcoming build — thanks for the report${mention}!` + (note ? `\n${note}` : "");
  try {
    await deps.postThreadReply(r.threadId!, text); // threadId guaranteed by caller guard
    await deps.markResolutionNotified(r.id);
  } catch (e) {
    // Leave the stamp unset so a widened driftRows/reconcile pass retries later.
    deps.log(e);
  }
}

export async function reconcileReport(deps: ReconcileDeps, id: number): Promise<void> {
  const r = await deps.loadReport(id);
  if (!r || !r.threadId) return;

  // Resolution reply — independent of tag-sync state, idempotent via the stamp.
  await maybePostResolution(deps, r);

  if (r.tagSyncedStatus === r.status) return;

  const wantName = STATUS_TAG_NAME[r.status as ReportStatus];
  if (!wantName) { deps.log(`unknown status "${r.status}" on report ${id}`); return; }

  const map = await deps.forumTagMap(r.source);
  const wantId = map.get(wantName);
  // ... rest of the existing body unchanged ...
```

(Only two edits to the existing body: insert the `await maybePostResolution(deps, r);` line after the `if (!r || !r.threadId) return;` guard, and change `deps.forumTagMap()` to `deps.forumTagMap(r.source)`. Everything from `const ourTagIds` onward is unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tagSync`
Expected: PASS — the 7 new tests plus all 10 existing reconcileReport tests (the resolution helper no-ops for their non-resolved rows).

- [ ] **Step 6: Build & commit**

```bash
npm run build
git add src/reports/tagSync.ts tests/reports/tagSync.test.ts
git commit -m "feat(reports): post one-time resolution reply from reconcileReport"
```

---

### Task 5: Wiring — config field, playtest tag routing, thread reply, ingest handler (mod bot)

**Files:**
- Modify: `src/config/guildConfig.ts`
- Modify: `src/index.ts`
- Modify: `src/bot/router.ts`
- Test: `tests/config/guildConfig.test.ts`

**Interfaces:**
- Consumes: `playtestThreadToReport` (Task 3), `reconcileReport`/`ReconcileDeps` (Task 4), `reportsRepo.markResolutionNotified` (Task 2).
- Produces: `GuildConfig.playtestForumChannelId: string | null`; a listener that mirrors tags for **both** forums and posts resolution replies; a `threadCreate` handler that ingests the playtest forum too.

- [ ] **Step 1: Write the failing test** — add to `tests/config/guildConfig.test.ts`:

```ts
it("defaults playtestForumChannelId to null and round-trips a set value", () => {
  const base = DEFAULT_CONFIG("g1");
  expect(base.playtestForumChannelId).toBeNull();
  const merged = mergeConfig(base, { playtestForumChannelId: "123" });
  expect(merged.playtestForumChannelId).toBe("123");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- guildConfig`
Expected: FAIL — property doesn't exist.

- [ ] **Step 3: Add the config field** in `src/config/guildConfig.ts` — add to the `GuildConfig` interface (after `bugForumChannelId`) and to `DEFAULT_CONFIG`:

```ts
  bugForumChannelId: string | null;
  playtestForumChannelId: string | null;
  securityChannelId: string | null;
```
```ts
    bugForumChannelId: null,
    playtestForumChannelId: null,
    securityChannelId: null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- guildConfig`
Expected: PASS.

- [ ] **Step 5: Wire the listener** in `src/index.ts`. Replace the single-forum block. Change the gate to start the listener when *either* forum is configured, build a per-source tag-map router, and supply the two new deps. Replace lines ~50–80 (the `if (conf?.bugForumChannelId) { … }` block) with:

```ts
      if (conf && (conf.bugForumChannelId || conf.playtestForumChannelId)) {
        const makeLoader = (forumId: string) =>
          makeForumTagMapLoader(async () => {
            const ch = await c.channels.fetch(forumId);
            return { available_tags: (ch as any)?.availableTags?.map((t: any) => ({ id: t.id, name: t.name })) ?? [] };
          });
        const bugLoader = conf.bugForumChannelId ? makeLoader(conf.bugForumChannelId) : null;
        const playtestLoader = conf.playtestForumChannelId ? makeLoader(conf.playtestForumChannelId) : null;
        const deps: ReconcileDeps = {
          loadReport: async (id) => (await reports.get(conf.guildId, id)) ?? null,
          forumTagMap: async (source) => {
            const loader = source === "playtest" ? playtestLoader : bugLoader;
            return loader ? loader() : new Map();
          },
          getThreadTags: async (threadId) => {
            const th = await c.channels.fetch(threadId);
            return th && th.type === ChannelType.PublicThread ? [...(th.appliedTags ?? [])] : [];
          },
          applyThreadTags: async (threadId, tagIds) => {
            const th = await c.channels.fetch(threadId);
            if (th && th.type === ChannelType.PublicThread) await th.setAppliedTags(tagIds);
          },
          markSynced: (id, status) => reports.markSynced(id, status),
          postThreadReply: async (threadId, content) => {
            const th = await c.channels.fetch(threadId);
            if (th && th.type === ChannelType.PublicThread) await th.send(content);
          },
          markResolutionNotified: (id) => reports.markResolutionNotified(id),
          isThreadGone: (e) => (e as { code?: number })?.code === 10003,
          onThreadGone: (id) => reports.clearThread(id),
          log: (e) => log.error(e),
        };
        const runOne = (id: number) => reconcileReport(deps, id);
        await startReportListener(
          () => new PgClient(pgConfig(env.databaseUrl)),
          runOne,
          () => reconcileAll(reports, runOne, (e) => log.error(e)),
          (e) => log.error(e),
          (msg) => log.debug(msg)
        );
        log.info("report backlog listener started");
      }
```

- [ ] **Step 6: Wire playtest ingest** in `src/bot/router.ts`. Import the new mapper and extend the `threadCreate` handler (lines ~162–181) to route by parent forum:

```ts
import { bugThreadToReport, securityMessageToReport, playtestThreadToReport } from "../reports/ingest.js";
```
```ts
  client.on("threadCreate", async (thread) => {
    try {
      if (!thread.guildId) return;
      const conf = await cfg.get(thread.guildId);
      const isBug = conf.bugForumChannelId && thread.parentId === conf.bugForumChannelId;
      const isPlaytest = conf.playtestForumChannelId && thread.parentId === conf.playtestForumChannelId;
      if (!isBug && !isPlaytest) return;
      const starter = await thread.fetchStarterMessage().catch(() => null);
      const incoming = {
        guildId: thread.guildId, threadId: thread.id, parentId: thread.parentId,
        name: thread.name, starterContent: starter?.content ?? null,
        ownerId: thread.ownerId ?? null,
      };
      const input = isBug
        ? bugThreadToReport(incoming, conf.bugForumChannelId!)
        : playtestThreadToReport(incoming, conf.playtestForumChannelId!);
      if (input) await reports.ingest(input);
    } catch (e) { ctx.log.error(e); }
  });
```

- [ ] **Step 7: Run the full mod-bot suite**

Run: `npm test`
Expected: PASS (all suites, including the ones touched in Tasks 1–4).

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: tsc exits 0 — confirms the `index.ts`/`router.ts` wiring typechecks against the new `ReconcileDeps` and config field.

- [ ] **Step 9: Commit**

```bash
git add src/config/guildConfig.ts src/index.ts src/bot/router.ts tests/config/guildConfig.test.ts
git commit -m "feat(reports): wire playtest forum ingest + tag routing + resolution reply"
```

---

### Task 6: MCP — backlog_set_status note + playtest source filter (MCP repo)

**Files:** *(repo: `D:\Projects\collapsedstargames-mcp`)*
- Modify: `src/tools/backlog.ts`
- Test: `tests/backlog.test.ts`

**Interfaces:**
- Consumes: the `reports` schema with `resolution_note` (mirror it into the test SCHEMA).
- Produces: `setBacklogStatus(ctx, { id, status, note? })` — records a `note` row when `note` is given, and writes `resolution_note` when `status === 'resolved'`. `backlog_set_status` tool schema gains `note?: string`; `backlog_list` `source` enum gains `playtest`.

- [ ] **Step 1: Extend the test SCHEMA** in `tests/backlog.test.ts` so the resolution column exists (add to the `reports` CREATE TABLE, before `created_at`):

```ts
  duplicate_of BIGINT, tag_synced_status TEXT, deleted_at TIMESTAMPTZ,
  resolution_note TEXT, resolution_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
```

- [ ] **Step 2: Write the failing tests** — add to `tests/backlog.test.ts`:

```ts
describe("setBacklogStatus resolution note", () => {
  it("writes resolution_note and a note row when resolving with a note", async () => {
    const { ctx, db } = await ctxWith([["G", "bug", "in_progress"]]);
    const r = await setBacklogStatus(ctx, { id: 1, status: "resolved", note: "fixed the sink bug" });
    expect(r.content[0].text).toContain("→ resolved");
    const row = await db.query("SELECT resolution_note FROM reports WHERE id=1");
    expect(row.rows[0].resolution_note).toBe("fixed the sink bug");
    const notes = await db.query("SELECT kind, body FROM report_notes WHERE report_id=1 ORDER BY id");
    expect(notes.rows.some((n: any) => n.kind === "note" && n.body === "fixed the sink bug")).toBe(true);
    expect(notes.rows.some((n: any) => n.kind === "status_change")).toBe(true);
  });

  it("does not write resolution_note for a non-resolved status", async () => {
    const { ctx, db } = await ctxWith([["G", "bug", "new"]]);
    await setBacklogStatus(ctx, { id: 1, status: "in_progress", note: "starting" });
    const row = await db.query("SELECT resolution_note FROM reports WHERE id=1");
    expect(row.rows[0].resolution_note).toBeNull();
  });

  it("lists a playtest-source report", async () => {
    const { ctx, db } = await ctxWith([]);
    await db.query("INSERT INTO reports (guild_id, source, title, status) VALUES ('G','playtest','grindy','new')");
    const r = await listBacklog(ctx, { source: "playtest" });
    expect(r.content[0].text).toContain("grindy");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- backlog`
Expected: FAIL — `setBacklogStatus` ignores `note`; `resolution_note` stays null.

- [ ] **Step 4: Implement** in `src/tools/backlog.ts`.

Update `setBacklogStatus` signature + body:
```ts
export async function setBacklogStatus(
  ctx: BacklogContext,
  args: { id: number; status: string; note?: string },
): Promise<ToolResult> {
  return toolTry(async () => {
    if (!(BACKLOG_STATUSES as readonly string[]).includes(args.status)) {
      return ok(`Unknown status "${args.status}". Valid: ${BACKLOG_STATUSES.join(', ')}.`);
    }
    const client = await ctx.db.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query('SELECT status FROM reports WHERE guild_id=$1 AND id=$2', [ctx.guildId, args.id]);
      if (!cur.rowCount) { await client.query('ROLLBACK'); return ok(`Report #${args.id} not found.`); }
      const from = cur.rows[0].status as string;
      if (from === args.status) { await client.query('ROLLBACK'); return ok(`No change (report #${args.id} already "${args.status}").`); }
      if (args.status === 'resolved' && args.note != null) {
        await client.query('UPDATE reports SET status=$1, resolution_note=$2, updated_at=now() WHERE guild_id=$3 AND id=$4',
          [args.status, args.note, ctx.guildId, args.id]);
      } else {
        await client.query('UPDATE reports SET status=$1, updated_at=now() WHERE guild_id=$2 AND id=$3',
          [args.status, ctx.guildId, args.id]);
      }
      await client.query(
        "INSERT INTO report_notes (report_id, author_id, kind, body) VALUES ($1,'assistant','status_change',$2)",
        [args.id, `${from} → ${args.status}`]);
      if (args.note != null) {
        await client.query(
          "INSERT INTO report_notes (report_id, author_id, kind, body) VALUES ($1,'assistant','note',$2)",
          [args.id, args.note]);
      }
      await client.query('COMMIT');
      return ok(`Report #${args.id}: ${from} → ${args.status}.`);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  });
}
```

Add `note` to the `backlog_set_status` tool schema and `playtest` to the `backlog_list` source enum (in `registerBacklogTools`):
```ts
  server.registerTool(
    'backlog_set_status',
    {
      description: 'Set a backlog item\'s status. Optional note: on resolve it is saved as the resolution note and included in the mod bot\'s reply to the reporter. The mod bot mirrors the matching tag onto the forum thread.',
      inputSchema: { id: z.number().int(), status: z.enum(BACKLOG_STATUSES), note: z.string().optional() },
    },
    async (args) => asCallResult(await setBacklogStatus(ctx, args)),
  );
```
```ts
        source: z.enum(['bug_forum', 'security', 'manual', 'playtest']).optional(),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- backlog`
Expected: PASS (existing backlog tests still green).

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: tsc exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/tools/backlog.ts tests/backlog.test.ts
git commit -m "feat(backlog): set_status resolution note + playtest source filter"
```

---

## Manual Rollout (after all tasks land — not a coding task)

Ordered so the schema is live before the MCP resolve-with-note is used:

1. **Mod bot:** merge to `master` → Railway runs `npm run migrate` (applies `005` + `006`) and redeploys. Confirm the log shows the listener started and no migration error.
2. **Discord:** create the `#playtest-feedback` **forum** channel under the PLAYTEST category; provision the six lifecycle tags (`new`, `triaged`, `in-progress`, `resolved`, `duplicate`, `wont-fix`) via direct REST PATCH on the forum's `available_tags` (as done for `#bug-reports` — the MCP `edit_channel` only sets name/topic). Set `guild_config.playtestForumChannelId` to the new channel id (via `configRepo.save` / the config surface).
3. **MCP:** merge the MCP change, rebuild `dist`, and restart Claude Code so the new `note` param and `playtest` source filter load.
4. **Verify live** (a `verify`-skill session):
   - Post a thread in `#playtest-feedback` → `backlog_list source:playtest` shows it as a `playtest` report.
   - `backlog_set_status(id, 'resolved', note:'…')` on a bug/playtest report → exactly one in-thread reply pinging the author, tag flips to `resolved`.
   - Resolve a `security` report → tag flips, **no** thread reply.
   - Re-trigger the same resolve (or a reconcile) → **no** second reply (idempotency).

## Self-Review Notes

- **Spec §3 (columns + rearm trigger):** Task 1. Rearm trigger split into `006_report_rearm.sql` so pg-mem skips it; reopen-rearm is verified on Neon in rollout step 4 (same pattern as the existing `003` NOTIFY trigger).
- **Spec §4 (playtest ingest):** Tasks 3 (mapper) + 5 (config, router handler) + Task 2 (source union). New `#playtest-feedback` forum per §4.2.
- **Spec §5 (resolve round-trip):** MCP note — Task 6; DB persistence — Task 2; reply — Task 4; wiring — Task 5. **Refinement beyond the spec's "mirror works unchanged":** the tag map is per-forum, so Task 5 routes `forumTagMap(source)` to the right forum's tags.
- **Spec §6 (security/manual silent):** the four-condition guard in Task 4; test covers a resolved `security` report with a thread → no reply.
- **Spec §8 (tests):** ingest (T3), round-trip happy path + note (T4/T6), idempotency + reply-retry (T4), reopen-rearm (Neon, rollout), silent security/manual (T4), MCP note + source filter (T6).
- **Deliberate scope note (deviates from spec §5.1's "mod-bot resolve command similarly accepts a note"):** this plan wires the resolution note through the **MCP** (the surface used to resolve during working sessions) and the `reportsRepo.setStatus` data layer, but does **not** add a `note` field to the `/backlog status` *slash command* UI (would touch `registerCommands` + the interaction→`BacklogInput` mapping). The data layer is ready, so exposing it later is a one-option add. Flagged for the user to fold in now if wanted.
