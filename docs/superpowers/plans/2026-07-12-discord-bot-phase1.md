# Discord Bot — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an always-on Discord moderation bot for the Collapsed Star Games community — auto-filter, AI-assisted review, mod commands, and anti-raid — as a standalone TypeScript service.

**Architecture:** A discord.js v14 gateway process routes Discord events to focused modules. All decision logic lives in **pure, unit-tested functions**; discord.js and Postgres are thin adapters around them. Runtime behavior is driven by a per-guild config row in Postgres so nothing needs a redeploy to tune. The AI layer is optional and off when no API key is present.

**Tech Stack:** Node 20+, TypeScript 5 (ESM), discord.js v14, node-postgres (`pg`), `pg-mem` for DB tests, Vitest, pino (logging), `@anthropic-ai/sdk`, dotenv. Hosted on Railway with a managed Postgres (Neon/Supabase).

## Global Constraints

- **Repo:** standalone `collapsedstargames-bot` (NOT the website repo). This plan document lives in the website repo; all code paths below are relative to the new bot repo root.
- **Language/module system:** TypeScript 5, ESM (`"type": "module"`), Node 20+.
- **Library floor:** discord.js `^14`.
- **Secrets:** `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL` required; `ANTHROPIC_API_KEY` optional. Loaded from env only; never hardcoded, never committed. A `.env.example` documents them without values.
- **Graceful degradation:** absence of `ANTHROPIC_API_KEY` disables AI review only; every other feature runs normally.
- **No message-content persistence in Phase 1:** messages are inspected in memory and discarded; only moderation *outcomes* are stored.
- **AI review never auto-punishes:** it flags to a private mod channel for a human.
- **Test-first:** every logic change starts with a failing test. Commit after each green step.
- **Discord `/mute` = native timeout** (`GuildMember.timeout()`), not a role.

---

## File Structure

```
collapsedstargames-bot/
├── package.json, tsconfig.json, vitest.config.ts, .eslintrc, .gitignore
├── .env.example
├── railway.json
├── README.md
├── src/
│   ├── index.ts                     # entrypoint: env → db → migrate → bot start
│   ├── config/
│   │   ├── env.ts                   # parse + validate process.env
│   │   └── guildConfig.ts           # GuildConfig type, DEFAULT_CONFIG, merge
│   ├── db/
│   │   ├── pool.ts                  # pg Pool factory
│   │   ├── migrate.ts               # run migrations/*.sql in order
│   │   ├── migrations/
│   │   │   └── 001_init.sql
│   │   └── repositories/
│   │       ├── configRepo.ts
│   │       ├── modLogRepo.ts
│   │       ├── infractionsRepo.ts
│   │       └── antiRaidRepo.ts
│   ├── bot/
│   │   ├── client.ts                # client factory + intents
│   │   ├── registerCommands.ts      # slash command registration
│   │   ├── errorReporter.ts         # post errors to status channel
│   │   └── router.ts                # wire events → handlers
│   ├── moderation/
│   │   ├── autoFilterRules.ts       # PURE: isInvite, matchesBlocklist, isSpam
│   │   ├── autoFilter.ts            # messageCreate handler
│   │   ├── escalation.ts            # PURE: decideEscalation
│   │   └── commands/
│   │       ├── warn.ts  mute.ts  kick.ts  ban.ts
│   ├── antiraid/
│   │   ├── accountAge.ts            # PURE: isAccountTooNew
│   │   ├── massJoin.ts              # PURE: detectSpike
│   │   └── verification.ts          # guildMemberAdd handler + verify button
│   └── ai/
│       ├── classifier.ts            # PURE: isReviewCandidate, buildPrompt, parseVerdict
│       └── review.ts                # orchestrates classify + mod-channel alert
└── tests/                           # mirrors src/
```

**Testing strategy:** files marked **PURE** are unit-tested directly with plain inputs. Repositories are tested against `pg-mem` (in-memory Postgres). discord.js handlers are thin — they extract primitives, call a pure function, and perform the Discord/DB side effect; they are covered by targeted tests with minimal hand-rolled mocks, not full gateway simulation.

---

## Task 1: Repo scaffolding & tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `README.md`, `src/index.ts` (placeholder), `tests/smoke.test.ts`

**Interfaces:**
- Produces: an installable, test-runnable project. `npm test` works; `npm run build` compiles.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "collapsedstargames-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "discord.js": "^14.16.0",
    "pg": "^8.13.0",
    "pino": "^9.0.0",
    "dotenv": "^16.4.0",
    "@anthropic-ai/sdk": "^0.32.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "pg-mem": "^3.0.0",
    "@types/pg": "^8.11.0",
    "@types/node": "^20.16.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`, `.gitignore`, `.env.example`**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["tests/**/*.test.ts"] } });
```

`.gitignore`:
```
node_modules/
dist/
.env
*.log
```

`.env.example`:
```
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DATABASE_URL=
# Optional — enables AI-assisted review when present
ANTHROPIC_API_KEY=
```

- [ ] **Step 4: Write smoke test** — `tests/smoke.test.ts`

```ts
import { describe, it, expect } from "vitest";
describe("smoke", () => {
  it("runs", () => { expect(1 + 1).toBe(2); });
});
```

- [ ] **Step 5: Placeholder entrypoint** — `src/index.ts`

```ts
// Real bootstrap wired in Task 10.
export {};
```

- [ ] **Step 6: Install, test, build**

Run: `npm install && npm test && npm run build`
Expected: 1 test passes; `dist/` is produced with no type errors.

- [ ] **Step 7: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold bot project (ts, vitest, tooling)"
```

---

## Task 2: Environment config (`config/env.ts`)

**Files:**
- Create: `src/config/env.ts`, `tests/config/env.test.ts`

**Interfaces:**
- Produces: `loadEnv(source: Record<string,string|undefined>): Env` where
  `Env = { discordToken: string; discordClientId: string; databaseUrl: string; anthropicApiKey: string | null }`.
  Throws `Error` listing every missing required var. `anthropicApiKey` is `null` when absent/empty.

- [ ] **Step 1: Write failing test** — `tests/config/env.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { loadEnv } from "../../src/config/env.js";

const base = { DISCORD_BOT_TOKEN: "t", DISCORD_CLIENT_ID: "c", DATABASE_URL: "postgres://x" };

describe("loadEnv", () => {
  it("parses required vars and defaults anthropic key to null", () => {
    const env = loadEnv(base);
    expect(env.discordToken).toBe("t");
    expect(env.anthropicApiKey).toBeNull();
  });
  it("keeps anthropic key when present", () => {
    expect(loadEnv({ ...base, ANTHROPIC_API_KEY: "k" }).anthropicApiKey).toBe("k");
  });
  it("throws listing all missing required vars", () => {
    expect(() => loadEnv({})).toThrow(/DISCORD_BOT_TOKEN.*DISCORD_CLIENT_ID.*DATABASE_URL/s);
  });
});
```

- [ ] **Step 2: Run test, verify fail** — `npx vitest run tests/config/env.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/config/env.ts`

