# Content & Triage MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, least-privilege, REST-only Discord MCP server that lets Claude Code interactively review/edit/post channel content and triage forum reports for the NOPAS server.

**Architecture:** A standalone TypeScript ESM project spawned by Claude Code over stdio. Tools are thin handlers over `@discordjs/rest` (no gateway, no privileged intents). A shared `ToolContext` carries the REST client, the configured guild id, and a cached channel→guild resolver used by a guardrail that refuses out-of-guild targets. Every Discord failure is caught and returned as a structured MCP tool error.

**Tech Stack:** Node ≥20, TypeScript 5.6 (NodeNext, strict), `@modelcontextprotocol/sdk` v1.x, `@discordjs/rest` v2, `discord-api-types` v10, `zod` v3, `dotenv`, `vitest` v2.

## Global Constraints

- **Project root:** `D:/Projects/collapsedstargames-mcp` — a NEW standalone git repo, local-only, never pushed to a host that deploys it.
- **Package:** `type: module`; TS config `target ES2022`, `module NodeNext`, `moduleResolution NodeNext`, `strict true`, `rootDir src`, `outDir dist`. Mirrors the `collapsedstargames-bot` conventions.
- **Relative imports use the `.js` extension** (NodeNext ESM requirement), e.g. `import { ok } from '../discord.js'`.
- **zod is v3** (`^3.23.8`) to match the MCP SDK; `registerTool` `inputSchema` is a **raw zod shape object** (e.g. `{ channelId: z.string() }`), NOT `z.object(...)`.
- **stdout is the JSON-RPC channel** — all diagnostics/logging go to **stderr** only.
- **Least-privilege:** the bot is granted only View Channels, Send Messages, Send Messages in Threads, Embed Links, Read Message History, Manage Messages, Manage Channels, Manage Threads. No roles/kick/ban/Manage Server/Administrator. No gateway intents.
- **Guild scoping:** every tool operates within `DISCORD_GUILD_ID`; no tool takes a guild argument; channel/thread targets outside that guild are refused.
- **Tool surface is fixed at 14 tools** (below). No tool outside this list ships in Round 1. No database, no auto-ingest, no scheduled posting (those are Rounds 2/3).
- **Secrets:** `DISCORD_MCP_TOKEN` and `DISCORD_GUILD_ID` come from a **gitignored `.env`** in the project root, loaded by the server itself. Never committed, never passed on the `claude mcp add` command line.

**The 14 tools:** `list_channels`, `get_channel`, `edit_channel` (channels); `read_messages`, `send_message`, `edit_message`, `delete_message`, `pin_message`, `unpin_message` (messages); `list_forum_posts`, `reply_thread`, `set_thread_tags`, `close_thread`, `reopen_thread` (forums).

## File Structure

```
collapsedstargames-mcp/
  package.json
  tsconfig.json
  vitest.config.ts
  .gitignore
  .env.example
  README.md
  src/
    index.ts            # Task 6 — dotenv, build server, stdio connect, startup env check
    config.ts           # Task 1 — loadConfig(env): Config
    discord.ts          # Task 2 — REST factory, ToolContext, guild guard, error mapping, helpers
    tools/
      channels.ts       # Task 3 — list_channels, get_channel, edit_channel
      messages.ts       # Task 4 — read/send/edit/delete/pin/unpin messages
      forums.ts         # Task 5 — list_forum_posts, reply_thread, set_thread_tags, close/reopen_thread
  tests/
    config.test.ts      # Task 1
    discord.test.ts     # Task 2
    channels.test.ts    # Task 3
    messages.test.ts    # Task 4
    forums.test.ts      # Task 5
    wiring.test.ts      # Task 6
```

---

### Task 1: Project scaffold + config module

**Files:**
- Create: `D:/Projects/collapsedstargames-mcp/package.json`
- Create: `D:/Projects/collapsedstargames-mcp/tsconfig.json`
- Create: `D:/Projects/collapsedstargames-mcp/vitest.config.ts`
- Create: `D:/Projects/collapsedstargames-mcp/.gitignore`
- Create: `D:/Projects/collapsedstargames-mcp/.env.example`
- Create: `D:/Projects/collapsedstargames-mcp/src/config.ts`
- Test: `D:/Projects/collapsedstargames-mcp/tests/config.test.ts`

**Interfaces:**
- Produces: `interface Config { token: string; guildId: string }` and `function loadConfig(env?: NodeJS.ProcessEnv): Config`. `loadConfig` trims values, treats empty/whitespace as missing, and throws `Error` naming all missing vars.

- [ ] **Step 1: Initialize the repo and scaffold config files**

Run:
```bash
mkdir -p D:/Projects/collapsedstargames-mcp/src D:/Projects/collapsedstargames-mcp/src/tools D:/Projects/collapsedstargames-mcp/tests
cd D:/Projects/collapsedstargames-mcp
git init
```

Create `package.json`:
```json
{
  "name": "collapsedstargames-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "collapsedstargames-mcp": "dist/index.js" },
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "@discordjs/rest": "^2.4.0",
    "discord-api-types": "^0.37.100",
    "dotenv": "^16.4.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^20.16.0",
    "tsx": "^4.19.0"
  }
}
```

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "types": ["node"]
  },
  "include": ["src"]
}
```

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node' },
});
```

Create `.gitignore`:
```
node_modules/
dist/
.env
*.log
```

Create `.env.example`:
```
# The DEDICATED assistant bot's token (NOT the moderation bot's token).
DISCORD_MCP_TOKEN=
# The NOPAS guild id. Every tool operates within this guild only.
DISCORD_GUILD_ID=1512237266800742570
```

- [ ] **Step 2: Install dependencies**

Run: `cd D:/Projects/collapsedstargames-mcp && npm install`
Expected: dependencies install, `node_modules/` and `package-lock.json` created, no errors.

