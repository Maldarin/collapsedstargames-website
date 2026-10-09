# Patch notes: design

**Date:** 2026-10-09 · **Status:** approved in conversation; awaiting spec review
**Repos touched:** `collapsedstargames-website` (source of truth, pages, feed, drafting tooling),
`collapsedstargames-bot` (Discord posting). The game repo `not-my-pants-alien-scum` is read-only input.

## Goal

After each Studio publish of NOPAS, turn the game PRs merged since the last patch into
player-facing patch notes, written in the site's comic voice. The owner approves them; they
then appear on a website page and are posted to Discord automatically.

**Success looks like:** one owner action ("publish") puts an approved patch on
`collapsedstargames.com/nopas/patch-notes/` and, within minutes, in Discord `#patch-notes`.
No patch is posted twice, and nothing goes public without the owner's yes.

## Decisions (owner, 2026-10-09)

| Question | Decision |
|---|---|
| What is "a patch"? | One Studio publish. Drafting is triggered by the owner, not a schedule. |
| Starting point | PRs merged after **2026-10-10T01:00:00Z** (8:00 PM CDT, 2026-10-09: "post-beta launch"). |
| Discord channel | New `#patch-notes`, id `1558224477131907165`. @everyone denied view; Verified can view; only bots post. |
| Review | Draft → owner edits/approves → publish. Never fully automatic. |
| Architecture | **The website is the source of truth.** The bot follows a JSON feed. (Rejected: bot-held notes with a write endpoint; a script that pushes to both places independently.) |

## 1. The patch file (the contract)

One markdown file per patch: `src/content/patch-notes/<YYYY-MM-DD>-<slug>.md` in the website repo.
The file name (without `.md`) is the patch **id**. It must never change once published, because
the bot uses it to tell posted patches apart.

```markdown
---
version: "Beta 1.1"                       # what players call it; owner confirms
title: "The Pants Strike Back"            # punny headline
date: 2026-10-10                          # the day it went live
summary: "One sentence a player would read."
prs: [315, 316, 318]                      # game PRs covered; traceability only, never rendered
coveredThrough: "2026-10-10T18:42:00Z"    # newest mergedAt included; the next draft starts after it
draft: true                               # optional; true = excluded from the build and the feed
---

## 🆕 New
- **Plain statement of the change.** Optional short joke.

## 🔧 Changes
- ...

## 🐛 Fixes
- ...
```

- Sections appear in that order, and empty sections are omitted. The body is ordinary markdown.
- **Schema (enforced at build):**
  - `version`, `title`, `summary`: non-empty strings.
  - `date`: a date.
  - `prs`: an array of positive integers.
  - `coveredThrough`: an ISO-8601 UTC timestamp.
  - `draft`: an optional boolean.
  - A file that fails the schema fails the build, so a malformed patch never deploys.

## 2. Drafting (website repo)

### `scripts/patch-notes/gather.mjs` (read-only; never writes a patch file)

1. **Find the start time.** Take the max `coveredThrough` across all patch files, drafts included, so a pending draft isn't re-gathered. If there are no files, use the constant `2026-10-10T01:00:00Z`.
2. **List the merged PRs:** `gh pr list -R Maldarin/not-my-pants-alien-scum --base main --state merged --search "merged:>=<start>" --json number,title,body,mergedAt,files --limit 200`.
   - Keep only PRs with `mergedAt > start` and `mergedAt <= now`, sorted oldest first.
3. **Classify each PR:**
   - **Player-facing:** any changed path under `src/`.
   - **Internal (skipped):** every path is under `tests/`, `docs/`, `design docs/`, `.claude/`, `.agents/`, `tools/`, `.github/`, or is a root-level dotfile or markdown file.
4. **Print a digest:**
   - The start and end times.
   - The player-facing PRs: number, title, merged time, description (truncated), and changed paths grouped by top-level folder.
   - The skipped PRs, each with the reason.
   - A suggested `coveredThrough`: the newest `mergedAt` among all listed PRs, skipped ones included.
5. **Exit codes:**
   - Nonzero, with a clear message, if `gh` is missing or unauthenticated.
   - Zero, with "nothing to draft", if no PRs are found.

### `docs/patch-notes-style.md`, the voice and rules the drafter follows

- **Audience:** players, many of them kids. Describe what they will notice: new things to do, things that feel different, and bugs that stopped.
- **Format:**
  - Each item is a bold, plain statement of the change, plus at most one short joke. Plain items are fine.
  - One PR can become several items, and several PRs can merge into one item.
  - Every patch gets a punny `title` and a one-sentence `summary`.
- **Public-safe:**
  - Balance changes give the direction, never the number.
  - No anti-cheat, earn-cap or server-protection changes.
  - No internal or system names.
  - No features that are built but switched off.
  - Exploit fixes appear at most as a generic "Fixed an exploit".
  - Never promise future work.
- **Humor:** the website's dry, pants-obsessed voice, self-deprecating about the dev team, never at players' expense, family-friendly.
- **Version:** the drafter suggests one (the first is "Beta 1.1"); the owner confirms it.

### Workflow

1. The owner publishes from Studio and asks for patch notes.
2. Run `gather.mjs`.
3. The drafter writes `src/content/patch-notes/<id>.md` with `draft: true`, then hands the owner three things:
   - the draft;
   - the skipped list;
   - the PRs behind each item.
4. The owner edits and approves the draft, and confirms the version.
5. **Publish:** set `draft: false` (or delete the line), commit with message `patch-notes: <version> — <title>`, and push `main`.
6. Cloudflare Pages builds the site, typically in about 90 seconds.

## 3. Website

