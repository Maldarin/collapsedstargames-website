# Backlog Soft-Delete + Lifecycle + Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reversible deletion lifecycle (soft-delete → restore → purge) to the report backlog, with an on-demand dry-run purge (MCP) and a 45-day automated retention reaper (mod bot).

**Architecture:** Two repos over one shared Neon Postgres. The **mod bot** (`collapsedstargames-bot`) owns the migration adding `reports.deleted_at` and runs the unattended retention reaper. The **MCP** (`collapsedstargames-mcp`) gains three DB-only tools — `backlog_delete`, `backlog_restore`, `backlog_purge` — plus `includeDeleted` on `backlog_list` and a deleted marker on `backlog_get`. Deletion is a nullable timestamp orthogonal to `status`, so the forum-tag mirror is untouched.

**Tech Stack:** TypeScript ESM, `pg`, vitest + pg-mem for tests. Mod bot on Railway (auto-migrates on deploy); MCP is a local stdio server.

## Global Constraints

- **MCP stays DB-only.** No Discord side-effects from backlog tools. Deleting a row does NOT touch its Discord thread.
- **Every query is guild-scoped** — filter `guild_id = ctx.guildId` (MCP) / `guildId` (bot). No tool may touch another guild's rows.
- **`deleted_at` is orthogonal to `status`** — never add a `'deleted'` status value; never change the status→tag mapping.
- **Compute time cutoffs in JS, pass as a bound `Date` param** (`new Date(Date.now() - days * 86_400_000)`) — do NOT use SQL `now() - interval` (pg-mem cannot reliably parse interval arithmetic; this mirrors the existing `driftRows` pg-mem accommodation).
- **Hard delete removes notes explicitly before the report row** (`DELETE FROM report_notes ... ; DELETE FROM reports ...` inside one transaction). This is deterministic under pg-mem (whose test schemas may lack the FK) and redundant-but-harmless with the real `ON DELETE CASCADE`.
- **`duplicate_of` RESTRICT FK:** before any hard delete, null out `duplicate_of` pointers into the purged id set. Build `IN (...)` clauses from the id list with positional placeholders — do NOT use `= ANY($array)` (pg-mem array-param support is unreliable).
- **Thresholds are constants:** on-demand purge default `30` days; retention reaper `45` days; reaper interval `24h` (`86_400_000` ms).
- **Migrations live in the mod bot only.** The MCP never runs migrations. Deploy the bot (Task A1) before using any MCP delete tool.
- **`npm run test` (vitest) and `npm run build` (tsc) must pass** in each repo before its tasks are considered done.

---

## Part A — Mod bot (`collapsedstargames-bot`)

### Task A1: `deleted_at` migration

**Files:**
- Create: `D:\Projects\collapsedstargames-bot\src\db\migrations\004_report_soft_delete.sql`
- Test: `D:\Projects\collapsedstargames-bot\tests\db\reportsSchema.test.ts` (add a case)

**Interfaces:**
- Produces: a nullable `reports.deleted_at TIMESTAMPTZ` column + partial index `idx_reports_deleted`. Consumed by A2/A3 and by all Part B tools. `runMigrations` (via `freshPool`) auto-applies it in every test in both repos' bot suite.

- [ ] **Step 1: Write the failing test**

Add to `tests/db/reportsSchema.test.ts`:

```typescript
it("has a nullable deleted_at column defaulting to NULL", async () => {
  const pool = await freshPool();
  const r = await pool.query(
    "INSERT INTO reports (guild_id, source, title) VALUES ($1,$2,$3) RETURNING deleted_at",
    ["g1", "manual", "item"]
  );
  expect(r.rows[0].deleted_at).toBeNull();
  // column accepts a timestamp
  await pool.query("UPDATE reports SET deleted_at = now() WHERE guild_id='g1'");
  const back = await pool.query("SELECT deleted_at FROM reports WHERE guild_id='g1'");
  expect(back.rows[0].deleted_at).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- reportsSchema`
Expected: FAIL — `column "deleted_at" does not exist`.

- [ ] **Step 3: Create the migration**

`src/db/migrations/004_report_soft_delete.sql`:

```sql
ALTER TABLE reports ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reports_deleted
  ON reports (guild_id, deleted_at)
  WHERE deleted_at IS NOT NULL;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- reportsSchema`
Expected: PASS. If pg-mem rejects the partial-index `WHERE` predicate, drop `WHERE deleted_at IS NOT NULL` **only in a test-path fallback** — but first confirm: pg-mem currently parses the existing partial-ish indexes fine, so this is unlikely. Do not weaken the real migration.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (all existing tests still green — the new column is nullable and unreferenced elsewhere).

- [ ] **Step 6: Commit**

```bash
git add src/db/migrations/004_report_soft_delete.sql tests/db/reportsSchema.test.ts
git commit -m "feat(reports): add deleted_at column for soft-delete lifecycle"
```