- [ ] **Step 3: Write the failing test**

Create `tests/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('returns token and guildId from env', () => {
    const cfg = loadConfig({ DISCORD_MCP_TOKEN: 'tok', DISCORD_GUILD_ID: '123' });
    expect(cfg).toEqual({ token: 'tok', guildId: '123' });
  });

  it('trims surrounding whitespace', () => {
    const cfg = loadConfig({ DISCORD_MCP_TOKEN: '  tok  ', DISCORD_GUILD_ID: ' 123 ' });
    expect(cfg).toEqual({ token: 'tok', guildId: '123' });
  });

  it('throws naming every missing variable', () => {
    expect(() => loadConfig({})).toThrow(/DISCORD_MCP_TOKEN/);
    expect(() => loadConfig({})).toThrow(/DISCORD_GUILD_ID/);
  });

  it('treats empty/whitespace-only values as missing', () => {
    expect(() => loadConfig({ DISCORD_MCP_TOKEN: '   ', DISCORD_GUILD_ID: '123' })).toThrow(
      /DISCORD_MCP_TOKEN/,
    );
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd D:/Projects/collapsedstargames-mcp && npx vitest run tests/config.test.ts`
Expected: FAIL — cannot resolve `../src/config.js` (module does not exist yet).

- [ ] **Step 5: Write the minimal implementation**

Create `src/config.ts`:
```ts
export interface Config {
  token: string;
  guildId: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = env.DISCORD_MCP_TOKEN?.trim();
  const guildId = env.DISCORD_GUILD_ID?.trim();

  const missing: string[] = [];
  if (!token) missing.push('DISCORD_MCP_TOKEN');
  if (!guildId) missing.push('DISCORD_GUILD_ID');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }

  return { token: token as string, guildId: guildId as string };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd D:/Projects/collapsedstargames-mcp && npx vitest run tests/config.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 7: Commit**

```bash
cd D:/Projects/collapsedstargames-mcp
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .env.example src/config.ts tests/config.test.ts
git commit -m "chore: scaffold MCP project + config module"
```

---

### Task 2: Shared Discord module (REST, context, guild guard, error mapping)

**Files:**
- Create: `D:/Projects/collapsedstargames-mcp/src/discord.ts`
- Test: `D:/Projects/collapsedstargames-mcp/tests/discord.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces:
  - `interface ToolResult { content: { type: 'text'; text: string }[]; isError?: boolean }`
  - `interface ToolContext { rest: REST; guildId: string; resolveGuild(channelId: string): Promise<string> }`
  - `class GuildScopeError extends Error` (constructed with the offending `channelId`)
  - `function createRest(token: string): REST`
  - `function createContext(rest: REST, guildId: string): ToolContext` — `resolveGuild` GETs `Routes.channel(id)`, reads `guild_id`, and caches per channel id for the process lifetime.
  - `function ensureInGuild(ctx: ToolContext, channelId: string): Promise<void>` — throws `GuildScopeError` if the channel's guild ≠ `ctx.guildId`.
  - `function ok(text: string): ToolResult` — success result.
  - `function toToolError(err: unknown): ToolResult` — maps errors to `{ isError: true }` results (guild-scope, Discord-REST duck-typed `{ status, code, message }`, generic `Error`, unknown).
  - `function toolTry(fn: () => Promise<ToolResult>): Promise<ToolResult>` — runs `fn`, returning `toToolError(err)` on throw.

- [ ] **Step 1: Write the failing test**

