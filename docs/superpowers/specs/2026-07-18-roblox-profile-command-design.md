# Spec — `/roblox` profile command

Status: designed (brainstormed 2026-07-18), not yet implemented.
Repo: `collapsedstargames-bot` (the mod bot). No website or MCP changes.

## 1. Goal

Give NOPAS community members a one-click path to follow each other on Roblox, initiated from Discord. A `/roblox` slash command surfaces a member's linked Roblox profile with a button that opens it, where the viewer clicks **Follow** on Roblox's own page.

This is the *supported* shape of the "can Discord make Roblox users follow each other?" ask (2026-07-17 investigation): Roblox exposes **no** sanctioned API to create a follow on a user's behalf — the official Open Cloud / OAuth2 surface has no follow/friend write scope, and the legacy `friends.roblox.com` follow endpoint requires the acting user's own session cookie (a ToS violation + full-account credential) and is bot-blocked. So the command makes following **one click away**, never automatic. See the security section (§9).

## 2. Non-goals

- No automated following/friending (impossible safely — see §1/§9).
- No storage of the Discord↔Roblox mapping in our DB (Bloxlink already owns it; we resolve on demand).
- No new DB table or migration.
- No avatar/rich-profile enrichment in v1 (deferred, §10).

## 3. Placement

Lives in the **mod bot** (`collapsedstargames-bot`), which owns the slash-command surface, `guild_config`, and the Bloxlink verification context. The MCP assistant is REST-only and not a command host, so it is not a fit.

The router branch sits in the **pre-mod-gate** section of `interactionCreate` (alongside `/ask`), because `/roblox` is a public member command, not a moderation command.

## 4. Command

One command, one optional option (`src/bot/registerCommands.ts`):

```
/roblox [user?]
  • no `user`  → the invoker's own linked profile, posted PUBLICLY to the channel
  • `user`     → that member's profile, replied EPHEMERALLY (only the invoker sees it)
```

Mode is determined solely by whether the `user` option was supplied (`interaction.options.getUser("user")`).

**Visibility rationale (asymmetric):** self-share is an intentional broadcast ("here's my Roblox, follow me") so it is public; a lookup is a private convenience to grab someone's follow link, so it is ephemeral — this avoids publicly surfacing / ping-spamming another member.

## 5. Resolution (Discord → Roblox)

The bot stores **no** Roblox ID today (confirmed: only `verifiedRoleId` is known, not the underlying account). Resolution uses the **Bloxlink Guild API**, the same source as the server's verification:

- Endpoint: `GET https://api.blox.link/v4/public/guilds/{guildId}/discord-to-roblox/{discordId}`
- Header: `Authorization: <BLOXLINK_API_KEY>`
- Success → `{ robloxID, ... }`; an unlinked member → not-resolved / 404.

Wrapped behind an injectable resolver so the network call is unit-testable (§8), matching the `CreateMessage`/`defaultCreate` seam pattern established for the AI calls.

## 6. Components

Following the repo's `runX(deps, input)` + injectable-seam convention; discord.js objects stay in the router, logic stays in plain functions returning data.

- **`src/roblox/bloxlink.ts`** — `makeBloxlinkResolver(apiKey: string, guildId: string, fetchFn = fetch): (discordId: string) => Promise<{ robloxId: string; username?: string } | null>`. Builds the URL + `Authorization` header, parses `robloxID`. **Two distinct outcomes:** returns `null` for an unlinked/unknown member (404 / not-resolved), and **throws** on transport failure or a 5xx (so the router can tell "not linked" apart from "Bloxlink unreachable" — the former is a normal per-member message, the latter the retry message). `fetchFn` injected for tests. Uses native `fetch` (Node 18+, already the runtime).
- **`src/roblox/profile.ts`** — pure helpers. v1: `robloxProfileUrl(id: string): string` → `https://www.roblox.com/users/${id}/profile`.
- **`src/roblox/robloxCommand.ts`** — `runRoblox(deps, input)` returns **plain data**, not discord.js objects:
  - `deps`: `{ resolve: (discordId) => Promise<{ robloxId: string; username?: string } | null> | null }` (`resolve` is `null` when unconfigured).
  - `input`: `{ invokerId: string; targetId: string | null; targetTag: string | null }` (`targetId` null ⇒ self mode).
  - returns: `{ kind: "self" | "lookup" | "self-unlinked" | "lookup-unlinked" | "unconfigured"; robloxId?: string; url?: string; buttonLabel?: string; ephemeral: boolean }`.
- **Router branch** (`src/bot/router.ts`) — `gi.commandName === "roblox"`: read `getUser("user")`, call `runRoblox`, then translate the result `kind` into either a plain ephemeral text reply (error kinds) or an embed + `ButtonStyle.Link` button (success kinds). Self → public `reply` with `allowedMentions: { parse: [] }`; lookup → `flags: MessageFlags.Ephemeral`.
- **Env/config** — add `BLOXLINK_API_KEY` (optional) to env loading + the `RouterCtx` wiring; construct the resolver once (like `answerer`), passing `null` through when the key is unset.

## 7. Data flow

**Self mode** (`/roblox`, public):
```
resolve(invokerId)
  → null  → kind:"self-unlinked"   → ephemeral "You haven't linked a Roblox account — verify with Bloxlink first."
  → {id}  → kind:"self", url       → PUBLIC embed{ Roblox profile } + [Open Roblox profile ↗] button
```