```ts
export interface Env {
  discordToken: string;
  discordClientId: string;
  databaseUrl: string;
  anthropicApiKey: string | null;
}

export function loadEnv(source: Record<string, string | undefined>): Env {
  const required = ["DISCORD_BOT_TOKEN", "DISCORD_CLIENT_ID", "DATABASE_URL"] as const;
  const missing = required.filter((k) => !source[k]);
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  const anthropic = source.ANTHROPIC_API_KEY?.trim();
  return {
    discordToken: source.DISCORD_BOT_TOKEN!,
    discordClientId: source.DISCORD_CLIENT_ID!,
    databaseUrl: source.DATABASE_URL!,
    anthropicApiKey: anthropic ? anthropic : null,
  };
}
```

- [ ] **Step 4: Run test, verify pass** — `npx vitest run tests/config/env.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: env loading with required-var validation"`

---

## Task 3: Guild config model (`config/guildConfig.ts`)

**Files:**
- Create: `src/config/guildConfig.ts`, `tests/config/guildConfig.test.ts`

**Interfaces:**
- Produces:
  - `interface GuildConfig { guildId: string; modLogChannelId: string|null; modAlertChannelId: string|null; verifyChannelId: string|null; statusChannelId: string|null; blocklist: string[]; minAccountAgeDays: number; massJoinThreshold: number; massJoinWindowSec: number; features: Record<FeatureFlag, boolean>; }`
  - `type FeatureFlag = "autoFilter" | "aiReview" | "antiRaid"`
  - `DEFAULT_CONFIG(guildId: string): GuildConfig`
  - `mergeConfig(base: GuildConfig, patch: Partial<GuildConfig>): GuildConfig`

- [ ] **Step 1: Write failing test** — `tests/config/guildConfig.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../../src/config/guildConfig.js";

describe("guildConfig", () => {
  it("defaults have all features enabled except aiReview", () => {
    const c = DEFAULT_CONFIG("g1");
    expect(c.guildId).toBe("g1");
    expect(c.features.autoFilter).toBe(true);
    expect(c.features.antiRaid).toBe(true);
    expect(c.features.aiReview).toBe(false); // opt-in; enabled once key + channel set
    expect(c.minAccountAgeDays).toBe(7);
  });
  it("merge overrides only provided fields", () => {
    const merged = mergeConfig(DEFAULT_CONFIG("g1"), { minAccountAgeDays: 30 });
    expect(merged.minAccountAgeDays).toBe(30);
    expect(merged.massJoinThreshold).toBe(DEFAULT_CONFIG("g1").massJoinThreshold);
  });
});
```

- [ ] **Step 2: Run test, verify fail.**

- [ ] **Step 3: Implement** — `src/config/guildConfig.ts`

```ts
export type FeatureFlag = "autoFilter" | "aiReview" | "antiRaid";

export interface GuildConfig {
  guildId: string;
  modLogChannelId: string | null;
  modAlertChannelId: string | null;
  verifyChannelId: string | null;
  statusChannelId: string | null;
  blocklist: string[];
  minAccountAgeDays: number;
  massJoinThreshold: number;
  massJoinWindowSec: number;
  features: Record<FeatureFlag, boolean>;
}

export function DEFAULT_CONFIG(guildId: string): GuildConfig {
  return {
    guildId,
    modLogChannelId: null,
    modAlertChannelId: null,
    verifyChannelId: null,
    statusChannelId: null,
    blocklist: [],
    minAccountAgeDays: 7,
    massJoinThreshold: 5,
    massJoinWindowSec: 10,
    features: { autoFilter: true, aiReview: false, antiRaid: true },
  };
}

export function mergeConfig(base: GuildConfig, patch: Partial<GuildConfig>): GuildConfig {
  return { ...base, ...patch, features: { ...base.features, ...(patch.features ?? {}) } };
}
```

- [ ] **Step 4: Run test, verify pass.**
- [ ] **Step 5: Commit** — `git commit -am "feat: guild config model with defaults and merge"`

---

## Task 4: Database pool, schema & migration runner

**Files:**
- Create: `src/db/pool.ts`, `src/db/migrate.ts`, `src/db/migrations/001_init.sql`, `tests/db/migrate.test.ts`

**Interfaces:**
- Produces:
  - `createPool(databaseUrl: string): Pool` (from `pg`)
  - `runMigrations(pool: Pool): Promise<void>` — applies every `migrations/*.sql` in filename order, idempotently, tracked in a `schema_migrations` table.

- [ ] **Step 1: Write `001_init.sql`**

```sql
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS mod_log (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS infractions (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_infractions_user ON infractions (guild_id, user_id);
CREATE TABLE IF NOT EXISTS join_events (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_join_events_guild_time ON join_events (guild_id, created_at);
```

- [ ] **Step 2: Write failing test** — `tests/db/migrate.test.ts` (uses `pg-mem`)

```ts
import { describe, it, expect } from "vitest";
import { newDb } from "pg-mem";
import { runMigrations } from "../../src/db/migrate.js";

describe("runMigrations", () => {
  it("creates all tables and is idempotent", async () => {
    const mem = newDb();
    const { Pool } = mem.adapters.createPg();
    const pool = new Pool();
    await runMigrations(pool);
    await runMigrations(pool); // second run must not throw
    const res = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
    );
    const names = res.rows.map((r: any) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining(["guild_config", "infractions", "join_events", "mod_log", "schema_migrations"])
    );
  });
});
```

- [ ] **Step 3: Run test, verify fail.**

- [ ] **Step 4: Implement `pool.ts` and `migrate.ts`**

`src/db/pool.ts`:
```ts
import { Pool } from "pg";
export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}
```

`src/db/migrate.ts`:
```ts
import type { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "migrations");

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const done = await pool.query("SELECT 1 FROM schema_migrations WHERE name=$1", [file]);
    if (done.rowCount) continue;
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
  }
}

// CLI entry: `npm run migrate`
if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  const { createPool } = await import("./pool.js");
  const pool = createPool(process.env.DATABASE_URL!);
  await runMigrations(pool);
  await pool.end();
  console.log("migrations applied");
}
```

Note: ensure `.sql` files are shipped to `dist/` — add a copy step in Task 10, or read from `src` at runtime. For Phase 1, run migrations via `tsx` (`npm run migrate`) so the `src` path is used.

- [ ] **Step 5: Run test, verify pass.**
- [ ] **Step 6: Commit** — `git commit -am "feat: pg pool + idempotent migration runner + initial schema"`

---

## Task 5: Repositories (config, mod-log, infractions, anti-raid)

**Files:**
- Create: `src/db/repositories/{configRepo,modLogRepo,infractionsRepo,antiRaidRepo}.ts`
- Create: `tests/db/repositories.test.ts`

**Interfaces:**
- Consumes: `runMigrations`, `GuildConfig`, `DEFAULT_CONFIG`, `mergeConfig`.
- Produces:
  - `configRepo(pool)` → `{ get(guildId): Promise<GuildConfig>; save(cfg: GuildConfig): Promise<void> }` (`get` returns `DEFAULT_CONFIG` if absent).
  - `modLogRepo(pool)` → `{ add(e: {guildId,targetUserId,moderatorId,action,reason}): Promise<void>; recent(guildId, limit): Promise<ModLogRow[]> }`.
  - `infractionsRepo(pool)` → `{ add(guildId,userId,kind): Promise<void>; countFor(guildId,userId): Promise<number> }`.
  - `antiRaidRepo(pool)` → `{ recordJoin(guildId,userId): Promise<void>; joinsSince(guildId, sinceIso): Promise<number>; prune(beforeIso): Promise<void> }`.