Create `tests/discord.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import {
  createContext,
  ensureInGuild,
  GuildScopeError,
  ok,
  toToolError,
  toolTry,
  type ToolContext,
} from '../src/discord.js';

function ctxWith(resolveGuild: (id: string) => Promise<string>): ToolContext {
  return { rest: {} as never, guildId: 'G', resolveGuild };
}

describe('ensureInGuild', () => {
  it('passes when the channel is in the configured guild', async () => {
    await expect(ensureInGuild(ctxWith(async () => 'G'), 'c1')).resolves.toBeUndefined();
  });

  it('throws GuildScopeError when the channel is in another guild', async () => {
    await expect(ensureInGuild(ctxWith(async () => 'OTHER'), 'c1')).rejects.toBeInstanceOf(
      GuildScopeError,
    );
  });
});

describe('createContext.resolveGuild', () => {
  it('caches the channel->guild lookup (only one REST call per id)', async () => {
    const get = vi.fn(async () => ({ guild_id: 'G' }));
    const ctx = createContext({ get } as never, 'G');
    expect(await ctx.resolveGuild('c1')).toBe('G');
    expect(await ctx.resolveGuild('c1')).toBe('G');
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('ok', () => {
  it('builds a non-error text result', () => {
    expect(ok('hi')).toEqual({ content: [{ type: 'text', text: 'hi' }] });
  });
});

describe('toToolError', () => {
  it('maps a GuildScopeError to a clear isError result', () => {
    const r = toToolError(new GuildScopeError('c9'));
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/c9/);
    expect(r.content[0].text).toMatch(/not in the configured guild/i);
  });

  it('maps a Discord REST error with a hint for the code', () => {
    const r = toToolError({ status: 403, code: 50013, message: 'Missing Permissions' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/403/);
    expect(r.content[0].text).toMatch(/50013/);
    expect(r.content[0].text).toMatch(/Missing Permissions/i);
  });

  it('maps a generic Error to its message', () => {
    const r = toToolError(new Error('boom'));
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe('boom');
  });
});

describe('toolTry', () => {
  it('returns the result of a successful fn', async () => {
    expect(await toolTry(async () => ok('done'))).toEqual(ok('done'));
  });

  it('catches a throw and returns an isError result', async () => {
    const r = await toolTry(async () => {
      throw new Error('nope');
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe('nope');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:/Projects/collapsedstargames-mcp && npx vitest run tests/discord.test.ts`
Expected: FAIL — cannot resolve `../src/discord.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/discord.ts`:
```ts
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export interface ToolContext {
  rest: REST;
  guildId: string;
  resolveGuild(channelId: string): Promise<string>;
}

export class GuildScopeError extends Error {
  constructor(public readonly channelId: string) {
    super(`Channel ${channelId} is not in the configured guild; refusing to act on it.`);
    this.name = 'GuildScopeError';
  }
}

export function createRest(token: string): REST {
  return new REST({ version: '10' }).setToken(token);
}

export function createContext(rest: REST, guildId: string): ToolContext {
  const cache = new Map<string, string>();
  return {
    rest,
    guildId,
    async resolveGuild(channelId: string): Promise<string> {
      const cached = cache.get(channelId);
      if (cached !== undefined) return cached;
      const channel = (await rest.get(Routes.channel(channelId))) as { guild_id?: string };
      const gid = channel.guild_id ?? '';
      cache.set(channelId, gid);
      return gid;
    },
  };
}

export async function ensureInGuild(ctx: ToolContext, channelId: string): Promise<void> {
  const gid = await ctx.resolveGuild(channelId);
  if (gid !== ctx.guildId) throw new GuildScopeError(channelId);
}

export function ok(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

interface DiscordErrorLike {
  status: number;
  code: number | string;
  message: string;
}

function isDiscordError(e: unknown): e is DiscordErrorLike {
  return (
    typeof e === 'object' &&
    e !== null &&
    'status' in e &&
    typeof (e as { status: unknown }).status === 'number' &&
    'code' in e
  );
}

function hintFor(code: number | string): string {
  const hints: Record<string, string> = {
    '50001': ' (Missing Access — the bot cannot see this channel; check category/channel view perms)',
    '50013': ' (Missing Permissions — the bot lacks a required permission here)',
    '10003': ' (Unknown Channel — the id is wrong or the bot cannot see it)',
    '10008': ' (Unknown Message — the id is wrong or the message was already deleted)',
  };
  return hints[String(code)] ?? '';
}

export function toToolError(err: unknown): ToolResult {
  let text: string;
  if (err instanceof GuildScopeError) {
    text = err.message;
  } else if (isDiscordError(err)) {
    text = `Discord API error ${err.status}/${err.code}: ${err.message}${hintFor(err.code)}`;
  } else if (err instanceof Error) {
    text = err.message;
  } else {
    text = String(err);
  }
  return { content: [{ type: 'text', text }], isError: true };
}

export async function toolTry(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    return toToolError(err);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:/Projects/collapsedstargames-mcp && npx vitest run tests/discord.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/collapsedstargames-mcp
git add src/discord.ts tests/discord.test.ts
git commit -m "feat: shared Discord REST context, guild guard, error mapping"
```

---

### Task 3: Channel tools

**Files:**
- Create: `D:/Projects/collapsedstargames-mcp/src/tools/channels.ts`
- Test: `D:/Projects/collapsedstargames-mcp/tests/channels.test.ts`

**Interfaces:**
- Consumes: `ToolContext`, `ToolResult`, `ensureInGuild`, `ok`, `toolTry` from `../discord.js`.
- Produces:
  - `listChannels(ctx: ToolContext): Promise<ToolResult>`
  - `getChannel(ctx: ToolContext, args: { channelId: string }): Promise<ToolResult>`
  - `editChannel(ctx: ToolContext, args: { channelId: string; name?: string; topic?: string }): Promise<ToolResult>`
  - `registerChannelTools(server: McpServer, ctx: ToolContext): void` — registers `list_channels`, `get_channel`, `edit_channel`.

- [ ] **Step 1: Write the failing test**

Create `tests/channels.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { listChannels, getChannel, editChannel } from '../src/tools/channels.js';
import type { ToolContext } from '../src/discord.js';

function fakeCtx(rest: Partial<Record<'get' | 'patch', ReturnType<typeof vi.fn>>>, guild = 'G'): ToolContext {
  return {
    rest: rest as never,
    guildId: 'G',
    resolveGuild: vi.fn(async () => guild),
  };
}

describe('listChannels', () => {
  it('lists guild channels by name and id', async () => {
    const get = vi.fn(async () => [
      { id: '1', name: 'welcome', type: 0, parent_id: null },
      { id: '2', name: 'general', type: 0, parent_id: null },
    ]);
    const r = await listChannels(fakeCtx({ get }));
    expect(get).toHaveBeenCalledWith('/guilds/G/channels');
    expect(r.content[0].text).toContain('welcome');
    expect(r.content[0].text).toContain('general');
  });
});

describe('getChannel', () => {
  it('returns the channel object as JSON when in guild', async () => {
    const get = vi.fn(async () => ({ id: '5', name: 'bugs', available_tags: [] }));
    const r = await getChannel(fakeCtx({ get }), { channelId: '5' });
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toContain('"name": "bugs"');
  });

  it('refuses a channel outside the configured guild', async () => {
    const get = vi.fn(async () => ({ id: '5' }));
    const r = await getChannel(fakeCtx({ get }, 'OTHER'), { channelId: '5' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/not in the configured guild/i);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('editChannel', () => {
  it('patches name and topic', async () => {
    const patch = vi.fn(async () => ({ id: '5', name: 'new', topic: 't' }));
    const r = await editChannel(fakeCtx({ patch }), { channelId: '5', name: 'new', topic: 't' });
    expect(patch).toHaveBeenCalledWith('/channels/5', { body: { name: 'new', topic: 't' } });
    expect(r.isError).toBeUndefined();
  });

  it('errors when neither name nor topic is provided', async () => {
    const patch = vi.fn();
    const r = await editChannel(fakeCtx({ patch }), { channelId: '5' });
    expect(r.isError).toBe(true);
    expect(patch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:/Projects/collapsedstargames-mcp && npx vitest run tests/channels.test.ts`