---

### Task A2: `reportsRepo.purgeSoftDeleted`

**Files:**
- Modify: `D:\Projects\collapsedstargames-bot\src\db\repositories\reportsRepo.ts`
- Test: `D:\Projects\collapsedstargames-bot\tests\db\reportsRepo.test.ts` (add cases)

**Interfaces:**
- Consumes: `deleted_at` column (A1).
- Produces: `purgeSoftDeleted(guildId: string, olderThanDays: number): Promise<ReportRow[]>` — hard-deletes soft-deleted rows older than the cutoff and returns the deleted rows (pre-delete snapshot, mapped via `mapRow`) for forensic logging. Consumed by A3.

- [ ] **Step 1: Write the failing tests**

Add to `tests/db/reportsRepo.test.ts`:

```typescript
// helper: seed a soft-deleted row with an explicit deleted_at age (days ago)
async function seedDeleted(pool: any, guildId: string, title: string, daysAgo: number): Promise<number> {
  const when = new Date(Date.now() - daysAgo * 86_400_000);
  const r = await pool.query(
    "INSERT INTO reports (guild_id, source, title, deleted_at) VALUES ($1,'manual',$2,$3) RETURNING id",
    [guildId, title, when]
  );
  return Number(r.rows[0].id);
}

describe("reportsRepo.purgeSoftDeleted", () => {
  it("purges only soft-deleted rows older than the threshold, returns them", async () => {
    const pool = await freshPool();
    const repo = reportsRepo(pool);
    const oldId = await seedDeleted(pool, "g1", "old", 60);
    await seedDeleted(pool, "g1", "recent", 10);           // within window — survives
    const liveId = (await repo.ingest({ ...base, source: "manual", sourceRef: null, threadId: null, title: "live" }))!;
    const purged = await repo.purgeSoftDeleted("g1", 45);
    expect(purged.map((r) => r.id)).toEqual([oldId]);
    const remaining = await pool.query("SELECT title FROM reports WHERE guild_id='g1' ORDER BY id");
    expect(remaining.rows.map((x: any) => x.title)).toEqual(["recent", "live"]);
    expect(liveId).toBeGreaterThan(0);
  });

  it("clears duplicate_of pointers into the purged set (FK-safe)", async () => {
    const pool = await freshPool();
    const repo = reportsRepo(pool);
    const targetId = await seedDeleted(pool, "g1", "target", 60);
    const pointerId = (await repo.ingest({ ...base, source: "manual", sourceRef: null, threadId: null, title: "pointer" }))!;
    await pool.query("UPDATE reports SET duplicate_of=$1 WHERE id=$2", [targetId, pointerId]);
    await repo.purgeSoftDeleted("g1", 45);
    const p = await pool.query("SELECT duplicate_of FROM reports WHERE id=$1", [pointerId]);
    expect(p.rows[0].duplicate_of).toBeNull();
  });

  it("deletes the purged rows' notes", async () => {
    const pool = await freshPool();
    const repo = reportsRepo(pool);
    const id = await seedDeleted(pool, "g1", "withnotes", 60);
    await pool.query("INSERT INTO report_notes (report_id, author_id, kind, body) VALUES ($1,'a','note','n')", [id]);
    await repo.purgeSoftDeleted("g1", 45);
    const n = await pool.query("SELECT count(*)::int AS n FROM report_notes WHERE report_id=$1", [id]);
    expect(n.rows[0].n).toBe(0);
  });

  it("is guild-scoped (never purges another guild's old rows)", async () => {
    const pool = await freshPool();
    const repo = reportsRepo(pool);
    await seedDeleted(pool, "OTHER", "theirs", 60);
    const purged = await repo.purgeSoftDeleted("g1", 45);
    expect(purged).toEqual([]);
    const survives = await pool.query("SELECT count(*)::int AS n FROM reports WHERE guild_id='OTHER'");
    expect(survives.rows[0].n).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- reportsRepo`
Expected: FAIL — `repo.purgeSoftDeleted is not a function`.

- [ ] **Step 3: Implement `purgeSoftDeleted`**

Add this method to the object returned by `reportsRepo(pool)` in `src/db/repositories/reportsRepo.ts` (place it after `merge`, before `driftRows`):

