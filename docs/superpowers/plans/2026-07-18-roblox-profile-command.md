# `/roblox` Profile Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/roblox` slash command to the mod bot that surfaces a member's Bloxlink-linked Roblox profile with an "Open Roblox profile" link button (manual Follow on Roblox — no automation).

**Architecture:** Three pure/injectable units in a new `src/roblox/` module — a profile-URL helper, a Bloxlink resolver (injectable `fetch`), and a `runRoblox` handler that returns plain data — plus thin discord.js wiring in the existing router and command registration. Logic is unit-tested; the router branch is presentation-only glue verified by build + manual smoke.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), discord.js v14, vitest, native `fetch` (Node 18+).

Spec: `docs/superpowers/specs/2026-07-18-roblox-profile-command-design.md` (in the website repo). All work is in the `collapsedstargames-bot` repo.

## Global Constraints

- ESM project: **all relative imports use `.js` extensions** (e.g. `import { x } from "./profile.js"`), even from `.ts` sources.
- Tests are vitest, mirrored under `tests/` matching `src/` paths.
- Follow the repo convention: logic in `runX(deps, input)` functions returning **plain data**; discord.js objects only in `src/bot/router.ts`. Injectable seams for anything doing I/O (mirror `makeAnswerer`/`defaultCreate` and the `CreateMessage` seam).
- **No follow/friend automation anywhere.** The command only links to a profile; following is a manual click on Roblox. Button label is "Open Roblox profile", never "Follow".
- Bloxlink key is a read-only, guild-scoped secret in `BLOXLINK_API_KEY`; the command fails closed when it is unset.
- Run `npm test` (vitest) and `npm run build` (tsc) — both must stay green.

---

### Task 1: Roblox profile-URL helper

**Files:**
- Create: `src/roblox/profile.ts`
- Test: `tests/roblox/profile.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `robloxProfileUrl(id: string): string` — returns `https://www.roblox.com/users/${id}/profile`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/roblox/profile.test.ts
import { describe, it, expect } from "vitest";
import { robloxProfileUrl } from "../../src/roblox/profile.js";

