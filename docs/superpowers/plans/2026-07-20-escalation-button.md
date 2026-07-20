# Escalate-to-admin Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a moderator right-click a message → "Escalate to admin" → optional reason → a deletion-proof snapshot card posts to an admin-only channel and pings the admin.

**Architecture:** A pure, discord.js-free `runEscalation(deps, input)` returns a discriminated union (forbidden / unconfigured / escalated); a short-lived in-memory store holds the message snapshot across the context-menu→modal round-trip; the router wires the context-menu command and modal handler. Follows the injectable-seam pattern established by `robloxCommand.ts` — discord.js lives only in the router.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), discord.js v14, vitest, tsc.

**Repo:** `collapsedstargames-bot` (the mod bot). No website or MCP changes.

## Global Constraints

- ESM: every relative import uses a `.js` specifier, even from `.ts` sources.
- Injectable-seam pattern: pure logic returns plain data and takes injected deps; discord.js is imported only in `src/bot/router.ts` and `src/bot/registerCommands.ts`.
- TDD: write the failing test, watch it fail, minimal implementation, watch it pass, commit.
- vitest does NOT typecheck — after the suite is green, also run `npm run build` (tsc) before considering a task done.
- Authorization: moderator = `PermissionFlagsBits.ModerateMembers` (same check `/roblox @user` uses).
- Mod-log lines for escalations are content-free (name the escalating mod, never the target or the message content).
- Config persists as a JSON `data` blob, so new `GuildConfig` fields are additive — no SQL migration.

---

### Task 1: Add admin-channel config fields

**Files:**
- Modify: `src/config/guildConfig.ts`
- Test: `tests/config/guildConfig.test.ts` (create if absent; otherwise add a case)

**Interfaces:**
- Produces: `GuildConfig.adminAlertChannelId: string | null`, `GuildConfig.adminRoleId: string | null`, both defaulting to `null` in `DEFAULT_CONFIG`.

- [ ] **Step 1: Write the failing test**

Create/append `tests/config/guildConfig.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../../src/config/guildConfig.js";

describe("guildConfig admin fields", () => {
  it("defaults the admin escalation fields to null", () => {
    const c = DEFAULT_CONFIG("g1");
    expect(c.adminAlertChannelId).toBeNull();
    expect(c.adminRoleId).toBeNull();
  });

  it("mergeConfig can set the admin channel", () => {
    const merged = mergeConfig(DEFAULT_CONFIG("g1"), { adminAlertChannelId: "chan-9" });
    expect(merged.adminAlertChannelId).toBe("chan-9");
    expect(merged.adminRoleId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/config/guildConfig.test.ts`
Expected: FAIL — `adminAlertChannelId` does not exist on `GuildConfig` (type error / undefined).

- [ ] **Step 3: Add the fields**

In `src/config/guildConfig.ts`, add to the `GuildConfig` interface (after `askLogChannelId`):

```ts
  adminAlertChannelId: string | null;
  adminRoleId: string | null;
```

And to the `DEFAULT_CONFIG` return object (after `askLogChannelId: null,`):

```ts
    adminAlertChannelId: null,
    adminRoleId: null,
```