Expected: FAIL — cannot resolve `../src/tools/channels.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/tools/channels.ts`:
```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Routes } from 'discord-api-types/v10';
import { ensureInGuild, ok, toolTry, type ToolContext, type ToolResult } from '../discord.js';

export async function listChannels(ctx: ToolContext): Promise<ToolResult> {
  return toolTry(async () => {
    const channels = (await ctx.rest.get(Routes.guildChannels(ctx.guildId))) as Array<{
      id: string;
      name: string;
      type: number;
      parent_id: string | null;
    }>;
    const lines = channels.map((c) => `#${c.name} (id: ${c.id}, type: ${c.type})`);
    return ok(lines.join('\n') || 'No channels found.');
  });
}

export async function getChannel(
  ctx: ToolContext,
  args: { channelId: string },
): Promise<ToolResult> {
  return toolTry(async () => {
    await ensureInGuild(ctx, args.channelId);
    const channel = await ctx.rest.get(Routes.channel(args.channelId));
    return ok(JSON.stringify(channel, null, 2));
  });
}

export async function editChannel(
  ctx: ToolContext,
  args: { channelId: string; name?: string; topic?: string },
): Promise<ToolResult> {
  return toolTry(async () => {
    await ensureInGuild(ctx, args.channelId);
    const body: Record<string, string> = {};
    if (args.name !== undefined) body.name = args.name;
    if (args.topic !== undefined) body.topic = args.topic;
    if (Object.keys(body).length === 0) {
      return {
        content: [{ type: 'text', text: 'Nothing to edit: provide name and/or topic.' }],
        isError: true,
      };
    }
    const updated = await ctx.rest.patch(Routes.channel(args.channelId), { body });
    return ok(`Channel updated:\n${JSON.stringify(updated, null, 2)}`);
  });
}

