# Round 2 — Report Backlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Discord reports (bug-forum threads, security-channel messages, manual items) into a shared Neon backlog with a status lifecycle mirrored one-way onto forum tags, worked from two surfaces — mod-bot slash commands and assistant-bot (MCP) tools.

**Architecture:** The always-on mod bot (`collapsedstargames-bot`) owns the DB schema, all auto-ingest, and is the sole applier of forum tags. A Postgres trigger fires `NOTIFY report_status` on any insert/status-change; the mod bot holds a `LISTEN` and reconciles the forum tag. The MCP (`collapsedstargames-mcp`) gains a thin `pg` layer to read/write the same backlog — it never touches forum tags. The `reports` table + a status→tag-name map are the entire cross-repo contract.

**Tech Stack:** TypeScript ESM, discord.js v14 (mod bot), `@modelcontextprotocol/sdk` + `@discordjs/rest` (MCP), `pg` + Neon Postgres, vitest + pg-mem.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-13-round2-backlog-design.md` (this repo). Read it first.
- Guild id: `1512237266800742570`. Bug-forum channel id: `1512241971710660879`. Security channel id: `1512242984069103696`.
- Status enum (DB, underscores): `new` | `triaged` | `in_progress` | `resolved` | `duplicate` | `wont_fix`.
- Priority enum: `low` | `normal` | `high`.
- Forum tag names (hyphens): `new`, `triaged`, `in-progress`, `resolved`, `duplicate`, `wont-fix`. Provisioned once on the forum via the MCP `edit_channel` tool (rollout step), NOT by the mod bot.
- Status→tag-name map: `new→new`, `triaged→triaged`, `in_progress→in-progress`, `resolved→resolved`, `duplicate→duplicate`, `wont_fix→wont-fix`.
- Mirroring is one-way DB→forum. Ingest is idempotent. Mirroring failures never block a DB write.
- Follow existing patterns exactly: repos are `xRepo(pool: Pool)` factories; feature modules are pure with a `Deps` interface + `Incoming*` input, wired in `router.ts`; MCP tools are `(ctx, args) => toolTry(...)` returning `ToolResult`.
- `pg-mem` cannot model plpgsql triggers/`pg_notify`; the NOTIFY trigger lives in its own migration file (`003_report_notify.sql`) that tests skip. `reconcileReport` is unit-tested directly; the trigger→LISTEN wire is smoke-tested against real Neon.
- Commit after every task. Run the repo's `npm test` before each commit.

---

# PART A — Mod bot (`collapsedstargames-bot`)

All Part A paths are relative to `D:\Projects\collapsedstargames-bot`.

### Task A1: Reports schema migration + skippable NOTIFY trigger

**Files:**
- Create: `src/db/migrations/002_reports.sql`
- Create: `src/db/migrations/003_report_notify.sql`
- Modify: `src/db/migrate.ts` (add optional `skip` predicate)
- Create: `tests/db/memDb.ts` (shared pg-mem bootstrap)
- Modify: `tests/db/migrate.test.ts`, `tests/db/repositories.test.ts` (use shared bootstrap)
- Test: `tests/db/reportsSchema.test.ts`

**Interfaces:**
- Produces: tables `reports` and `report_notes` (columns per spec §3); trigger `report_status_notify_trg`. `runMigrations(pool, opts?: { skip?: (file: string) => boolean }): Promise<void>`. Test helper `freshPool(): Promise<Pool>` and `TEST_MIGRATION_OPTS`.

- [ ] **Step 1: Write `002_reports.sql`** (schema only — no trigger)

```sql
CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  thread_id TEXT,
  title TEXT NOT NULL,
  body TEXT,
  author_id TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',
  duplicate_of BIGINT REFERENCES reports(id),
  tag_synced_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_source ON reports (guild_id, source, source_ref);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (guild_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_source_kind ON reports (guild_id, source);

CREATE TABLE IF NOT EXISTS report_notes (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_report_notes_report ON report_notes (report_id, id);
```

- [ ] **Step 2: Write `003_report_notify.sql`** (plpgsql trigger — skipped in tests)

```sql
CREATE OR REPLACE FUNCTION report_status_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('report_status', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS report_status_notify_trg ON reports;
CREATE TRIGGER report_status_notify_trg
  AFTER INSERT OR UPDATE OF status ON reports
  FOR EACH ROW EXECUTE FUNCTION report_status_notify();
```

- [ ] **Step 3: Add the optional `skip` predicate to `runMigrations`**

In `src/db/migrate.ts`, change the signature and the file loop:

```ts
export async function runMigrations(
  pool: Pool,
  opts: { skip?: (file: string) => boolean } = {}
): Promise<void> {
  // ... existing schema_migrations bootstrap unchanged ...
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (opts.skip?.(file)) continue;
    const done = await pool.query("SELECT 1 FROM schema_migrations WHERE name=$1", [file]);
    if (done.rowCount) continue;
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
  }
}
```

The CLI entry at the bottom of the file stays `runMigrations(pool)` (no skip — real Postgres runs the trigger).

- [ ] **Step 4: Write the shared test bootstrap `tests/db/memDb.ts`**

```ts
import { newDb } from "pg-mem";
import type { Pool } from "pg";
import { runMigrations } from "../../src/db/migrate.js";

// pg-mem cannot parse plpgsql trigger/function bodies, so skip the NOTIFY
// migration in tests. reconcileReport is unit-tested directly; the trigger
// itself is smoke-tested against real Neon (see plan Global Constraints).
export const TEST_MIGRATION_OPTS = { skip: (f: string) => f.endsWith("_report_notify.sql") };

export async function freshPool(): Promise<Pool> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Pool;
  await runMigrations(pool, TEST_MIGRATION_OPTS);
  return pool;
}
```

- [ ] **Step 5: Point existing DB tests at the shared bootstrap**

In `tests/db/repositories.test.ts`, delete its local `freshPool` and import from `./memDb.js`:

```ts
import { freshPool } from "./memDb.js";
```

In `tests/db/migrate.test.ts`, pass `TEST_MIGRATION_OPTS` to every `runMigrations(pool, ...)` call so the trigger file is skipped there too:

```ts
import { TEST_MIGRATION_OPTS } from "./memDb.js";
// ...
await runMigrations(pool, TEST_MIGRATION_OPTS);
```

- [ ] **Step 6: Write the failing schema test `tests/db/reportsSchema.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { freshPool } from "./memDb.js";

describe("reports schema", () => {
  it("creates reports + report_notes with defaults", async () => {
    const pool = await freshPool();
    const r = await pool.query(
      "INSERT INTO reports (guild_id, source, source_ref, thread_id, title, body, author_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, status, priority",
      ["g1", "bug_forum", "t1", "t1", "Crash on join", "steps...", "u1"]
    );
    expect(r.rows[0].status).toBe("new");
    expect(r.rows[0].priority).toBe("normal");
    const id = r.rows[0].id;
    await pool.query(
      "INSERT INTO report_notes (report_id, author_id, kind, body) VALUES ($1,$2,$3,$4)",
      [id, "assistant", "note", "looking into it"]
    );
    const notes = await pool.query("SELECT body FROM report_notes WHERE report_id=$1", [id]);
    expect(notes.rows[0].body).toBe("looking into it");
  });

  it("enforces idempotent ingest via unique (guild_id, source, source_ref)", async () => {
    const pool = await freshPool();
    const ins = () =>
      pool.query(
        "INSERT INTO reports (guild_id, source, source_ref, title) VALUES ($1,$2,$3,$4) ON CONFLICT (guild_id, source, source_ref) DO NOTHING RETURNING id",
        ["g1", "bug_forum", "t1", "dup"]
      );
    const a = await ins();
    const b = await ins();
    expect(a.rowCount).toBe(1);
    expect(b.rowCount).toBe(0);
  });
});
```

- [ ] **Step 7: Run tests to verify the new test passes and existing DB tests still pass**

Run: `npm test -- tests/db`
Expected: PASS (reportsSchema, migrate, repositories all green).

- [ ] **Step 8: Commit**

```bash
git add src/db/migrations/002_reports.sql src/db/migrations/003_report_notify.sql src/db/migrate.ts tests/db/memDb.ts tests/db/reportsSchema.test.ts tests/db/repositories.test.ts tests/db/migrate.test.ts
git commit -m "feat(reports): add reports + report_notes schema and skippable NOTIFY trigger"
```

---

### Task A2: `reportsRepo`

**Files:**
- Create: `src/db/repositories/reportsRepo.ts`
- Test: `tests/db/reportsRepo.test.ts`

**Interfaces:**
- Consumes: `Pool`, the schema from Task A1.
- Produces: `reportsRepo(pool)` returning:
  - `ingest(i: IngestInput): Promise<number | null>` — inserts, returns new id or `null` on conflict.
  - `get(guildId: string, id: number): Promise<ReportWithNotes | null>`
  - `list(guildId: string, f: ListFilter): Promise<ReportRow[]>`
  - `setStatus(guildId: string, id: number, status: string, actorId: string): Promise<{ ok: boolean; from?: string }>`
  - `addNote(guildId: string, id: number, authorId: string, body: string): Promise<boolean>`
  - `merge(guildId: string, id: number, duplicateOfId: number, actorId: string): Promise<boolean>`
  - `driftRows(): Promise<ReportRow[]>` — rows where `thread_id IS NOT NULL AND tag_synced_status IS DISTINCT FROM status`.
  - `markSynced(id: number, status: string): Promise<void>`
- Types (exported from this file):

```ts
export type ReportStatus = "new" | "triaged" | "in_progress" | "resolved" | "duplicate" | "wont_fix";
export type ReportPriority = "low" | "normal" | "high";
export interface IngestInput {
  guildId: string; source: "bug_forum" | "security" | "manual";
  sourceRef: string | null; threadId: string | null;
  title: string; body: string; authorId: string | null; priority: ReportPriority;
}
export interface ReportRow {
  id: number; guildId: string; source: string; sourceRef: string | null; threadId: string | null;
  title: string; body: string | null; authorId: string | null; status: string; priority: string;
  duplicateOf: number | null; tagSyncedStatus: string | null; createdAt: Date; updatedAt: Date;
}
export interface ReportNote { authorId: string; kind: string; body: string; createdAt: Date; }
export interface ReportWithNotes extends ReportRow { notes: ReportNote[]; }
export interface ListFilter { status?: string; source?: string; priority?: string; limit?: number; }
export const REPORT_STATUSES: ReportStatus[] = ["new","triaged","in_progress","resolved","duplicate","wont_fix"];
```

- [ ] **Step 1: Write the failing test `tests/db/reportsRepo.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { freshPool } from "./memDb.js";
import { reportsRepo } from "../../src/db/repositories/reportsRepo.js";

const base = {
  guildId: "g1", source: "bug_forum" as const, sourceRef: "t1", threadId: "t1",
  title: "Crash on join", body: "steps", authorId: "u1", priority: "normal" as const,
};

describe("reportsRepo", () => {
  it("ingest is idempotent on (guild, source, source_ref)", async () => {
    const repo = reportsRepo(await freshPool());
    const id = await repo.ingest(base);
    expect(id).not.toBeNull();
    expect(await repo.ingest(base)).toBeNull();
  });

  it("get returns the row with its notes newest-last", async () => {
    const repo = reportsRepo(await freshPool());
    const id = (await repo.ingest(base))!;
    await repo.addNote("g1", id, "assistant", "note A");
    const r = await repo.get("g1", id);
    expect(r?.title).toBe("Crash on join");
    expect(r?.notes.map((n) => n.body)).toEqual(["note A"]);
  });

  it("get is guild-scoped (other guild cannot read the row)", async () => {
    const repo = reportsRepo(await freshPool());
    const id = (await repo.ingest(base))!;
    expect(await repo.get("OTHER", id)).toBeNull();
  });

  it("setStatus updates status, records a status_change note, and is a no-op on same status", async () => {
    const repo = reportsRepo(await freshPool());
    const id = (await repo.ingest(base))!;
    const a = await repo.setStatus("g1", id, "triaged", "mod1");
    expect(a).toEqual({ ok: true, from: "new" });
    const r = await repo.get("g1", id);
    expect(r?.status).toBe("triaged");
    expect(r?.notes.some((n) => n.kind === "status_change" && n.body === "new → triaged")).toBe(true);
    const b = await repo.setStatus("g1", id, "triaged", "mod1");
    expect(b.ok).toBe(false);
  });

  it("list filters by status and source", async () => {
    const repo = reportsRepo(await freshPool());
    await repo.ingest(base);
    await repo.ingest({ ...base, sourceRef: "t2", threadId: "t2", title: "B" });
    await repo.setStatus("g1", 1, "resolved", "mod1");
    expect((await repo.list("g1", { status: "resolved" })).length).toBe(1);
    expect((await repo.list("g1", { source: "bug_forum" })).length).toBe(2);
  });

  it("merge marks the item duplicate and sets duplicate_of", async () => {
    const repo = reportsRepo(await freshPool());
    const a = (await repo.ingest(base))!;
    const b = (await repo.ingest({ ...base, sourceRef: "t2", threadId: "t2", title: "B" }))!;
    expect(await repo.merge("g1", b, a, "mod1")).toBe(true);
    const r = await repo.get("g1", b);
    expect(r?.status).toBe("duplicate");
    expect(r?.duplicateOf).toBe(a);
  });

  it("driftRows returns forum items whose synced status lags, markSynced clears them", async () => {
    const repo = reportsRepo(await freshPool());
    const id = (await repo.ingest(base))!;
    expect((await repo.driftRows()).map((r) => r.id)).toContain(id);
    await repo.markSynced(id, "new");
    expect((await repo.driftRows()).map((r) => r.id)).not.toContain(id);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/db/reportsRepo.test.ts`
Expected: FAIL with "Cannot find module '../../src/db/repositories/reportsRepo.js'".

- [ ] **Step 3: Implement `src/db/repositories/reportsRepo.ts`**

```ts
import type { Pool } from "pg";

export type ReportStatus = "new" | "triaged" | "in_progress" | "resolved" | "duplicate" | "wont_fix";
export type ReportPriority = "low" | "normal" | "high";
export interface IngestInput {
  guildId: string; source: "bug_forum" | "security" | "manual";
  sourceRef: string | null; threadId: string | null;
  title: string; body: string; authorId: string | null; priority: ReportPriority;
}
export interface ReportRow {
  id: number; guildId: string; source: string; sourceRef: string | null; threadId: string | null;
  title: string; body: string | null; authorId: string | null; status: string; priority: string;
  duplicateOf: number | null; tagSyncedStatus: string | null; createdAt: Date; updatedAt: Date;
}
export interface ReportNote { authorId: string; kind: string; body: string; createdAt: Date; }
export interface ReportWithNotes extends ReportRow { notes: ReportNote[]; }
export interface ListFilter { status?: string; source?: string; priority?: string; limit?: number; }
export const REPORT_STATUSES: ReportStatus[] = ["new","triaged","in_progress","resolved","duplicate","wont_fix"];

function mapRow(x: any): ReportRow {
  return {
    id: Number(x.id), guildId: x.guild_id, source: x.source, sourceRef: x.source_ref,
    threadId: x.thread_id, title: x.title, body: x.body, authorId: x.author_id,
    status: x.status, priority: x.priority, duplicateOf: x.duplicate_of === null ? null : Number(x.duplicate_of),
    tagSyncedStatus: x.tag_synced_status, createdAt: x.created_at, updatedAt: x.updated_at,
  };
}

export function reportsRepo(pool: Pool) {
  return {
    async ingest(i: IngestInput): Promise<number | null> {
      const r = await pool.query(
        `INSERT INTO reports (guild_id, source, source_ref, thread_id, title, body, author_id, priority)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (guild_id, source, source_ref) DO NOTHING
         RETURNING id`,
        [i.guildId, i.source, i.sourceRef, i.threadId, i.title, i.body, i.authorId, i.priority]
      );
      return r.rowCount ? Number(r.rows[0].id) : null;
    },

    async get(guildId: string, id: number): Promise<ReportWithNotes | null> {
      const r = await pool.query("SELECT * FROM reports WHERE guild_id=$1 AND id=$2", [guildId, id]);
      if (!r.rowCount) return null;
      const notes = await pool.query(
        "SELECT author_id, kind, body, created_at FROM report_notes WHERE report_id=$1 ORDER BY id ASC",
        [id]
      );
      return {
        ...mapRow(r.rows[0]),
        notes: notes.rows.map((n: any) => ({ authorId: n.author_id, kind: n.kind, body: n.body, createdAt: n.created_at })),
      };
    },

    async list(guildId: string, f: ListFilter): Promise<ReportRow[]> {
      const where = ["guild_id=$1"];
      const params: any[] = [guildId];
      if (f.status) { params.push(f.status); where.push(`status=$${params.length}`); }
      if (f.source) { params.push(f.source); where.push(`source=$${params.length}`); }
      if (f.priority) { params.push(f.priority); where.push(`priority=$${params.length}`); }
      params.push(Math.min(f.limit ?? 25, 100));
      const r = await pool.query(
        `SELECT * FROM reports WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT $${params.length}`,
        params
      );
      return r.rows.map(mapRow);
    },

    async setStatus(guildId: string, id: number, status: string, actorId: string): Promise<{ ok: boolean; from?: string }> {
      const cur = await pool.query("SELECT status FROM reports WHERE guild_id=$1 AND id=$2", [guildId, id]);
      if (!cur.rowCount) return { ok: false };
      const from = cur.rows[0].status as string;
      if (from === status) return { ok: false };
      await pool.query("UPDATE reports SET status=$1, updated_at=now() WHERE guild_id=$2 AND id=$3", [status, guildId, id]);
      await pool.query(
        "INSERT INTO report_notes (report_id, author_id, kind, body) VALUES ($1,$2,'status_change',$3)",
        [id, actorId, `${from} → ${status}`]
      );
      return { ok: true, from };
    },

    async addNote(guildId: string, id: number, authorId: string, body: string): Promise<boolean> {
      const owned = await pool.query("SELECT 1 FROM reports WHERE guild_id=$1 AND id=$2", [guildId, id]);
      if (!owned.rowCount) return false;
      await pool.query(
        "INSERT INTO report_notes (report_id, author_id, kind, body) VALUES ($1,$2,'note',$3)",
        [id, authorId, body]
      );
      return true;
    },

    async merge(guildId: string, id: number, duplicateOfId: number, actorId: string): Promise<boolean> {
      const owned = await pool.query("SELECT status FROM reports WHERE guild_id=$1 AND id=$2", [guildId, id]);
      if (!owned.rowCount) return false;
      await pool.query(
        "UPDATE reports SET status='duplicate', duplicate_of=$1, updated_at=now() WHERE guild_id=$2 AND id=$3",
        [duplicateOfId, guildId, id]
      );
      await pool.query(
        "INSERT INTO report_notes (report_id, author_id, kind, body) VALUES ($1,$2,'status_change',$3)",
        [id, actorId, `merged as duplicate of #${duplicateOfId}`]
      );
      return true;
    },

    async driftRows(): Promise<ReportRow[]> {
      const r = await pool.query(
        "SELECT * FROM reports WHERE thread_id IS NOT NULL AND tag_synced_status IS DISTINCT FROM status"
      );
      return r.rows.map(mapRow);
    },

    async markSynced(id: number, status: string): Promise<void> {
      await pool.query("UPDATE reports SET tag_synced_status=$1 WHERE id=$2", [status, id]);
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/db/reportsRepo.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/reportsRepo.ts tests/db/reportsRepo.test.ts
git commit -m "feat(reports): add reportsRepo (ingest, get, list, setStatus, note, merge, drift)"
```

---

### Task A3: Ingest decision logic + config channel ids

**Files:**
- Create: `src/reports/ingest.ts`
- Modify: `src/config/guildConfig.ts` (add `bugForumChannelId`, `securityChannelId`)
- Test: `tests/reports/ingest.test.ts`

**Interfaces:**
- Consumes: `IngestInput`, `ReportPriority` from `reportsRepo.js`.
- Produces:
  - `securityMessageToReport(m: IncomingSecurityMessage): IngestInput | null`
  - `bugThreadToReport(t: IncomingBugThread, bugForumChannelId: string): IngestInput | null`
  - Config fields `bugForumChannelId: string | null`, `securityChannelId: string | null`.

- [ ] **Step 1: Add channel ids to `GuildConfig` and `DEFAULT_CONFIG`**

In `src/config/guildConfig.ts`, add two fields to the interface (after `statusChannelId`):

```ts
  bugForumChannelId: string | null;
  securityChannelId: string | null;
```

And to `DEFAULT_CONFIG`'s returned object (after `statusChannelId: null,`):

```ts
    bugForumChannelId: null,
    securityChannelId: null,
```

(`mergeConfig` needs no change — it spreads all fields.)

- [ ] **Step 2: Write the failing test `tests/reports/ingest.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { securityMessageToReport, bugThreadToReport } from "../../src/reports/ingest.js";

describe("securityMessageToReport", () => {
  const m = { guildId: "g1", authorBot: false, isReply: false, content: "Exploit: dupe glitch\nsteps here", authorId: "u1", messageId: "m1" };
  it("maps a top-level human message to a high-priority security item", () => {
    const r = securityMessageToReport(m)!;
    expect(r.source).toBe("security");
    expect(r.priority).toBe("high");
    expect(r.title).toBe("Exploit: dupe glitch");
    expect(r.body).toContain("steps here");
    expect(r.sourceRef).toBe("m1");
    expect(r.threadId).toBeNull();
  });
  it("ignores bot messages", () => expect(securityMessageToReport({ ...m, authorBot: true })).toBeNull());
  it("ignores replies", () => expect(securityMessageToReport({ ...m, isReply: true })).toBeNull());
  it("ignores empty content", () => expect(securityMessageToReport({ ...m, content: "   " })).toBeNull());
  it("truncates a very long title to 120 chars", () => {
    const r = securityMessageToReport({ ...m, content: "x".repeat(200) })!;
    expect(r.title.length).toBe(120);
  });
});

describe("bugThreadToReport", () => {
  const t = { guildId: "g1", threadId: "t1", parentId: "FORUM", name: "Crash on join", starterContent: "repro steps", ownerId: "u9" };
  it("maps a thread under the bug forum to a normal-priority bug item", () => {
    const r = bugThreadToReport(t, "FORUM")!;
    expect(r.source).toBe("bug_forum");
    expect(r.priority).toBe("normal");
    expect(r.threadId).toBe("t1");
    expect(r.sourceRef).toBe("t1");
    expect(r.title).toBe("Crash on join");
    expect(r.authorId).toBe("u9");
  });
  it("ignores threads under other channels", () => {
    expect(bugThreadToReport(t, "OTHERFORUM")).toBeNull();
  });
  it("tolerates a missing starter message", () => {
    const r = bugThreadToReport({ ...t, starterContent: null }, "FORUM")!;
    expect(r.body).toBe("");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- tests/reports/ingest.test.ts`
Expected: FAIL with "Cannot find module '../../src/reports/ingest.js'".

- [ ] **Step 4: Implement `src/reports/ingest.ts`**

```ts
import type { IngestInput } from "../db/repositories/reportsRepo.js";

export interface IncomingSecurityMessage {
  guildId: string; authorBot: boolean; isReply: boolean; content: string; authorId: string; messageId: string;
}
export interface IncomingBugThread {
  guildId: string; threadId: string; parentId: string | null; name: string;
  starterContent: string | null; ownerId: string | null;
}

const firstLine = (s: string): string => (s.split("\n")[0] ?? "").trim();

export function securityMessageToReport(m: IncomingSecurityMessage): IngestInput | null {
  if (m.authorBot) return null;
  if (m.isReply) return null;
  const content = m.content.trim();
  if (!content) return null;
  const title = (firstLine(content) || content).slice(0, 120);
  return {
    guildId: m.guildId, source: "security", sourceRef: m.messageId, threadId: null,
    title, body: content, authorId: m.authorId, priority: "high",
  };
}

export function bugThreadToReport(t: IncomingBugThread, bugForumChannelId: string): IngestInput | null {
  if (t.parentId !== bugForumChannelId) return null;
  return {
    guildId: t.guildId, source: "bug_forum", sourceRef: t.threadId, threadId: t.threadId,
    title: t.name, body: t.starterContent ?? "", authorId: t.ownerId, priority: "normal",
  };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- tests/reports/ingest.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/reports/ingest.ts src/config/guildConfig.ts tests/reports/ingest.test.ts
git commit -m "feat(reports): add ingest decision logic + bug-forum/security channel config"
```

---

### Task A4: Status→tag map + `reconcileReport`

**Files:**
- Create: `src/reports/tagSync.ts`
- Test: `tests/reports/tagSync.test.ts`

**Interfaces:**
- Consumes: `ReportRow`, `REPORT_STATUSES` from `reportsRepo.js`.
- Produces:
  - `STATUS_TAG_NAME: Record<ReportStatus, string>` and `ALL_STATUS_TAG_NAMES: Set<string>`.
  - `interface ReconcileDeps { loadReport(id): Promise<ReportRow | null>; forumTagMap(): Promise<Map<string,string>>; getThreadTags(threadId): Promise<string[]>; applyThreadTags(threadId, tagIds): Promise<void>; markSynced(id, status): Promise<void>; log(e: unknown): void; }`
  - `reconcileReport(deps: ReconcileDeps, id: number): Promise<void>`

- [ ] **Step 1: Write the failing test `tests/reports/tagSync.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { STATUS_TAG_NAME, reconcileReport, type ReconcileDeps } from "../../src/reports/tagSync.js";
import { REPORT_STATUSES, type ReportRow } from "../../src/db/repositories/reportsRepo.js";

const row = (over: Partial<ReportRow> = {}): ReportRow => ({
  id: 1, guildId: "g1", source: "bug_forum", sourceRef: "t1", threadId: "t1",
  title: "T", body: "", authorId: "u1", status: "triaged", priority: "normal",
  duplicateOf: null, tagSyncedStatus: "new", createdAt: new Date(0), updatedAt: new Date(0),
  ...over,
});

// forum has one tag per status name; ids are `tag:<name>`
const tagMap = () => new Map(Object.values(STATUS_TAG_NAME).map((n) => [n, `tag:${n}`]));

function deps(over: Partial<ReconcileDeps> = {}): ReconcileDeps {
  return {
    loadReport: vi.fn(async () => row()),
    forumTagMap: vi.fn(async () => tagMap()),
    getThreadTags: vi.fn(async () => ["tag:new", "keepme"]),
    applyThreadTags: vi.fn(async () => {}),
    markSynced: vi.fn(async () => {}),
    log: vi.fn(),
    ...over,
  };
}

describe("STATUS_TAG_NAME", () => {
  it("has an entry for every status (exhaustive contract)", () => {
    for (const s of REPORT_STATUSES) expect(typeof STATUS_TAG_NAME[s]).toBe("string");
  });
});

describe("reconcileReport", () => {
  it("swaps the status tag, preserving non-status tags, then marks synced", async () => {
    const d = deps();
    await reconcileReport(d, 1);
    expect(d.applyThreadTags).toHaveBeenCalledWith("t1", ["keepme", "tag:triaged"]);
    expect(d.markSynced).toHaveBeenCalledWith(1, "triaged");
  });

  it("is a no-op when tag_synced_status already equals status", async () => {
    const d = deps({ loadReport: vi.fn(async () => row({ tagSyncedStatus: "triaged" })) });
    await reconcileReport(d, 1);
    expect(d.applyThreadTags).not.toHaveBeenCalled();
  });

  it("skips items without a thread_id (security/manual)", async () => {
    const d = deps({ loadReport: vi.fn(async () => row({ threadId: null })) });
    await reconcileReport(d, 1);
    expect(d.applyThreadTags).not.toHaveBeenCalled();
  });

  it("skips (and does not mark synced) when the tag is not provisioned", async () => {
    const d = deps({ forumTagMap: vi.fn(async () => new Map()) });
    await reconcileReport(d, 1);
    expect(d.applyThreadTags).not.toHaveBeenCalled();
    expect(d.markSynced).not.toHaveBeenCalled();
  });

  it("catches a Discord failure (archived/deleted thread) without marking synced", async () => {
    const d = deps({ applyThreadTags: vi.fn(async () => { throw new Error("403"); }) });
    await reconcileReport(d, 1);
    expect(d.markSynced).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalled();
  });

  it("does nothing when the report is gone", async () => {
    const d = deps({ loadReport: vi.fn(async () => null) });
    await reconcileReport(d, 1);
    expect(d.applyThreadTags).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/reports/tagSync.test.ts`
Expected: FAIL with "Cannot find module '../../src/reports/tagSync.js'".

- [ ] **Step 3: Implement `src/reports/tagSync.ts`**

```ts
import type { ReportRow, ReportStatus } from "../db/repositories/reportsRepo.js";

export const STATUS_TAG_NAME: Record<ReportStatus, string> = {
  new: "new", triaged: "triaged", in_progress: "in-progress",
  resolved: "resolved", duplicate: "duplicate", wont_fix: "wont-fix",
};
export const ALL_STATUS_TAG_NAMES: Set<string> = new Set(Object.values(STATUS_TAG_NAME));

export interface ReconcileDeps {
  loadReport(id: number): Promise<ReportRow | null>;
  forumTagMap(): Promise<Map<string, string>>; // tag name -> tag id, for the bug forum
  getThreadTags(threadId: string): Promise<string[]>;
  applyThreadTags(threadId: string, tagIds: string[]): Promise<void>;
  markSynced(id: number, status: string): Promise<void>;
  log(e: unknown): void;
}

export async function reconcileReport(deps: ReconcileDeps, id: number): Promise<void> {
  const r = await deps.loadReport(id);
  if (!r || !r.threadId) return;
  if (r.tagSyncedStatus === r.status) return;

  const wantName = STATUS_TAG_NAME[r.status as ReportStatus];
  if (!wantName) { deps.log(`unknown status "${r.status}" on report ${id}`); return; }

  const map = await deps.forumTagMap();
  const wantId = map.get(wantName);
  if (!wantId) { deps.log(`forum tag "${wantName}" not provisioned; skipping report ${id}`); return; }

  const ourTagIds = new Set(
    [...map.entries()].filter(([name]) => ALL_STATUS_TAG_NAMES.has(name)).map(([, tid]) => tid)
  );

  let current: string[];
  try {
    current = await deps.getThreadTags(r.threadId);
  } catch (e) { deps.log(e); return; }

  const next = current.filter((t) => !ourTagIds.has(t)).concat(wantId);
  try {
    await deps.applyThreadTags(r.threadId, next);
  } catch (e) { deps.log(e); return; }

  await deps.markSynced(r.id, r.status);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/reports/tagSync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reports/tagSync.ts tests/reports/tagSync.test.ts
git commit -m "feat(reports): add status->tag map and reconcileReport mirroring logic"
```

---

### Task A5: Listener + startup reconcile + router/index wiring

**Files:**
- Create: `src/reports/reconcileService.ts` (Discord-backed `ReconcileDeps`, `reconcileAll`, listener)
- Modify: `src/bot/router.ts` (ingest handlers on `threadCreate` / security `messageCreate`)
- Modify: `src/index.ts` (start listener + startup reconcile on ready)
- Test: `tests/reports/reconcileService.test.ts`

**Interfaces:**
- Consumes: `reportsRepo` (A2), `reconcileReport`/`ReconcileDeps` (A4), `bugThreadToReport`/`securityMessageToReport` (A3).
- Produces:
  - `reconcileAll(repo, runOne: (id: number) => Promise<void>): Promise<void>` — reconcile every drift row.
  - `makeForumTagMapLoader(fetchForumChannel): () => Promise<Map<string,string>>` — builds+caches name→id from `available_tags`.
  - `startReportListener(clientFactory, onNotify): Promise<{ stop: () => Promise<void> }>` — dedicated `pg` client `LISTEN report_status`.

- [ ] **Step 1: Write the failing test `tests/reports/reconcileService.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { reconcileAll, makeForumTagMapLoader } from "../../src/reports/reconcileService.js";

describe("reconcileAll", () => {
  it("runs the reconciler once per drift row", async () => {
    const repo = { driftRows: vi.fn(async () => [{ id: 1 }, { id: 2 }, { id: 3 }]) } as any;
    const runOne = vi.fn(async () => {});
    await reconcileAll(repo, runOne);
    expect(runOne.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
  });
});

describe("makeForumTagMapLoader", () => {
  it("builds a name->id map from the forum's available_tags and caches it", async () => {
    const fetchForum = vi.fn(async () => ({ available_tags: [{ id: "x", name: "new" }, { id: "y", name: "resolved" }] }));
    const load = makeForumTagMapLoader(fetchForum);
    const m = await load();
    expect(m.get("new")).toBe("x");
    expect(m.get("resolved")).toBe("y");
    await load();
    expect(fetchForum).toHaveBeenCalledTimes(1); // cached
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/reports/reconcileService.test.ts`
Expected: FAIL with "Cannot find module '../../src/reports/reconcileService.js'".

- [ ] **Step 3: Implement `src/reports/reconcileService.ts`**

```ts
import { Client as PgClient } from "pg";
import type { reportsRepo } from "../db/repositories/reportsRepo.js";

type Repo = ReturnType<typeof reportsRepo>;

export async function reconcileAll(
  repo: Pick<Repo, "driftRows">,
  runOne: (id: number) => Promise<void>
): Promise<void> {
  const rows = await repo.driftRows();
  for (const r of rows) await runOne(r.id);
}

interface ForumChannelLike { available_tags?: { id: string; name: string }[]; }

export function makeForumTagMapLoader(
  fetchForumChannel: () => Promise<ForumChannelLike>
): () => Promise<Map<string, string>> {
  let cache: Map<string, string> | null = null;
  return async () => {
    if (cache) return cache;
    const forum = await fetchForumChannel();
    cache = new Map((forum.available_tags ?? []).map((t) => [t.name, t.id]));
    return cache;
  };
}

/**
 * Dedicated pg client that LISTENs for report_status notifications. Uses its own
 * connection (not the shared Pool) because a LISTEN connection is long-lived.
 * Reconnects on error and replays a full reconcile pass to catch missed NOTIFYs.
 */
export async function startReportListener(
  clientFactory: () => PgClient,
  onNotify: (reportId: number) => Promise<void>,
  onReconnect: () => Promise<void>,
  log: (e: unknown) => void
): Promise<{ stop: () => Promise<void> }> {
  let client!: PgClient;
  let stopped = false;

  const connect = async (): Promise<void> => {
    client = clientFactory();
    client.on("notification", (msg) => {
      const id = Number(msg.payload);
      if (Number.isFinite(id)) void onNotify(id).catch(log);
    });
    client.on("error", (e) => {
      log(e);
      if (!stopped) void reconnect();
    });
    await client.connect();
    await client.query("LISTEN report_status");
    await onReconnect();
  };

  const reconnect = async (): Promise<void> => {
    try { await client.end(); } catch { /* already dead */ }
    if (!stopped) { try { await connect(); } catch (e) { log(e); } }
  };

  await connect();
  return {
    stop: async () => { stopped = true; try { await client.end(); } catch { /* ignore */ } },
  };
}
```

- [ ] **Step 4: Run to verify the two unit tests pass**

Run: `npm test -- tests/reports/reconcileService.test.ts`
Expected: PASS (2 tests). (The listener itself is smoke-tested against real Neon — see Global Constraints.)

- [ ] **Step 5: Wire ingest handlers into `src/bot/router.ts`**

At the top, add imports:

```ts
import { reportsRepo } from "../db/repositories/reportsRepo.js";
import { bugThreadToReport, securityMessageToReport } from "../reports/ingest.js";
```

Inside `attachRouter`, after the existing repo constructions, add:

```ts
  const reports = reportsRepo(ctx.pool);
```

Add a `ThreadType`/channel-type-agnostic thread handler. After the existing `guildMemberAdd` handler, add:

```ts
  client.on("threadCreate", async (thread) => {
    try {
      if (!thread.guildId) return;
      const conf = await cfg.get(thread.guildId);
      if (!conf.bugForumChannelId) return;
      const starter = await thread.fetchStarterMessage().catch(() => null);
      const input = bugThreadToReport(
        {
          guildId: thread.guildId, threadId: thread.id, parentId: thread.parentId,
          name: thread.name, starterContent: starter?.content ?? null,
          ownerId: thread.ownerId ?? null,
        },
        conf.bugForumChannelId
      );
      if (input) await reports.ingest(input);
    } catch (e) { ctx.log.error(e); }
  });
```

In the existing `messageCreate` handler, after the auto-filter/review block (still inside the `try`), add security-channel ingest:

```ts
      const conf = await cfg.get(m.guildId);
      if (conf.securityChannelId && m.channelId === conf.securityChannelId) {
        const input = securityMessageToReport({
          guildId: m.guildId, authorBot: m.author.bot, isReply: m.reference !== null,
          content: m.content, authorId: m.author.id, messageId: m.id,
        });
        if (input) await reports.ingest(input);
      }
```

- [ ] **Step 6: Wire the listener + startup reconcile into `src/index.ts`**

Add imports:

```ts
import { Client as PgClient } from "pg";
import { reportsRepo } from "./db/repositories/reportsRepo.js";
import { reconcileReport, type ReconcileDeps } from "./reports/tagSync.js";
import { reconcileAll, makeForumTagMapLoader, startReportListener } from "./reports/reconcileService.js";
import { ChannelType } from "discord.js";
```

Inside `main`, after `attachRouter(...)`, build the reconcile wiring and start it inside the `ClientReady` handler (the guild + channel caches are ready there). Add this block at the end of the existing `client.once(Events.ClientReady, ...)` callback body, after command registration:

```ts
    try {
      const reports = reportsRepo(pool);
      // Resolve the bug-forum channel id from config (single-guild deployment).
      const anyGuild = c.guilds.cache.first();
      const conf = anyGuild ? await (await import("./db/repositories/configRepo.js")).configRepo(pool).get(anyGuild.id) : null;
      if (conf?.bugForumChannelId) {
        const forumId = conf.bugForumChannelId;
        const loadTagMap = makeForumTagMapLoader(async () => {
          const ch = await c.channels.fetch(forumId);
          return { available_tags: (ch as any)?.availableTags?.map((t: any) => ({ id: t.id, name: t.name })) ?? [] };
        });
        const deps: ReconcileDeps = {
          loadReport: async (id) => (await reports.get(conf.guildId, id)) ?? null,
          forumTagMap: loadTagMap,
          getThreadTags: async (threadId) => {
            const th = await c.channels.fetch(threadId);
            return th && th.type === ChannelType.PublicThread ? [...(th.appliedTags ?? [])] : [];
          },
          applyThreadTags: async (threadId, tagIds) => {
            const th = await c.channels.fetch(threadId);
            if (th && th.type === ChannelType.PublicThread) await th.setAppliedTags(tagIds);
          },
          markSynced: (id, status) => reports.markSynced(id, status),
          log: (e) => log.error(e),
        };
        const runOne = (id: number) => reconcileReport(deps, id);
        await startReportListener(
          () => new PgClient({ connectionString: env.databaseUrl }),
          runOne,
          () => reconcileAll(reports, runOne),
          (e) => log.error(e)
        );
        log.info("report backlog listener started");
      }
    } catch (e) {
      log.error(e);
    }
```

- [ ] **Step 7: Typecheck + run the full suite**

Run: `npm run build && npm test`
Expected: build succeeds; all tests PASS (Part A suite green). Ingest/listener wiring is covered by unit tests for its pure pieces; the live `threadCreate`/`LISTEN` path is verified in rollout smoke tests.

- [ ] **Step 8: Commit**

```bash
git add src/reports/reconcileService.ts src/bot/router.ts src/index.ts tests/reports/reconcileService.test.ts
git commit -m "feat(reports): wire ingest handlers, NOTIFY listener, and startup reconcile"
```

---

### Task A6: `/backlog` slash commands

**Files:**
- Create: `src/reports/backlogCommand.ts` (pure command runner + format helpers)
- Modify: `src/bot/registerCommands.ts` (add the `/backlog` command definition)
- Modify: `src/bot/router.ts` (dispatch `/backlog` in `interactionCreate`)
- Test: `tests/reports/backlogCommand.test.ts`, add a case to `tests/bot/registerCommands.test.ts`

**Interfaces:**
- Consumes: `reportsRepo` (A2), `REPORT_STATUSES` (A2).
- Produces:
  - `runBacklog(repo, i: BacklogInput): Promise<string>` where `BacklogInput = { guildId; actorId; sub: "list"|"view"|"status"|"note"|"add"; status?; id?; text?; title?; priority? }`.
  - `buildCommandData()` includes a `backlog` command with subcommands `list|view|status|note|add`.

- [ ] **Step 1: Write the failing test `tests/reports/backlogCommand.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { freshPool } from "../db/memDb.js";
import { reportsRepo } from "../../src/db/repositories/reportsRepo.js";
import { runBacklog } from "../../src/reports/backlogCommand.js";

const seed = async () => {
  const pool = await freshPool();
  const repo = reportsRepo(pool);
  const id = (await repo.ingest({ guildId: "g1", source: "bug_forum", sourceRef: "t1", threadId: "t1", title: "Crash", body: "b", authorId: "u1", priority: "normal" }))!;
  return { repo, id };
};

describe("runBacklog", () => {
  it("list renders id, title, status", async () => {
    const { repo } = await seed();
    const out = await runBacklog(repo, { guildId: "g1", actorId: "m1", sub: "list" });
    expect(out).toContain("Crash");
    expect(out).toContain("new");
  });
  it("view shows the item and its notes", async () => {
    const { repo, id } = await seed();
    await repo.addNote("g1", id, "m1", "hello");
    const out = await runBacklog(repo, { guildId: "g1", actorId: "m1", sub: "view", id });
    expect(out).toContain("Crash");
    expect(out).toContain("hello");
  });
  it("status changes state and reports the transition", async () => {
    const { repo, id } = await seed();
    const out = await runBacklog(repo, { guildId: "g1", actorId: "m1", sub: "status", id, status: "triaged" });
    expect(out).toContain("new → triaged");
    expect((await repo.get("g1", id))?.status).toBe("triaged");
  });
  it("status rejects an unknown state", async () => {
    const { repo, id } = await seed();
    const out = await runBacklog(repo, { guildId: "g1", actorId: "m1", sub: "status", id, status: "bogus" });
    expect(out.toLowerCase()).toContain("unknown status");
  });
  it("view of a missing id reports not found", async () => {
    const { repo } = await seed();
    const out = await runBacklog(repo, { guildId: "g1", actorId: "m1", sub: "view", id: 999 });
    expect(out.toLowerCase()).toContain("not found");
  });
  it("add creates a manual item", async () => {
    const { repo } = await seed();
    const out = await runBacklog(repo, { guildId: "g1", actorId: "m1", sub: "add", title: "Idea", priority: "low" });
    expect(out).toContain("Idea");
    expect((await repo.list("g1", { source: "manual" })).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/reports/backlogCommand.test.ts`
Expected: FAIL with "Cannot find module '../../src/reports/backlogCommand.js'".

- [ ] **Step 3: Implement `src/reports/backlogCommand.ts`**

```ts
import { reportsRepo, REPORT_STATUSES } from "../db/repositories/reportsRepo.js";

type Repo = ReturnType<typeof reportsRepo>;

export interface BacklogInput {
  guildId: string; actorId: string;
  sub: "list" | "view" | "status" | "note" | "add";
  status?: string; id?: number; text?: string; title?: string; priority?: string;
}

export async function runBacklog(repo: Repo, i: BacklogInput): Promise<string> {
  switch (i.sub) {
    case "list": {
      const rows = await repo.list(i.guildId, i.status ? { status: i.status } : {});
      if (!rows.length) return "Backlog is empty.";
      return rows.map((r) => `#${r.id} [${r.status}/${r.priority}] ${r.title}`).join("\n");
    }
    case "view": {
      if (i.id === undefined) return "Provide an id.";
      const r = await repo.get(i.guildId, i.id);
      if (!r) return `Report #${i.id} not found.`;
      const notes = r.notes.map((n) => `  • (${n.kind}) ${n.authorId}: ${n.body}`).join("\n") || "  (no notes)";
      return `#${r.id} [${r.status}/${r.priority}] ${r.title}\nsource: ${r.source} · thread: ${r.threadId ?? "—"}\n${r.body ?? ""}\nNotes:\n${notes}`;
    }
    case "status": {
      if (i.id === undefined || !i.status) return "Provide an id and status.";
      if (!REPORT_STATUSES.includes(i.status as any)) {
        return `Unknown status "${i.status}". Valid: ${REPORT_STATUSES.join(", ")}.`;
      }
      const r = await repo.setStatus(i.guildId, i.id, i.status, i.actorId);
      if (!r.ok) return `No change (report #${i.id} missing or already "${i.status}").`;
      return `Report #${i.id}: ${r.from} → ${i.status}.`;
    }
    case "note": {
      if (i.id === undefined || !i.text) return "Provide an id and note text.";
      const ok = await repo.addNote(i.guildId, i.id, i.actorId, i.text);
      return ok ? `Noted on #${i.id}.` : `Report #${i.id} not found.`;
    }
    case "add": {
      if (!i.title) return "Provide a title.";
      const priority = i.priority === "low" || i.priority === "high" ? i.priority : "normal";
      const id = await repo.ingest({
        guildId: i.guildId, source: "manual", sourceRef: null, threadId: null,
        title: i.title, body: "", authorId: null, priority,
      });
      return `Created manual item #${id}: ${i.title} [${priority}].`;
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/reports/backlogCommand.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the `/backlog` command to `buildCommandData` in `src/bot/registerCommands.ts`**

Add inside `buildCommandData`, before the `return`:

```ts
  const backlog = new SlashCommandBuilder().setName("backlog").setDescription("Report backlog");
  backlog.addSubcommand((s) =>
    s.setName("list").setDescription("List items").addStringOption((o) =>
      o.setName("status").setDescription("Filter by status").setRequired(false)));
  backlog.addSubcommand((s) =>
    s.setName("view").setDescription("View one item").addIntegerOption((o) =>
      o.setName("id").setDescription("Report id").setRequired(true)));
  backlog.addSubcommand((s) =>
    s.setName("status").setDescription("Set status").addIntegerOption((o) =>
      o.setName("id").setDescription("Report id").setRequired(true)).addStringOption((o) =>
      o.setName("status").setDescription("new|triaged|in_progress|resolved|duplicate|wont_fix").setRequired(true)));
  backlog.addSubcommand((s) =>
    s.setName("note").setDescription("Add a note").addIntegerOption((o) =>
      o.setName("id").setDescription("Report id").setRequired(true)).addStringOption((o) =>
      o.setName("text").setDescription("Note").setRequired(true)));
  backlog.addSubcommand((s) =>
    s.setName("add").setDescription("Add a manual item").addStringOption((o) =>
      o.setName("title").setDescription("Title").setRequired(true)).addStringOption((o) =>
      o.setName("priority").setDescription("low|normal|high").setRequired(false)));
```

And change the return to include it:

```ts
  return [warn, mute, kick, ban, backlog].map((b) => b.toJSON());
```

- [ ] **Step 6: Add a `registerCommands.test.ts` assertion**

In `tests/bot/registerCommands.test.ts`, add:

```ts
  it("includes the backlog command with 5 subcommands", () => {
    const cmds = buildCommandData();
    const backlog = cmds.find((c) => c.name === "backlog");
    expect(backlog).toBeDefined();
    expect((backlog as any).options).toHaveLength(5);
  });
```

- [ ] **Step 7: Dispatch `/backlog` in `src/bot/router.ts`**

Add import at top:

```ts
import { runBacklog } from "../reports/backlogCommand.js";
```

In the `interactionCreate` handler, the current code replies "You lack moderation permission" for non-mods, then reads `user`/`reason` (both mod-action-specific). `/backlog` has no `user` option, so handle it BEFORE the `getUser("user", true)` line. Right after the `ModerateMembers` permission check block, add:

```ts
    if (gi.commandName === "backlog") {
      const sub = gi.options.getSubcommand() as "list" | "view" | "status" | "note" | "add";
      try {
        const out = await runBacklog(reports, {
          guildId: i.guildId, actorId: gi.user.id, sub,
          status: gi.options.getString("status") ?? undefined,
          id: gi.options.getInteger("id") ?? undefined,
          text: gi.options.getString("text") ?? undefined,
          title: gi.options.getString("title") ?? undefined,
          priority: gi.options.getString("priority") ?? undefined,
        });
        await gi.reply({ content: out.slice(0, 1900), flags: MessageFlags.Ephemeral });
      } catch (e) {
        ctx.log.error(e);
        await gi.reply({ content: "Backlog command failed.", flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      return;
    }
```

(`reports` is already constructed in `attachRouter` from Task A5. `MessageFlags` is already imported.)

- [ ] **Step 8: Typecheck + full suite**

Run: `npm run build && npm test`
Expected: build succeeds; all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/reports/backlogCommand.ts src/bot/registerCommands.ts src/bot/router.ts tests/reports/backlogCommand.test.ts tests/bot/registerCommands.test.ts
git commit -m "feat(reports): add /backlog slash command (list/view/status/note/add)"
```

---

# PART B — Assistant bot / MCP (`collapsedstargames-mcp`)

All Part B paths are relative to `D:\Projects\collapsedstargames-mcp`. Part B assumes the migration from Task A1 has been applied to the shared Neon DB.

### Task B1: `pg` dependency, DB config, and backlog context

**Files:**
- Modify: `package.json` (add `pg` + `@types/pg`, add `pg-mem` dev dep)
- Modify: `src/config.ts` (require `DATABASE_URL`)
- Create: `src/backlogDb.ts` (pool factory + `BacklogContext`)
- Modify: `.env.example` (document `DATABASE_URL`)
- Test: add a case to `tests/config.test.ts`

**Interfaces:**
- Produces: `Config.databaseUrl: string`; `createDbPool(url): Pool`; `interface BacklogContext { db: Pool; guildId: string }`.

- [ ] **Step 1: Add deps**

Run: `npm install pg && npm install -D @types/pg pg-mem`
Expected: `pg`, `@types/pg`, `pg-mem` appear in `package.json`.

- [ ] **Step 2: Write the failing config test** (add to `tests/config.test.ts`)

```ts
  it("loads DATABASE_URL and errors when missing", () => {
    const env = { DISCORD_MCP_TOKEN: "t", DISCORD_GUILD_ID: "g", DATABASE_URL: "postgres://x" };
    expect(loadConfig(env).databaseUrl).toBe("postgres://x");
    expect(() => loadConfig({ DISCORD_MCP_TOKEN: "t", DISCORD_GUILD_ID: "g" })).toThrow(/DATABASE_URL/);
  });
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL (`databaseUrl` undefined / no throw).

- [ ] **Step 4: Update `src/config.ts`**

```ts
export interface Config {
  token: string;
  guildId: string;
  databaseUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = env.DISCORD_MCP_TOKEN?.trim();
  const guildId = env.DISCORD_GUILD_ID?.trim();
  const databaseUrl = env.DATABASE_URL?.trim();

  const missing: string[] = [];
  if (!token) missing.push('DISCORD_MCP_TOKEN');
  if (!guildId) missing.push('DISCORD_GUILD_ID');
  if (!databaseUrl) missing.push('DATABASE_URL');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }

  return { token: token as string, guildId: guildId as string, databaseUrl: databaseUrl as string };
}
```

- [ ] **Step 5: Create `src/backlogDb.ts`**

```ts
import { Pool } from 'pg';

export interface BacklogContext {
  db: Pool;
  guildId: string;
}

export function createDbPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}
```

- [ ] **Step 6: Document the env var** in `.env.example` (create if absent):

```
DISCORD_MCP_TOKEN=
DISCORD_GUILD_ID=1512237266800742570
DATABASE_URL=postgres://...?sslmode=require
```

- [ ] **Step 7: Run to verify it passes**

Run: `npm test -- tests/config.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/config.ts src/backlogDb.ts .env.example tests/config.test.ts
git commit -m "feat(backlog): add pg dependency, DATABASE_URL config, and backlog context"
```

---

### Task B2: Backlog read tools (`backlog_list`, `backlog_get`)

**Files:**
- Create: `src/tools/backlog.ts` (start with read tools + helpers)
- Test: `tests/backlog.test.ts`

**Interfaces:**
- Consumes: `BacklogContext` (B1). The `reports`/`report_notes` schema (A1).
- Produces (in `src/tools/backlog.ts`):
  - `listBacklog(ctx, args): Promise<ToolResult>`
  - `getBacklog(ctx, args): Promise<ToolResult>`
  - Reuses `ok`, `toolTry`, `ToolResult` from `../discord.js`.

Guild scope is enforced by filtering every query with `ctx.guildId` — an id from another guild simply returns "not found".

- [ ] **Step 1: Write the failing test `tests/backlog.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { listBacklog, getBacklog } from '../src/tools/backlog.js';
import type { BacklogContext } from '../src/backlogDb.js';

// Minimal reports schema (mirrors mod-bot migration 002, no trigger).
const SCHEMA = `
CREATE TABLE reports (id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, source TEXT NOT NULL,
  source_ref TEXT, thread_id TEXT, title TEXT NOT NULL, body TEXT, author_id TEXT,
  status TEXT NOT NULL DEFAULT 'new', priority TEXT NOT NULL DEFAULT 'normal',
  duplicate_of BIGINT, tag_synced_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE report_notes (id BIGSERIAL PRIMARY KEY, report_id BIGINT NOT NULL, author_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note', body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());`;

async function ctxWith(rows: Array<[string, string, string]>): Promise<{ ctx: BacklogContext; db: Pool }> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const db = new Pool() as unknown as Pool;
  await db.query(SCHEMA);
  for (const [guild, title, status] of rows) {
    await db.query('INSERT INTO reports (guild_id, source, title, status) VALUES ($1,$2,$3,$4)',
      [guild, 'manual', title, status]);
  }
  return { ctx: { db, guildId: 'G' }, db };
}

describe('listBacklog', () => {
  it('lists items for the configured guild only', async () => {
    const { ctx } = await ctxWith([['G', 'mine', 'new'], ['OTHER', 'theirs', 'new']]);
    const r = await listBacklog(ctx, {});
    expect(r.content[0].text).toContain('mine');
    expect(r.content[0].text).not.toContain('theirs');
  });
  it('filters by status', async () => {
    const { ctx } = await ctxWith([['G', 'a', 'new'], ['G', 'b', 'resolved']]);
    const r = await listBacklog(ctx, { status: 'resolved' });
    expect(r.content[0].text).toContain('b');
    expect(r.content[0].text).not.toContain('a');
  });
});

describe('getBacklog', () => {
  it('returns the item with notes', async () => {
    const { ctx, db } = await ctxWith([['G', 'crash', 'new']]);
    await db.query("INSERT INTO report_notes (report_id, author_id, kind, body) VALUES (1,'assistant','note','hi')");
    const r = await getBacklog(ctx, { id: 1 });
    expect(r.content[0].text).toContain('crash');
    expect(r.content[0].text).toContain('hi');
  });
  it('refuses an item from another guild (not found)', async () => {
    const { ctx } = await ctxWith([['OTHER', 'secret', 'new']]);
    const r = await getBacklog(ctx, { id: 1 });
    expect(r.content[0].text.toLowerCase()).toContain('not found');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/backlog.test.ts`
Expected: FAIL with "Cannot find module '../src/tools/backlog.js'".

- [ ] **Step 3: Implement the read half of `src/tools/backlog.ts`**

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { asCallResult, ok, toolTry, type ToolResult } from '../discord.js';
import type { BacklogContext } from '../backlogDb.js';

export const BACKLOG_STATUSES = ['new', 'triaged', 'in_progress', 'resolved', 'duplicate', 'wont_fix'] as const;
export const BACKLOG_PRIORITIES = ['low', 'normal', 'high'] as const;

function line(r: any): string {
  return `#${r.id} [${r.status}/${r.priority}] ${r.title}`;
}

export async function listBacklog(
  ctx: BacklogContext,
  args: { status?: string; source?: string; priority?: string; limit?: number },
): Promise<ToolResult> {
  return toolTry(async () => {
    const where = ['guild_id=$1'];
    const params: any[] = [ctx.guildId];
    for (const [k, col] of [['status', 'status'], ['source', 'source'], ['priority', 'priority']] as const) {
      const v = (args as any)[k];
      if (v) { params.push(v); where.push(`${col}=$${params.length}`); }
    }
    params.push(Math.min(args.limit ?? 25, 100));
    const r = await ctx.db.query(
      `SELECT id, title, status, priority FROM reports WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT $${params.length}`,
      params,
    );
    return ok(r.rows.map(line).join('\n') || 'Backlog is empty.');
  });
}

export async function getBacklog(ctx: BacklogContext, args: { id: number }): Promise<ToolResult> {
  return toolTry(async () => {
    const r = await ctx.db.query('SELECT * FROM reports WHERE guild_id=$1 AND id=$2', [ctx.guildId, args.id]);
    if (!r.rowCount) return ok(`Report #${args.id} not found.`);
    const row = r.rows[0];
    const notes = await ctx.db.query(
      'SELECT author_id, kind, body FROM report_notes WHERE report_id=$1 ORDER BY id ASC',
      [args.id],
    );
    const noteLines = notes.rows.map((n: any) => `  • (${n.kind}) ${n.author_id}: ${n.body}`).join('\n') || '  (no notes)';
    return ok(
      `#${row.id} [${row.status}/${row.priority}] ${row.title}\n` +
        `source: ${row.source} · thread: ${row.thread_id ?? '—'} · author: ${row.author_id ?? '—'}\n` +
        `${row.body ?? ''}\nNotes:\n${noteLines}`,
    );
  });
}

export function registerBacklogTools(server: McpServer, ctx: BacklogContext): void {
  server.registerTool(
    'backlog_list',
    {
      description: 'List backlog reports (bug/security/manual) for the guild, newest first. Optional status/source/priority filters.',
      inputSchema: {
        status: z.enum(BACKLOG_STATUSES).optional(),
        source: z.enum(['bug_forum', 'security', 'manual']).optional(),
        priority: z.enum(BACKLOG_PRIORITIES).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) => asCallResult(await listBacklog(ctx, args)),
  );
  server.registerTool(
    'backlog_get',
    {
      description: 'Get one backlog report by id, with its full note/activity trail.',
      inputSchema: { id: z.number().int().describe('Report id') },
    },
    async (args) => asCallResult(await getBacklog(ctx, args)),
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/backlog.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/backlog.ts tests/backlog.test.ts
git commit -m "feat(backlog): add backlog_list and backlog_get MCP tools (guild-scoped)"
```

---

### Task B3: Backlog mutation tools (`backlog_add`, `backlog_set_status`, `backlog_note`, `backlog_merge`)

**Files:**
- Modify: `src/tools/backlog.ts` (add mutation functions + register them)
- Modify: `tests/backlog.test.ts` (add mutation cases)

**Interfaces:**
- Consumes: `BacklogContext`, `BACKLOG_STATUSES`, `BACKLOG_PRIORITIES` (B2).
- Produces: `addBacklog`, `setBacklogStatus`, `noteBacklog`, `mergeBacklog` (each `(ctx, args) => Promise<ToolResult>`), all registered in `registerBacklogTools`.
- Note: status writes here rely on the mod bot's DB trigger to NOTIFY and mirror the forum tag. The MCP only writes `reports`/`report_notes`.

- [ ] **Step 1: Add failing mutation tests to `tests/backlog.test.ts`**

```ts
import { addBacklog, setBacklogStatus, noteBacklog, mergeBacklog } from '../src/tools/backlog.js';

describe('backlog mutations', () => {
  it('backlog_add creates a manual item and returns its id', async () => {
    const { ctx, db } = await ctxWith([]);
    const r = await addBacklog(ctx, { title: 'Idea', priority: 'low' });
    expect(r.content[0].text).toMatch(/#\d+/);
    const rows = await db.query("SELECT source, priority FROM reports");
    expect(rows.rows[0]).toMatchObject({ source: 'manual', priority: 'low' });
  });

  it('backlog_set_status updates status and appends a status_change note', async () => {
    const { ctx, db } = await ctxWith([['G', 'crash', 'new']]);
    const r = await setBacklogStatus(ctx, { id: 1, status: 'triaged' });
    expect(r.content[0].text).toContain('new → triaged');
    const s = await db.query('SELECT status FROM reports WHERE id=1');
    expect(s.rows[0].status).toBe('triaged');
    const n = await db.query("SELECT body FROM report_notes WHERE report_id=1 AND kind='status_change'");
    expect(n.rows[0].body).toBe('new → triaged');
  });

  it('backlog_set_status is a no-op on same status', async () => {
    const { ctx } = await ctxWith([['G', 'crash', 'new']]);
    const r = await setBacklogStatus(ctx, { id: 1, status: 'new' });
    expect(r.content[0].text.toLowerCase()).toContain('no change');
  });

  it('backlog_set_status refuses another guild item', async () => {
    const { ctx } = await ctxWith([['OTHER', 'x', 'new']]);
    const r = await setBacklogStatus(ctx, { id: 1, status: 'triaged' });
    expect(r.content[0].text.toLowerCase()).toContain('not found');
  });

  it('backlog_note appends a note', async () => {
    const { ctx, db } = await ctxWith([['G', 'crash', 'new']]);
    await noteBacklog(ctx, { id: 1, text: 'investigating' });
    const n = await db.query("SELECT body FROM report_notes WHERE report_id=1 AND kind='note'");
    expect(n.rows[0].body).toBe('investigating');
  });

  it('backlog_merge marks duplicate and sets duplicate_of', async () => {
    const { ctx, db } = await ctxWith([['G', 'a', 'new'], ['G', 'b', 'new']]);
    const r = await mergeBacklog(ctx, { id: 2, duplicateOf: 1 });
    expect(r.content[0].text).toContain('duplicate');
    const row = await db.query('SELECT status, duplicate_of FROM reports WHERE id=2');
    expect(row.rows[0].status).toBe('duplicate');
    expect(Number(row.rows[0].duplicate_of)).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/backlog.test.ts`
Expected: FAIL with "addBacklog is not exported" / undefined.

- [ ] **Step 3: Add the mutation functions to `src/tools/backlog.ts`**

Add these functions above `registerBacklogTools`:

```ts
async function ownedStatus(ctx: BacklogContext, id: number): Promise<string | null> {
  const r = await ctx.db.query('SELECT status FROM reports WHERE guild_id=$1 AND id=$2', [ctx.guildId, id]);
  return r.rowCount ? (r.rows[0].status as string) : null;
}

export async function addBacklog(
  ctx: BacklogContext,
  args: { title: string; body?: string; priority?: string },
): Promise<ToolResult> {
  return toolTry(async () => {
    const priority = (BACKLOG_PRIORITIES as readonly string[]).includes(args.priority ?? '') ? args.priority : 'normal';
    const r = await ctx.db.query(
      `INSERT INTO reports (guild_id, source, source_ref, thread_id, title, body, author_id, priority)
       VALUES ($1,'manual',NULL,NULL,$2,$3,NULL,$4) RETURNING id`,
      [ctx.guildId, args.title, args.body ?? '', priority],
    );
    return ok(`Created manual item #${r.rows[0].id}: ${args.title} [${priority}].`);
  });
}

export async function setBacklogStatus(
  ctx: BacklogContext,
  args: { id: number; status: string },
): Promise<ToolResult> {
  return toolTry(async () => {
    if (!(BACKLOG_STATUSES as readonly string[]).includes(args.status)) {
      return ok(`Unknown status "${args.status}". Valid: ${BACKLOG_STATUSES.join(', ')}.`);
    }
    const from = await ownedStatus(ctx, args.id);
    if (from === null) return ok(`Report #${args.id} not found.`);
    if (from === args.status) return ok(`No change (report #${args.id} already "${args.status}").`);
    await ctx.db.query('UPDATE reports SET status=$1, updated_at=now() WHERE guild_id=$2 AND id=$3',
      [args.status, ctx.guildId, args.id]);
    await ctx.db.query(
      "INSERT INTO report_notes (report_id, author_id, kind, body) VALUES ($1,'assistant','status_change',$2)",
      [args.id, `${from} → ${args.status}`]);
    return ok(`Report #${args.id}: ${from} → ${args.status}.`);
  });
}

export async function noteBacklog(ctx: BacklogContext, args: { id: number; text: string }): Promise<ToolResult> {
  return toolTry(async () => {
    if ((await ownedStatus(ctx, args.id)) === null) return ok(`Report #${args.id} not found.`);
    await ctx.db.query(
      "INSERT INTO report_notes (report_id, author_id, kind, body) VALUES ($1,'assistant','note',$2)",
      [args.id, args.text]);
    return ok(`Noted on #${args.id}.`);
  });
}

export async function mergeBacklog(ctx: BacklogContext, args: { id: number; duplicateOf: number }): Promise<ToolResult> {
  return toolTry(async () => {
    if ((await ownedStatus(ctx, args.id)) === null) return ok(`Report #${args.id} not found.`);
    await ctx.db.query(
      "UPDATE reports SET status='duplicate', duplicate_of=$1, updated_at=now() WHERE guild_id=$2 AND id=$3",
      [args.duplicateOf, ctx.guildId, args.id]);
    await ctx.db.query(
      "INSERT INTO report_notes (report_id, author_id, kind, body) VALUES ($1,'assistant','status_change',$2)",
      [args.id, `merged as duplicate of #${args.duplicateOf}`]);
    return ok(`Report #${args.id} merged as duplicate of #${args.duplicateOf}.`);
  });
}
```

- [ ] **Step 4: Register the four tools** — add to `registerBacklogTools`:

```ts
  server.registerTool(
    'backlog_add',
    {
      description: 'Create a manual backlog item (e.g. a suggestion captured from chat).',
      inputSchema: {
        title: z.string(),
        body: z.string().optional(),
        priority: z.enum(BACKLOG_PRIORITIES).optional(),
      },
    },
    async (args) => asCallResult(await addBacklog(ctx, args)),
  );
  server.registerTool(
    'backlog_set_status',
    {
      description: 'Set a backlog item\'s status. The mod bot mirrors the matching tag onto the forum thread.',
      inputSchema: { id: z.number().int(), status: z.enum(BACKLOG_STATUSES) },
    },
    async (args) => asCallResult(await setBacklogStatus(ctx, args)),
  );
  server.registerTool(
    'backlog_note',
    {
      description: 'Append a free-text note to a backlog item.',
      inputSchema: { id: z.number().int(), text: z.string() },
    },
    async (args) => asCallResult(await noteBacklog(ctx, args)),
  );
  server.registerTool(
    'backlog_merge',
    {
      description: 'Mark a backlog item as a duplicate of another (sets status=duplicate, records duplicate_of).',
      inputSchema: { id: z.number().int(), duplicateOf: z.number().int() },
    },
    async (args) => asCallResult(await mergeBacklog(ctx, args)),
  );
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- tests/backlog.test.ts`
Expected: PASS (all read + mutation cases).

- [ ] **Step 6: Commit**

```bash
git add src/tools/backlog.ts tests/backlog.test.ts
git commit -m "feat(backlog): add backlog_add/set_status/note/merge MCP tools"
```

---

### Task B4: Wire backlog tools into the server

**Files:**
- Modify: `src/index.ts` (create pool, build `BacklogContext`, register backlog tools)
- Modify: `tests/wiring.test.ts` (assert the six backlog tools register)

**Interfaces:**
- Consumes: `registerBacklogTools` (B2/B3), `createDbPool`/`BacklogContext` (B1), `loadConfig` (B1).
- Produces: a server that also exposes the six `backlog_*` tools.

- [ ] **Step 1: Update `buildServer` to accept and register the backlog context**

In `src/index.ts`, change `buildServer` and `main`:

```ts
import { registerBacklogTools } from './tools/backlog.js';
import { createDbPool, type BacklogContext } from './backlogDb.js';

export function buildServer(ctx: ToolContext, backlog: BacklogContext, server?: McpServer): McpServer {
  const s = server ?? new McpServer({ name: 'collapsedstargames-mcp', version: '0.1.0' });
  registerChannelTools(s, ctx);
  registerMessageTools(s, ctx);
  registerForumTools(s, ctx);
  registerBacklogTools(s, backlog);
  return s;
}
```

And in `main`, after `const config = loadConfig();`:

```ts
  const rest = createRest(config.token);
  const ctx = createContext(rest, config.guildId);
  const db = createDbPool(config.databaseUrl);
  const backlog: BacklogContext = { db, guildId: config.guildId };
  const server = buildServer(ctx, backlog);
```

- [ ] **Step 2: Update `tests/wiring.test.ts`**

The existing test builds the server with `buildServer(ctx, fakeServer as never)` and asserts a sorted 14-name list. The new signature is `buildServer(ctx, backlog, server?)`, so the call gains a fake backlog context and the expected list gains the six `backlog_*` names (20 total). Replace the test body:

```ts
import { describe, it, expect, vi } from 'vitest';
import { newDb } from 'pg-mem';
import { buildServer } from '../src/index.js';
import type { ToolContext } from '../src/discord.js';
import type { BacklogContext } from '../src/backlogDb.js';

describe('buildServer', () => {
  it('registers exactly the 20 expected tools', () => {
    const registered: string[] = [];
    const fakeServer = { registerTool: vi.fn((name: string) => { registered.push(name); }) };
    const ctx: ToolContext = { rest: {} as never, guildId: 'G', resolveGuild: async () => 'G' };
    const mem = newDb();
    const { Pool } = mem.adapters.createPg();
    const backlog: BacklogContext = { db: new Pool() as never, guildId: 'G' };
    buildServer(ctx, backlog, fakeServer as never);

    expect(registered.sort()).toEqual(
      [
        'backlog_add', 'backlog_get', 'backlog_list', 'backlog_merge', 'backlog_note', 'backlog_set_status',
        'close_thread', 'delete_message', 'edit_channel', 'edit_message', 'get_channel', 'list_channels',
        'list_forum_posts', 'pin_message', 'read_messages', 'reopen_thread', 'reply_thread', 'send_message',
        'set_thread_tags', 'unpin_message',
      ].sort(),
    );
  });
});
```

- [ ] **Step 3: Run the full suite + build**

Run: `npm test && npm run build`
Expected: all tests PASS; `tsc` succeeds; `dist/` includes `tools/backlog.js` and `backlogDb.js`.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts tests/wiring.test.ts
git commit -m "feat(backlog): register backlog tools and wire DB pool into the MCP server"
```

---

# ROLLOUT (manual, after both parts merge)

Not code tasks — an operator checklist. Do these in order once Part A and Part B are committed.

1. **Apply the migration.** Deploy the mod bot (Railway auto-deploys from `master`); the `npm run migrate` step applies `002_reports.sql` and `003_report_notify.sql` to Neon. Confirm both appear in `schema_migrations`.
2. **Provision forum tags.** Using the assistant (MCP), create the six status tags on #bug-reports (`1512241971710660879`) via `edit_channel` with `available_tags`: `new`, `triaged`, `in-progress`, `resolved`, `duplicate`, `wont-fix`. Confirm with `get_channel`.
3. **Set the channel-id config** in `guild_config` so ingest + reconcile activate:
   ```sql
   UPDATE guild_config SET data = jsonb_set(jsonb_set(data,
     '{bugForumChannelId}', '"1512241971710660879"'::jsonb),
     '{securityChannelId}', '"1512242984069103696"'::jsonb)
   WHERE guild_id = '1512237266800742570';
   ```
4. **Add `DATABASE_URL`** (Neon, `?sslmode=require`) to the MCP `.env`; rebuild (`npm run build`) and restart Claude Code so the MCP reloads with the six backlog tools.
5. **Smoke test the live wire** (the part pg-mem can't cover):
   - Create a test thread in #bug-reports → confirm a `bug_forum` row appears and the `new` tag is applied to the thread.
   - `backlog_set_status` that item to `triaged` via the MCP → confirm the forum tag flips to `in-progress`/`triaged` (NOTIFY→listener→reconcile).
   - Post a top-level message in #security-and-exploits → confirm a `high`-priority `security` row appears; post a reply → confirm no new row.
   - Restart the mod bot with a deliberately drifted row (`tag_synced_status` stale) → confirm startup reconcile heals it.

---

## Self-Review

**Spec coverage:**
- §3 data model → Task A1. §4 ingest (bug forum / security / manual / startup reconcile) → A3 (logic), A5 (wiring), A6 `add`. §5 mirroring (tags, trigger, LISTEN, reconcile, map) → A1 (trigger), A4 (map + reconcile), A5 (listener + reconcileAll). §6 surfaces → B2/B3 (MCP tools), A6 (slash commands). §7 error handling → A4/A5 (catch+log, drift retry), B2/B3 (`ok(...)` friendly strings). §8 testing → tests in every task; pg-mem trigger caveat handled in A1. §9 rollout → ROLLOUT section. All covered.

**Placeholder scan:** No TBD/TODO; every code step shows complete code, including B4 Step 2's full `wiring.test.ts` replacement (20-name sorted assertion).

**Type consistency:** `IngestInput`, `ReportRow`, `ReconcileDeps`, `BacklogContext`, `BacklogInput` are defined once (A2/A4/B1/A6) and consumed with matching field names. Status enum uses underscores everywhere in code; tag names use hyphens only inside `STATUS_TAG_NAME` and the forum. `reportsRepo` method names (`ingest/get/list/setStatus/addNote/merge/driftRows/markSynced`) match between definition (A2) and use (A5/A6). MCP function names (`listBacklog/getBacklog/addBacklog/setBacklogStatus/noteBacklog/mergeBacklog`) match between definition (B2/B3) and registration/wiring (B2/B3/B4).