describe("robloxProfileUrl", () => {
  it("builds the canonical Roblox profile URL from a user id", () => {
    expect(robloxProfileUrl("12345")).toBe("https://www.roblox.com/users/12345/profile");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/roblox/profile.test.ts`
Expected: FAIL — cannot resolve `../../src/roblox/profile.js` (module missing).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/roblox/profile.ts

/** Canonical Roblox profile URL for a numeric user id. */
export function robloxProfileUrl(id: string): string {
  return `https://www.roblox.com/users/${id}/profile`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/roblox/profile.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/roblox/profile.ts tests/roblox/profile.test.ts
git commit -m "feat(roblox): add robloxProfileUrl helper"
```

---

### Task 2: Bloxlink resolver (Discord id → Roblox id)

**Files:**
- Create: `src/roblox/bloxlink.ts`
- Test: `tests/roblox/bloxlink.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type BloxlinkResolver = (guildId: string, discordId: string) => Promise<{ robloxId: string; username?: string } | null>`
  - `makeBloxlinkResolver(apiKey: string, fetchFn?: typeof fetch): BloxlinkResolver`
  - Behavior: `GET https://api.blox.link/v4/public/guilds/{guildId}/discord-to-roblox/{discordId}` with header `Authorization: <apiKey>`. Returns `{ robloxId }` on success; `null` when the member is unlinked (HTTP 404 or missing `robloxID`); **throws** on any other non-OK status (5xx / 429) or transport error, so the caller can distinguish "not linked" from "Bloxlink unreachable".

- [ ] **Step 1: Write the failing test**

```typescript
// tests/roblox/bloxlink.test.ts
import { describe, it, expect } from "vitest";
import { makeBloxlinkResolver } from "../../src/roblox/bloxlink.js";

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("makeBloxlinkResolver", () => {
  it("calls the guild endpoint with the Authorization header and parses robloxID", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return res(200, { robloxID: 987654 });
    }) as unknown as typeof fetch;

    const resolve = makeBloxlinkResolver("secret-key", fetchFn);
    const out = await resolve("guild-1", "disc-9");

    expect(out).toEqual({ robloxId: "987654", username: undefined });
    expect(calls[0].url).toBe(
      "https://api.blox.link/v4/public/guilds/guild-1/discord-to-roblox/disc-9",
    );
    expect(calls[0].headers.Authorization).toBe("secret-key");
  });

  it("returns null for an unlinked member (HTTP 404)", async () => {
    const fetchFn = (async () => res(404, { error: "not found" })) as unknown as typeof fetch;
    expect(await makeBloxlinkResolver("k", fetchFn)("g", "d")).toBeNull();
  });

  it("returns null when the body has no robloxID", async () => {
    const fetchFn = (async () => res(200, { resolved: {} })) as unknown as typeof fetch;
    expect(await makeBloxlinkResolver("k", fetchFn)("g", "d")).toBeNull();
  });

  it("throws on a 5xx so the caller can show a retry message", async () => {
    const fetchFn = (async () => res(500, {})) as unknown as typeof fetch;
    await expect(makeBloxlinkResolver("k", fetchFn)("g", "d")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/roblox/bloxlink.test.ts`
Expected: FAIL — module `../../src/roblox/bloxlink.js` missing.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/roblox/bloxlink.ts

export type BloxlinkResolver = (
  guildId: string,
  discordId: string,
) => Promise<{ robloxId: string; username?: string } | null>;

interface BloxlinkBody {
  robloxID?: string | number;
  resolved?: { roblox?: { name?: string } };
}

// Resolve a Discord user to their Bloxlink-linked Roblox account via the Guild
// public API. Returns null when the member is not linked; throws on transport /
// 5xx so the router can distinguish "not linked" from "Bloxlink unreachable".
export function makeBloxlinkResolver(
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): BloxlinkResolver {
  return async (guildId, discordId) => {
    const url = `https://api.blox.link/v4/public/guilds/${guildId}/discord-to-roblox/${discordId}`;
    const res = await fetchFn(url, { headers: { Authorization: apiKey } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Bloxlink API returned ${res.status}`);
    const body = (await res.json()) as BloxlinkBody;
    if (body.robloxID == null) return null;
    return { robloxId: String(body.robloxID), username: body.resolved?.roblox?.name };
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/roblox/bloxlink.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/roblox/bloxlink.ts tests/roblox/bloxlink.test.ts
git commit -m "feat(roblox): add injectable Bloxlink discord->roblox resolver"
```

---

### Task 3: `runRoblox` handler (returns plain data)

**Files:**
- Create: `src/roblox/robloxCommand.ts`
- Test: `tests/roblox/robloxCommand.test.ts`

**Interfaces:**
- Consumes: `robloxProfileUrl` (Task 1); `BloxlinkResolver` type (Task 2).
- Produces:
  - `interface RobloxDeps { resolve: BloxlinkResolver | null }`
  - `interface RobloxInput { guildId: string; invokerId: string; targetId: string | null; targetTag: string | null }`
  - `interface RobloxResult { kind: "self" | "lookup" | "self-unlinked" | "lookup-unlinked" | "unconfigured" | "error"; ephemeral: boolean; robloxId?: string; url?: string; buttonLabel?: string; message?: string }`
  - `runRoblox(deps: RobloxDeps, input: RobloxInput): Promise<RobloxResult>`
  - Behavior: `targetId === null` ⇒ self mode, else lookup mode. `resolve === null` ⇒ `unconfigured`. Resolver `null` ⇒ `self-unlinked` / `lookup-unlinked`. Resolver throws ⇒ `error`. Success ⇒ `self` (public, `ephemeral:false`) / `lookup` (`ephemeral:true`) with `url`, `buttonLabel:"Open Roblox profile"`, `robloxId`. All non-success kinds are `ephemeral:true`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/roblox/robloxCommand.test.ts
import { describe, it, expect } from "vitest";
import { runRoblox } from "../../src/roblox/robloxCommand.js";
import type { BloxlinkResolver } from "../../src/roblox/bloxlink.js";

const base = { guildId: "g", invokerId: "me", targetId: null, targetTag: null };
const linked: BloxlinkResolver = async () => ({ robloxId: "555" });
const unlinked: BloxlinkResolver = async () => null;
const boom: BloxlinkResolver = async () => { throw new Error("network"); };

describe("runRoblox", () => {
  it("self + linked → public profile with a button", async () => {
    const r = await runRoblox({ resolve: linked }, { ...base });
    expect(r.kind).toBe("self");
    expect(r.ephemeral).toBe(false);
    expect(r.url).toBe("https://www.roblox.com/users/555/profile");
    expect(r.buttonLabel).toBe("Open Roblox profile");
  });

  it("lookup + linked → ephemeral profile with a button", async () => {
    const r = await runRoblox({ resolve: linked }, { ...base, targetId: "them", targetTag: "Them#1" });
    expect(r.kind).toBe("lookup");
    expect(r.ephemeral).toBe(true);
    expect(r.url).toBe("https://www.roblox.com/users/555/profile");
  });

  it("self + unlinked → ephemeral verify-first message", async () => {
    const r = await runRoblox({ resolve: unlinked }, { ...base });
    expect(r.kind).toBe("self-unlinked");
    expect(r.ephemeral).toBe(true);
    expect(r.message).toContain("verify");
  });

  it("lookup + unlinked → ephemeral not-linked message", async () => {
    const r = await runRoblox({ resolve: unlinked }, { ...base, targetId: "them", targetTag: "Them#1" });
    expect(r.kind).toBe("lookup-unlinked");
    expect(r.ephemeral).toBe(true);
  });

  it("no resolver configured → unconfigured", async () => {
    const r = await runRoblox({ resolve: null }, { ...base });
    expect(r.kind).toBe("unconfigured");
    expect(r.ephemeral).toBe(true);
  });

  it("resolver throws → error (retry message)", async () => {
    const r = await runRoblox({ resolve: boom }, { ...base });
    expect(r.kind).toBe("error");
    expect(r.ephemeral).toBe(true);
    expect(r.message).toContain("Bloxlink");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/roblox/robloxCommand.test.ts`
Expected: FAIL — module `../../src/roblox/robloxCommand.js` missing.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/roblox/robloxCommand.ts
import { robloxProfileUrl } from "./profile.js";
import type { BloxlinkResolver } from "./bloxlink.js";

export interface RobloxDeps {
  resolve: BloxlinkResolver | null;
}

export interface RobloxInput {
  guildId: string;
  invokerId: string;
  targetId: string | null;
  targetTag: string | null;
}

export interface RobloxResult {
  kind: "self" | "lookup" | "self-unlinked" | "lookup-unlinked" | "unconfigured" | "error";
  ephemeral: boolean;
  robloxId?: string;
  url?: string;
  buttonLabel?: string;
  message?: string;
}

const BUTTON_LABEL = "Open Roblox profile";

export async function runRoblox(deps: RobloxDeps, input: RobloxInput): Promise<RobloxResult> {
  if (!deps.resolve) {
    return { kind: "unconfigured", ephemeral: true, message: "Roblox lookup isn't configured." };
  }
  const isSelf = input.targetId === null;
  const whoId = isSelf ? input.invokerId : input.targetId!;

  let linked: { robloxId: string; username?: string } | null;
  try {
    linked = await deps.resolve(input.guildId, whoId);
  } catch {
    return {
      kind: "error",
      ephemeral: true,
      message: "Couldn't reach Bloxlink right now — try again shortly.",
    };
  }

  if (!linked) {
    return isSelf
      ? {
          kind: "self-unlinked",
          ephemeral: true,
          message: "You haven't linked a Roblox account — verify with Bloxlink first.",
        }
      : {
          kind: "lookup-unlinked",
          ephemeral: true,
          message: "That member hasn't linked a Roblox account.",
        };
  }

  return {
    kind: isSelf ? "self" : "lookup",
    ephemeral: !isSelf,
    robloxId: linked.robloxId,
    url: robloxProfileUrl(linked.robloxId),
    buttonLabel: BUTTON_LABEL,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/roblox/robloxCommand.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/roblox/robloxCommand.ts tests/roblox/robloxCommand.test.ts
git commit -m "feat(roblox): add runRoblox handler returning plain result data"
```

---

### Task 4: Load `BLOXLINK_API_KEY` from the environment

**Files:**
- Modify: `src/config/env.ts`
- Test: `tests/config/env.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Env.bloxlinkApiKey: string | null` — trimmed `BLOXLINK_API_KEY`, or `null` when unset/blank. It is **optional** (not added to the `required` list).

- [ ] **Step 1: Write the failing test**

Add this `describe` block to `tests/config/env.test.ts` (keep existing tests). **`loadEnv` and the vitest helpers are already imported at the top of that file — do not re-import them; add only the block below.** Use a complete valid base source of required vars:

```typescript
const baseRequired = {
  DISCORD_BOT_TOKEN: "t",
  DISCORD_CLIENT_ID: "c",
  DATABASE_URL: "postgres://x",
};

describe("loadEnv — bloxlinkApiKey", () => {
  it("reads BLOXLINK_API_KEY when present", () => {
    expect(loadEnv({ ...baseRequired, BLOXLINK_API_KEY: " key " }).bloxlinkApiKey).toBe("key");
  });
  it("is null when BLOXLINK_API_KEY is absent", () => {
    expect(loadEnv({ ...baseRequired }).bloxlinkApiKey).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/env.test.ts`
Expected: FAIL — `bloxlinkApiKey` is `undefined` (property does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Edit `src/config/env.ts` to add the field:

```typescript
export interface Env {
  discordToken: string;
  discordClientId: string;
  databaseUrl: string;
  anthropicApiKey: string | null;
  bloxlinkApiKey: string | null;
}

export function loadEnv(source: Record<string, string | undefined>): Env {
  const required = ["DISCORD_BOT_TOKEN", "DISCORD_CLIENT_ID", "DATABASE_URL"] as const;
  const missing = required.filter((k) => !source[k]);
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  const anthropic = source.ANTHROPIC_API_KEY?.trim();
  const bloxlink = source.BLOXLINK_API_KEY?.trim();
  return {
    discordToken: source.DISCORD_BOT_TOKEN!,
    discordClientId: source.DISCORD_CLIENT_ID!,
    databaseUrl: source.DATABASE_URL!,
    anthropicApiKey: anthropic ? anthropic : null,
    bloxlinkApiKey: bloxlink ? bloxlink : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config/env.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/config/env.ts tests/config/env.test.ts
git commit -m "feat(roblox): load optional BLOXLINK_API_KEY from env"
```

---

### Task 5: Register the `/roblox` command

**Files:**
- Modify: `src/bot/registerCommands.ts:42` (the `buildCommandData` return array)
- Test: `tests/bot/registerCommands.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `buildCommandData()` output includes a command `{ name: "roblox" }` with one **optional** user option named `user`.

**Note — two existing assertions in `tests/bot/registerCommands.test.ts` must be updated in this task, or the suite breaks when `/roblox` is added:**
1. The first test pins the exact command set: `expect(names).toEqual(["ask", "backlog", "ban", "kb", "kick", "mute", "warn"])`. Adding `/roblox` must extend it to include `"roblox"` (sorted).
2. The second test ("each moderation command requires a target user option") skips `["backlog", "ask", "kb"]`. Add `"roblox"` to that skip list — `/roblox` is not a moderation command, and its `user` option is optional. (It would coincidentally still pass, since `/roblox` has a `user` option, but the skip keeps the test's intent honest.)

- [ ] **Step 1: Update the existing assertions + add the new failing test**

In `tests/bot/registerCommands.test.ts`:

(a) Update the exact-set assertion (currently line 7) to include `"roblox"` (sorted):

```typescript
    expect(names).toEqual(["ask", "backlog", "ban", "kb", "kick", "mute", "roblox", "warn"]);
```

(b) Update the moderation-command skip list (currently line 11) to add `"roblox"`:

```typescript
      if (["backlog", "ask", "kb", "roblox"].includes(cmd.name)) continue;
```

(c) Add this new `describe` block. **`buildCommandData` and the vitest helpers are already imported at the top of that file — do not re-import; add only the block below:**

```typescript
describe("buildCommandData — /roblox", () => {
  it("includes a roblox command with an optional user option", () => {
    const roblox = buildCommandData().find((c) => c.name === "roblox");
    expect(roblox).toBeDefined();
    const userOpt = (roblox!.options ?? []).find((o: { name: string }) => o.name === "user");
    expect(userOpt).toBeDefined();
    expect((userOpt as { required?: boolean }).required ?? false).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bot/registerCommands.test.ts`
Expected: FAIL — the updated exact-set assertion expects `"roblox"` but `buildCommandData` doesn't emit it yet; the new test's `find(... "roblox")` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/bot/registerCommands.ts`, add the builder just before the `return` in `buildCommandData` and include it in the array:

```typescript
  const roblox = new SlashCommandBuilder()
    .setName("roblox")
    .setDescription("Show a Roblox profile to follow");
  roblox.addUserOption((o) =>
    o.setName("user").setDescription("Member to look up (omit for your own)").setRequired(false));
  return [warn, mute, kick, ban, backlog, ask, kb, roblox].map((b) => b.toJSON());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bot/registerCommands.test.ts`
Expected: PASS (existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/bot/registerCommands.ts tests/bot/registerCommands.test.ts
git commit -m "feat(roblox): register /roblox slash command"
```

---

### Task 6: Wire `/roblox` into the router and startup

**Files:**
- Modify: `src/bot/router.ts` (imports, `RouterCtx`, and a new command branch)
- Modify: `src/index.ts` (construct the resolver, pass it into `attachRouter`)

**Interfaces:**
- Consumes: `runRoblox`, `RobloxResult` (Task 3); `makeBloxlinkResolver`, `BloxlinkResolver` (Task 2); `Env.bloxlinkApiKey` (Task 4).
- Produces: a live `/roblox` command. No new unit test — the logic is covered by Task 3; this task is discord.js presentation glue, verified by `npm run build` + `npm test` staying green and a manual smoke.

- [ ] **Step 1: Add discord.js imports and the resolver to `RouterCtx`**

In `src/bot/router.ts`, extend the discord.js import on line 2 to add the builder types, add the roblox imports, and add the `robloxResolve` field to `RouterCtx`:

```typescript
// line 2 — add EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle
import {
  PermissionFlagsBits, MessageFlags, GuildVerificationLevel, TextChannel, ChannelType,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  type ChatInputCommandInteraction,
} from "discord.js";

// with the other imports:
import { runRoblox } from "../roblox/robloxCommand.js";
import type { BloxlinkResolver } from "../roblox/bloxlink.js";
```

In the `RouterCtx` interface, add:

```typescript
  robloxResolve: BloxlinkResolver | null;
```

- [ ] **Step 2: Add the `/roblox` branch in `interactionCreate`**

In `src/bot/router.ts`, add this branch immediately **after** the closing `}` of the `if (gi.commandName === "ask") { … }` block and **before** the `if (!gi.memberPermissions?.has(PermissionFlagsBits.ModerateMembers))` mod gate (so `/roblox` is a public command, not mod-gated):

```typescript
    if (gi.commandName === "roblox") {
      const target = gi.options.getUser("user");
      const res = await runRoblox(
        { resolve: ctx.robloxResolve },
        { guildId: i.guildId, invokerId: gi.user.id, targetId: target?.id ?? null, targetTag: target?.tag ?? null },
      );
      if ((res.kind === "self" || res.kind === "lookup") && res.url) {
        const embed = new EmbedBuilder()
          .setTitle("Roblox profile")
          .setURL(res.url)
          .setDescription(`[Open profile](${res.url}) — then click **Follow** on Roblox.`);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(res.buttonLabel!).setURL(res.url),
        );
        await gi.reply({
          embeds: [embed],
          components: [row],
          ...(res.ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
          allowedMentions: { parse: [] },
        });
      } else {
        await gi.reply({ content: res.message ?? "Couldn't look that up.", flags: MessageFlags.Ephemeral });
      }
      return;
    }
```

- [ ] **Step 3: Construct the resolver in `src/index.ts`**

Add the import near the other feature imports:

```typescript
import { makeBloxlinkResolver } from "./roblox/bloxlink.js";
```

In the `attachRouter(client, { … })` call, add the field alongside `answerer`:

```typescript
    robloxResolve: env.bloxlinkApiKey ? makeBloxlinkResolver(env.bloxlinkApiKey) : null,
```

- [ ] **Step 4: Verify build + full suite pass**

Run: `npm run build`
Expected: exit 0 (no type errors — confirms `RouterCtx` is satisfied at the `attachRouter` call site and the branch typechecks).

Run: `npm test`
Expected: all tests pass (the earlier task suites + the existing 142).

- [ ] **Step 5: Commit**

```bash
git add src/bot/router.ts src/index.ts
git commit -m "feat(roblox): wire /roblox into the router and startup"
```

- [ ] **Step 6: Manual smoke (after deploy, with BLOXLINK_API_KEY set on Railway)**

In the NOPAS server:
1. `/roblox` (no user, as a Bloxlink-verified member) → **public** embed with an "Open Roblox profile" button that opens your own profile.
2. `/roblox @someone-verified` → **ephemeral** embed for that member.
3. `/roblox @someone-unverified` → ephemeral "hasn't linked a Roblox account".
4. Temporarily unset `BLOXLINK_API_KEY` (or test before setting) → ephemeral "isn't configured".

---

## Rollout notes (not code tasks)

- Add `BLOXLINK_API_KEY` to Railway env (read-only, guild-scoped key from the Bloxlink dashboard) before/for the smoke test. The bot runs fine without it — `/roblox` just replies "isn't configured".
- Commands register per-guild on `ClientReady`, so `/roblox` appears instantly on the next deploy/restart (no ~1h global propagation).
- No DB migration, no config row changes.
