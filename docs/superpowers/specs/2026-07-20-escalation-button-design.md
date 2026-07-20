# Spec — Escalate-to-admin button

Status: designed (brainstormed 2026-07-20), not yet implemented.
Repo: `collapsedstargames-bot` (the mod bot). No website or MCP changes.

## 1. Goal

Give a moderator a one-action way to flag a specific message to the adult admin — privately, with a snapshot that survives the message being deleted. The driving use case: the NOPAS Discord is moderated by a three-person team of which **two are teenagers**. When a teen mod encounters something they should not have to adjudicate (threats, grooming, doxxing, self-harm, sexual content), they need to route it to the adult without dwelling on it, exposing it in the shared mod channel, or losing it if the author deletes the message.

**Flow:** Right-click a message → **Apps → Escalate to admin** → optional "reason" modal → a snapshot card posts to an admin-only channel and pings the admin → the mod gets a quiet ephemeral "Escalated ✓".

## 2. Non-goals

- No member-facing reporting/panic path (mods only — decided in brainstorming).
- No follow-up admin discussion threads in v1 (YAGNI).
- No new verification/permission gate in code — Bloxlink already owns verification and role assignment; locking unverified users out is a Discord permission-config task handed over as a checklist (§11), not a build.
- No `/escalate` slash command in v1 (context menu only — decided in brainstorming).
- No new DB table or SQL migration (`guild_config` is a JSON blob; new fields are additive).

## 3. Placement

Lives in the **mod bot** (`collapsedstargames-bot`), which owns the command surface, `guild_config`, and the mod-log. This is a moderation command, so its router branch sits **after** the mod-permission gate in `interactionCreate` (unlike `/ask` and `/roblox`, which are pre-gate public commands).

## 4. Trigger surface

A single **message context-menu command** (`ContextMenuCommandBuilder`, type `Message`) named **"Escalate to admin"**. No slash command, no arguments — the target message is `interaction.targetMessage`.

**Authorization:** gated on `PermissionFlagsBits.ModerateMembers`, the same check `/roblox @user` uses. A non-mod who somehow invokes it gets an ephemeral refusal and nothing is posted.

**Reason capture:** the context-menu interaction opens a modal (`showModal`) with one optional paragraph input, "Reason (optional)". Discord allows a modal to be shown directly in response to a context-menu interaction.

## 5. Deletion-proof snapshot

The offending message is frequently deleted right after posting, so the snapshot must be captured at right-click time, **before** the modal round-trip:

1. On the context-menu interaction, build a `Snapshot` from `interaction.targetMessage` immediately (content, author tag + id, channel id, message id, jump URL, attachment count, created-at).
2. Stash it in a short-lived in-memory map keyed by a random token, TTL ~10 minutes, same pattern/style as `src/ask/rateLimiter.ts` (bounded, self-sweeping). The token goes in the modal's `customId` (`escalate:<token>` — well under the 100-char limit).
3. On modal submit, look up the token, combine the snapshot with the entered reason, and proceed. If the token is missing/expired (mod sat on the modal >10 min), reply ephemerally "This escalation expired — right-click the message again."

This means a deleted message still escalates with full content intact.

## 6. Config additions

Two new nullable fields on `GuildConfig` / `DEFAULT_CONFIG` (`src/config/guildConfig.ts`). Because config persists as a JSON `data` column, this needs **no migration** — absent keys default to `null` via `DEFAULT_CONFIG`.

```ts
adminAlertChannelId: string | null;  // admin-only channel escalations post to
adminRoleId: string | null;          // role to ping; null → ping the guild owner
```

Set the same way the rest of `guild_config` is edited live today. Note: like other `guild_config` reads, a change takes up to the config-cache TTL (30 s) to apply, or is immediate on a bot restart.

## 7. Core logic — `src/escalation/escalate.ts`

Pure, discord.js-free, following the injectable-seam pattern established by `robloxCommand.ts` (discord.js lives only in the router). Returns a discriminated union so the router just renders.