- [ ] **Step 1: Write failing test** — `tests/db/repositories.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { newDb } from "pg-mem";
import { runMigrations } from "../../src/db/migrate.js";
import { configRepo } from "../../src/db/repositories/configRepo.js";
import { infractionsRepo } from "../../src/db/repositories/infractionsRepo.js";
import { modLogRepo } from "../../src/db/repositories/modLogRepo.js";
import { DEFAULT_CONFIG } from "../../src/config/guildConfig.js";

async function freshPool() {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();
  await runMigrations(pool);
  return pool;
}

describe("repositories", () => {
  it("config get returns defaults then persists overrides", async () => {
    const pool = await freshPool();
    const repo = configRepo(pool);
    expect((await repo.get("g1")).minAccountAgeDays).toBe(DEFAULT_CONFIG("g1").minAccountAgeDays);
    await repo.save({ ...DEFAULT_CONFIG("g1"), minAccountAgeDays: 42 });
    expect((await repo.get("g1")).minAccountAgeDays).toBe(42);
  });

  it("infractions count accumulates per user", async () => {
    const pool = await freshPool();
    const repo = infractionsRepo(pool);
    await repo.add("g1", "u1", "warn");
    await repo.add("g1", "u1", "warn");
    await repo.add("g1", "u2", "warn");
    expect(await repo.countFor("g1", "u1")).toBe(2);
  });

  it("mod-log stores and returns recent entries", async () => {
    const pool = await freshPool();
    const repo = modLogRepo(pool);
    await repo.add({ guildId: "g1", targetUserId: "u1", moderatorId: "m1", action: "ban", reason: "spam" });
    const rows = await repo.recent("g1", 10);
    expect(rows[0].action).toBe("ban");
    expect(rows[0].reason).toBe("spam");
  });
});
```

- [ ] **Step 2: Run test, verify fail.**

- [ ] **Step 3: Implement repositories**

`src/db/repositories/configRepo.ts`:
```ts
import type { Pool } from "pg";
import { DEFAULT_CONFIG, mergeConfig, type GuildConfig } from "../../config/guildConfig.js";

export function configRepo(pool: Pool) {
  return {
    async get(guildId: string): Promise<GuildConfig> {
      const res = await pool.query("SELECT data FROM guild_config WHERE guild_id=$1", [guildId]);
      if (!res.rowCount) return DEFAULT_CONFIG(guildId);
      return mergeConfig(DEFAULT_CONFIG(guildId), res.rows[0].data as Partial<GuildConfig>);
    },
    async save(cfg: GuildConfig): Promise<void> {
      await pool.query(
        `INSERT INTO guild_config (guild_id, data) VALUES ($1,$2)
         ON CONFLICT (guild_id) DO UPDATE SET data = EXCLUDED.data`,
        [cfg.guildId, cfg]
      );
    },
  };
}
```

`src/db/repositories/infractionsRepo.ts`:
```ts
import type { Pool } from "pg";
export function infractionsRepo(pool: Pool) {
  return {
    async add(guildId: string, userId: string, kind: string): Promise<void> {
      await pool.query("INSERT INTO infractions (guild_id,user_id,kind) VALUES ($1,$2,$3)", [guildId, userId, kind]);
    },
    async countFor(guildId: string, userId: string): Promise<number> {
      const r = await pool.query("SELECT COUNT(*)::int AS n FROM infractions WHERE guild_id=$1 AND user_id=$2", [guildId, userId]);
      return r.rows[0].n as number;
    },
  };
}
```

`src/db/repositories/modLogRepo.ts`:
```ts
import type { Pool } from "pg";
export interface ModLogRow { action: string; reason: string | null; targetUserId: string; moderatorId: string; createdAt: Date; }
export function modLogRepo(pool: Pool) {
  return {
    async add(e: { guildId: string; targetUserId: string; moderatorId: string; action: string; reason?: string | null }): Promise<void> {
      await pool.query(
        "INSERT INTO mod_log (guild_id,target_user_id,moderator_id,action,reason) VALUES ($1,$2,$3,$4,$5)",
        [e.guildId, e.targetUserId, e.moderatorId, e.action, e.reason ?? null]
      );
    },
    async recent(guildId: string, limit: number): Promise<ModLogRow[]> {
      const r = await pool.query(
        "SELECT action,reason,target_user_id,moderator_id,created_at FROM mod_log WHERE guild_id=$1 ORDER BY id DESC LIMIT $2",
        [guildId, limit]
      );
      return r.rows.map((x: any) => ({ action: x.action, reason: x.reason, targetUserId: x.target_user_id, moderatorId: x.moderator_id, createdAt: x.created_at }));
    },
  };
}
```

`src/db/repositories/antiRaidRepo.ts`:
```ts
import type { Pool } from "pg";
export function antiRaidRepo(pool: Pool) {
  return {
    async recordJoin(guildId: string, userId: string): Promise<void> {
      await pool.query("INSERT INTO join_events (guild_id,user_id) VALUES ($1,$2)", [guildId, userId]);
    },
    async joinsSince(guildId: string, sinceIso: string): Promise<number> {
      const r = await pool.query("SELECT COUNT(*)::int AS n FROM join_events WHERE guild_id=$1 AND created_at >= $2", [guildId, sinceIso]);
      return r.rows[0].n as number;
    },
    async prune(beforeIso: string): Promise<void> {
      await pool.query("DELETE FROM join_events WHERE created_at < $1", [beforeIso]);
    },
  };
}
```

- [ ] **Step 4: Run test, verify pass.**
- [ ] **Step 5: Commit** — `git commit -am "feat: postgres repositories (config, mod-log, infractions, anti-raid)"`

---

## Task 6: Auto-filter rules (PURE)

**Files:**
- Create: `src/moderation/autoFilterRules.ts`, `tests/moderation/autoFilterRules.test.ts`

**Interfaces:**
- Produces:
  - `isInvite(content: string): boolean` — matches discord.gg / discord invite URLs.
  - `matchesBlocklist(content: string, blocklist: string[]): string | null` — returns the offending term (case-insensitive, whole-word) or null.
  - `isSpam(content: string): boolean` — flags obvious spam (excessive repeated chars or >6 identical mentions-like tokens).
  - `evaluateMessage(content, blocklist): { blocked: boolean; reason: string | null }` — combines the three.

- [ ] **Step 1: Write failing test** — `tests/moderation/autoFilterRules.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { isInvite, matchesBlocklist, isSpam, evaluateMessage } from "../../src/moderation/autoFilterRules.js";

describe("autoFilterRules", () => {
  it("detects discord invites", () => {
    expect(isInvite("join discord.gg/abc123")).toBe(true);
    expect(isInvite("https://discord.com/invite/xyz")).toBe(true);
    expect(isInvite("no links here")).toBe(false);
  });
  it("matches blocklist whole-word, case-insensitive", () => {
    expect(matchesBlocklist("this is SCAM stuff", ["scam"])).toBe("scam");
    expect(matchesBlocklist("scampi is food", ["scam"])).toBeNull();
    expect(matchesBlocklist("clean", [])).toBeNull();
  });
  it("flags repeated-character spam", () => {
    expect(isSpam("aaaaaaaaaaaaaaaaaaaa")).toBe(true);
    expect(isSpam("hello there")).toBe(false);
  });
  it("evaluateMessage returns first reason", () => {
    expect(evaluateMessage("discord.gg/x", [])).toEqual({ blocked: true, reason: "invite-link" });
    expect(evaluateMessage("totally fine", ["scam"])).toEqual({ blocked: false, reason: null });
  });
});
```

