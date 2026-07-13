# Content & Triage MCP — Design Spec (Round 1)

**Date:** 2026-07-13
**Project:** `collapsedstargames-mcp` (new, standalone, local-only)
**Status:** Approved for planning

## Summary

A local [Model Context Protocol](https://modelcontextprotocol.io) server that
gives Claude Code a small, fixed set of Discord tools for the NOPAS community
server (guild `1512237266800742570`). It lets Claude — working interactively
with the user — **review, edit, and post channel content**, and **triage forum
reports** (bug reports, playtester feedback, suggestions, roadmap) by reading a
thread, replying with status/remediation, setting its status tag, and
closing/reopening it.

It authenticates as a **dedicated, least-privilege Discord bot** that is
**separate from the moderation bot** (`collapsedstargames-bot`). It never has
the moderation bot's kick/ban/role powers. It talks to Discord over **REST
only** — no gateway connection and no privileged intents.

This is **Round 1** of a three-round vision. Rounds 2 (backlog persistence +
automated ingest) and 3 (scheduled in-game stat/highlight posts) are explicitly
out of scope here and get their own specs.

## Goals

- Claude can read existing channel/thread content and edit or post content in
  the NOPAS server, interactively with the user.
- Claude can triage forum reports end-to-end: read a report thread, reply,
  change its status tag, and close or reopen it.
- The tool that holds a Discord token has the **minimum** permissions its job
  requires, and is isolated from the moderation bot.
- No new infrastructure: Round 1 treats Discord threads as the source of truth.
  Report status lives in Discord forum tags, not a database.

## Non-Goals (Round 1)

- **No database / backlog store.** No persistence of reports, roadmap items, or
  suggestions. (→ Round 2)
- **No automated ingest.** Nothing runs on new-report events; all triage is
  interactive and initiated by the user through Claude. (→ Round 2)
- **No scheduled posting.** No "post daily stats" behavior — that requires an
  always-on process and game telemetry. (→ Round 3)
- **No role management, kicks, bans, or server-config changes.** Those belong to
  the moderation bot, not this tool.
- **No creating or deleting channels**; `edit_channel` changes name/topic only.
- **No creating new forum posts** in Round 1 (users create bug/playtest posts).

## Why local + interactive (architecture boundary)

The MCP runs **only when Claude Code is open on the user's machine**. It is the
*interactive, human-in-the-loop* surface. Anything **automatic** (auto-ingesting
new reports) or **scheduled** (daily stat posts) cannot live here because the
MCP is asleep whenever the user is not actively working with Claude — those
belong to the always-on moderation bot (Rounds 2 and 3). This boundary is the
reason the vision is split into rounds.

## Approach: REST-only

The server uses `@discordjs/rest` + `discord-api-types` to call Discord's REST
API directly. There is **no `discord.js` gateway `Client`** and **no websocket**.

Rationale:

- **Avoids the privileged `MessageContent` gateway intent entirely.** Reading
  message content over REST requires only View Channel + Read Message History,
  not the privileged intent (which gates *gateway events*, not REST fetches).
  Fewer privileges, no intent toggles, no future verification requirement.
- **Stateless and light.** Each tool call is one HTTPS request; no persistent
  connection to hold open for a tool that is only used intermittently.
- **Simple to test.** The REST layer mocks cleanly.

## Tool Surface

This is the **entire** surface. No tool outside this list ships in Round 1.

### Content tools

| Tool | Input (beyond guild default) | Discord permission |
|---|---|---|
| `list_channels` | — | View Channels |
| `get_channel` | `channelId` | View Channels |
| `read_messages` | `channelId`, `limit` (default 20, max 100) | View Channels, Read Message History |
| `send_message` | `channelId`, `content` (optional `embeds`) | Send Messages, Embed Links |
| `edit_message` | `channelId`, `messageId`, `content` | Send Messages |
| `delete_message` | `channelId`, `messageId` | Manage Messages |
| `pin_message` | `channelId`, `messageId` | Manage Messages |
| `unpin_message` | `channelId`, `messageId` | Manage Messages |
| `edit_channel` | `channelId`, optional `name`, optional `topic` | Manage Channels |

Notes:

- `read_messages` works on any channel **and any thread** (threads are channels),
  so it doubles as "read a bug report thread."
- `get_channel` on a **forum** channel returns its `available_tags` (the status
  tags), which the triage tools reference.

### Forum triage tools

| Tool | Input (beyond guild default) | Discord permission |
|---|---|---|
| `list_forum_posts` | `forumChannelId`, optional `includeArchived` (default true) | View Channels |
| `reply_thread` | `threadId`, `content` | Send Messages in Threads |
| `set_thread_tags` | `threadId`, `tagIds` (array) | Manage Threads |
| `close_thread` | `threadId`, optional `lock` (default false) | Manage Threads |
| `reopen_thread` | `threadId` | Manage Threads |

Notes:

- `list_forum_posts` returns, per thread: `id`, `name`, `appliedTags` (ids),
  `archived`, `locked`, `messageCount`, `createdTimestamp`. It merges the forum's
  **active** threads and (when `includeArchived`) its **archived public**
  threads.
- `reply_thread` is a message send to the thread's channel id; kept as its own
  named tool for clarity of intent when triaging.
- `close_thread` sets the thread `archived: true` (and `locked: true` when
  `lock`); `reopen_thread` sets `archived: false`.
- To change a report's status, the flow is: `get_channel(forumId)` to learn tag
  ids/names → `set_thread_tags(threadId, [statusTagId])`.

### Dedicated bot's total permission set

**Granted:** View Channels, Send Messages, Send Messages in Threads, Embed
Links, Read Message History, Manage Messages, Manage Channels, Manage Threads.

**Not granted:** Manage Roles, Kick Members, Ban Members, Moderate Members,
Manage Server/Guild, Manage Webhooks, Mention Everyone, Administrator, and every
other permission.

Rationale per non-default grant:

- **Manage Messages** — `delete_message` (self-cleanup of duplicate posts) and
  pin/unpin.
- **Manage Channels** — `edit_channel` name/topic.
- **Manage Threads** — `set_thread_tags`, `close_thread`, `reopen_thread`.
- **Send Messages in Threads** — `reply_thread`.

**Gateway intents:** none (REST-only). No privileged intents enabled in the
Developer Portal.

## Configuration

Read from environment variables, sourced from a **gitignored `.env`** in the
project folder and passed through the Claude Code MCP registration:

| Var | Meaning | Required |
|---|---|---|
| `DISCORD_MCP_TOKEN` | The dedicated assistant bot's token | Yes |
| `DISCORD_GUILD_ID` | Default guild; every tool operates within it | Yes |

- On startup, missing/empty required vars cause an immediate, clear exit before
  the server accepts requests.
- Every tool defaults to `DISCORD_GUILD_ID`; no tool takes a guild argument.

## Guild guardrail

Before any write (and for reads where cheaply verifiable), the server confirms
the target channel/thread belongs to `DISCORD_GUILD_ID`. A channel resolves to a
guild via `get_channel`; the server caches channel→guild lookups for the process
lifetime to avoid repeat calls. A target outside the configured guild is refused
with a structured error and no Discord write is attempted. This prevents the
tool from ever acting on a server it was not scoped to.

## Error handling

All Discord REST failures are caught and returned as **structured MCP tool
errors** (never raw stack traces), carrying:

- the HTTP status,
- the Discord JSON error `code` and `message` when present,
- a short human hint for the common cases: `50001` Missing Access, `50013`
  Missing Permissions, `10003` Unknown Channel, `10008` Unknown Message,
  `429` rate limited (include `retry_after`).

`@discordjs/rest` handles 429 retry/backoff internally; if a rate limit still
surfaces to the caller it is reported rather than silently swallowed.

## File structure

New standalone project at `D:\Projects\collapsedstargames-mcp` (its own git
repo, **local-only — never pushed to a host that deploys it**):

```
collapsedstargames-mcp/
  package.json          # type: module; matches bot repo conventions
  tsconfig.json         # ES2022, NodeNext, strict, rootDir src, outDir dist
  vitest.config.ts
  .gitignore            # .env, dist, node_modules
  .env.example          # documents the two vars, no secrets
  README.md             # setup + claude mcp add instructions
  src/
    index.ts            # stdio MCP bootstrap; registers all tools; startup env check
    config.ts           # load + validate env
    discord.ts          # REST client factory + guild guard + error mapping
    tools/
      channels.ts       # list_channels, get_channel, edit_channel
      messages.ts       # read_messages, send_message, edit_message,
                        #   delete_message, pin_message, unpin_message
      forums.ts         # list_forum_posts, reply_thread, set_thread_tags,
                        #   close_thread, reopen_thread
  tests/
    channels.test.ts
    messages.test.ts
    forums.test.ts
    discord.test.ts     # guild guard + error mapping
```

Each tool group is a focused file that registers its tools against the shared
REST client and exports them for the bootstrap to wire up. Input validation for
every tool uses **zod** schemas.

## Dependencies

- `@modelcontextprotocol/sdk` — MCP server + stdio transport.
- `@discordjs/rest`, `discord-api-types` — Discord REST calls and route/typing.
- `zod` — tool input schemas.
- Dev: `typescript` ^5.6, `vitest` ^2, `@types/node` ^20, `tsx` (dev run).

Conventions mirror `collapsedstargames-bot`: `type: module`, ES2022/NodeNext,
`strict`, vitest.

## Testing strategy

`vitest` with the `@discordjs/rest` layer mocked. For each tool:

- asserts it calls the correct route with the correct method and body,
- asserts input validation rejects bad input,
- asserts Discord error responses map to the right structured MCP error,
- asserts the guild guardrail refuses out-of-guild targets.

No test performs a live Discord call.

## Activation runbook (post-build)

1. Build the project (`npm install`, `npm run build`, `npm test` green).
2. Create a **new** application + bot in the Discord Developer Portal (separate
   from the moderation bot). Copy its token into the local `.env`.
3. Invite the bot to the NOPAS server with **only** the permission set above
   (least-privilege invite URL; no Administrator).
4. Ensure the bot's role can view the private categories/channels it needs
   (same category-access gotcha as the moderation bot).
5. Register with Claude Code: `claude mcp add` pointing at the built server,
   with `DISCORD_MCP_TOKEN` and `DISCORD_GUILD_ID` supplied as env.
6. **Restart Claude Code once** to load the MCP.

## Round 2 / Round 3 preview (context only — not built here)

- **Round 2 — Backlog persistence + auto-ingest.** A persistent store
  (recommended: the moderation bot's existing Neon Postgres, shared with the
  website per the parked Phase 3 plan) plus a background ingester + two-way
  status sync living in the always-on bot. The MCP gains tools to query/update
  the backlog. Roadmap and suggestions are the same machinery with different
  tags.
- **Round 3 — Scheduled stats & highlights.** A scheduler in the always-on bot
  posts daily in-game highlights (e.g. "pants stolen in the last 24h"). The
  posting mechanism is small; the real data depends on the Roblox → Postgres
  telemetry pipeline (parked Phase 3, gated on game launch).