```ts
export interface Snapshot {
  authorTag: string;
  authorId: string;
  channelId: string;
  messageId: string;
  jumpUrl: string;
  content: string;        // raw; may be ""
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

export type EscalationResult =
  | { kind: "forbidden"; ephemeral: true; message: string }
  | { kind: "unconfigured"; ephemeral: true; message: string }
  | {
      kind: "escalated";
      ephemeral: true;                 // the ack to the mod
      adminChannelId: string;
      ping: { roleId: string } | { ownerFallback: true };
      card: EscalationCard;            // structured; router builds the embed
      modLogLine: string;              // neutral, content-free
      ackMessage: string;              // "Escalated ✓ — sent to the admin."
    };

export interface EscalationCard {
  authorMention: string;   // <@id>
  authorTag: string;
  authorId: string;
  channelMention: string;  // <#id>
  jumpUrl: string;
  contentQuoted: string;   // truncated to 1024; "(no text — N attachment(s))" when empty
  attachmentCount: number;
  escalatedByMention: string;
  reason: string;          // "(none given)" when null/blank
  whenIso: string;
}
```

Behavior:
- `requesterIsMod === false` → `forbidden`.
- `adminAlertChannelId` null → `unconfigured` (ephemeral guidance, nothing posted).
- otherwise → `escalated`. `ping` is `{ roleId }` when `adminRoleId` is set, else `{ ownerFallback: true }` (router resolves the owner mention).
- `contentQuoted`: if `content.trim()` is empty → `"(no text — ${attachmentCount} attachment(s))"`; else the content truncated to 1024 chars (append `…` if cut).

## 8. Router wiring (`src/bot/router.ts`)

- Register the context-menu command in `registerCommands.ts`.
- On the `ContextMenuCommand` interaction: check `ModerateMembers`; build + stash the snapshot; `showModal`.
- On the matching `ModalSubmit` (`customId` starts `escalate:`): resolve the token → snapshot; call `runEscalation`; on `escalated`, post the embed + ping content to `adminChannelId` (resolve owner mention if `ownerFallback`), write the mod-log line via the existing mod-log path, and reply to the mod ephemerally with `ackMessage`. On `unconfigured`/`forbidden`/expired-token, reply ephemerally. Wrap the reply in `.catch(() => {})` per the established unguarded-reply hardening.

## 9. Mod-log

A neutral, **content-free** line — e.g. `🚩 escalation raised by @mod` — written to the existing mod-log. This gives an accountability trail (an escalation happened, by whom, when) without surfacing the sensitive content to the teen mods. The content lives only in the admin-only channel card.

(If we later decide even the neutral line is undesirable, it is a one-line removal — but the default is to keep it for accountability.)

## 10. Testing

TDD, pure-function unit tests on `runEscalation` (`tests/escalation/escalate.test.ts`), mirroring the `robloxCommand` test structure:

- non-mod → `forbidden`, nothing else computed
- mod, no `adminAlertChannelId` → `unconfigured`
- mod, configured, `adminRoleId` set → `escalated` with `ping.roleId`
- mod, configured, `adminRoleId` null → `escalated` with `ownerFallback`
- content > 1024 → truncated with `…`
- empty content + attachments → `"(no text — N attachment(s))"`
- null/blank reason → `"(none given)"`

The router stays thin (integration-manual, as with the rest of the bot). The `registerCommands` test that pins the exact command set is updated to include the new context-menu command.

## 11. Companion: verification gate (config, not code)

Handed over as a checklist rather than built, since Bloxlink owns verification:

1. Confirm `verifiedRoleId` in `guild_config` is Bloxlink's assigned verified role.
2. In Discord, remove `@everyone`'s View/Send on all channels except `#verify` (and any rules/landing channel).
3. Grant the verified role View/Send on the real channels.
4. Ensure Bloxlink is configured to assign that exact role on successful verification.
5. Sanity-check the bot's own role sits above the verified role and retains its needed permissions.

Result: unverified users see only `#verify`; verifying (via Bloxlink) unlocks the server. No bot code involved.

## 12. Open decisions (resolved in brainstorming 2026-07-20)

- Who escalates → **mods only**.
- Trigger → **right-click context menu** (not slash, not both).
- Destination → **new admin-only channel + ping the admin/owner** (not DM, not the shared mod-alert channel).
