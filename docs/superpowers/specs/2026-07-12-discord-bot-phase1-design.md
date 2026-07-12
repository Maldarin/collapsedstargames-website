# Discord Bot — Phase 1 Design (Foundation + Moderation)

**Date:** 2026-07-12
**Status:** Approved design, pending implementation plan
**Scope:** Phase 1 only. Later phases summarized in the roadmap for context.

## Purpose

Stand up an always-on Discord bot for the Collapsed Star Games community
(the NOPAS Roblox game's server). Phase 1 delivers the foundational
always-on service plus a full moderation suite. Later phases add community
sentiment analysis, Roblox gameplay statistics, and a Discord MCP for
in-session interaction.

### Why a bot and not just an MCP

An MCP server only acts while a Claude Code session is live. Moderation,
sentiment monitoring, and stat feeds must run continuously and autonomously.
The persistent bot service is therefore the substrate; a Discord MCP (Phase
4) is a complementary layer added later so Claude can query and act on the
server on-demand during sessions.

## Goals (Phase 1)

- A 24/7 bot connected to the community server.
- Automatic filtering of spam, invite links, and blocklisted content.
- AI-assisted review of gray-area messages, flagged to a private mod channel.
- Human moderator tooling: `/warn`, `/mute`, `/kick`, `/ban` + persistent mod-log.
- Anti-raid protection: new-account gating, verification, mass-join detection.

## Non-Goals (Phase 1)

- Persisting message content (see Data & Privacy).
- Sentiment analysis (Phase 2).
- Gameplay statistics / website integration (Phase 3 — game not yet launched).
- Discord MCP (Phase 4).

## Stack & Infrastructure

| Concern   | Choice | Notes |
|-----------|--------|-------|
| Repo      | New separate repo `collapsedstargames-bot` | Distinct lifecycle from the static Astro site. |
| Language  | TypeScript | Matches the existing Node/Astro ecosystem. |
| Library   | discord.js v14 | Slash commands, gateway intents, moderation APIs. |
| Host      | Railway | Always-on, GitHub auto-deploy, simple env-var/secret management. |
| Database  | Managed Postgres (Neon or Supabase free tier) | Durable across redeploys; becomes the shared seam the website reads for Phase 3 stats. |
| Secrets   | Railway env vars + gitignored local `.env` | `.env.example` documents required vars without values. |

**Alternative considered:** SQLite on a Railway volume — simpler for Phase 1,
but does not help the future website integration, so Postgres is preferred.

**Required secrets:** `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`,
`ANTHROPIC_API_KEY` (optional — see AI Review), `DATABASE_URL`.

## Components

Each component is a focused module reading a central config, so behavior is
tunable without code changes.

### 1. Core / Gateway
Connects to Discord, declares the minimum required gateway intents, registers
slash commands, and routes events to the other modules. The always-on
skeleton everything attaches to. Owns startup, graceful shutdown, and the
error-reporting hook (see Ops).

### 2. Auto-Filter
Inspects each incoming message against pure rules: spam heuristics, Discord
invite links, and a configurable blocklist. On a match: delete the message
and write an outcome record to the mod-log. Instant, no external API, no cost.

### 3. AI Review
Messages that pass the cheap filters but look gray-area (length/pattern
heuristics decide candidacy to control cost) are sent to the Claude API with
a classification prompt ("is this harassment, toxicity, or a rule violation?").
If flagged, the bot posts a summary + jump-link to a **private mod channel**
for a human to action — it does not auto-punish. **Degrades gracefully:** if
`ANTHROPIC_API_KEY` is absent, this module stays off and the rest of the bot
runs normally.

### 4. Mod Commands
Slash commands for human moderators: `/warn`, `/mute` (via Discord's native
timeout), `/kick`, `/ban`.
Every action writes to a persistent **mod-log** in Postgres and is mirrored
to a log channel. Warnings accumulate in an **infractions** table so `/warn`
can support escalation. Command access is gated by Discord role/permission.

### 5. Anti-Raid
- **Account-age gate:** joiners below a configurable account-age threshold are
  held/restricted.
- **Verification:** a verification step (e.g. react/button-to-verify) before
  full access.
- **Mass-join detection:** a spike in joins within a short window can auto-lock
  the server and ping mods.

## Configuration

A central per-server config controls all tunable behavior:
- Channel IDs: mod-alert channel, mod-log channel, verification channel,
  bot-status channel.
- Auto-filter blocklist and toggles.
- Account-age threshold and mass-join sensitivity.
- Feature enable/disable flags (for staged rollout).

Config is stored in Postgres and editable without redeploying.

## Data & Privacy

**Stored in Postgres:**
- **Config** — per-server settings.
- **Mod-log** — target user ID, moderator ID, action, reason, timestamp.
  Retained indefinitely as an audit trail.
- **Infractions** — per-user warning/mute history for escalation.
- **Anti-raid state** — recent join timestamps; short-lived, auto-pruned.

**Deliberately NOT stored in Phase 1:** message content. Auto-filter and AI
review inspect a message in memory at post time, act, and discard it. Only the
*outcome* is persisted (e.g. "deleted invite link from user X"). This keeps the
bot clean against privacy expectations and Discord's ToS.

This boundary changes in Phase 2 (sentiment needs message content) and will be
designed there with an explicit, announced retention policy (aggregated /
anonymized, short window).

## Deployment & Operations

- **CI/CD:** GitHub repo → Railway auto-deploy on push to `main`.
- **Logging & health:** structured logs to Railway; unhandled errors also
  posted to a private bot-status channel so crashes are visible in Discord.
- **Local development:** run against a dedicated **test Discord server** with a
  separate dev bot token — never test moderation against the live community.
- **Permissions:** bot joins with least-privilege permissions.
- **Rollout:** features enabled one at a time via config flags to validate each
  before it goes live.

## Phase-1 Build Order

Smallest-useful-first, external dependency last:

1. Core / gateway skeleton (connect, register commands, error hook).
2. Auto-filter + mod-log.
3. Mod commands + infractions.
4. Anti-raid.
5. AI review (only piece with an external API dependency).

## Roadmap (Beyond Phase 1)

- **Phase 2 — Community sentiment:** scheduled digests of player/community
  sentiment posted to the owner. Introduces a message-content retention policy.
- **Phase 3 — Gameplay stats (post-launch):** Roblox → Open Cloud → shared
  Postgres → website + Discord widgets. Parked until the game ships.
- **Phase 4 — Discord MCP:** lets Claude query/act on the server during
  sessions (read mod-log, pull sentiment summaries, post announcements).

## Open Questions / Assumptions

- Postgres provider (Neon vs Supabase) to be chosen at implementation; both
  free tiers are adequate. No design impact.
- Specific auto-filter blocklist contents and anti-raid thresholds are
  operational config, set during rollout rather than in this design.
- Verification mechanism (button vs reaction vs role-gate) to be finalized in
  the implementation plan; button-based is the default assumption.