- [ ] **Step 2: Run test, verify fail.**

- [ ] **Step 3: Implement** — `src/moderation/autoFilterRules.ts`

```ts
const INVITE_RE = /(discord\.gg\/|discord(?:app)?\.com\/invite\/)\S+/i;

export function isInvite(content: string): boolean {
  return INVITE_RE.test(content);
}

export function matchesBlocklist(content: string, blocklist: string[]): string | null {
  const lower = content.toLowerCase();
  for (const term of blocklist) {
    const re = new RegExp(`\\b${escapeRegex(term.toLowerCase())}\\b`);
    if (re.test(lower)) return term.toLowerCase();
  }
  return null;
}

export function isSpam(content: string): boolean {
  if (/(.)\1{15,}/.test(content)) return true; // 16+ repeated identical chars
  return false;
}

export function evaluateMessage(content: string, blocklist: string[]): { blocked: boolean; reason: string | null } {
  if (isInvite(content)) return { blocked: true, reason: "invite-link" };
  const term = matchesBlocklist(content, blocklist);
  if (term) return { blocked: true, reason: `blocklist:${term}` };
  if (isSpam(content)) return { blocked: true, reason: "spam" };
  return { blocked: false, reason: null };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 4: Run test, verify pass.**
- [ ] **Step 5: Commit** — `git commit -am "feat: pure auto-filter rules (invite, blocklist, spam)"`

---

## Task 7: Escalation logic (PURE)

**Files:**
- Create: `src/moderation/escalation.ts`, `tests/moderation/escalation.test.ts`

**Interfaces:**
- Produces: `decideEscalation(priorWarnings: number): "note" | "timeout" | "recommend-ban"`.
  0–1 prior → `"note"`; 2–3 → `"timeout"`; 4+ → `"recommend-ban"`. (`priorWarnings` is the count BEFORE the current warning.)

- [ ] **Step 1: Write failing test** — `tests/moderation/escalation.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { decideEscalation } from "../../src/moderation/escalation.js";

describe("decideEscalation", () => {
  it("maps warning counts to actions", () => {
    expect(decideEscalation(0)).toBe("note");
    expect(decideEscalation(1)).toBe("note");
    expect(decideEscalation(2)).toBe("timeout");
    expect(decideEscalation(3)).toBe("timeout");
    expect(decideEscalation(4)).toBe("recommend-ban");
  });
});
```

- [ ] **Step 2: Run test, verify fail.**

- [ ] **Step 3: Implement** — `src/moderation/escalation.ts`

```ts
export function decideEscalation(priorWarnings: number): "note" | "timeout" | "recommend-ban" {
  if (priorWarnings >= 4) return "recommend-ban";
  if (priorWarnings >= 2) return "timeout";
  return "note";
}
```

- [ ] **Step 4: Run test, verify pass.**
- [ ] **Step 5: Commit** — `git commit -am "feat: pure warning escalation logic"`

---

## Task 8: Anti-raid detection (PURE)

**Files:**
- Create: `src/antiraid/accountAge.ts`, `src/antiraid/massJoin.ts`, `tests/antiraid/detection.test.ts`

**Interfaces:**
- Produces:
  - `isAccountTooNew(accountCreatedAt: Date, now: Date, minAgeDays: number): boolean`.
  - `detectSpike(joinCountInWindow: number, threshold: number): boolean` — `>= threshold` is a spike.

- [ ] **Step 1: Write failing test** — `tests/antiraid/detection.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { isAccountTooNew } from "../../src/antiraid/accountAge.js";
import { detectSpike } from "../../src/antiraid/massJoin.js";