export function registerChannelTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_channels',
    { description: 'List all channels in the NOPAS guild.', inputSchema: {} },
    () => listChannels(ctx),
  );
  server.registerTool(
    'get_channel',
    {
      description:
        'Get a channel or thread object by id (a forum channel includes its available_tags).',
      inputSchema: { channelId: z.string().describe('Channel or thread id') },
    },
    (args) => getChannel(ctx, args),
  );
  server.registerTool(
    'edit_channel',
    {
      description: 'Edit a channel name and/or topic. Only name and topic are changeable.',
      inputSchema: {
        channelId: z.string(),
        name: z.string().optional().describe('New channel name'),
        topic: z.string().optional().describe('New channel topic/description'),
      },
    },
    (args) => editChannel(ctx, args),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:/Projects/collapsedstargames-mcp && npx vitest run tests/channels.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/collapsedstargames-mcp
git add src/tools/channels.ts tests/channels.test.ts
git commit -m "feat: channel tools (list, get, edit)"
```

---

### Task 4: Message tools

**Files:**
- Create: `D:/Projects/collapsedstargames-mcp/src/tools/messages.ts`
- Test: `D:/Projects/collapsedstargames-mcp/tests/messages.test.ts`

**Interfaces:**
- Consumes: `ToolContext`, `ToolResult`, `ensureInGuild`, `ok`, `toolTry` from `../discord.js`.
- Produces:
  - `readMessages(ctx, args: { channelId: string; limit?: number }): Promise<ToolResult>` — default limit 20.
  - `sendMessage(ctx, args: { channelId: string; content?: string; embeds?: unknown[] }): Promise<ToolResult>` — requires content or ≥1 embed.
  - `editMessage(ctx, args: { channelId: string; messageId: string; content: string }): Promise<ToolResult>`
  - `deleteMessage(ctx, args: { channelId: string; messageId: string }): Promise<ToolResult>`
  - `pinMessage(ctx, args: { channelId: string; messageId: string }): Promise<ToolResult>`
  - `unpinMessage(ctx, args: { channelId: string; messageId: string }): Promise<ToolResult>`
  - `registerMessageTools(server: McpServer, ctx: ToolContext): void` — registers `read_messages`, `send_message`, `edit_message`, `delete_message`, `pin_message`, `unpin_message`.

- [ ] **Step 1: Write the failing test**

Create `tests/messages.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import {
  readMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  pinMessage,
  unpinMessage,
} from '../src/tools/messages.js';
import type { ToolContext } from '../src/discord.js';

function fakeCtx(
  rest: Partial<Record<'get' | 'post' | 'patch' | 'delete' | 'put', ReturnType<typeof vi.fn>>>,
  guild = 'G',
): ToolContext {
  return { rest: rest as never, guildId: 'G', resolveGuild: vi.fn(async () => guild) };
}

describe('readMessages', () => {
  it('reads the last N messages with a limit query (default 20)', async () => {
    const get = vi.fn(async () => [
      { id: 'm1', content: 'hi', author: { username: 'ann' } },
    ]);
    const r = await readMessages(fakeCtx({ get }), { channelId: 'c1' });
    expect(get).toHaveBeenCalledWith('/channels/c1/messages', {
      query: new URLSearchParams({ limit: '20' }),
    });
    expect(r.content[0].text).toContain('ann: hi');
  });

  it('refuses an out-of-guild channel', async () => {
    const get = vi.fn();
    const r = await readMessages(fakeCtx({ get }, 'OTHER'), { channelId: 'c1' });
    expect(r.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('sendMessage', () => {
  it('posts content', async () => {
    const post = vi.fn(async () => ({ id: 'm9' }));
    const r = await sendMessage(fakeCtx({ post }), { channelId: 'c1', content: 'hello' });
    expect(post).toHaveBeenCalledWith('/channels/c1/messages', { body: { content: 'hello' } });
    expect(r.content[0].text).toContain('m9');
  });

  it('errors when neither content nor an embed is given', async () => {
    const post = vi.fn();
    const r = await sendMessage(fakeCtx({ post }), { channelId: 'c1' });
    expect(r.isError).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('editMessage', () => {
  it('patches the message content', async () => {
    const patch = vi.fn(async () => ({ id: 'm1' }));
    await editMessage(fakeCtx({ patch }), { channelId: 'c1', messageId: 'm1', content: 'new' });
    expect(patch).toHaveBeenCalledWith('/channels/c1/messages/m1', { body: { content: 'new' } });
  });
});

describe('deleteMessage', () => {
  it('deletes the message', async () => {
    const del = vi.fn(async () => undefined);
    const r = await deleteMessage(fakeCtx({ delete: del }), { channelId: 'c1', messageId: 'm1' });
    expect(del).toHaveBeenCalledWith('/channels/c1/messages/m1');
    expect(r.content[0].text).toMatch(/deleted/i);
  });
});

describe('pin/unpin', () => {
  it('pins via PUT on the pin route', async () => {
    const put = vi.fn(async () => undefined);
    await pinMessage(fakeCtx({ put }), { channelId: 'c1', messageId: 'm1' });
    expect(put).toHaveBeenCalledWith('/channels/c1/pins/m1');
  });

  it('unpins via DELETE on the pin route', async () => {
    const del = vi.fn(async () => undefined);
    await unpinMessage(fakeCtx({ delete: del }), { channelId: 'c1', messageId: 'm1' });
    expect(del).toHaveBeenCalledWith('/channels/c1/pins/m1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:/Projects/collapsedstargames-mcp && npx vitest run tests/messages.test.ts`
Expected: FAIL — cannot resolve `../src/tools/messages.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/tools/messages.ts`:
```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Routes } from 'discord-api-types/v10';
import { ensureInGuild, ok, toolTry, type ToolContext, type ToolResult } from '../discord.js';

export async function readMessages(
  ctx: ToolContext,
  args: { channelId: string; limit?: number },
): Promise<ToolResult> {
  return toolTry(async () => {
    await ensureInGuild(ctx, args.channelId);
    const limit = args.limit ?? 20;
    const messages = (await ctx.rest.get(Routes.channelMessages(args.channelId), {
      query: new URLSearchParams({ limit: String(limit) }),
    })) as Array<{ id: string; content: string; author: { username: string } }>;
    const lines = messages.map((m) => `[${m.id}] ${m.author.username}: ${m.content}`);
    return ok(lines.join('\n') || 'No messages.');
  });
}

export async function sendMessage(
  ctx: ToolContext,
  args: { channelId: string; content?: string; embeds?: unknown[] },
): Promise<ToolResult> {
  return toolTry(async () => {
    await ensureInGuild(ctx, args.channelId);
    if (!args.content && (!args.embeds || args.embeds.length === 0)) {
      return {
        content: [{ type: 'text', text: 'Provide content and/or at least one embed.' }],
        isError: true,
      };
    }
    const body: Record<string, unknown> = {};
    if (args.content) body.content = args.content;
    if (args.embeds && args.embeds.length > 0) body.embeds = args.embeds;
    const msg = (await ctx.rest.post(Routes.channelMessages(args.channelId), { body })) as {
      id: string;
    };
    return ok(`Message sent (id: ${msg.id}).`);
  });
}

export async function editMessage(
  ctx: ToolContext,
  args: { channelId: string; messageId: string; content: string },
): Promise<ToolResult> {
  return toolTry(async () => {
    await ensureInGuild(ctx, args.channelId);
    const msg = (await ctx.rest.patch(Routes.channelMessage(args.channelId, args.messageId), {
      body: { content: args.content },
    })) as { id: string };
    return ok(`Message edited (id: ${msg.id}).`);
  });
}

export async function deleteMessage(
  ctx: ToolContext,
  args: { channelId: string; messageId: string },
): Promise<ToolResult> {
  return toolTry(async () => {
    await ensureInGuild(ctx, args.channelId);
    await ctx.rest.delete(Routes.channelMessage(args.channelId, args.messageId));
    return ok('Message deleted.');
  });
}

export async function pinMessage(
  ctx: ToolContext,
  args: { channelId: string; messageId: string },
): Promise<ToolResult> {
  return toolTry(async () => {
    await ensureInGuild(ctx, args.channelId);
    await ctx.rest.put(Routes.channelPin(args.channelId, args.messageId));
    return ok('Message pinned.');
  });
}

export async function unpinMessage(
  ctx: ToolContext,
  args: { channelId: string; messageId: string },
): Promise<ToolResult> {
  return toolTry(async () => {
    await ensureInGuild(ctx, args.channelId);
    await ctx.rest.delete(Routes.channelPin(args.channelId, args.messageId));
    return ok('Message unpinned.');
  });
}

export function registerMessageTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'read_messages',
    {
      description: 'Read the most recent messages in a channel or thread.',
      inputSchema: {
        channelId: z.string(),
        limit: z.number().int().min(1).max(100).optional().describe('How many (default 20, max 100)'),
      },
    },
    (args) => readMessages(ctx, args),
  );
  server.registerTool(
    'send_message',
    {
      description: 'Post a new message to a channel or thread. Provide content and/or embeds.',
      inputSchema: {
        channelId: z.string(),
        content: z.string().optional(),
        embeds: z.array(z.unknown()).optional().describe('Raw Discord embed objects'),
      },
    },
    (args) => sendMessage(ctx, args),
  );
  server.registerTool(
    'edit_message',
    {
      description: "Edit an existing message's content (must be a message the bot authored).",
      inputSchema: { channelId: z.string(), messageId: z.string(), content: z.string() },
    },
    (args) => editMessage(ctx, args),
  );
  server.registerTool(
    'delete_message',
    {
      description: 'Delete a message by id.',
      inputSchema: { channelId: z.string(), messageId: z.string() },
    },
    (args) => deleteMessage(ctx, args),
  );
  server.registerTool(
    'pin_message',
    {
      description: 'Pin a message in a channel or thread.',
      inputSchema: { channelId: z.string(), messageId: z.string() },
    },
    (args) => pinMessage(ctx, args),
  );
  server.registerTool(
    'unpin_message',
    {
      description: 'Unpin a message in a channel or thread.',
      inputSchema: { channelId: z.string(), messageId: z.string() },
    },
    (args) => unpinMessage(ctx, args),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:/Projects/collapsedstargames-mcp && npx vitest run tests/messages.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/collapsedstargames-mcp
git add src/tools/messages.ts tests/messages.test.ts
git commit -m "feat: message tools (read, send, edit, delete, pin, unpin)"
```

---

### Task 5: Forum triage tools

**Files:**
- Create: `D:/Projects/collapsedstargames-mcp/src/tools/forums.ts`
- Test: `D:/Projects/collapsedstargames-mcp/tests/forums.test.ts`

**Interfaces:**
- Consumes: `ToolContext`, `ToolResult`, `ensureInGuild`, `ok`, `toolTry` from `../discord.js`.
- Produces:
  - `listForumPosts(ctx, args: { forumChannelId: string; includeArchived?: boolean }): Promise<ToolResult>` — merges guild active threads filtered to the forum + (when `includeArchived`, default true) archived public threads.
  - `replyThread(ctx, args: { threadId: string; content: string }): Promise<ToolResult>`
  - `setThreadTags(ctx, args: { threadId: string; tagIds: string[] }): Promise<ToolResult>`
  - `closeThread(ctx, args: { threadId: string; lock?: boolean }): Promise<ToolResult>`
  - `reopenThread(ctx, args: { threadId: string }): Promise<ToolResult>`
  - `registerForumTools(server: McpServer, ctx: ToolContext): void` — registers `list_forum_posts`, `reply_thread`, `set_thread_tags`, `close_thread`, `reopen_thread`.

- [ ] **Step 1: Write the failing test**

Create `tests/forums.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import {
  listForumPosts,
  replyThread,
  setThreadTags,
  closeThread,
  reopenThread,
} from '../src/tools/forums.js';
import type { ToolContext } from '../src/discord.js';

function fakeCtx(
  rest: Partial<Record<'get' | 'post' | 'patch', ReturnType<typeof vi.fn>>>,
  guild = 'G',
): ToolContext {
  return { rest: rest as never, guildId: 'G', resolveGuild: vi.fn(async () => guild) };
}

describe('listForumPosts', () => {
  it('lists active + archived threads under the forum with tags and state', async () => {
    const get = vi.fn(async (route: string) => {
      if (route === '/guilds/G/threads/active') {
        return {
          threads: [
            {
              id: 't1',
              name: 'Crash on join',
              parent_id: 'F',
              applied_tags: ['tagOpen'],
              thread_metadata: { archived: false, locked: false },
              message_count: 3,
            },
            { id: 'tX', name: 'other forum', parent_id: 'OTHERFORUM', message_count: 1 },
          ],
        };
      }
      return {
        threads: [
          {
            id: 't2',
            name: 'Old bug',
            parent_id: 'F',
            applied_tags: ['tagDone'],
            thread_metadata: { archived: true, locked: true },
            message_count: 8,
          },
        ],
      };
    });
    const r = await listForumPosts(fakeCtx({ get }), { forumChannelId: 'F' });
    expect(get).toHaveBeenCalledWith('/guilds/G/threads/active');
    expect(get).toHaveBeenCalledWith('/channels/F/threads/archived/public');
    expect(r.content[0].text).toContain('Crash on join');
    expect(r.content[0].text).toContain('Old bug');
    expect(r.content[0].text).not.toContain('other forum'); // filtered by parent_id
  });

  it('skips archived fetch when includeArchived is false', async () => {
    const get = vi.fn(async () => ({ threads: [] }));
    await listForumPosts(fakeCtx({ get }), { forumChannelId: 'F', includeArchived: false });
    expect(get).toHaveBeenCalledWith('/guilds/G/threads/active');
    expect(get).not.toHaveBeenCalledWith('/channels/F/threads/archived/public');
  });
});

describe('replyThread', () => {
  it('posts a reply message into the thread', async () => {
    const post = vi.fn(async () => ({ id: 'm5' }));
    const r = await replyThread(fakeCtx({ post }), { threadId: 't1', content: 'fixed in build 12' });
    expect(post).toHaveBeenCalledWith('/channels/t1/messages', {
      body: { content: 'fixed in build 12' },
    });
    expect(r.content[0].text).toContain('m5');
  });
});

describe('setThreadTags', () => {
  it('patches applied_tags on the thread', async () => {
    const patch = vi.fn(async () => ({}));
    await setThreadTags(fakeCtx({ patch }), { threadId: 't1', tagIds: ['tagDone'] });
    expect(patch).toHaveBeenCalledWith('/channels/t1', { body: { applied_tags: ['tagDone'] } });
  });
});

describe('closeThread / reopenThread', () => {
  it('archives (and optionally locks) on close', async () => {
    const patch = vi.fn(async () => ({}));
    await closeThread(fakeCtx({ patch }), { threadId: 't1', lock: true });
    expect(patch).toHaveBeenCalledWith('/channels/t1', { body: { archived: true, locked: true } });
  });

  it('un-archives on reopen', async () => {
    const patch = vi.fn(async () => ({}));
    await reopenThread(fakeCtx({ patch }), { threadId: 't1' });
    expect(patch).toHaveBeenCalledWith('/channels/t1', { body: { archived: false } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:/Projects/collapsedstargames-mcp && npx vitest run tests/forums.test.ts`
Expected: FAIL — cannot resolve `../src/tools/forums.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/tools/forums.ts`:
```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Routes } from 'discord-api-types/v10';
import { ensureInGuild, ok, toolTry, type ToolContext, type ToolResult } from '../discord.js';

interface ThreadChannel {
  id: string;
  name: string;
  parent_id: string | null;
  applied_tags?: string[];
  thread_metadata?: { archived: boolean; locked: boolean };
  message_count?: number;
}

function formatThread(t: ThreadChannel): string {
  const tags = (t.applied_tags ?? []).join(', ') || 'none';
  const meta = t.thread_metadata;
  const state = meta?.archived ? (meta.locked ? 'closed+locked' : 'archived') : 'open';
  return `[${t.id}] ${t.name} — tags: [${tags}] — ${state} — ${t.message_count ?? 0} msgs`;
}

export async function listForumPosts(
  ctx: ToolContext,
  args: { forumChannelId: string; includeArchived?: boolean },
): Promise<ToolResult> {
  return toolTry(async () => {
    await ensureInGuild(ctx, args.forumChannelId);
    const includeArchived = args.includeArchived ?? true;

    const active = (await ctx.rest.get(Routes.guildActiveThreads(ctx.guildId))) as {
      threads: ThreadChannel[];
    };
    let threads = active.threads.filter((t) => t.parent_id === args.forumChannelId);

    if (includeArchived) {
      const archived = (await ctx.rest.get(
        `/channels/${args.forumChannelId}/threads/archived/public` as `/${string}`,
      )) as { threads: ThreadChannel[] };
      threads = threads.concat(archived.threads);
    }

    const lines = threads.map(formatThread);
    return ok(lines.join('\n') || 'No forum posts found.');
  });
}

export async function replyThread(
  ctx: ToolContext,
  args: { threadId: string; content: string },
): Promise<ToolResult> {
  return toolTry(async () => {
    await ensureInGuild(ctx, args.threadId);
    const msg = (await ctx.rest.post(Routes.channelMessages(args.threadId), {
      body: { content: args.content },
    })) as { id: string };
    return ok(`Replied to thread (message id: ${msg.id}).`);
  });
}

export async function setThreadTags(
  ctx: ToolContext,
  args: { threadId: string; tagIds: string[] },
): Promise<ToolResult> {
  return toolTry(async () => {
    await ensureInGuild(ctx, args.threadId);
    await ctx.rest.patch(Routes.channel(args.threadId), { body: { applied_tags: args.tagIds } });
    return ok(`Thread tags set to: [${args.tagIds.join(', ') || 'none'}].`);
  });
}

export async function closeThread(
  ctx: ToolContext,
  args: { threadId: string; lock?: boolean },
): Promise<ToolResult> {
  return toolTry(async () => {
    await ensureInGuild(ctx, args.threadId);
    const body: Record<string, boolean> = { archived: true };
    if (args.lock) body.locked = true;
    await ctx.rest.patch(Routes.channel(args.threadId), { body });
    return ok(`Thread closed${args.lock ? ' and locked' : ''}.`);
  });
}

export async function reopenThread(
  ctx: ToolContext,
  args: { threadId: string },
): Promise<ToolResult> {
  return toolTry(async () => {
    await ensureInGuild(ctx, args.threadId);
    await ctx.rest.patch(Routes.channel(args.threadId), { body: { archived: false } });
    return ok('Thread reopened.');
  });
}

export function registerForumTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_forum_posts',
    {
      description:
        'List forum threads (bug/playtest/suggestion posts) under a forum channel, with their status tags and open/archived state.',
      inputSchema: {
        forumChannelId: z.string().describe('The forum channel id'),
        includeArchived: z.boolean().optional().describe('Include archived posts (default true)'),
      },
    },
    (args) => listForumPosts(ctx, args),
  );
  server.registerTool(
    'reply_thread',
    {
      description: 'Reply to a forum thread (e.g. post status/remediation on a bug report).',
      inputSchema: { threadId: z.string(), content: z.string() },
    },
    (args) => replyThread(ctx, args),
  );
  server.registerTool(
    'set_thread_tags',
    {
      description:
        "Set a forum thread's applied status tags (replaces the current set). Get tag ids from get_channel on the forum.",
      inputSchema: {
        threadId: z.string(),
        tagIds: z.array(z.string()).describe('Forum tag ids to apply'),
      },
    },
    (args) => setThreadTags(ctx, args),
  );
  server.registerTool(
    'close_thread',
    {
      description: 'Close (archive) a forum thread, optionally locking it.',
      inputSchema: {
        threadId: z.string(),
        lock: z.boolean().optional().describe('Also lock the thread (default false)'),
      },
    },
    (args) => closeThread(ctx, args),
  );
  server.registerTool(
    'reopen_thread',
    {
      description: 'Reopen (un-archive) a forum thread.',
      inputSchema: { threadId: z.string() },
    },
    (args) => reopenThread(ctx, args),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:/Projects/collapsedstargames-mcp && npx vitest run tests/forums.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/collapsedstargames-mcp
git add src/tools/forums.ts tests/forums.test.ts
git commit -m "feat: forum triage tools (list, reply, tag, close, reopen)"
```

---

### Task 6: Server bootstrap, wiring test, README

**Files:**
- Create: `D:/Projects/collapsedstargames-mcp/src/index.ts`
- Create: `D:/Projects/collapsedstargames-mcp/README.md`
- Test: `D:/Projects/collapsedstargames-mcp/tests/wiring.test.ts`

**Interfaces:**
- Consumes: `loadConfig` (Task 1); `createRest`, `createContext`, `ToolContext` (Task 2); `registerChannelTools` (Task 3); `registerMessageTools` (Task 4); `registerForumTools` (Task 5).
- Produces: `buildServer(ctx: ToolContext): McpServer` — constructs an `McpServer` and registers all 14 tools. `index.ts` also runs `main()` on import (loads env via dotenv, validates config, connects stdio).

- [ ] **Step 1: Write the failing wiring test**

Create `tests/wiring.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { buildServer } from '../src/index.js';
import type { ToolContext } from '../src/discord.js';

describe('buildServer', () => {
  it('registers exactly the 14 expected tools', () => {
    const registered: string[] = [];
    const fakeServer = {
      registerTool: vi.fn((name: string) => {
        registered.push(name);
      }),
    };
    // buildServer accepts an optional server for testing; falls back to a real McpServer.
    const ctx: ToolContext = { rest: {} as never, guildId: 'G', resolveGuild: async () => 'G' };
    buildServer(ctx, fakeServer as never);

    expect(registered.sort()).toEqual(
      [
        'close_thread',
        'delete_message',
        'edit_channel',
        'edit_message',
        'get_channel',
        'list_channels',
        'list_forum_posts',
        'pin_message',
        'read_messages',
        'reopen_thread',
        'reply_thread',
        'send_message',
        'set_thread_tags',
        'unpin_message',
      ].sort(),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:/Projects/collapsedstargames-mcp && npx vitest run tests/wiring.test.ts`
Expected: FAIL — cannot resolve `../src/index.js` / `buildServer` not exported.

- [ ] **Step 3: Write the minimal implementation**

Create `src/index.ts`:
```ts
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createRest, createContext, type ToolContext } from './discord.js';
import { registerChannelTools } from './tools/channels.js';
import { registerMessageTools } from './tools/messages.js';
import { registerForumTools } from './tools/forums.js';

// Load .env from the project root (dist/index.js -> ..), independent of the
// process cwd Claude Code spawns us with.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, '..', '.env') });

export function buildServer(ctx: ToolContext, server?: McpServer): McpServer {
  const s = server ?? new McpServer({ name: 'collapsedstargames-mcp', version: '0.1.0' });
  registerChannelTools(s, ctx);
  registerMessageTools(s, ctx);
  registerForumTools(s, ctx);
  return s;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const rest = createRest(config.token);
  const ctx = createContext(rest, config.guildId);
  const server = buildServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only run the server when executed directly (not when imported by tests).
const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    // stderr only — stdout is the JSON-RPC channel.
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:/Projects/collapsedstargames-mcp && npx vitest run tests/wiring.test.ts`
Expected: PASS — the 14 tool names match.

- [ ] **Step 5: Run the full suite and a type-check build**

Run: `cd D:/Projects/collapsedstargames-mcp && npm test && npm run build`
Expected: all test files pass; `tsc` compiles with no errors and emits `dist/`.

- [ ] **Step 6: Write the README**

Create `README.md`:
````markdown
# collapsedstargames-mcp

A local, least-privilege Discord MCP server for the NOPAS community server. It
gives Claude Code tools to review/edit/post channel content and triage forum
reports (bug/playtest/suggestion posts). REST-only — no gateway, no privileged
intents. Runs only on your machine; never deployed.

Design spec: `collapsedstargames-website/docs/superpowers/specs/2026-07-13-content-triage-mcp-design.md`.

## Setup

1. Install and build:
   ```bash
   npm install
   npm run build
   npm test
   ```
2. Create a **new** Discord application + bot in the Developer Portal (separate
   from the moderation bot). Copy the bot token.
3. Create `.env` from `.env.example` and fill it in:
   ```
   DISCORD_MCP_TOKEN=<the dedicated assistant bot token>
   DISCORD_GUILD_ID=1512237266800742570
   ```
   `.env` is gitignored — the token never leaves your machine.
4. Invite the bot with **only** these permissions (no Administrator):
   View Channels, Send Messages, Send Messages in Threads, Embed Links,
   Read Message History, Manage Messages, Manage Channels, Manage Threads.
5. Make sure the bot's role can view the private categories/channels it needs
   (same category-access step as the moderation bot).

## Register with Claude Code

```bash
claude mcp add collapsedstargames-mcp --scope user -- node D:/Projects/collapsedstargames-mcp/dist/index.js
```

No secrets go on this command line — the server reads them from its own gitignored
`.env`. Restart Claude Code once so it launches the server.

## Tools

Channels: `list_channels`, `get_channel`, `edit_channel`.
Messages: `read_messages`, `send_message`, `edit_message`, `delete_message`, `pin_message`, `unpin_message`.
Forums: `list_forum_posts`, `reply_thread`, `set_thread_tags`, `close_thread`, `reopen_thread`.

Every tool operates only within `DISCORD_GUILD_ID`; targets outside it are refused.
````

- [ ] **Step 7: Commit**

```bash
cd D:/Projects/collapsedstargames-mcp
git add src/index.ts tests/wiring.test.ts README.md
git commit -m "feat: server bootstrap, tool wiring, README runbook"
```

---

## Notes for the implementer

- **`@discordjs/rest` route typing:** `rest.get/post/patch/put/delete` accept route strings typed `` `/${string}` ``. `Routes.*` helpers already produce that type. The one raw path (archived threads in Task 5) is cast `as \`/${string}\`` — keep the cast.
- **429 rate limits:** `@discordjs/rest` handles retry/backoff internally, so tools do not special-case 429. Anything that still surfaces is reported by `toToolError`'s generic branches. This is an intentional simplification, consistent with the spec ("`@discordjs/rest` handles 429 retry/backoff internally; if a rate limit still surfaces to the caller it is reported").
- **stdout discipline:** never `console.log` — it corrupts the JSON-RPC stream. Diagnostics go to `console.error` (stderr).
- **Do not** add tools beyond the 14 listed, add a database, or add scheduling — those are Rounds 2/3.
```