`mergeConfig` needs no change (it spreads `patch` over `base`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/config/guildConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify no config/repo test regressed and typecheck**

Run: `npm test -- tests/db/repositories.test.ts && npm run build`
Expected: PASS, build clean. (`configRepo` reads/writes the whole config as JSON, so absent keys on old rows resolve to `null` via `DEFAULT_CONFIG`; no repo change needed.)

- [ ] **Step 6: Commit**

```bash
git add src/config/guildConfig.ts tests/config/guildConfig.test.ts
git commit -m "feat(escalation): add adminAlertChannelId + adminRoleId config fields"
```

---

### Task 2: Pure escalation logic

**Files:**
- Create: `src/escalation/escalate.ts`
- Test: `tests/escalation/escalate.test.ts`

**Interfaces:**
- Consumes: `GuildConfig` (for `adminAlertChannelId`, `adminRoleId`).
- Produces: `Snapshot`, `EscalationInput`, `EscalationDeps`, `EscalationCard`, `EscalationResult`, and `runEscalation(deps, input): Promise<EscalationResult>`. Task 3 imports `Snapshot`; Task 5 imports `runEscalation` and all types.

- [ ] **Step 1: Write the failing test**

Create `tests/escalation/escalate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runEscalation } from "../../src/escalation/escalate.js";
import type { Snapshot } from "../../src/escalation/escalate.js";
import { DEFAULT_CONFIG } from "../../src/config/guildConfig.js";

const snap: Snapshot = {
  authorTag: "Bad#1", authorId: "u-bad", channelId: "c-1", messageId: "m-1",
  jumpUrl: "https://discord.com/channels/g/c-1/m-1",
  content: "something alarming", attachmentCount: 0, createdAtIso: "2026-07-20T00:00:00.000Z",
};
const base = { guildId: "g", moderatorId: "mod-1", requesterIsMod: true, snapshot: snap, reason: "grooming" };
const cfgWith = (patch: Record<string, unknown>) => ({
  getConfig: async () => ({ ...DEFAULT_CONFIG("g"), ...patch }),
});

describe("runEscalation", () => {
  it("non-mod → forbidden, nothing computed", async () => {
    const r = await runEscalation(cfgWith({ adminAlertChannelId: "admin-c" }), { ...base, requesterIsMod: false });
    expect(r.kind).toBe("forbidden");
    expect(r.ephemeral).toBe(true);
  });

  it("mod but no admin channel → unconfigured", async () => {
    const r = await runEscalation(cfgWith({ adminAlertChannelId: null }), { ...base });
    expect(r.kind).toBe("unconfigured");
  });

  it("mod + admin channel + admin role → escalated, pings the role", async () => {
    const r = await runEscalation(cfgWith({ adminAlertChannelId: "admin-c", adminRoleId: "role-9" }), { ...base });
    expect(r.kind).toBe("escalated");
    if (r.kind !== "escalated") throw new Error("narrow");
    expect(r.adminChannelId).toBe("admin-c");
    expect(r.ping).toEqual({ roleId: "role-9" });
    expect(r.card.authorMention).toBe("<@u-bad>");
    expect(r.card.reason).toBe("grooming");
    expect(r.modLogLine).toContain("mod-1");
    expect(r.modLogLine).not.toContain("u-bad"); // content-free: no target
  });

  it("no admin role → owner fallback ping", async () => {
    const r = await runEscalation(cfgWith({ adminAlertChannelId: "admin-c", adminRoleId: null }), { ...base });
    if (r.kind !== "escalated") throw new Error("narrow");
    expect(r.ping).toEqual({ ownerFallback: true });
  });

  it("content over 1024 is truncated with an ellipsis", async () => {
    const long = "x".repeat(2000);
    const r = await runEscalation(cfgWith({ adminAlertChannelId: "admin-c" }), { ...base, snapshot: { ...snap, content: long } });
    if (r.kind !== "escalated") throw new Error("narrow");
    expect(r.card.contentQuoted.length).toBe(1024);
    expect(r.card.contentQuoted.endsWith("…")).toBe(true);
  });

  it("empty content shows an attachment placeholder", async () => {
    const r = await runEscalation(cfgWith({ adminAlertChannelId: "admin-c" }), { ...base, snapshot: { ...snap, content: "   ", attachmentCount: 2 } });
    if (r.kind !== "escalated") throw new Error("narrow");
    expect(r.card.contentQuoted).toBe("(no text — 2 attachment(s))");
  });

  it("blank reason renders as (none given)", async () => {
    const r = await runEscalation(cfgWith({ adminAlertChannelId: "admin-c" }), { ...base, reason: null });
    if (r.kind !== "escalated") throw new Error("narrow");
    expect(r.card.reason).toBe("(none given)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/escalation/escalate.test.ts`
Expected: FAIL — cannot find module `../../src/escalation/escalate.js`.

- [ ] **Step 3: Write the implementation**

Create `src/escalation/escalate.ts`:

```ts
import type { GuildConfig } from "../config/guildConfig.js";

export interface Snapshot {
  authorTag: string;
  authorId: string;
  channelId: string;
  messageId: string;
  jumpUrl: string;
  content: string;
  attachmentCount: number;
  createdAtIso: string;
}

export interface EscalationInput {
  guildId: string;
  moderatorId: string;
  requesterIsMod: boolean;
  snapshot: Snapshot;
  reason: string | null;
}

export interface EscalationDeps {
  getConfig: (guildId: string) => Promise<GuildConfig>;
}

export interface EscalationCard {
  authorMention: string;
  authorTag: string;
  authorId: string;
  channelMention: string;
  jumpUrl: string;
  contentQuoted: string;
  attachmentCount: number;
  escalatedByMention: string;
  reason: string;
  whenIso: string;
}

export type EscalationResult =
  | { kind: "forbidden"; ephemeral: true; message: string }
  | { kind: "unconfigured"; ephemeral: true; message: string }
  | {
      kind: "escalated";
      ephemeral: true;
      adminChannelId: string;
      ping: { roleId: string } | { ownerFallback: true };
      card: EscalationCard;
      modLogLine: string;
      ackMessage: string;
    };

const MAX_CONTENT = 1024;

function quoteContent(content: string, attachmentCount: number): string {
  const trimmed = content.trim();
  if (!trimmed) return `(no text — ${attachmentCount} attachment(s))`;
  return trimmed.length > MAX_CONTENT ? trimmed.slice(0, MAX_CONTENT - 1) + "…" : trimmed;
}

export async function runEscalation(deps: EscalationDeps, input: EscalationInput): Promise<EscalationResult> {
  if (!input.requesterIsMod) {
    return { kind: "forbidden", ephemeral: true, message: "Only moderators can escalate a message." };
  }
  const cfg = await deps.getConfig(input.guildId);
  if (!cfg.adminAlertChannelId) {
    return { kind: "unconfigured", ephemeral: true, message: "Escalation isn't set up yet — no admin channel is configured." };
  }
  const s = input.snapshot;
  const card: EscalationCard = {
    authorMention: `<@${s.authorId}>`,
    authorTag: s.authorTag,
    authorId: s.authorId,
    channelMention: `<#${s.channelId}>`,
    jumpUrl: s.jumpUrl,
    contentQuoted: quoteContent(s.content, s.attachmentCount),
    attachmentCount: s.attachmentCount,
    escalatedByMention: `<@${input.moderatorId}>`,
    reason: input.reason && input.reason.trim() ? input.reason.trim() : "(none given)",
    whenIso: s.createdAtIso,
  };
  return {
    kind: "escalated",
    ephemeral: true,
    adminChannelId: cfg.adminAlertChannelId,
    ping: cfg.adminRoleId ? { roleId: cfg.adminRoleId } : { ownerFallback: true },
    card,
    modLogLine: `🚩 Escalation raised by <@${input.moderatorId}>.`,
    ackMessage: "Escalated ✓ — sent to the admin.",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/escalation/escalate.test.ts`
Expected: PASS (all 7).

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/escalation/escalate.ts tests/escalation/escalate.test.ts
git commit -m "feat(escalation): pure runEscalation logic + tests"
```

---

### Task 3: Pending-snapshot store (context-menu → modal bridge)

**Files:**
- Create: `src/escalation/pendingEscalations.ts`
- Test: `tests/escalation/pendingEscalations.test.ts`

**Interfaces:**
- Consumes: `Snapshot` from `./escalate.js`.
- Produces: `makePendingEscalations({ now, ttlMs? })` → `{ put(snapshot): string; take(token): Snapshot | null; size(): number }`. Single-use: `take` removes the entry. Task 5 uses it in the router.

- [ ] **Step 1: Write the failing test**

Create `tests/escalation/pendingEscalations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makePendingEscalations } from "../../src/escalation/pendingEscalations.js";
import type { Snapshot } from "../../src/escalation/escalate.js";

const snap = (id: string): Snapshot => ({
  authorTag: "A#1", authorId: id, channelId: "c", messageId: "m",
  jumpUrl: "u", content: "x", attachmentCount: 0, createdAtIso: "2026-07-20T00:00:00.000Z",
});

describe("makePendingEscalations", () => {
  it("put then take returns the snapshot exactly once", () => {
    let t = 1000;
    const store = makePendingEscalations({ now: () => t });
    const token = store.put(snap("u1"));
    expect(store.take(token)?.authorId).toBe("u1");
    expect(store.take(token)).toBeNull(); // single-use
  });

  it("take of an unknown token is null", () => {
    const store = makePendingEscalations({ now: () => 1000 });
    expect(store.take("nope")).toBeNull();
  });

  it("take after the TTL returns null", () => {
    let t = 1000;
    const store = makePendingEscalations({ now: () => t, ttlMs: 600_000 });
    const token = store.put(snap("u1"));
    t += 600_001;
    expect(store.take(token)).toBeNull();
  });

  it("put sweeps entries whose TTL has expired", () => {
    let t = 1000;
    const store = makePendingEscalations({ now: () => t, ttlMs: 600_000 });
    store.put(snap("old"));
    expect(store.size()).toBe(1);
    t += 600_001;
    store.put(snap("new")); // sweep runs on put
    expect(store.size()).toBe(1);
  });

  it("issues distinct tokens for successive puts at the same instant", () => {
    const store = makePendingEscalations({ now: () => 1000 });
    expect(store.put(snap("a"))).not.toBe(store.put(snap("b")));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/escalation/pendingEscalations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/escalation/pendingEscalations.ts`:

```ts
import type { Snapshot } from "./escalate.js";

// Holds a message snapshot for the brief window between a moderator clicking
// "Escalate to admin" (context menu) and submitting the reason modal. Snapshot
// is captured at click time so a deleted message still escalates intact.
export function makePendingEscalations(opts: { now: () => number; ttlMs?: number }) {
  const ttl = opts.ttlMs ?? 600_000; // 10 minutes
  const map = new Map<string, { at: number; snapshot: Snapshot }>();
  let seq = 0;

  const sweep = (t: number) => {
    for (const [k, v] of map) if (t - v.at >= ttl) map.delete(k);
  };

  return {
    put(snapshot: Snapshot): string {
      const t = opts.now();
      sweep(t);
      const token = `${t.toString(36)}-${(seq++).toString(36)}`;
      map.set(token, { at: t, snapshot });
      return token;
    },
    take(token: string): Snapshot | null {
      const hit = map.get(token);
      if (!hit) return null;
      map.delete(token);
      if (opts.now() - hit.at >= ttl) return null;
      return hit.snapshot;
    },
    size(): number {
      return map.size;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/escalation/pendingEscalations.test.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/escalation/pendingEscalations.ts tests/escalation/pendingEscalations.test.ts
git commit -m "feat(escalation): pending-snapshot store for context-menu→modal bridge"
```

---

### Task 4: Register the "Escalate to admin" context-menu command

**Files:**
- Modify: `src/bot/registerCommands.ts`
- Test: `tests/bot/registerCommands.test.ts`

**Interfaces:**
- Produces: `buildCommandData()` now returns the existing 8 slash commands plus one message context-menu command named `"Escalate to admin"` (`type: 3`, no options).

- [ ] **Step 1: Update the failing tests**

In `tests/bot/registerCommands.test.ts`:

Change the name-set assertion (line ~7) — note capitalized names sort before lowercase in JS default sort:

```ts
    expect(names).toEqual(["Escalate to admin", "ask", "backlog", "ban", "kb", "kick", "mute", "roblox", "warn"]);
```

Add `"Escalate to admin"` to the skip list in the per-command loop (line ~11):

```ts
      if (["backlog", "ask", "kb", "roblox", "Escalate to admin"].includes(cmd.name)) continue;
```

Add a new test at the end of the file:

```ts
describe("buildCommandData — escalation context menu", () => {
  it("includes a message context-menu command with no options", () => {
    const esc = buildCommandData().find((c) => c.name === "Escalate to admin");
    expect(esc).toBeDefined();
    expect((esc as any).type).toBe(3); // ApplicationCommandType.Message
    expect(((esc as any).options ?? [])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/bot/registerCommands.test.ts`
Expected: FAIL — name set is missing `"Escalate to admin"`; new test can't find the command.

- [ ] **Step 3: Add the context-menu command**

In `src/bot/registerCommands.ts`, extend the import (line 1):

```ts
import { REST, Routes, SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType } from "discord.js";
```

Replace the `return` line at the end of `buildCommandData` (currently `return [warn, mute, kick, ban, backlog, ask, kb, roblox].map((b) => b.toJSON());`) with:

```ts
  const slash = [warn, mute, kick, ban, backlog, ask, kb, roblox].map((b) => b.toJSON());
  const escalate = new ContextMenuCommandBuilder()
    .setName("Escalate to admin")
    .setType(ApplicationCommandType.Message);
  return [...slash, escalate.toJSON()];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/bot/registerCommands.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: clean. (`ContextMenuCommandBuilder().toJSON()` is a member of the `RESTPostAPIApplicationCommandsJSONBody` union that `buildCommandData` returns.)

- [ ] **Step 6: Commit**

```bash
git add src/bot/registerCommands.ts tests/bot/registerCommands.test.ts
git commit -m "feat(escalation): register 'Escalate to admin' message context-menu command"
```

---

### Task 5: Wire the context-menu + modal handlers in the router

**Files:**
- Modify: `src/bot/router.ts`

**Interfaces:**
- Consumes: `runEscalation` + types from `../escalation/escalate.js`; `makePendingEscalations` from `../escalation/pendingEscalations.js`; existing `cfg` (config repo), `postModLog`, `client`, `ctx.log` inside `attachRouter`.
- Produces: no new exports. This is integration glue; the pure units it calls are fully tested in Tasks 2–3. Consistent with the rest of the router, it has no unit test — verified by typecheck, the unchanged suite staying green, and a manual smoke.

- [ ] **Step 1: Add imports**

At the top of `src/bot/router.ts`, extend the discord.js named import to add the modal builders:

```ts
import {
  PermissionFlagsBits, MessageFlags, GuildVerificationLevel, TextChannel, ChannelType,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  type ChatInputCommandInteraction,
} from "discord.js";
```

Add the module imports near the other feature imports (after the `runRoblox` import):

```ts
import { runEscalation } from "../escalation/escalate.js";
import { makePendingEscalations } from "../escalation/pendingEscalations.js";
```

- [ ] **Step 2: Instantiate the pending store**

Inside `attachRouter`, alongside the other repo instantiations (after `const reports = reportsRepo(ctx.pool);`):

```ts
  const pending = makePendingEscalations({ now: () => Date.now() });
```

- [ ] **Step 3: Add a dedicated interaction listener for context-menu + modal**

Add a new `client.on("interactionCreate", ...)` handler (separate from the existing chat-input one, which early-returns on these interaction types). Place it after the existing `interactionCreate` handler block, before `client.on("guildMemberAdd", ...)`:

```ts
  client.on("interactionCreate", async (i) => {
    try {
      if (i.isMessageContextMenuCommand() && i.commandName === "Escalate to admin") {
        if (!i.guildId) return;
        if (!i.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
          await i.reply({ content: "Only moderators can escalate a message.", flags: MessageFlags.Ephemeral }).catch(() => {});
          return;
        }
        const msg = i.targetMessage;
        const token = pending.put({
          authorTag: msg.author.tag,
          authorId: msg.author.id,
          channelId: msg.channelId,
          messageId: msg.id,
          jumpUrl: msg.url,
          content: msg.content ?? "",
          attachmentCount: msg.attachments.size,
          createdAtIso: msg.createdAt.toISOString(),
        });
        const modal = new ModalBuilder().setCustomId(`escalate:${token}`).setTitle("Escalate to admin");
        const reason = new TextInputBuilder()
          .setCustomId("reason").setLabel("Reason (optional)")
          .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason));
        await i.showModal(modal).catch((e) => ctx.log.error(e));
        return;
      }

      if (i.isModalSubmit() && i.customId.startsWith("escalate:") && i.guildId) {
        const snapshot = pending.take(i.customId.slice("escalate:".length));
        if (!snapshot) {
          await i.reply({ content: "This escalation expired — right-click the message again.", flags: MessageFlags.Ephemeral }).catch(() => {});
          return;
        }
        const res = await runEscalation(
          { getConfig: (g) => cfg.get(g) },
          {
            guildId: i.guildId,
            moderatorId: i.user.id,
            requesterIsMod: i.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) ?? false,
            snapshot,
            reason: i.fields.getTextInputValue("reason") || null,
          },
        );
        if (res.kind !== "escalated") {
          await i.reply({ content: res.message, flags: MessageFlags.Ephemeral }).catch(() => {});
          return;
        }
        try {
          const c = res.card;
          let pingText: string;
          const allowedMentions: { parse: []; roles?: string[]; users?: string[] } = { parse: [] };
          if ("roleId" in res.ping) {
            pingText = `<@&${res.ping.roleId}>`;
            allowedMentions.roles = [res.ping.roleId];
          } else {
            const ownerId = (await i.guild!.fetchOwner()).id;
            pingText = `<@${ownerId}>`;
            allowedMentions.users = [ownerId];
          }
          const embed = new EmbedBuilder()
            .setTitle("🚩 Escalation")
            .setColor(0xd83c3e)
            .setDescription(`From ${c.authorMention} (${c.authorTag}, \`${c.authorId}\`) in ${c.channelMention}\n[Jump to message](${c.jumpUrl})`)
            .addFields(
              { name: "Message", value: c.contentQuoted },
              { name: "Attachments", value: String(c.attachmentCount), inline: true },
              { name: "Escalated by", value: c.escalatedByMention, inline: true },
              { name: "Reason", value: c.reason },
            )
            .setTimestamp(new Date(c.whenIso));
          const ch = await client.channels.fetch(res.adminChannelId).catch(() => null);
          if (ch instanceof TextChannel) {
            await ch.send({ content: pingText, embeds: [embed], allowedMentions });
          }
          await postModLog(i.guildId, res.modLogLine);
          await i.reply({ content: res.ackMessage, flags: MessageFlags.Ephemeral }).catch(() => {});
        } catch (e) {
          ctx.log.error(e);
          await i.reply({ content: "Escalation failed to send.", flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        return;
      }
    } catch (e) {
      ctx.log.error(e);
    }
  });
```

- [ ] **Step 4: Typecheck + full suite**

Run: `npm run build && npm test`
Expected: build clean; entire suite green (no test regressions; the new handler is not unit-tested, consistent with the existing router).

- [ ] **Step 5: Commit**

```bash
git add src/bot/router.ts
git commit -m "feat(escalation): wire context-menu + modal handlers to runEscalation"
```

- [ ] **Step 6: Manual smoke checklist (post-deploy, requires a real Discord + a set adminAlertChannelId)**

- Right-click a message → Apps → **Escalate to admin** appears for a mod, is absent/refused for a non-mod.
- Submit with a reason → snapshot card lands in the admin-only channel, pings the admin role (or owner), and the mod sees an ephemeral "Escalated ✓".
- Submit with no reason → card shows "Reason: (none given)".
- Delete the source message, then escalate a *fresh* copy after waiting >10 min on the modal → "This escalation expired" (verifies the TTL); within the window the card still renders even after the message is deleted.
- Confirm the mod-log shows only "🚩 Escalation raised by @mod" with no target/content.

---

## Self-Review

**Spec coverage:**
- §4 trigger (context menu, ModerateMembers gate) → Task 4 (register) + Task 5 (handler + gate). ✓
- §5 deletion-proof snapshot + 10-min TTL token in modal customId → Task 3 + Task 5 Step 3. ✓
- §6 config fields (no migration) → Task 1. ✓
- §7 pure discriminated-union logic → Task 2. ✓
- §8 router wiring (context menu → modal → post + ack) → Task 5. ✓
- §9 content-free mod-log line → Task 2 (`modLogLine`, asserted content-free) + Task 5 (`postModLog`). ✓
- §10 test matrix → Task 2 tests (all 7 cases). ✓
- §11 verification checklist → out of code scope (handed over separately); no task. ✓ (intentional)

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**Type consistency:** `Snapshot`/`EscalationResult`/`EscalationCard` defined in Task 2 are consumed unchanged in Tasks 3 and 5; `ping` union (`{ roleId }` | `{ ownerFallback: true }`) is produced in Task 2 and narrowed identically in Task 5; `makePendingEscalations` signature in Task 3 matches its use in Task 5. ✓

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-20-escalation-button.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