describe("anti-raid detection", () => {
  it("flags accounts younger than the threshold", () => {
    const now = new Date("2026-07-12T00:00:00Z");
    const twoDaysOld = new Date("2026-07-10T00:00:00Z");
    const oneYearOld = new Date("2025-07-12T00:00:00Z");
    expect(isAccountTooNew(twoDaysOld, now, 7)).toBe(true);
    expect(isAccountTooNew(oneYearOld, now, 7)).toBe(false);
  });
  it("detects join spikes at or above threshold", () => {
    expect(detectSpike(5, 5)).toBe(true);
    expect(detectSpike(4, 5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify fail.**

- [ ] **Step 3: Implement**

`src/antiraid/accountAge.ts`:
```ts
export function isAccountTooNew(accountCreatedAt: Date, now: Date, minAgeDays: number): boolean {
  const ageMs = now.getTime() - accountCreatedAt.getTime();
  return ageMs < minAgeDays * 24 * 60 * 60 * 1000;
}
```

`src/antiraid/massJoin.ts`:
```ts
export function detectSpike(joinCountInWindow: number, threshold: number): boolean {
  return joinCountInWindow >= threshold;
}
```

- [ ] **Step 4: Run test, verify pass.**
- [ ] **Step 5: Commit** — `git commit -am "feat: pure anti-raid detection (account age, join spike)"`

---

## Task 9: AI classifier (PURE candidacy + prompt + parse)

**Files:**
- Create: `src/ai/classifier.ts`, `tests/ai/classifier.test.ts`

**Interfaces:**
- Produces:
  - `isReviewCandidate(content: string): boolean` — cheap heuristic to limit API calls: only messages ≥ 20 chars and not pure links.
  - `buildPrompt(content: string): string`.
  - `parseVerdict(modelText: string): { flagged: boolean; category: string | null; rationale: string }` — expects a JSON object from the model; defaults to not-flagged on parse failure.

- [ ] **Step 1: Write failing test** — `tests/ai/classifier.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { isReviewCandidate, buildPrompt, parseVerdict } from "../../src/ai/classifier.js";

describe("ai classifier", () => {
  it("skips short messages", () => {
    expect(isReviewCandidate("ok")).toBe(false);
    expect(isReviewCandidate("this is a longer message that should be reviewed")).toBe(true);
  });
  it("prompt includes the content and asks for JSON", () => {
    const p = buildPrompt("hello world");
    expect(p).toContain("hello world");
    expect(p.toLowerCase()).toContain("json");
  });
  it("parses a flagged verdict", () => {
    const v = parseVerdict('{"flagged":true,"category":"harassment","rationale":"targeted insult"}');
    expect(v.flagged).toBe(true);
    expect(v.category).toBe("harassment");
  });
  it("defaults to not-flagged on bad JSON", () => {
    expect(parseVerdict("not json").flagged).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify fail.**

- [ ] **Step 3: Implement** — `src/ai/classifier.ts`

```ts
export function isReviewCandidate(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 20) return false;
  if (/^https?:\/\/\S+$/.test(trimmed)) return false;
  return true;
}

export function buildPrompt(content: string): string {
  return [
    "You are a Discord moderation classifier for a gaming community.",
    "Decide whether the MESSAGE breaks rules (harassment, hate, threats, sexual content, scams).",
    'Respond with ONLY a JSON object: {"flagged": boolean, "category": string|null, "rationale": string}.',
    "",
    `MESSAGE: ${content}`,
  ].join("\n");
}

export function parseVerdict(modelText: string): { flagged: boolean; category: string | null; rationale: string } {
  try {
    const match = modelText.match(/\{[\s\S]*\}/);
    if (!match) return { flagged: false, category: null, rationale: "no-json" };
    const obj = JSON.parse(match[0]);
    return { flagged: Boolean(obj.flagged), category: obj.category ?? null, rationale: String(obj.rationale ?? "") };
  } catch {
    return { flagged: false, category: null, rationale: "parse-error" };
  }
}
```

- [ ] **Step 4: Run test, verify pass.**
- [ ] **Step 5: Commit** — `git commit -am "feat: pure AI review classifier (candidacy, prompt, verdict parsing)"`

---

## Task 10: Bot bootstrap, client & command registration

**Files:**
- Create: `src/bot/client.ts`, `src/bot/registerCommands.ts`, `src/bot/errorReporter.ts`
- Modify: `src/index.ts`
- Create: `tests/bot/registerCommands.test.ts`

**Interfaces:**
- Consumes: `loadEnv`, `createPool`, `runMigrations`.
- Produces:
  - `createClient(): Client` with intents `Guilds`, `GuildMembers`, `GuildMessages`, `MessageContent`.
  - `buildCommandData(): RESTPostAPIApplicationCommandsJSONBody[]` — the `/warn /mute /kick /ban` definitions (PURE, testable).
  - `registerCommands(token, clientId, commands): Promise<void>` — pushes via REST.
  - `reportError(client, statusChannelId, err): Promise<void>`.

- [ ] **Step 1: Write failing test** — `tests/bot/registerCommands.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildCommandData } from "../../src/bot/registerCommands.js";

describe("buildCommandData", () => {
  it("defines the four moderation commands", () => {
    const names = buildCommandData().map((c) => c.name).sort();
    expect(names).toEqual(["ban", "kick", "mute", "warn"]);
  });
  it("each command requires a target user option", () => {
    for (const cmd of buildCommandData()) {
      const opts = (cmd.options ?? []).map((o: any) => o.name);
      expect(opts).toContain("user");
    }
  });
});
```

- [ ] **Step 2: Run test, verify fail.**

- [ ] **Step 3: Implement `registerCommands.ts`**

```ts
import { REST, Routes, SlashCommandBuilder } from "discord.js";
import type { RESTPostAPIApplicationCommandsJSONBody } from "discord.js";

function withTarget(b: SlashCommandBuilder): SlashCommandBuilder {
  b.addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
   .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false));
  return b;
}

export function buildCommandData(): RESTPostAPIApplicationCommandsJSONBody[] {
  const warn = withTarget(new SlashCommandBuilder().setName("warn").setDescription("Warn a user"));
  const kick = withTarget(new SlashCommandBuilder().setName("kick").setDescription("Kick a user"));
  const ban = withTarget(new SlashCommandBuilder().setName("ban").setDescription("Ban a user"));
  const mute = withTarget(new SlashCommandBuilder().setName("mute").setDescription("Timeout a user"));
  mute.addIntegerOption((o) => o.setName("duration").setDescription("Minutes").setRequired(false));
  return [warn, mute, kick, ban].map((b) => b.toJSON());
}

export async function registerCommands(token: string, clientId: string, commands: RESTPostAPIApplicationCommandsJSONBody[]): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
}
```

> The `mute` command already carries its optional `duration` option here, so Task 12 only wires the handler — the command schema needs no further change.

- [ ] **Step 4: Implement `client.ts` and `errorReporter.ts`**

`src/bot/client.ts`:
```ts
import { Client, GatewayIntentBits } from "discord.js";
export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
}
```

`src/bot/errorReporter.ts`:
```ts
import { type Client, TextChannel } from "discord.js";
export async function reportError(client: Client, statusChannelId: string | null, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  if (!statusChannelId) return;
  const ch = await client.channels.fetch(statusChannelId).catch(() => null);
  if (ch instanceof TextChannel) await ch.send(`⚠️ Bot error:\n\`\`\`\n${msg.slice(0, 1800)}\n\`\`\``).catch(() => {});
}
```

- [ ] **Step 5: Implement `src/index.ts` bootstrap**

```ts
import "dotenv/config";
import pino from "pino";
import { loadEnv } from "./config/env.js";
import { createPool } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import { createClient } from "./bot/client.js";
import { registerCommands, buildCommandData } from "./bot/registerCommands.js";
import { attachRouter } from "./bot/router.js";

const log = pino({ level: "info" });

async function main() {
  const env = loadEnv(process.env);
  const pool = createPool(env.databaseUrl);
  await runMigrations(pool);
  await registerCommands(env.discordToken, env.discordClientId, buildCommandData());

  const client = createClient();
  attachRouter(client, { pool, anthropicApiKey: env.anthropicApiKey, log });
  client.once("clientReady", (c) => log.info(`logged in as ${c.user.tag}`));
  await client.login(env.discordToken);
}

main().catch((e) => { log.error(e); process.exit(1); });
```

> `attachRouter` is created in Task 11. Until then, temporarily stub it so `index.ts` compiles: `export function attachRouter(){}` in `src/bot/router.ts`.

- [ ] **Step 6: Run test + build** — `npx vitest run tests/bot/registerCommands.test.ts` → PASS; `npm run build` → no type errors.
- [ ] **Step 7: Commit** — `git commit -am "feat: bot client, command registration, error reporter, bootstrap"`

---

## Task 11: Event router + auto-filter handler wiring

**Files:**
- Create/Modify: `src/bot/router.ts`
- Create: `src/moderation/autoFilter.ts`
- Create: `tests/moderation/autoFilter.test.ts`

**Interfaces:**
- Consumes: `evaluateMessage`, `configRepo`, `modLogRepo`.
- Produces:
  - `handleMessage(deps, msg): Promise<{ deleted: boolean; reason: string | null }>` where `msg` is the minimal shape `{ guildId, authorBot: boolean, authorId?, content, delete: () => Promise<void> }`. This is the testable core.
  - `attachRouter(client, ctx)` wires `messageCreate`, `interactionCreate`, `guildMemberAdd` to the handlers.

- [ ] **Step 1: Write failing test** — `tests/moderation/autoFilter.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { handleMessage } from "../../src/moderation/autoFilter.js";
import { DEFAULT_CONFIG } from "../../src/config/guildConfig.js";

