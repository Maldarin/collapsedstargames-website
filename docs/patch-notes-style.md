# NOPAS patch notes: style and workflow

The spec is `docs/superpowers/specs/2026-10-09-patch-notes-design.md`.

## Workflow
1. Publish the game from Studio.
2. Run `npm run patch-notes:gather`.
   - Add `-- --since <ISO time>` to override the start time, for a preview or a re-draft.
3. Write `src/content/patch-notes/<YYYY-MM-DD>-<slug>.md` with `draft: true`.
   - The date is the day it went live.
   - The slug is the punny title in lowercase-dashes.
4. Hand the owner three things: the draft, the skipped list, and the PRs behind each item.
   - Preview it locally with `npm run dev`; drafts show there but not in a real build.
5. When the owner approves, delete the `draft: true` line and commit: `patch-notes: <version> — <title>`. Push `main`.
6. Cloudflare rebuilds the site in about 90 seconds. The bot posts to #patch-notes within about 5 minutes after that.

Never rename a published file. Its name is the id the bot remembers, so a rename posts the patch again.

Website edits to a published patch don't change the Discord post.

## Frontmatter
- `version`
- `title`
- `date`
- `summary`
- `prs`
- `coveredThrough`: quoted ISO UTC. Use the digest's "Suggested coveredThrough".
- `draft`

The version goes up as Beta 1.1, 1.2, and so on, and the owner confirms it. Use Beta 2.0 only when the owner says so.

## Body
`## 🆕 New`, `## 🔧 Changes`, `## 🐛 Fixes`, in that order, leaving out any that are empty. Each item is:

    - **Plain statement of what changed for players.** Optional short joke.

## Rules
- **Audience:** players, many of them kids. Write about what they'll notice: new things to do, things that feel different, and bugs that stopped.
- **Grouping:** one PR can become several items, and several PRs can merge into one item.
- **Skip** PRs with no player-visible effect, even if they touched `src/`: renderer tuning, tests re-pinned, logging.
- **Balance:** give the direction, never the number.
  - Write "The Street Sweeper hits harder up close and fades sooner at range."
  - Not "26/pellet, falloff from 14.5".
- **Leave out:**
  - Anti-cheat, earn caps, rate limits and server-protection changes.
  - Internal or system names.
  - Features that are built but switched off.
- **Exploits:** at most "Fixed an exploit". Never explain how it worked.
- **No promises.** No "coming soon" and no dates.
- **Voice:** the website's. Dry, pants-obsessed, self-deprecating about the dev team.
  - Never at players' expense.
  - Family-friendly.
  - At most one joke per item; plain items are fine.
  - Every patch gets a punny `title` and a one-sentence `summary`.

## Example
- **The Commander no longer gets stuck on Final Stand cannons.** He was hugging them. We don't know why either.
