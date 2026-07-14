# Backlog Purge — Targeted (per-id) Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `ids[]` param to the MCP `backlog_purge` tool so an operator can hard-delete exact soft-deleted rows with zero chance of catching others, fail-closed if any named id is live/not-found/other-guild.

**Architecture:** One repo, one function. Modify `purgeBacklog` in `collapsedstargames-mcp/src/tools/backlog.ts` to branch on `ids`: targeted mode validates the named ids (fail-closed) then reuses the existing dry-run preview and the existing TOCTOU-hardened confirmed transaction; age mode is left byte-for-byte unchanged. No DB migration, no new tool, no mod-bot change.

**Tech Stack:** TypeScript ESM, `pg`, Zod (MCP input schema), vitest + pg-mem for tests. MCP is a local stdio server; `npm run build` = `tsc -p tsconfig.json`, `npm run test` = `vitest run`.

**Spec:** `docs/superpowers/specs/2026-07-14-backlog-purge-targeted-design.md` (amends the soft-delete spec §5.3).

## Global Constraints

- **Working repo is `collapsedstargames-mcp`** (sibling of this website repo at `D:\Projects\collapsedstargames-mcp`). All file paths below are in that repo.
- **Do NOT change the age-mode candidate SELECT string.** The two existing TOCTOU tests patch `ctx.db.query` on the exact substring `SELECT id, status, title FROM reports`. Age mode's candidate query must keep that string verbatim, and the new targeted validation query must NOT contain it (use `SELECT id, status, title, deleted_at FROM reports` — the trailing `, deleted_at` breaks the substring match, which is intentional).
- **Age mode is unchanged behavior.** Selection, the `Nothing to purge (0 items older than <N>d).` message, the dry-run text, and the confirmed transaction (incl. its in-tx `deleted_at IS NOT NULL` re-check) stay exactly as they are today. Targeted mode reuses the same confirmed transaction.
- **Fail-closed, all-or-nothing (targeted mode).** If ANY named id is not-found (includes another guild's rows, since lookups are guild-scoped) or still live (`deleted_at IS NULL`), return a `REJECTED` message and mutate nothing — no dry-run listing, no delete.
- **`ids` empty or absent → age mode.** `{ ids: [] }` must behave identically to passing no `ids` at all.
- **Every query is guild-scoped** — filter `guild_id = ctx.guildId`. No tool may touch another guild's rows.
- **Compute time cutoffs in JS** (`new Date(Date.now() - days * 86_400_000)`) — never SQL `now() - interval` (pg-mem cannot parse it). (Age mode already does this; do not regress it.)
- **Build `IN (...)` clauses with positional placeholders** from the id list — do NOT use `= ANY($array)` (pg-mem array-param support is unreliable). (Matches existing code.)
- **`npm run test` (vitest) and `npm run build` (tsc) must both pass** before the work is considered done.

## File Structure

- `src/tools/backlog.ts` — modify `purgeBacklog` (add `ids?` to the arg type + the targeted branch) and, in `registerBacklogTools`, add `ids` to the `backlog_purge` Zod `inputSchema` and update its description. This is the only source file touched.
- `tests/backlog.test.ts` — add a new `describe('backlog purge — targeted (ids)')` block. No other test file changes.

---

### Task 1: Targeted-mode logic in `purgeBacklog` (validation + dry-run + confirm)

**Files:**
- Modify: `src/tools/backlog.ts` — function `purgeBacklog` (currently lines 185-237)
- Test: `tests/backlog.test.ts` — add a new `describe` block after the existing `describe('backlog purge', …)` (currently ends line 312)

**Interfaces:**
- Consumes: existing `BacklogContext` (`{ db, guildId }`), `ok`, `toolTry`, `ToolResult` (already imported in the file). Existing test helpers `ctxWith(rows)` and, inside the current `describe('backlog purge')`, `seedDeleted(db, guild, title, daysAgo)`. NOTE: `seedDeleted` is currently declared *inside* the `backlog purge` describe block — Step 1 hoists it (see below) so the new describe block can reuse it.
- Produces: `purgeBacklog(ctx, { ids?: number[]; olderThanDays?: number; confirm?: boolean })`. When `ids` is a non-empty array, returns either a `REJECTED — nothing purged. …` message (any id invalid), a `DRY RUN — would purge N item(s). …` listing (valid, `confirm` falsy), or `Purged N item(s).` (valid, `confirm:true`). When `ids` is absent/empty, behavior is identical to today.

- [ ] **Step 1: Hoist `seedDeleted` so both describe blocks can use it**

In `tests/backlog.test.ts`, the helper is currently declared inside `describe('backlog purge', …)`. Move its declaration up to module scope (just below the `ctxWith` helper, before the first `describe`). Delete the in-block copy. The hoisted declaration:

```typescript
// seed a soft-deleted row aged `daysAgo` days (module scope — shared by both purge blocks)
async function seedDeleted(db: any, guild: string, title: string, daysAgo: number): Promise<void> {
  const when = new Date(Date.now() - daysAgo * 86_400_000);
  await db.query("INSERT INTO reports (guild_id, source, title, deleted_at) VALUES ($1,'manual',$2,$3)", [guild, title, when]);
}
```

- [ ] **Step 2: Write the failing tests**

Append this block to the end of `tests/backlog.test.ts` (after the existing `describe('backlog purge', …)` block closes):

```typescript
describe('backlog purge — targeted (ids)', () => {
  it('targeted dry-run lists exactly the named ids and deletes nothing', async () => {
    const { ctx, db } = await ctxWith([]);
    await seedDeleted(db, 'G', 'wantthis', 0);  // id 1
    await seedDeleted(db, 'G', 'keepthis', 0);  // id 2
    const r = await purgeBacklog(ctx, { ids: [1] });
    expect(r.content[0].text).toContain('DRY RUN');
    expect(r.content[0].text).toContain('wantthis');
    expect(r.content[0].text).not.toContain('keepthis');
    expect((await db.query('SELECT count(*)::int AS n FROM reports')).rows[0].n).toBe(2);
  });

  it('targeted confirm deletes only the named ids, leaving other soft-deleted rows', async () => {
    const { ctx, db } = await ctxWith([]);
    await seedDeleted(db, 'G', 'purgeme', 0);  // id 1
    await seedDeleted(db, 'G', 'keepme', 0);   // id 2
    const r = await purgeBacklog(ctx, { ids: [1], confirm: true });
    expect(r.content[0].text).toContain('Purged 1');
    const left = await db.query('SELECT title FROM reports');
    expect(left.rows.map((x: any) => x.title)).toEqual(['keepme']);
  });

  it('targeted confirm clears duplicate_of pointers into the purged id', async () => {
    const { ctx, db } = await ctxWith([]);
    await seedDeleted(db, 'G', 'target', 0);  // id 1
    await db.query("INSERT INTO reports (guild_id, source, title, duplicate_of) VALUES ('G','manual','pointer',1)"); // id 2
    await purgeBacklog(ctx, { ids: [1], confirm: true });
    const p = await db.query("SELECT duplicate_of FROM reports WHERE title='pointer'");
    expect(p.rows[0].duplicate_of).toBeNull();
  });

  it('fail-closed: a live id rejects the whole call and deletes nothing', async () => {
    const { ctx, db } = await ctxWith([['G', 'liverow', 'new']]); // id 1 live
    await seedDeleted(db, 'G', 'deletedrow', 0);                   // id 2 soft-deleted
    const r = await purgeBacklog(ctx, { ids: [1, 2], confirm: true });
    expect(r.content[0].text).toContain('REJECTED');
    expect(r.content[0].text).toContain('#1: live');
    expect((await db.query('SELECT count(*)::int AS n FROM reports')).rows[0].n).toBe(2);
  });

  it('fail-closed: a not-found id rejects the whole call', async () => {
    const { ctx, db } = await ctxWith([]);
    await seedDeleted(db, 'G', 'deletedrow', 0); // id 1
    const r = await purgeBacklog(ctx, { ids: [1, 999], confirm: true });
    expect(r.content[0].text).toContain('REJECTED');
    expect(r.content[0].text).toContain('#999: not found');
    expect((await db.query('SELECT count(*)::int AS n FROM reports')).rows[0].n).toBe(1);
  });

  it("fail-closed: another guild's id is treated as not found and rejects", async () => {
    const { ctx, db } = await ctxWith([]);
    await seedDeleted(db, 'G', 'mine', 0);       // id 1 (guild G)
    await seedDeleted(db, 'OTHER', 'theirs', 0); // id 2 (guild OTHER)
    const r = await purgeBacklog(ctx, { ids: [2], confirm: true });
    expect(r.content[0].text).toContain('REJECTED');
    expect(r.content[0].text).toContain('#2: not found');
    expect((await db.query("SELECT count(*)::int AS n FROM reports WHERE guild_id='OTHER'")).rows[0].n).toBe(1);
  });

  it('empty ids:[] falls through to age mode', async () => {
    const { ctx, db } = await ctxWith([]);
    await seedDeleted(db, 'G', 'oldjunk', 60);
    const r = await purgeBacklog(ctx, { ids: [], olderThanDays: 30 });
    expect(r.content[0].text).toContain('DRY RUN');
    expect(r.content[0].text).toContain('oldjunk');
  });
});
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npm run test -- backlog`
Expected: the new `targeted (ids)` block fails. Because `ids` is currently ignored, all `ids:[…]` calls fall into age mode with a 30-day cutoff over 0-day-old rows → `Nothing to purge`, so the `DRY RUN` / `Purged 1` / `REJECTED` assertions all fail. (The `empty ids:[]` test already passes — it is a guard pinning that empty-array === age mode; it must stay green after the change too.) All existing tests still pass.

- [ ] **Step 4: Implement targeted mode**

Replace the entire `purgeBacklog` function (lines 185-237) with:

```typescript
export async function purgeBacklog(
  ctx: BacklogContext,
  args: { ids?: number[]; olderThanDays?: number; confirm?: boolean },
): Promise<ToolResult> {
  return toolTry(async () => {
    const targeted = Array.isArray(args.ids) && args.ids.length > 0;
    let cand: { rows: any[]; rowCount: number };

    if (targeted) {
      // Targeted mode: candidate set is exactly the named ids; age is ignored.
      const reqIds = [...new Set(args.ids!.map((n) => Number(n)))].sort((a, b) => a - b);
      const ph = reqIds.map((_, i) => `$${i + 2}`).join(',');
      // NB: "SELECT id, status, title, deleted_at" — the trailing column deliberately
      // avoids the "SELECT id, status, title FROM reports" substring the TOCTOU tests patch.
      const found = await ctx.db.query(
        `SELECT id, status, title, deleted_at FROM reports WHERE guild_id=$1 AND id IN (${ph})`,
        [ctx.guildId, ...reqIds],
      );
      const byId = new Map<number, any>(found.rows.map((r: any) => [Number(r.id), r]));
      // Fail-closed: if ANY id is not-found (incl. other guild, since guild-scoped) or
      // still live, reject the whole call and mutate nothing.
      const bad: string[] = [];
      for (const id of reqIds) {
        const row = byId.get(id);
        if (!row) bad.push(`  #${id}: not found`);
        else if (row.deleted_at === null) bad.push(`  #${id}: live — soft-delete it first`);
      }
      if (bad.length) {
        return ok(`REJECTED — nothing purged. ${bad.length} id(s) cannot be purged:\n${bad.join('\n')}`);
      }
      cand = { rows: reqIds.map((id) => byId.get(id)), rowCount: reqIds.length };
    } else {
      // Age mode (unchanged): every soft-deleted row older than the cutoff.
      const days = args.olderThanDays ?? 30;
      // Cutoff in JS (pg-mem cannot do interval arithmetic reliably).
      const cutoff = new Date(Date.now() - days * 86_400_000);
      cand = await ctx.db.query(
        'SELECT id, status, title FROM reports WHERE guild_id=$1 AND deleted_at IS NOT NULL AND deleted_at < $2 ORDER BY id ASC',
        [ctx.guildId, cutoff],
      );
      if (!cand.rowCount) return ok(`Nothing to purge (0 items older than ${days}d).`);
    }

    const ids = cand.rows.map((r: any) => Number(r.id));
    if (!args.confirm) {
      const lines = cand.rows.map((r: any) => `  #${r.id} [${r.status}] ${r.title}`).join('\n');
      return ok(`DRY RUN — would purge ${ids.length} item(s). Re-run with confirm:true to delete.\n${lines}`);
    }
    const client = await ctx.db.connect();
    try {
      await client.query('BEGIN');
      const ph = ids.map((_: number, i: number) => `$${i + 1}`).join(',');
      const gp = `$${ids.length + 1}`;
      // Re-check guild_id + deleted_at IS NOT NULL inside the transaction: guards against
      // a backlog_restore (or a cross-guild id) landing in the window between the
      // candidate SELECT above and here (TOCTOU). ALL THREE mutating statements below
      // are scoped to this re-checked set — not the stale candidate `ids` — so a row
      // that got restored out from under the candidate set keeps its notes and its
      // duplicate_of pointers intact, not just its row. Shared by age + targeted modes.
      const live = await client.query(
        `SELECT id FROM reports WHERE id IN (${ph}) AND guild_id=${gp} AND deleted_at IS NOT NULL`,
        [...ids, ctx.guildId],
      );
      const delIds = live.rows.map((r: any) => Number(r.id));
      if (!delIds.length) {
        await client.query('COMMIT');
        return ok('Purged 0 item(s).');
      }
      const dph = delIds.map((_: number, i: number) => `$${i + 1}`).join(',');
      // Null duplicate_of pointers first (RESTRICT FK); pointers are same-guild.
      await client.query(`UPDATE reports SET duplicate_of=NULL WHERE duplicate_of IN (${dph})`, delIds);
      await client.query(`DELETE FROM report_notes WHERE report_id IN (${dph})`, delIds);
      await client.query(`DELETE FROM reports WHERE id IN (${dph})`, delIds);
      await client.query('COMMIT');
      return ok(`Purged ${delIds.length} item(s).`);
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

Run: `npm run test -- backlog`
Expected: the whole `backlog.test.ts` suite passes — the 27 pre-existing tests (incl. both TOCTOU tests, which still match the untouched age-mode SELECT string) plus the 7 new targeted tests = 34.

- [ ] **Step 6: Commit**

```bash
git add src/tools/backlog.ts tests/backlog.test.ts
git commit -m "feat(backlog): add targeted per-id purge (fail-closed) to backlog_purge"
```

---

### Task 2: Expose `ids` on the MCP tool surface (Zod schema + description)

**Files:**
- Modify: `src/tools/backlog.ts` — the `backlog_purge` registration inside `registerBacklogTools` (currently lines 314-324)

**Interfaces:**
- Consumes: `purgeBacklog` from Task 1 (now accepts `ids`).
- Produces: the `backlog_purge` MCP tool now advertises an optional `ids: number[]` input, so callers (Claude Code) can invoke targeted mode. Tool count stays 23.

- [ ] **Step 1: Add `ids` to the Zod input schema and update the description**

In `registerBacklogTools`, replace the `backlog_purge` `registerTool` call (lines 314-324) with:

```typescript
  server.registerTool(
    'backlog_purge',
    {
      description:
        'Permanently delete soft-deleted backlog items. Default: bulk by age (olderThanDays, default 30). ' +
        'Pass ids:[…] to target exact soft-deleted rows regardless of age — fail-closed: if any id is live, ' +
        'not-found, or another guild\'s, the whole call is rejected and nothing is deleted. ' +
        'Dry-run by default (lists candidates, deletes nothing); pass confirm:true to hard-delete. Irreversible.',
      inputSchema: {
        ids: z.array(z.number().int()).optional(),
        olderThanDays: z.number().int().min(0).optional(),
        confirm: z.boolean().optional(),
      },
    },
    async (args) => asCallResult(await purgeBacklog(ctx, args)),
  );
```

- [ ] **Step 2: Typecheck / build**

Run: `npm run build`
Expected: `tsc` exits 0 with no errors (the `args` object from the Zod schema now structurally matches `purgeBacklog`'s `{ ids?; olderThanDays?; confirm? }` parameter).

- [ ] **Step 3: Run the full test suite (regression)**

Run: `npm run test`
Expected: every file passes — `backlog.test.ts` (34), plus `channels` (6), `config` (5), `discord` (11), `forums` (11), `messages` (13), `wiring` (1). No regressions.

- [ ] **Step 4: Commit**

```bash
git add src/tools/backlog.ts
git commit -m "feat(backlog): expose ids[] param on backlog_purge MCP tool"
```

---

## Post-implementation: live verification

Not a code task — do this after both tasks land, `dist` is rebuilt (`npm run build`), and Claude Code is restarted so the MCP respawns with the new schema. Mirrors the smoke test that motivated this work:

1. `backlog_add` two throwaway items; `backlog_delete` both (note their ids, say A and B).
2. `backlog_purge({ ids:[A,B] })` → confirm the DRY RUN lists exactly A and B.
3. `backlog_purge({ ids:[A,B, <some live id>], confirm:true })` → confirm `REJECTED — nothing purged`, and that A and B are still soft-deleted (`backlog_list includeDeleted:true`).
4. `backlog_purge({ ids:[A,B], confirm:true })` → `Purged 2`; confirm any *other* soft-deleted rows are untouched and A/B are gone (`backlog_get` → not found).

## Self-review

- **Spec coverage:** §3.1 signature → Task 1 arg type + Task 2 Zod. §3.2 mode selection (empty→age) → Task 1 `targeted` guard + the `empty ids:[]` test. §3.3 fail-closed validation → Task 1 targeted branch + the 3 fail-closed tests. §3.4 dry-run → shared dry-run path + dry-run test. §3.5 confirmed delete + FK null + notes → shared tx (unchanged) + confirm/`duplicate_of` tests. §4 unchanged surfaces → Global Constraints (age SELECT string, tx untouched) + full-suite regression in Task 2. §5 edge cases: mixed valid/invalid → fail-closed tests; ids+olderThanDays → `targeted` wins by construction; empty ids → guard test; duplicate ids → `new Set(...)` dedupe in impl. §6 testing → all seven tests present. §7 rollout → Post-implementation section.
- **Placeholder scan:** none — every step has concrete code or an exact command.
- **Type consistency:** `purgeBacklog` arg shape `{ ids?: number[]; olderThanDays?: number; confirm?: boolean }` is identical in the function signature (Task 1) and matches the Zod `inputSchema` keys (Task 2). `cand` is `{ rows: any[]; rowCount: number }` in both branches. Helper name `seedDeleted` is consistent after the hoist.