function deps(overrides = {}) {
  return {
    getConfig: async () => ({ ...DEFAULT_CONFIG("g1"), blocklist: ["scam"] }),
    logAction: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("handleMessage", () => {
  it("deletes invite links and logs", async () => {
    const d = deps();
    const del = vi.fn(async () => {});
    const res = await handleMessage(d, { guildId: "g1", authorBot: false, content: "discord.gg/x", delete: del });
    expect(res).toEqual({ deleted: true, reason: "invite-link" });
    expect(del).toHaveBeenCalledOnce();
    expect(d.logAction).toHaveBeenCalledOnce();
  });
  it("ignores bot messages", async () => {
    const del = vi.fn(async () => {});
    const res = await handleMessage(deps(), { guildId: "g1", authorBot: true, content: "discord.gg/x", delete: del });
    expect(res.deleted).toBe(false);
    expect(del).not.toHaveBeenCalled();
  });
  it("leaves clean messages alone", async () => {
    const res = await handleMessage(deps(), { guildId: "g1", authorBot: false, content: "hello team", delete: vi.fn() });
    expect(res.deleted).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify fail.**

- [ ] **Step 3: Implement `autoFilter.ts` (testable core)**

```ts
import { evaluateMessage } from "./autoFilterRules.js";
import type { GuildConfig } from "../config/guildConfig.js";

export interface AutoFilterDeps {
  getConfig: (guildId: string) => Promise<GuildConfig>;
  logAction: (e: { guildId: string; targetUserId: string; moderatorId: string; action: string; reason: string }) => Promise<void>;
}
export interface IncomingMessage {
  guildId: string;
  authorBot: boolean;
  authorId?: string;
  content: string;
  delete: () => Promise<void>;
}

export async function handleMessage(deps: AutoFilterDeps, msg: IncomingMessage): Promise<{ deleted: boolean; reason: string | null }> {
  if (msg.authorBot) return { deleted: false, reason: null };
  const cfg = await deps.getConfig(msg.guildId);
  if (!cfg.features.autoFilter) return { deleted: false, reason: null };
  const verdict = evaluateMessage(msg.content, cfg.blocklist);
  if (!verdict.blocked) return { deleted: false, reason: null };
  await msg.delete();
  await deps.logAction({
    guildId: msg.guildId, targetUserId: msg.authorId ?? "unknown", moderatorId: "auto-filter",
    action: "delete", reason: verdict.reason!,
  });
  return { deleted: true, reason: verdict.reason };
}
```

- [ ] **Step 4: Implement `router.ts` (thin adapter)**

```ts
import type { Client } from "discord.js";
import type { Pool } from "pg";
import type { Logger } from "pino";
import { configRepo } from "../db/repositories/configRepo.js";
import { modLogRepo } from "../db/repositories/modLogRepo.js";
import { handleMessage } from "../moderation/autoFilter.js";

export interface RouterCtx { pool: Pool; anthropicApiKey: string | null; log: Logger; }

export function attachRouter(client: Client, ctx: RouterCtx): void {
  const cfg = configRepo(ctx.pool);
  const modlog = modLogRepo(ctx.pool);

  client.on("messageCreate", async (m) => {
    if (!m.guildId) return;
    try {
      await handleMessage(
        { getConfig: (g) => cfg.get(g), logAction: (e) => modlog.add(e) },
        { guildId: m.guildId, authorBot: m.author.bot, authorId: m.author.id, content: m.content, delete: () => m.delete().then(() => {}) }
      );
    } catch (e) { ctx.log.error(e); }
  });
  // interactionCreate (Task 12) and guildMemberAdd (Task 13) wired in later tasks.
}
```

- [ ] **Step 5: Run test + build** → PASS, no type errors.
- [ ] **Step 6: Commit** — `git commit -am "feat: event router + auto-filter message handler"`

---

## Task 12: Moderation commands (`/warn /mute /kick /ban`)

**Files:**
- Create: `src/moderation/commands/{warn,mute,kick,ban}.ts`
- Modify: `src/bot/router.ts` (add `interactionCreate`)
- Create: `tests/moderation/commands.test.ts`

**Interfaces:**
- Consumes: `modLogRepo`, `infractionsRepo`, `decideEscalation`.
- Produces (each command's testable core):
  - `runWarn(deps, { guildId, targetUserId, moderatorId, reason }): Promise<{ escalation: string; priorWarnings: number }>`
  - `runKick/runBan(deps, args): Promise<void>` — perform action + log.
  - `runMute(deps, args & { durationMinutes: number }): Promise<void>` — timeout + log.
  - `deps` shape: `{ addInfraction, countInfractions, logAction, timeout(userId, ms), kick(userId), ban(userId) }`.

- [ ] **Step 1: Write failing test** — `tests/moderation/commands.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { runWarn } from "../../src/moderation/commands/warn.js";

function deps(prior: number) {
  return {
    addInfraction: vi.fn(async () => {}),
    countInfractions: vi.fn(async () => prior),
    logAction: vi.fn(async () => {}),
  };
}

describe("runWarn", () => {
  it("records the infraction, logs, and returns escalation", async () => {
    const d = deps(2); // 2 prior → timeout tier
    const res = await runWarn(d, { guildId: "g1", targetUserId: "u1", moderatorId: "m1", reason: "rude" });
    expect(d.addInfraction).toHaveBeenCalledWith("g1", "u1", "warn");
    expect(d.logAction).toHaveBeenCalledOnce();
    expect(res.escalation).toBe("timeout");
    expect(res.priorWarnings).toBe(2);
  });
});
```

- [ ] **Step 2: Run test, verify fail.**

- [ ] **Step 3: Implement `warn.ts`**

```ts
import { decideEscalation } from "../escalation.js";

export interface WarnDeps {
  addInfraction: (guildId: string, userId: string, kind: string) => Promise<void>;
  countInfractions: (guildId: string, userId: string) => Promise<number>;
  logAction: (e: { guildId: string; targetUserId: string; moderatorId: string; action: string; reason: string | null }) => Promise<void>;
}

export async function runWarn(
  deps: WarnDeps,
  args: { guildId: string; targetUserId: string; moderatorId: string; reason: string | null }
): Promise<{ escalation: string; priorWarnings: number }> {
  const prior = await deps.countInfractions(args.guildId, args.targetUserId);
  await deps.addInfraction(args.guildId, args.targetUserId, "warn");
  await deps.logAction({ ...args, action: "warn" });
  return { escalation: decideEscalation(prior), priorWarnings: prior };
}
```

- [ ] **Step 4: Implement `kick.ts`, `ban.ts`, `mute.ts`**

```ts
// kick.ts
export interface ActionDeps {
  logAction: (e: { guildId: string; targetUserId: string; moderatorId: string; action: string; reason: string | null }) => Promise<void>;
  kick: (userId: string) => Promise<void>;
  ban: (userId: string) => Promise<void>;
  timeout: (userId: string, ms: number) => Promise<void>;
}
export async function runKick(deps: ActionDeps, a: { guildId: string; targetUserId: string; moderatorId: string; reason: string | null }): Promise<void> {
  await deps.kick(a.targetUserId);
  await deps.logAction({ ...a, action: "kick" });
}
// ban.ts
export async function runBan(deps: ActionDeps, a: { guildId: string; targetUserId: string; moderatorId: string; reason: string | null }): Promise<void> {
  await deps.ban(a.targetUserId);
  await deps.logAction({ ...a, action: "ban" });
}
// mute.ts
export async function runMute(deps: ActionDeps, a: { guildId: string; targetUserId: string; moderatorId: string; reason: string | null; durationMinutes: number }): Promise<void> {
  await deps.timeout(a.targetUserId, a.durationMinutes * 60 * 1000);
  await deps.logAction({ guildId: a.guildId, targetUserId: a.targetUserId, moderatorId: a.moderatorId, action: `mute:${a.durationMinutes}m`, reason: a.reason });
}
```

Put `ActionDeps` in `kick.ts` and import it into `ban.ts`/`mute.ts` to stay DRY.

- [ ] **Step 5: Wire `interactionCreate` in `router.ts`** (permission-gate to Discord `ModerateMembers`; map options → the `run*` functions; reply with an ephemeral confirmation and, for `warn`, the escalation tier). The `mute` `duration` option already exists in the command schema (Task 10); default to 10 minutes when omitted.

```ts
// inside attachRouter, after messageCreate:
import { PermissionFlagsBits, ChatInputCommandInteraction } from "discord.js";
import { infractionsRepo } from "../db/repositories/infractionsRepo.js";
import { runWarn } from "../moderation/commands/warn.js";
import { runKick } from "../moderation/commands/kick.js";
import { runBan } from "../moderation/commands/ban.js";
import { runMute } from "../moderation/commands/mute.js";

const infractions = infractionsRepo(ctx.pool);
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand() || !i.guildId) return;
  const gi = i as ChatInputCommandInteraction;
  if (!gi.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
    await gi.reply({ content: "You lack moderation permission.", ephemeral: true }); return;
  }
  const user = gi.options.getUser("user", true);
  const reason = gi.options.getString("reason");
  const guild = gi.guild!;
  const actionDeps = {
    logAction: (e: any) => modlog.add(e),
    kick: (uid: string) => guild.members.kick(uid).then(() => {}),
    ban: (uid: string) => guild.members.ban(uid).then(() => {}),
    timeout: (uid: string, ms: number) => guild.members.edit(uid, { communicationDisabledUntil: new Date(Date.now() + ms) }).then(() => {}),
  };
  const common = { guildId: i.guildId, targetUserId: user.id, moderatorId: gi.user.id, reason };
  try {
    if (gi.commandName === "warn") {
      const r = await runWarn({ addInfraction: infractions.add, countInfractions: infractions.countFor, logAction: modlog.add }, common);
      await gi.reply({ content: `Warned ${user.tag}. Tier: ${r.escalation} (prior warnings: ${r.priorWarnings}).`, ephemeral: true });
    } else if (gi.commandName === "kick") { await runKick(actionDeps, common); await gi.reply({ content: `Kicked ${user.tag}.`, ephemeral: true }); }
    else if (gi.commandName === "ban") { await runBan(actionDeps, common); await gi.reply({ content: `Banned ${user.tag}.`, ephemeral: true }); }
    else if (gi.commandName === "mute") {
      const dur = gi.options.getInteger("duration") ?? 10;
      await runMute(actionDeps, { ...common, durationMinutes: dur });
      await gi.reply({ content: `Muted ${user.tag} for ${dur}m.`, ephemeral: true });
    }
  } catch (e) { ctx.log.error(e); await gi.reply({ content: "Action failed.", ephemeral: true }).catch(() => {}); }
});
```

Note: `Date.now()` is fine in production runtime code (only forbidden in workflow scripts, not here).

- [ ] **Step 6: Run tests + build** → PASS, no type errors.
- [ ] **Step 7: Commit** — `git commit -am "feat: moderation commands warn/mute/kick/ban with mod-log + escalation"`

---

## Task 13: Anti-raid handler (join gate, verification, mass-join lock)

**Files:**
- Create: `src/antiraid/verification.ts`
- Modify: `src/bot/router.ts` (add `guildMemberAdd`), `src/bot/registerCommands.ts` if a verify button is used
- Create: `tests/antiraid/handleJoin.test.ts`

**Interfaces:**
- Consumes: `isAccountTooNew`, `detectSpike`, `antiRaidRepo`, `configRepo`.
- Produces:
  - `handleJoin(deps, member): Promise<{ action: "allow" | "restrict" | "raid-lock" }>` — testable core.
  - `member` shape: `{ guildId, userId, accountCreatedAt: Date }`; `deps`: `{ getConfig, recordJoin, joinsSince, restrict(userId), raidLock(guildId), alertMods(guildId, text), now: () => Date }`.

- [ ] **Step 1: Write failing test** — `tests/antiraid/handleJoin.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { handleJoin } from "../../src/antiraid/verification.js";
import { DEFAULT_CONFIG } from "../../src/config/guildConfig.js";

function deps(joins: number, cfg = DEFAULT_CONFIG("g1")) {
  return {
    getConfig: async () => cfg,
    recordJoin: vi.fn(async () => {}),
    joinsSince: vi.fn(async () => joins),
    restrict: vi.fn(async () => {}),
    raidLock: vi.fn(async () => {}),
    alertMods: vi.fn(async () => {}),
    now: () => new Date("2026-07-12T00:00:00Z"),
  };
}
const oldAccount = new Date("2020-01-01T00:00:00Z");
const newAccount = new Date("2026-07-11T00:00:00Z");

describe("handleJoin", () => {
  it("restricts too-new accounts", async () => {
    const d = deps(1);
    const r = await handleJoin(d, { guildId: "g1", userId: "u1", accountCreatedAt: newAccount });
    expect(r.action).toBe("restrict");
    expect(d.restrict).toHaveBeenCalledWith("u1");
  });
  it("locks the server on a join spike", async () => {
    const d = deps(5); // threshold default 5
    const r = await handleJoin(d, { guildId: "g1", userId: "u9", accountCreatedAt: oldAccount });
    expect(r.action).toBe("raid-lock");
    expect(d.raidLock).toHaveBeenCalledWith("g1");
    expect(d.alertMods).toHaveBeenCalledOnce();
  });
  it("allows normal joins", async () => {
    const r = await handleJoin(deps(1), { guildId: "g1", userId: "u2", accountCreatedAt: oldAccount });
    expect(r.action).toBe("allow");
  });
});
```

- [ ] **Step 2: Run test, verify fail.**

- [ ] **Step 3: Implement `verification.ts`**

```ts
import { isAccountTooNew } from "./accountAge.js";
import { detectSpike } from "./massJoin.js";
import type { GuildConfig } from "../config/guildConfig.js";

export interface JoinDeps {
  getConfig: (guildId: string) => Promise<GuildConfig>;
  recordJoin: (guildId: string, userId: string) => Promise<void>;
  joinsSince: (guildId: string, sinceIso: string) => Promise<number>;
  restrict: (userId: string) => Promise<void>;
  raidLock: (guildId: string) => Promise<void>;
  alertMods: (guildId: string, text: string) => Promise<void>;
  now: () => Date;
}
export interface JoiningMember { guildId: string; userId: string; accountCreatedAt: Date; }

export async function handleJoin(deps: JoinDeps, member: JoiningMember): Promise<{ action: "allow" | "restrict" | "raid-lock" }> {
  const cfg = await deps.getConfig(member.guildId);
  if (!cfg.features.antiRaid) return { action: "allow" };
  const now = deps.now();
  await deps.recordJoin(member.guildId, member.userId);

  const windowStart = new Date(now.getTime() - cfg.massJoinWindowSec * 1000).toISOString();
  const recentJoins = await deps.joinsSince(member.guildId, windowStart);
  if (detectSpike(recentJoins, cfg.massJoinThreshold)) {
    await deps.raidLock(member.guildId);
    await deps.alertMods(member.guildId, `🚨 Mass-join detected (${recentJoins} in ${cfg.massJoinWindowSec}s). Server locked.`);
    return { action: "raid-lock" };
  }
  if (isAccountTooNew(member.accountCreatedAt, now, cfg.minAccountAgeDays)) {
    await deps.restrict(member.userId);
    await deps.alertMods(member.guildId, `New account restricted: <@${member.userId}> (age below ${cfg.minAccountAgeDays}d).`);
    return { action: "restrict" };
  }
  return { action: "allow" };
}
```

- [ ] **Step 4: Wire `guildMemberAdd` in `router.ts`** — build `JoinDeps` from repos + guild APIs (`restrict` = apply a muted/unverified role or timeout; `raidLock` = raise verification level via `guild.setVerificationLevel`; `alertMods` = send to `modAlertChannelId`). Use `member.user.createdAt` for `accountCreatedAt`.

- [ ] **Step 5: Run tests + build** → PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat: anti-raid join handling (age gate, verification restrict, mass-join lock)"`

---

## Task 14: AI review orchestration + wiring

**Files:**
- Create: `src/ai/review.ts`
- Modify: `src/bot/router.ts` (call AI review for messages that survive the auto-filter, when enabled)
- Create: `tests/ai/review.test.ts`

**Interfaces:**
- Consumes: `isReviewCandidate`, `buildPrompt`, `parseVerdict`, `configRepo`.
- Produces:
  - `reviewMessage(deps, msg): Promise<{ flagged: boolean }>` — testable core; calls the model only when a candidate.
  - `deps`: `{ enabled: boolean; getConfig; classify(prompt): Promise<string>; alert(guildId, text): Promise<void> }`.
  - `makeClassifier(apiKey): (prompt: string) => Promise<string>` — wraps `@anthropic-ai/sdk` (`claude-haiku-4-5-20251001`, cheap). Not unit-tested (network); covered by the injected fake.

- [ ] **Step 1: Write failing test** — `tests/ai/review.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { reviewMessage } from "../../src/ai/review.js";
import { DEFAULT_CONFIG } from "../../src/config/guildConfig.js";

function deps(over = {}) {
  return {
    enabled: true,
    getConfig: async () => ({ ...DEFAULT_CONFIG("g1"), modAlertChannelId: "chan", features: { autoFilter: true, aiReview: true, antiRaid: true } }),
    classify: vi.fn(async () => '{"flagged":true,"category":"harassment","rationale":"insult"}'),
    alert: vi.fn(async () => {}),
    ...over,
  };
}

describe("reviewMessage", () => {
  it("alerts mods when the model flags a candidate message", async () => {
    const d = deps();
    const r = await reviewMessage(d, { guildId: "g1", authorId: "u1", content: "you are a worthless idiot and everyone hates you" });
    expect(r.flagged).toBe(true);
    expect(d.alert).toHaveBeenCalledOnce();
  });
  it("skips when disabled", async () => {
    const d = deps({ enabled: false });
    const r = await reviewMessage(d, { guildId: "g1", authorId: "u1", content: "long enough message to be a candidate here" });
    expect(r.flagged).toBe(false);
    expect(d.classify).not.toHaveBeenCalled();
  });
  it("skips non-candidate (too short) messages", async () => {
    const d = deps();
    const r = await reviewMessage(d, { guildId: "g1", authorId: "u1", content: "ok" });
    expect(d.classify).not.toHaveBeenCalled();
    expect(r.flagged).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify fail.**

- [ ] **Step 3: Implement `review.ts`**

```ts
import { isReviewCandidate, buildPrompt, parseVerdict } from "./classifier.js";
import type { GuildConfig } from "../config/guildConfig.js";
import Anthropic from "@anthropic-ai/sdk";

export interface ReviewDeps {
  enabled: boolean;
  getConfig: (guildId: string) => Promise<GuildConfig>;
  classify: (prompt: string) => Promise<string>;
  alert: (guildId: string, text: string) => Promise<void>;
}
export interface ReviewInput { guildId: string; authorId: string; content: string; }

export async function reviewMessage(deps: ReviewDeps, msg: ReviewInput): Promise<{ flagged: boolean }> {
  if (!deps.enabled) return { flagged: false };
  if (!isReviewCandidate(msg.content)) return { flagged: false };
  const cfg = await deps.getConfig(msg.guildId);
  if (!cfg.features.aiReview || !cfg.modAlertChannelId) return { flagged: false };
  const verdict = parseVerdict(await deps.classify(buildPrompt(msg.content)));
  if (!verdict.flagged) return { flagged: false };
  await deps.alert(msg.guildId, `🔎 AI flagged a message from <@${msg.authorId}> — ${verdict.category}: ${verdict.rationale}`);
  return { flagged: true };
}

export function makeClassifier(apiKey: string): (prompt: string) => Promise<string> {
  const client = new Anthropic({ apiKey });
  return async (prompt: string) => {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    const block = res.content[0];
    return block && block.type === "text" ? block.text : "";
  };
}
```

- [ ] **Step 4: Wire into `router.ts`** — in the `messageCreate` handler, after `handleMessage` returns `deleted:false`, call `reviewMessage`. Build `ReviewDeps` with `enabled: ctx.anthropicApiKey !== null`, `classify: makeClassifier(ctx.anthropicApiKey!)` (guarded by enabled), and `alert` sending to `modAlertChannelId`. Skip entirely when key is null.

- [ ] **Step 5: Run tests + build** → PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat: AI-assisted review with graceful degradation + mod alerts"`

---

## Task 15: Deployment config & docs

**Files:**
- Create: `railway.json`, `README.md` (expand)
- Verify: full `npm run build` + `npm test`

**Interfaces:**
- Produces: a deployable service + operator documentation.

- [ ] **Step 1: Create `railway.json`**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS", "buildCommand": "npm run build" },
  "deploy": { "startCommand": "npm run migrate && npm run start", "restartPolicyType": "ON_FAILURE" }
}
```

- [ ] **Step 2: Write `README.md`** — cover: what the bot does; required env vars (from `.env.example`); how to create the Discord app + bot token + invite URL with least-privilege scopes (`bot`, `applications.commands`; perms: Manage Messages, Moderate Members, Kick, Ban, Manage Server for anti-raid); how to provision Neon/Supabase Postgres; Railway deploy steps; how to configure channels via the config table; local dev against a test server.

- [ ] **Step 3: Full verification**

Run: `npm ci && npm test && npm run build`
Expected: all tests pass; clean build.

- [ ] **Step 4: Commit** — `git commit -am "chore: railway deploy config + operator README"`

---

## Self-Review (completed against the spec)

**Spec coverage:**
- Foundation/gateway → Tasks 1, 4, 10, 11. ✔
- Auto-filter → Tasks 6, 11. ✔
- AI review (flags to mods, degrades without key) → Tasks 9, 14. ✔
- Mod commands + mod-log + escalation → Tasks 5, 7, 12. ✔
- Anti-raid (age gate, verification, mass-join) → Tasks 8, 13. ✔
- Config-driven, no redeploy → Tasks 3, 5. ✔
- Data/privacy (no message persistence; outcomes only) → enforced in Tasks 11/14 (nothing writes `content`). ✔
- Secrets via env, `.env.example` → Tasks 1, 2. ✔
- Ops (Railway, error-to-channel, test server) → Tasks 10, 15. ✔
- Build order matches spec (skeleton → filter → commands → anti-raid → AI). ✔

**Placeholder scan:** No TBD/TODO left in code steps. The two forward-reference stubs (`attachRouter` stub in Task 10; `mute` duration option finalized in Task 12) are explicitly called out with the code to replace them.

**Type consistency:** `logAction`/`modLogRepo.add` share the `{guildId,targetUserId,moderatorId,action,reason}` shape across Tasks 5, 11, 12. `GuildConfig.features` keys (`autoFilter/aiReview/antiRaid`) are consistent across Tasks 3, 11, 13, 14. `getConfig` signature consistent (`(guildId) => Promise<GuildConfig>`) across all handlers. The `IncomingMessage.authorBot` property is spelled consistently in the Task 11 interface, test, and implementation.

**Known human-only steps (cannot be automated):** creating the Discord application + bot token, inviting the bot, provisioning Postgres, and setting Railway env vars. These are documented in Task 15's README and must be done before first deploy.