```typescript
    async purgeSoftDeleted(guildId: string, olderThanDays: number): Promise<ReportRow[]> {
      // Cutoff computed in JS (pg-mem cannot do interval arithmetic reliably).
      const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const cand = await client.query(
          "SELECT * FROM reports WHERE guild_id=$1 AND deleted_at IS NOT NULL AND deleted_at < $2 ORDER BY id ASC",
          [guildId, cutoff]
        );
        if (!cand.rowCount) { await client.query("COMMIT"); return []; }
        const rows = cand.rows.map(mapRow);
        const ids = rows.map((r) => r.id);
        const ph = ids.map((_, i) => `$${i + 1}`).join(",");
        // duplicate_of pointers are always same-guild (merge is guild-scoped), so
        // clearing without a guild filter is safe; null them to dodge the RESTRICT FK.
        await client.query(`UPDATE reports SET duplicate_of=NULL WHERE duplicate_of IN (${ph})`, ids);
        await client.query(`DELETE FROM report_notes WHERE report_id IN (${ph})`, ids);
        await client.query(`DELETE FROM reports WHERE id IN (${ph})`, ids);
        await client.query("COMMIT");
        return rows;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- reportsRepo`
Expected: PASS (all four new cases).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/db/repositories/reportsRepo.ts tests/db/reportsRepo.test.ts
git commit -m "feat(reports): add purgeSoftDeleted repo method (FK-safe, guild-scoped)"
```

---

### Task A3: Retention reaper service + startup wiring

**Files:**
- Create: `D:\Projects\collapsedstargames-bot\src\reports\retentionService.ts`
- Create: `D:\Projects\collapsedstargames-bot\tests\reports\retentionService.test.ts`
- Modify: `D:\Projects\collapsedstargames-bot\src\index.ts` (wire the job after the listener starts, ~line 79)

**Interfaces:**
- Consumes: `purgeSoftDeleted` (A2).
- Produces:
  - `purgeExpiredReports(repo: Pick<Repo, "purgeSoftDeleted">, guildId: string, olderThanDays: number, logInfo: (m: string) => void): Promise<number>` — purges, logs a forensic JSON line per removed row + a count line, returns the count.
  - `startRetentionJob(repo, guildId, opts: { olderThanDays: number; intervalMs: number }, logInfo: (m: string) => void, logError: (e: unknown) => void): () => void` — runs once immediately then on an interval; returns a stop function.

- [ ] **Step 1: Write the failing tests**

`tests/reports/retentionService.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { purgeExpiredReports, startRetentionJob } from "../../src/reports/retentionService.js";
import type { ReportRow } from "../../src/db/repositories/reportsRepo.js";

function row(id: number, title: string): ReportRow {
  return {
    id, guildId: "g1", source: "manual", sourceRef: null, threadId: null,
    title, body: "b", authorId: null, status: "new", priority: "normal",
    duplicateOf: null, tagSyncedStatus: null, createdAt: new Date(0), updatedAt: new Date(0),
  };
}

describe("purgeExpiredReports", () => {
  it("logs a forensic JSON line per purged row plus a count, and returns the count", async () => {
    const purged = [row(1, "a"), row(2, "b")];
    const repo = { purgeSoftDeleted: vi.fn().mockResolvedValue(purged) };
    const logs: string[] = [];
    const n = await purgeExpiredReports(repo, "g1", 45, (m) => logs.push(m));
    expect(n).toBe(2);
    expect(repo.purgeSoftDeleted).toHaveBeenCalledWith("g1", 45);
    expect(logs.filter((l) => l.includes('"id":1')).length).toBe(1);
    expect(logs.filter((l) => l.includes('"id":2')).length).toBe(1);
    expect(logs.some((l) => l.includes("purged 2"))).toBe(true);
  });

  it("logs a zero count and no per-row lines when nothing is purged", async () => {
    const repo = { purgeSoftDeleted: vi.fn().mockResolvedValue([]) };
    const logs: string[] = [];
    const n = await purgeExpiredReports(repo, "g1", 45, (m) => logs.push(m));
    expect(n).toBe(0);
    expect(logs.some((l) => l.includes("purged 0"))).toBe(true);
  });
});