- **Collection:** `src/content.config.ts` defines a `patchNotes` collection.
  - It uses `glob({ pattern: "*.md", base: "./src/content/patch-notes" })` with the Section 1 schema.
  - A helper `getPublishedPatches()` returns the non-draft entries, newest `date` first, ties broken by id descending.
  - Pages and the feed use only this helper.
- **`/nopas/patch-notes/`** (list), using `BaseLayout`, the `nopas-overview` styles and a new `src/styles/nopas-patch-notes.css`:
  - A hero with the eyebrow line "FRESHLY LAUNDERED CHANGES" and the title "PATCH NOTES".
  - The newest patch featured: version eyebrow, title, date, summary, and a link.
  - Older patches as cards.
  - Empty state: "No patches yet. The pants are still in the wash."
- **`/nopas/patch-notes/[id]/`** (detail), generated statically for each published patch:
  - Version eyebrow, title, date and summary.
  - The body rendered, with the three sections styled as colored laundry tags (New, Changes, Fixes).
  - Previous and next links, and a back link to the list.
- **Navigation:** add a "Patch Notes" link wherever the NOPAS section links (`BaseLayout` nav and mobile menu), and a "Latest patch" teaser on `/nopas/`. The teaser is hidden when there are no patches.
- **Feed:** `src/pages/nopas/patch-notes/feed.json.ts`, prerendered at build time.

  ```json
  { "patches": [ { "id": "...", "version": "...", "title": "...", "date": "YYYY-MM-DD",
    "summary": "...", "url": "https://collapsedstargames.com/nopas/patch-notes/<id>/",
    "markdown": "<raw body>" } ] }
  ```

  It contains published patches only, newest first. With none it is `{"patches": []}`.
- **Test:** `scripts/e2e-patch-notes.mjs` (Playwright, same style as `scripts/e2e-stats.mjs`), run against a built preview. It checks:
  - The list and a detail page render.
  - Draft fixtures are absent from the pages and the feed.
  - Every feed entry's `url` resolves to a page whose title matches.
  - The empty state renders when there are no published patches.

## 4. Bot (`collapsedstargames-bot`)

- **Config** (in `guild_config` JSON, merged with defaults):
  - `patchNotesChannelId: string | null` (default `null`; set to `1558224477131907165` at rollout).
  - `patchNotesRoleId: string | null` (default `null`; opt-in ping).
- **Env:** optional `PATCH_NOTES_FEED_URL`, default `https://collapsedstargames.com/nopas/patch-notes/feed.json`.
- **Migration `010_patch_notes_posted.sql`:** a table `patch_notes_posted` with these columns:
  - `patch_id TEXT PRIMARY KEY`
  - `guild_id TEXT NOT NULL`
  - `message_id TEXT`
  - `posted_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- **Pure modules** (unit-tested):
  - `parseFeed(json)`: validates the shape and throws `FeedError` with a reason.
  - `buildPatchEmbed(patch)`:
    - **Title:** `🩳 <version> — <title>`, linking to `url`.
    - **Description:** `*<summary>*`, then the body with `##`/`###` heading lines converted to bold lines.
    - **Length:** capped at the embed limit by cutting at a whole bullet boundary and appending `…plus more — read the full patch notes →`.
    - **Footer:** `<date> · collapsedstargames.com`.
- **Job:** `runPatchNotesTick`, scheduled with the existing `startDigestJob` wrapper every 5 minutes.
  1. If `patchNotesChannelId` is unset, do nothing.
  2. Fetch the feed with a timeout.
  3. Select patches with no row in `patch_notes_posted`, take the 3 oldest by `date` then id, and handle each in turn:
     1. Claim it: insert the row with `message_id NULL`; if the insert conflicts, skip the patch.
     2. Send the embed. Include role-ping content only if `patchNotesRoleId` is set, and set `allowedMentions` to that role only (never `@everyone`).
     3. Update the row's `message_id`.
     4. If the send fails, delete the claim row so the next tick retries.
- **Delivery is at most once,** chosen on purpose. A crash between claim and send skips the patch rather than posting it twice: a missing post surfaces through alerts, while a duplicate is public.
- **Errors:**
  - A network failure or non-2xx response from the feed is `log.warn` and is retried next tick.
  - An invalid feed (`FeedError`) is `log.error`, which reaches #admin through the existing ops alerter.
  - A missing or unsendable channel is `log.error`; the patch is not claimed.
- **Tests** (Vitest + pg-mem):
  - `parseFeed` accepts valid feeds and rejects malformed ones.
  - Embed conversion and truncation at a bullet.
  - The tick:
    - posts only unposted patches, oldest first;
    - is capped at 3 per tick;
    - rolls back the claim after a failed send;
    - is a no-op without a channel;
    - skips an already-claimed patch.

## 5. Rollout

1. **Website.**
   - Ship everything in Sections 2–3 with zero patches.
   - Verify the empty page and that the feed is `{"patches": []}` in production.
2. **Bot.**
   - Ship Section 4.
   - Set `patchNotesChannelId = 1558224477131907165`.
   - Verify the deployed bot reads the empty feed and posts nothing.
3. **Smoke test.**
   - Run the bot's real `buildPatchEmbed` and send code locally, with the bot token and a sample patch, to **#admin** (`1528829084552134848`).
   - Nothing is inserted into `patch_notes_posted`.
   - The owner checks the look.
4. **First real patch:** the first owner publish after 2026-10-10T01:00:00Z.

## Out of scope

- Patch notes for the bot or the website.
- RSS.
- A `/patchnotes` Discord command.
- Auto-triggering from Studio publishes (Roblox gives us no signal).
- Editing a Discord post after a website correction (website edits are website-only).
- Any of these can be added later without changing the patch file format.