**Lookup mode** (`/roblox @member`, ephemeral):
```
resolve(targetId)
  → null  → kind:"lookup-unlinked" → ephemeral "That member hasn't linked a Roblox account."
  → {id}  → kind:"lookup", url      → EPHEMERAL embed{ Roblox profile } + [Open Roblox profile ↗] button
```

The button is a **Link** button (`ButtonStyle.Link`) whose `url` is the profile URL. It *opens* the profile; the viewer clicks Follow on Roblox. Label reads "Open Roblox profile," never "Follow," so nothing implies automation.

**Resolver throw path (both modes):** if `resolve(...)` throws (Bloxlink transport error / 5xx, per §6), the router catches it and replies ephemerally "Couldn't reach Bloxlink right now — try again shortly." This is distinct from the `null` (not-linked) path above.

## 8. Testing (TDD)

- **`runRoblox`** with an injected fake resolver — asserts each of the five `kind` branches and the correct `ephemeral` flag per mode (self → public/`ephemeral:false`; lookup → `ephemeral:true`; all error kinds ephemeral). `resolve: null` → `kind:"unconfigured"`.
- **`makeBloxlinkResolver`** with an injected `fetch` fake — asserts the request URL and `Authorization` header are built correctly, parses `robloxId` from a success body, returns `null` on 404 / not-resolved, and surfaces a network/5xx error distinctly (so the router can show the "couldn't reach Bloxlink" message).
- **`robloxProfileUrl`** — pure unit test.

## 9. Security & least-privilege

- **One new secret:** `BLOXLINK_API_KEY` — a **read-only, guild-scoped** key from the Bloxlink dashboard (Guild API). No write capability, no Roblox credentials anywhere.
- **No follow automation, ever.** The only mechanism that could create a follow requires the acting user's `.ROBLOSECURITY` cookie (ToS violation + full-account access) and is bot-blocked by Roblox. This command deliberately does not go near it; following is always a manual click on Roblox's page.
- **No pings:** public self-post uses `allowedMentions: { parse: [] }`.
- **Fails closed:** unset key ⇒ `kind:"unconfigured"` ("not configured"); unlinked members get a clear message, never an error dump.
- Consistent with the project's least-privilege posture (assistant bot / Bloxlink invite are already minimal-scope).

## 10. Out of scope / deferred

- ~~**Profile enrichment**~~ — **PROMOTED to §11 (2026-07-18), being implemented.** (Originally deferred: Roblox display name + headshot avatar via the no-auth `users` + `thumbnails` APIs.)
- **Rate limiting** — Bloxlink's free tier is rate-limited; at current server volume this is a non-issue. Revisit if `/roblox` sees heavy use (bundle with the same launch-volume thinking as the other launch-gated items).
- **`/config` setter for `BLOXLINK_API_KEY`** — set via env var / Railway, not a slash command (a secret, not a per-guild toggle).

## 11. Addendum — profile enrichment (2026-07-18)

**Motivation:** as shipped (v1, live on Railway), the success card shows only a generic "Roblox profile" title + link — it doesn't say *whose* profile the button opens. This addendum adds identifying detail so a viewer knows the account before clicking. Promotes the §10 deferred item; implemented via direct TDD (not the full SDD cycle), on top of the merged v1.

**Data source — Roblox public, no-auth APIs (no new secret):**
- `GET https://users.roblox.com/v1/users/{id}` → `name` (the unique `@username`) + `displayName` (shown name).
- `GET https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds={id}&size=150x150&format=Png&isCircular=false` → `data[0].imageUrl` (headshot CDN URL).

**New unit — `src/roblox/robloxProfile.ts`:** `makeRobloxProfileFetcher(fetchFn = fetch): (robloxId: string) => Promise<{ displayName: string; username: string; avatarUrl: string | null } | null>`. **Best-effort, NEVER throws** (catches internally): users call fails/errors → returns `null` (card falls back to generic); only the avatar call fails → returns name with `avatarUrl: null` (name shown, no thumbnail). Injectable `fetchFn` for tests, mirroring the `bloxlink.ts` seam.

**`runRoblox` gains an optional injected dep** `enrich?: (robloxId) => Promise<{ displayName; username; avatarUrl } | null>`. On a `self`/`lookup` success it calls `enrich(robloxId)` (wrapped so any failure just omits the fields) and attaches optional `displayName`, `username`, `avatarUrl` to the result. Logic stays discord.js-free and unit-tested with a fake `enrich`. `robloxId` is already on the result (the v1 hook), so no input change.

**Router render:** for success kinds, embed title becomes `` `${displayName} (@${username})` `` when enriched, else the current "Roblox profile"; `embed.setThumbnail(avatarUrl)` when present; description + Link button unchanged. Applies to both self and lookup.

**Wiring:** `index.ts` constructs `makeRobloxProfileFetcher()` and passes it into `RouterCtx` (new `robloxEnrich` field). Enrichment is independent of `BLOXLINK_API_KEY` — it needs no key — so it works whenever a profile resolves.

**Failure/degradation:** enrichment can never block or break `/roblox`; worst case is the v1 generic card. No new secrets; Roblox public endpoints, non-issue at current volume.

**Tests (TDD):** `makeRobloxProfileFetcher` (name+avatar success; avatar-fails → name-only, `avatarUrl:null`; users-fails → `null`); `runRoblox` (enrich attaches fields on success; enrich returns `null` → generic, no fields; enrich throws → caught, generic).