describe("startRetentionJob", () => {
  it("runs a purge pass immediately and returns a stop function", async () => {
    const repo = { purgeSoftDeleted: vi.fn().mockResolvedValue([]) };
    const stop = startRetentionJob(repo, "g1", { olderThanDays: 45, intervalMs: 60_000 }, () => {}, () => {});
    await new Promise((r) => setTimeout(r, 0)); // let the immediate async pass settle
    expect(repo.purgeSoftDeleted).toHaveBeenCalledWith("g1", 45);
    expect(typeof stop).toBe("function");
    stop(); // clears the interval — no throw
  });

  it("routes a purge failure to logError instead of throwing", async () => {
    const repo = { purgeSoftDeleted: vi.fn().mockRejectedValue(new Error("boom")) };
    const errors: unknown[] = [];
    const stop = startRetentionJob(repo, "g1", { olderThanDays: 45, intervalMs: 60_000 }, () => {}, (e) => errors.push(e));
    await new Promise((r) => setTimeout(r, 0));
    expect(errors.length).toBe(1);
    stop();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- retentionService`
Expected: FAIL — cannot find module `retentionService.js`.

- [ ] **Step 3: Implement the service**

`src/reports/retentionService.ts`:

```typescript
import type { reportsRepo } from "../db/repositories/reportsRepo.js";

type Repo = ReturnType<typeof reportsRepo>;

/**
 * Hard-purge soft-deleted rows older than `olderThanDays` and emit a forensic
 * trail: one JSON line per removed row (hand-recoverable from logs — the purge
 * is otherwise irreversible) plus a summary count. Returns the number purged.
 */
export async function purgeExpiredReports(
  repo: Pick<Repo, "purgeSoftDeleted">,
  guildId: string,
  olderThanDays: number,
  logInfo: (m: string) => void
): Promise<number> {
  const purged = await repo.purgeSoftDeleted(guildId, olderThanDays);
  for (const r of purged) logInfo(`retention: purged row ${JSON.stringify(r)}`);
  logInfo(`retention: purged ${purged.length} backlog rows soft-deleted > ${olderThanDays}d`);
  return purged.length;
}

/**
 * Run a retention pass immediately, then every `intervalMs`. Failures are routed
 * to logError and never crash the loop. Returns a stop function (clears the timer).
 */
export function startRetentionJob(
  repo: Pick<Repo, "purgeSoftDeleted">,
  guildId: string,
  opts: { olderThanDays: number; intervalMs: number },
  logInfo: (m: string) => void,
  logError: (e: unknown) => void
): () => void {
  const run = () => purgeExpiredReports(repo, guildId, opts.olderThanDays, logInfo).catch(logError);
  run();
  const timer = setInterval(run, opts.intervalMs);
  if (typeof (timer as { unref?: () => void }).unref === "function") (timer as { unref: () => void }).unref();
  return () => clearInterval(timer);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- retentionService`
Expected: PASS (all four cases).

- [ ] **Step 5: Wire into startup**

In `src/index.ts`, add the import near the other reports imports (top, ~line 13):

```typescript
import { startRetentionJob } from "./reports/retentionService.js";
```

Then, immediately after `log.info("report backlog listener started");` (line 79), inside the same block, add:

```typescript
        startRetentionJob(
          reports,
          conf.guildId,
          { olderThanDays: 45, intervalMs: 86_400_000 },
          (m) => log.info(m),
          (e) => log.error(e)
        );
        log.info("report retention job started (45d, daily)");
```

- [ ] **Step 6: Build + full suite**

Run: `npm run build && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/reports/retentionService.ts tests/reports/retentionService.test.ts src/index.ts
git commit -m "feat(reports): 45-day retention reaper with forensic logging + startup wiring"
```

---

## Part B — MCP (`collapsedstargames-mcp`)

> All Part B tasks edit `D:\Projects\collapsedstargames-mcp\src\tools\backlog.ts` and `D:\Projects\collapsedstargames-mcp\tests\backlog.test.ts`. Commands run from `D:\Projects\collapsedstargames-mcp`.

### Task B1: `backlog_delete` + `backlog_restore` (soft-delete/restore)

**Files:**
- Modify: `src\tools\backlog.ts` (add two functions)
- Test: `tests\backlog.test.ts` (extend `SCHEMA`, add cases)

**Interfaces:**
- Consumes: `BacklogContext { db: Pool; guildId: string }`, `toolTry`, `ok`, `ToolResult`.
- Produces:
  - `deleteBacklog(ctx: BacklogContext, args: { id: number }): Promise<ToolResult>`
  - `restoreBacklog(ctx: BacklogContext, args: { id: number }): Promise<ToolResult>`

- [ ] **Step 1: Extend the test schema (shared by all Part B tasks)**

In `tests/backlog.test.ts`, add `deleted_at` to the `reports` table in the `SCHEMA` constant so every Part B test can use it. Change the `reports` line to include `deleted_at TIMESTAMPTZ,` before `created_at`:

```typescript
const SCHEMA = `
CREATE TABLE reports (id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, source TEXT NOT NULL,
  source_ref TEXT, thread_id TEXT, title TEXT NOT NULL, body TEXT, author_id TEXT,
  status TEXT NOT NULL DEFAULT 'new', priority TEXT NOT NULL DEFAULT 'normal',
  duplicate_of BIGINT, tag_synced_status TEXT, deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE report_notes (id BIGSERIAL PRIMARY KEY, report_id BIGINT NOT NULL, author_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note', body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());`;
```

- [ ] **Step 2: Write the failing tests**

Add a new `describe` block in `tests/backlog.test.ts`. Import the new functions at the top (extend the existing import line):

```typescript
import { listBacklog, getBacklog, addBacklog, setBacklogStatus, noteBacklog, mergeBacklog,
  deleteBacklog, restoreBacklog } from '../src/tools/backlog.js';
```

```typescript
describe('backlog delete/restore', () => {
  it('backlog_delete soft-deletes: sets deleted_at and appends a deleted note', async () => {
    const { ctx, db } = await ctxWith([['G', 'junk', 'new']]);
    const r = await deleteBacklog(ctx, { id: 1 });
    expect(r.content[0].text.toLowerCase()).toContain('deleted');
    const row = await db.query('SELECT deleted_at FROM reports WHERE id=1');
    expect(row.rows[0].deleted_at).not.toBeNull();
    const n = await db.query("SELECT body FROM report_notes WHERE report_id=1 AND kind='deleted'");
    expect(n.rowCount).toBe(1);
  });

  it('backlog_delete is a no-op message when already deleted', async () => {
    const { ctx } = await ctxWith([['G', 'junk', 'new']]);
    await deleteBacklog(ctx, { id: 1 });
    const r = await deleteBacklog(ctx, { id: 1 });
    expect(r.content[0].text.toLowerCase()).toContain('already deleted');
  });

  it('backlog_delete refuses another guild item (not found)', async () => {
    const { ctx } = await ctxWith([['OTHER', 'secret', 'new']]);
    const r = await deleteBacklog(ctx, { id: 1 });
    expect(r.content[0].text.toLowerCase()).toContain('not found');
  });

  it('backlog_restore clears deleted_at and appends a restored note', async () => {
    const { ctx, db } = await ctxWith([['G', 'junk', 'new']]);
    await deleteBacklog(ctx, { id: 1 });
    const r = await restoreBacklog(ctx, { id: 1 });
    expect(r.content[0].text.toLowerCase()).toContain('restored');
    const row = await db.query('SELECT deleted_at FROM reports WHERE id=1');
    expect(row.rows[0].deleted_at).toBeNull();
    const n = await db.query("SELECT body FROM report_notes WHERE report_id=1 AND kind='restored'");
    expect(n.rowCount).toBe(1);
  });

  it('backlog_restore is a no-op message when not deleted', async () => {
    const { ctx } = await ctxWith([['G', 'live', 'new']]);
    const r = await restoreBacklog(ctx, { id: 1 });
    expect(r.content[0].text.toLowerCase()).toContain('not deleted');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- backlog`
Expected: FAIL — `deleteBacklog`/`restoreBacklog` are not exported.

- [ ] **Step 4: Implement the two functions**

In `src/tools/backlog.ts`, add after `mergeBacklog` (before `registerBacklogTools`):

```typescript
export async function deleteBacklog(ctx: BacklogContext, args: { id: number }): Promise<ToolResult> {
  return toolTry(async () => {
    const client = await ctx.db.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query('SELECT deleted_at FROM reports WHERE guild_id=$1 AND id=$2', [ctx.guildId, args.id]);
      if (!cur.rowCount) { await client.query('ROLLBACK'); return ok(`Report #${args.id} not found.`); }
      if (cur.rows[0].deleted_at !== null) { await client.query('ROLLBACK'); return ok(`Report #${args.id} is already deleted.`); }
      await client.query('UPDATE reports SET deleted_at=now(), updated_at=now() WHERE guild_id=$1 AND id=$2', [ctx.guildId, args.id]);
      await client.query(
        "INSERT INTO report_notes (report_id, author_id, kind, body) VALUES ($1,'assistant','deleted','soft-deleted')",
        [args.id]);
      await client.query('COMMIT');
      return ok(`Report #${args.id} deleted (soft — restorable until purged).`);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  });
}

export async function restoreBacklog(ctx: BacklogContext, args: { id: number }): Promise<ToolResult> {
  return toolTry(async () => {
    const client = await ctx.db.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query('SELECT deleted_at FROM reports WHERE guild_id=$1 AND id=$2', [ctx.guildId, args.id]);
      if (!cur.rowCount) { await client.query('ROLLBACK'); return ok(`Report #${args.id} not found.`); }
      if (cur.rows[0].deleted_at === null) { await client.query('ROLLBACK'); return ok(`Report #${args.id} is not deleted.`); }
      await client.query('UPDATE reports SET deleted_at=NULL, updated_at=now() WHERE guild_id=$1 AND id=$2', [ctx.guildId, args.id]);
      await client.query(
        "INSERT INTO report_notes (report_id, author_id, kind, body) VALUES ($1,'assistant','restored','restored')",
        [args.id]);
      await client.query('COMMIT');
      return ok(`Report #${args.id} restored.`);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- backlog`
Expected: PASS (all five new cases; existing cases still green).

- [ ] **Step 6: Commit**

```bash
git add src/tools/backlog.ts tests/backlog.test.ts
git commit -m "feat(backlog): add soft-delete + restore (deleted_at, activity notes)"
```

---

### Task B2: `backlog_purge` (dry-run + confirm)

**Files:**
- Modify: `src\tools\backlog.ts`
- Test: `tests\backlog.test.ts`

**Interfaces:**
- Consumes: `deleted_at` column, soft-delete from B1.
- Produces: `purgeBacklog(ctx: BacklogContext, args: { olderThanDays?: number; confirm?: boolean }): Promise<ToolResult>` — dry-run by default (lists candidates, deletes nothing); with `confirm:true`, hard-deletes soft-deleted rows older than `olderThanDays` (default 30), FK-safe, notes removed.

- [ ] **Step 1: Write the failing tests**

Extend the import line to add `purgeBacklog`, then add:

```typescript
describe('backlog purge', () => {
  // seed a soft-deleted row aged `daysAgo` days
  async function seedDeleted(db: any, guild: string, title: string, daysAgo: number): Promise<void> {
    const when = new Date(Date.now() - daysAgo * 86_400_000);
    await db.query("INSERT INTO reports (guild_id, source, title, deleted_at) VALUES ($1,'manual',$2,$3)", [guild, title, when]);
  }

  it('dry-run lists candidates and deletes nothing', async () => {
    const { ctx, db } = await ctxWith([]);
    await seedDeleted(db, 'G', 'oldjunk', 60);
    const r = await purgeBacklog(ctx, { olderThanDays: 30 });
    expect(r.content[0].text).toContain('DRY RUN');
    expect(r.content[0].text).toContain('oldjunk');
    const n = await db.query('SELECT count(*)::int AS n FROM reports');
    expect(n.rows[0].n).toBe(1); // still there
  });

  it('confirm:true hard-deletes candidates and their notes', async () => {
    const { ctx, db } = await ctxWith([]);
    await seedDeleted(db, 'G', 'oldjunk', 60);
    await db.query("INSERT INTO report_notes (report_id, author_id, kind, body) VALUES (1,'a','note','n')");
    const r = await purgeBacklog(ctx, { olderThanDays: 30, confirm: true });
    expect(r.content[0].text).toContain('Purged 1');
    expect((await db.query('SELECT count(*)::int AS n FROM reports')).rows[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM report_notes WHERE report_id=1')).rows[0].n).toBe(0);
  });

  it('excludes rows newer than the threshold', async () => {
    const { ctx, db } = await ctxWith([]);
    await seedDeleted(db, 'G', 'recent', 10);
    const r = await purgeBacklog(ctx, { olderThanDays: 30, confirm: true });
    expect(r.content[0].text.toLowerCase()).toContain('nothing to purge');
    expect((await db.query('SELECT count(*)::int AS n FROM reports')).rows[0].n).toBe(1);
  });

  it('clears duplicate_of pointers into the purged set', async () => {
    const { ctx, db } = await ctxWith([]);
    await seedDeleted(db, 'G', 'target', 60);          // id 1
    await db.query("INSERT INTO reports (guild_id, source, title, duplicate_of) VALUES ('G','manual','pointer',1)"); // id 2
    await purgeBacklog(ctx, { olderThanDays: 30, confirm: true });
    const p = await db.query('SELECT duplicate_of FROM reports WHERE title=$1', ['pointer']);
    expect(p.rows[0].duplicate_of).toBeNull();
  });

  it('ignores non-deleted rows entirely', async () => {
    const { ctx, db } = await ctxWith([['G', 'live', 'new']]);
    const r = await purgeBacklog(ctx, { confirm: true });
    expect(r.content[0].text.toLowerCase()).toContain('nothing to purge');
    expect((await db.query('SELECT count(*)::int AS n FROM reports')).rows[0].n).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- backlog`
Expected: FAIL — `purgeBacklog` is not exported.

- [ ] **Step 3: Implement `purgeBacklog`**

In `src/tools/backlog.ts`, add after `restoreBacklog`:

```typescript
export async function purgeBacklog(
  ctx: BacklogContext,
  args: { olderThanDays?: number; confirm?: boolean },
): Promise<ToolResult> {
  return toolTry(async () => {
    const days = args.olderThanDays ?? 30;
    // Cutoff in JS (pg-mem cannot do interval arithmetic reliably).
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const cand = await ctx.db.query(
      'SELECT id, status, title FROM reports WHERE guild_id=$1 AND deleted_at IS NOT NULL AND deleted_at < $2 ORDER BY id ASC',
      [ctx.guildId, cutoff],
    );
    if (!cand.rowCount) return ok(`Nothing to purge (0 items older than ${days}d).`);
    const ids = cand.rows.map((r: any) => Number(r.id));
    if (!args.confirm) {
      const lines = cand.rows.map((r: any) => `  #${r.id} [${r.status}] ${r.title}`).join('\n');
      return ok(`DRY RUN — would purge ${ids.length} item(s). Re-run with confirm:true to delete.\n${lines}`);
    }
    const client = await ctx.db.connect();
    try {
      await client.query('BEGIN');
      const ph = ids.map((_: number, i: number) => `$${i + 1}`).join(',');
      // Null duplicate_of pointers first (RESTRICT FK); pointers are same-guild.
      await client.query(`UPDATE reports SET duplicate_of=NULL WHERE duplicate_of IN (${ph})`, ids);
      await client.query(`DELETE FROM report_notes WHERE report_id IN (${ph})`, ids);
      await client.query(`DELETE FROM reports WHERE id IN (${ph})`, ids);
      await client.query('COMMIT');
      return ok(`Purged ${ids.length} item(s).`);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- backlog`
Expected: PASS (all five new cases).

- [ ] **Step 5: Commit**

```bash
git add src/tools/backlog.ts tests/backlog.test.ts
git commit -m "feat(backlog): add purge tool (dry-run by default, confirm to hard-delete)"
```

---

### Task B3: `includeDeleted` on list + deleted marker on get

**Files:**
- Modify: `src\tools\backlog.ts` (`listBacklog`, `getBacklog`, `line`)
- Test: `tests\backlog.test.ts`

**Interfaces:**
- Modifies: `listBacklog(ctx, args)` — `args` gains `includeDeleted?: boolean` (default false → hides soft-deleted rows; true → shows them with a `🗑 ` prefix). `getBacklog` render gains a `deleted:` field when the row is soft-deleted.

- [ ] **Step 1: Write the failing tests**

```typescript
describe('deleted visibility', () => {
  it('list hides soft-deleted rows by default', async () => {
    const { ctx } = await ctxWith([['G', 'visible', 'new'], ['G', 'gone', 'new']]);
    await deleteBacklog(ctx, { id: 2 });
    const r = await listBacklog(ctx, {});
    expect(r.content[0].text).toContain('visible');
    expect(r.content[0].text).not.toContain('gone');
  });

  it('list includeDeleted shows soft-deleted rows with a marker', async () => {
    const { ctx } = await ctxWith([['G', 'visible', 'new'], ['G', 'gone', 'new']]);
    await deleteBacklog(ctx, { id: 2 });
    const r = await listBacklog(ctx, { includeDeleted: true });
    expect(r.content[0].text).toContain('gone');
    expect(r.content[0].text).toContain('🗑');
  });

  it('get shows a deleted marker for a soft-deleted row', async () => {
    const { ctx } = await ctxWith([['G', 'gone', 'new']]);
    await deleteBacklog(ctx, { id: 1 });
    const r = await getBacklog(ctx, { id: 1 });
    expect(r.content[0].text.toLowerCase()).toContain('deleted:');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- backlog`
Expected: FAIL — deleted rows still listed by default / no marker.

- [ ] **Step 3: Update `line`, `listBacklog`, and `getBacklog`**

In `src/tools/backlog.ts`, replace the `line` helper:

```typescript
function line(r: any): string {
  const mark = r.deleted_at ? '🗑 ' : '';
  return `${mark}#${r.id} [${r.status}/${r.priority}] ${r.title}`;
}
```

In `listBacklog`, add `deleted_at` to the SELECT and the default-hide filter. Replace the filter-building + query section body with:

```typescript
    const where = ['guild_id=$1'];
    const params: any[] = [ctx.guildId];
    for (const [k, col] of [['status', 'status'], ['source', 'source'], ['priority', 'priority']] as const) {
      const v = (args as any)[k];
      if (v) { params.push(v); where.push(`${col}=$${params.length}`); }
    }
    if (!args.includeDeleted) where.push('deleted_at IS NULL');
    params.push(Math.min(args.limit ?? 25, 100));
    const r = await ctx.db.query(
      `SELECT id, title, status, priority, deleted_at FROM reports WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT $${params.length}`,
      params,
    );
    return ok(r.rows.map(line).join('\n') || 'Backlog is empty.');
```

Also widen the `listBacklog` args type to include the new flag:

```typescript
export async function listBacklog(
  ctx: BacklogContext,
  args: { status?: string; source?: string; priority?: string; limit?: number; includeDeleted?: boolean },
): Promise<ToolResult> {
```

In `getBacklog`, append a `deleted:` field to the header line when the row is soft-deleted. Replace the final `return ok(...)` with:

```typescript
    const del = row.deleted_at ? ` · deleted: ${new Date(row.deleted_at).toISOString()}` : '';
    return ok(
      `#${row.id} [${row.status}/${row.priority}] ${row.title}\n` +
        `source: ${row.source} · thread: ${row.thread_id ?? '—'} · author: ${row.author_id ?? '—'}${del}\n` +
        `${row.body ?? ''}\nNotes:\n${noteLines}`,
    );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- backlog`
Expected: PASS (three new cases; all prior backlog tests still green — existing list tests use non-deleted rows, so the default filter does not hide them).

- [ ] **Step 5: Commit**

```bash
git add src/tools/backlog.ts tests/backlog.test.ts
git commit -m "feat(backlog): hide deleted from list by default, add includeDeleted + get marker"
```

---

### Task B4: Register the new tools

**Files:**
- Modify: `src\tools\backlog.ts` (`registerBacklogTools`)

**Interfaces:**
- Consumes: `deleteBacklog`, `restoreBacklog`, `purgeBacklog` (B1/B2), the widened `listBacklog` (B3).
- Produces: three registered MCP tools (`backlog_delete`, `backlog_restore`, `backlog_purge`) and an `includeDeleted` param on `backlog_list`. Total MCP tool count 20 → 23.

- [ ] **Step 1: Add `includeDeleted` to the `backlog_list` registration**

In `registerBacklogTools`, in the `backlog_list` `inputSchema`, add:

```typescript
        includeDeleted: z.boolean().optional(),
```

- [ ] **Step 2: Register the three new tools**

Before the closing `}` of `registerBacklogTools`, add:

```typescript
  server.registerTool(
    'backlog_delete',
    {
      description: 'Soft-delete a backlog item (hidden from list, reversible via backlog_restore until purged). DB-only; does not touch the Discord thread.',
      inputSchema: { id: z.number().int() },
    },
    async (args) => asCallResult(await deleteBacklog(ctx, args)),
  );
  server.registerTool(
    'backlog_restore',
    {
      description: 'Restore a soft-deleted backlog item (clears deleted_at).',
      inputSchema: { id: z.number().int() },
    },
    async (args) => asCallResult(await restoreBacklog(ctx, args)),
  );
  server.registerTool(
    'backlog_purge',
    {
      description: 'Permanently delete soft-deleted items older than olderThanDays (default 30). Dry-run by default — lists candidates and deletes nothing; pass confirm:true to hard-delete. Irreversible.',
      inputSchema: {
        olderThanDays: z.number().int().min(0).optional(),
        confirm: z.boolean().optional(),
      },
    },
    async (args) => asCallResult(await purgeBacklog(ctx, args)),
  );
```

- [ ] **Step 3: Build to verify wiring + types**

Run: `npm run build`
Expected: no type errors (confirms the new functions and schemas line up).

- [ ] **Step 4: Full test suite**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add src/tools/backlog.ts
git commit -m "feat(backlog): register delete/restore/purge MCP tools + includeDeleted param"
```

---

## Rollout (manual, after both parts merge)

1. **Mod bot first:** merge Part A to `master` → Railway auto-deploys → migration `004` applies to Neon (adds `deleted_at`); retention job starts (logs `report retention job started`).
2. **MCP second:** merge Part B; rebuild `dist` (`npm run build`); user restarts Claude Code to respawn the MCP with 23 tools.
3. **Verify end-to-end:** `backlog_delete` an item → gone from `backlog_list`, present under `includeDeleted:true` with 🗑 → `backlog_restore` → reappears. `backlog_purge` (dry-run) lists candidates; `confirm:true` deletes. Finally, clean up the live smoke-test rows: soft-delete #4/#5/#6, then `backlog_purge olderThanDays:0 confirm:true` to remove them.

---

## Self-Review

**Spec coverage** (against `2026-07-14-backlog-soft-delete-design.md`):
- §3 data model → A1. §4 state model → A1 (column) + B1 (delete/restore) + B2/A2 (purge). §5.1 delete → B1. §5.2 restore → B1. §5.3 purge dry-run/confirm/FK → B2. §5.4 list includeDeleted → B3/B4. §5.5 get marker → B3. §6 retention reaper + forensic log → A2/A3. §7 recovery model → covered by B1 (restore) + B2 (dry-run). §8 edge cases: duplicate_of FK → A2/B2; re-ingest suppression → inherent (soft-deleted rows keep their source_ref slot; no code needed, documented); idempotency → B1; guild isolation → all tasks. §9 testing → each task's tests. §10 rollout ordering → Rollout section.
- **Deviation from spec, intentional:** spec §5.3/§6 sketched `now() - interval` SQL; the plan computes cutoffs in JS (Global Constraints) for pg-mem determinism — same behavior, and it matches the existing `driftRows` accommodation. Purge also deletes notes explicitly rather than relying solely on CASCADE, for the same reason. Both are documented in Global Constraints.

**Placeholder scan:** none — every code step shows complete code.

**Type consistency:** `purgeSoftDeleted(guildId, olderThanDays): Promise<ReportRow[]>` defined in A2, consumed with that signature in A3. `deleteBacklog`/`restoreBacklog`/`purgeBacklog` signatures defined in B1/B2 match their registrations in B4. `listBacklog` args widened in B3 and the matching `includeDeleted` schema added in B4. Note `kind` values `'deleted'`/`'restored'` (B1) are used consistently in tests and assertions.
