# NOPAS universe of games — design

Date: 2026-11-15 · Status: draft for owner approval · Branch: `feat/nopas-universe-of-games`

## Why

The site still sells NOPAS as "One ridiculous universe. Three ways to play." Since the Oct 9 open beta,
two more games went public: **Pants Rush** (2026-11-11) and **Steal a Minion** (2026-11-13). The Lobby
also has a free **Arcade** and an **AFK Lounge**. A tester-only **Pants Factory Manager** is coming. The
site needs to present NOPAS as a universe of games, put the newest launch in front of visitors (Steal a
Minion has a Roblox ad campaign pointing at it), and stop hard-coding the game count so the next
launch is a data change, not a rewrite.

Audience: Roblox players (many of them kids) and parents deciding whether to press Play.

## Goals

1. Homepage and `/nopas/` present five public games, with one **spotlight** game (Steal a Minion now).
2. New pages **`/nopas/steal-a-minion/`** and **`/nopas/pants-rush/`**, built like the Bowling page.
3. A single games list drives the cards, the spotlight, the nav menu, back-links and the check scripts.
   Adding or re-spotlighting a game = editing that list (plus the new page, if any).
4. Nav: "NOPAS" becomes a **"Games ▾"** menu listing every game page plus "All games".
5. One-line mentions for the Arcade, the AFK Lounge and a Pants Factory Manager teaser.

## Non-goals

- Stats for Survivors, Steal a Minion, Bowling or the obby (needs bot pipelines; backlog #40 and new
  items). The Pants Rush page only links to the existing stats section.
- A dedicated Invasion page. Invasion keeps its long section on `/nopas/`.
- Per-game Roblox Share Links / deep links. Every Play button stays `PLAY_URL` (the Lobby).
- New gameplay videos, or a sitemap/robots/OG-image overhaul. (Per-page OG images are left to the builder; see below.)
- Rewriting character, lore or patch-notes pages beyond back-link text.

## Anti-goals (would be a failure even if it "works")

- Advertising anything switched off or tester-only: Steal a Minion's global Player Battle search and
  minion stakes (`SamConfig.luau` `PvpSearchOff`/`MinionStakesOff` = true), Pants Rush boss badges,
  the Shrinkinator/Ballooninator in Pants Rush, any Pants Factory Manager feature, price or tester detail.
- Promises or dates: no "coming soon" beyond the PFM teaser's own Lobby wording, no weekly minion
  schedule, no "next map".
- Earn rates, daily caps, anti-cheat, internal names (`SAM`, `NAB`, `PFM`, `NMPA_`, `Era`).
- Copy that says a number of games ("three", "five") anywhere outside data-derived text.
- Ambiguous "Pants Factory": write "Pants Factory Manager" for the new game; "the Pants Factory" stays
  the Invasion / Pants Rush location; the Survivors map is "Pants Factory Floor".
- The owner's username, Studio UI, or other players' names in screenshots.

## Constraints

- Astro 6 static site on Cloudflare Pages (25 MiB per-file cap). Images go through `astro:assets`
  `<Image>`. Theme tokens + dark mode per `src/styles/comic-themes.css`; both themes must pass
  `check-themes`, `check-theme-states`, `audit-theme-contrast`.
- Every page keeps: one `main h1`, meta description, `PLAY_URL`/`COMMUNITY_URL`/`DISCORD_URL`/
  `YOUTUBE_URL` links (`check-release`), no plain `roblox.com/games/` URLs, no unsolicited media.
- No horizontal overflow or clipped headings at 320/390/768/1024/1440 (existing check pattern).
- Patch-note voice (`docs/patch-notes-style.md`): dry, pants-obsessed, family-friendly, one joke max per
  item, direction not numbers.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | Equal grid of five cards, newest marked NEW | Simplest, fair; gives the ad traffic nothing to land on, newest launch gets no lift |
| **B (chosen)** | **Spotlight band for the newest launch + grid for the rest** | One more component; the spotlight is a one-line swap when the next game opens |
| C | Group by side: aliens / defenders / party | On-theme but harder to scan; groups break as games are added |

Owner picked **B, spotlighting Steal a Minion** (2026-11-15).

## Decided (owner-approved 2026-11-15)

- Framing "the NOPAS universe of games". Headline **"One ridiculous universe. / Every kind of chaos."**
  (no count). The homepage ticker drops "THREE WAYS TO PLAY" for a count-free line.
- Spotlight: Steal a Minion. Grid: Pants Rush (NEW), NOPAS: Invasion, Minion Survivors, Minion Panic Bowling.
- Nav "NOPAS" → "Games ▾" (desktop disclosure menu; on phones, a sub-list inside the existing menu).
  Items: each game page + "All games" (`/nopas/`). Invasion's item goes to `/nopas/#match`.
- Pants Factory Manager: one line using the Lobby's words — *"Pants Factory Manager is coming soon.
  Build pants. Build an empire!"* — optionally with its title logo. No page.
- Galleries on the new pages use the owner's two screenshots per game, padded with game-repo art.
- Steal a Minion opened 2026-11-13; Pants Rush 2026-11-11 (dates are not shown on pages; "NEW" badges are).

## Design

### 1. The games list — `src/lib/games.mjs`

Plain `.mjs` (like `links.mjs`) so pages and check scripts import the same data. Each entry:

```js
{ id: "steal-a-minion", name: "Steal a Minion", href: "/nopas/steal-a-minion/",
  tag: "COLLECT. SNEAK. NAB.", blurb: "...", color: "#...", status: "Open Beta",
  isNew: true, image: "steal-a-minion/hero" /* key the page maps to an imported asset */ }
```

Order = display order. Exports: `GAMES` (five public games), `SPOTLIGHT_ID = "steal-a-minion"`,
`EXTRAS` (Arcade, AFK Lounge: name + one line, no link), `COMING_SOON` (Pants Factory Manager line).
Images can't live in `.mjs` (Astro asset imports), so pages keep a small `id → imported image` map;
the builder may choose another pattern as long as the check scripts can read ids, names, hrefs and
the spotlight id without parsing `.astro` files.

Invasion's `href` is `/nopas/#match` (no page). "NEW" shows while `isNew` is true; the owner clears it
by editing the list.

### 2. Homepage `/`

```
[ hero: CSG presents · NOPAS logo · "One ridiculous universe. / Every kind of chaos." · ▶ Play · community ]
[ ticker (count-free)                                                                 ]
[ ★ SPOTLIGHT · NEW · OPEN BETA                                                       ]
[  title logo + screenshot  |  2-line pitch  |  ▶ Play free  ·  What is Steal a Minion? → ]
[ THE NOPAS UNIVERSE OF GAMES — "Same aliens. New problems."                          ]
[  4 cards from GAMES minus spotlight (image, tag, name, blurb, NEW/Open Beta, link)   ]
[  Also in the Lobby: Arcade · AFK Lounge  |  Pants Factory Manager is coming soon…    ]
[ characters · gameplay videos · studio — unchanged                                   ]
```

- Title/description: no game count; name the games from the list.
- Card links go to the game page (Invasion → `/nopas/#match`). Keep the existing anchor ids on cards
  (`match`, `bowling`, `survivors`) and add `pants-rush`, `steal-a-minion`, so old `/#bowling`-style
  links keep working.
- Grid lays out 4 cards cleanly at all widths (2×2 on tablet, 4-across or 2×2 on desktop — builder's call).

### 3. Explore page `/nopas/`

Same order of ideas: intro (new headline), latest-patch teaser (unchanged), spotlight band, grid of the
other four, extras line, then the existing gameplay videos and the long **Invasion** section (`#match`,
with its two phase cards — unchanged content). The current long Bowling (`#bowling`) and Survivors
(`#survivors`) teaser sections are replaced by the cards (they duplicate the game pages); keep their
ids as anchors on the cards so existing links resolve. Remove the "01 / 02 / 03" numbering.

### 4. `/nopas/steal-a-minion/` (new)

Built on the Bowling page's structure and CSS patterns (`nopas-overview.css` + a new
`nopas-steal.css`). Colour: pick from the game's title logo.

- **Hero:** title logo, tagline *"Collect 'em. Nab 'em. Keep 'em!"*, lede, ▶ Play free, status "Open Beta · Live now on Roblox",
  "How to get there: Lobby → Steal a Minion door, or PLAY → Steal a Minion."
- **At a glance:** 8 players per server · 42 kinds of minion · 6 threat levels · Golden & Rainbow finishes.
- **How it works:** the delivery rift over Suburbia keeps dropping minions into the UPDF Rift Yard; alien
  billing pays Bounty every second for every minion anyone holds and never checks who. Fill your lot:
  buy off the belt, sneak past snoring Officer Dozy to the Evidence Locker, or nab from a neighbour's
  open gate and wobble home with a stack on your head (up to 3). They can nab yours too: your best
  minion is always protected, you get a chance to NAB IT BACK, plus Lock Gate and new-player protection.
- **Features (disclosure cards, like Bowling):** Dirty Laundry jobs (Puff Round-Up, Probably Pants,
  Power Nap) and Guarded Salvage · the Research Arena (turn-based; Practice, League, friendly
  same-server challenges; six-minion Arena Team that can't be nabbed) · Minion Index & 16 trophies ·
  Golden and Rainbow minions · UPDF career ranks / Evidence Cabinet · cosmetics (gamepasses are
  cosmetic only — say "cosmetic-only passes", no prices).
- **Gallery:** `steal-a-minion-1.png` (Rift Yard lots), `steal-a-minion-2.png` (Research Arena; crop the
  Roblox top-left menu chrome), the "Know your minions" poster, and the title logo.
- **Closing band:** count-free universe line + links to the other games (from the list).
- Never mention: global Player Battle search, minion stakes, the weekly minion schedule, earn rates.

### 5. `/nopas/pants-rush/` (new)

- **Hero:** "This time, you're the alien." ▶ Play free, status "Open Beta · Live now on Roblox",
  "How to get there: PLAY → Invasion → Pants Rush." Art: Commander character art or a screenshot.
- **At a glance:** 6 phases · 6 bosses · up to 4 players · Easy / Normal / Hard.
- **How a run works:** zap fleeing citizens with the Depantsinator, grab the pants, bank them at the
  mothership's beam before time runs out; hit the quota and the boss shows up; knock it down, then
  depants it. Run out of time or get the whole crew knocked out and the phase is lost.
- **The six phases** (list or cards): High School — The Hall Monitor · Garage Alley — The Seam Ripper ·
  Playground Plaza — The Recess Menace · Gas & Go — Dr. Peepers · Water Tower — Needle Eye ·
  Pants Factory — the Golden Pants (stop the cannons, smash the glass, carry the Golden Pants home,
  go giant: RAMPAGE HAUL). Names from `PantsRushConfig.luau`.
- **Features:** Commander / Overlord / Minion roles (co-op: up to 2 alien bosses + 2 minion players;
  revive your crew) · Time Trial (medals, rankings) or Unlimited · Play Solo / Find Co-op / Play with
  Friends / WANT A CREW? · rewards go to your main NOPAS account (XP, coins, class mastery, Gold-medal
  titles) · Fancy Pants VIP, WANTED posters. No purchases — say "no purchases needed" only if true at
  build time (it is as of 2026-11-14).
- **Stats link:** "See the fastest crews →" `/nopas/stats/#rush`. The stats page has no `#rush` id
  today (only `#rush-heading`, `#rush-board`…): add `id="rush"` to its Pants Rush `<section>`.
- **Gallery:** `pants-rush-2.png` (High School hallway), `pants-rush-1.png` cropped to remove the owner's
  name card and the Studio "Output" bar (or dropped if the crop loses the point), and the Commander /
  Overlord / Minion character art.
- Never mention: boss badges, Shrinkinator/Ballooninator, daily caps, "next map".

### 6. Nav — `BaseLayout.astro`

- Desktop: "Games ▾" is a `<button aria-expanded>` disclosure with a list of links (not a hover-only
  menu). Closes on Escape, outside click, and focus leaving. Works in both themes and at md widths
  (the header is already tight; builder verifies no wrap at 768/1024).
- Mobile: inside the existing menu, "Games" becomes a heading with indented links.
- Items from `GAMES` + "All games". Remaining links unchanged (Studio, Defenders, Collectors, Stats,
  Patch Notes, Lore).

### 7. Existing pages: count-free copy

- Bowling + Survivors: back-link "← All three NOPAS modes" → "← All NOPAS games"; closing bands drop
  "THREE WAYS TO PLAY"/"all three modes" and list the other games from the list.
- Stats: "Explore all three modes ↗" → "Explore all NOPAS games ↗".
- Character page footers: unchanged except any "three" copy.
- Grep gate: no `three (ways|modes|games)` / `all three` / `3 modes` outside patch notes.

### 8. Assets

Copy into `src/assets/steal-a-minion/` and `src/assets/pants-rush/` (and `src/assets/brand/` for the
PFM logo if used), from the game repo `origin/main`:
`assets/lobby-polish/Steal-a-Minion-Title.png`, `assets/lobby-polish/Pants-Factory-Manager-Title.png`,
`assets/nab/graphics/updf-know-your-minions.png`, `art/pants-rush-ui-20261107/{commander,overlord,minion}.png`,
plus the owner screenshots in `D:\NOPAS\website-update\`. Crop personal names/Studio chrome with
`sharp`. Captions follow the existing "Development screenshot" / "Game artwork" labelling.

### 9. Checks

Update the scripts to read `src/lib/games.mjs` instead of hard-coded counts:
- `check-homepage.mjs`: spotlight present and equals `SPOTLIGHT_ID`; grid card count = `GAMES.length - 1`.
- `check-nopas-overview.mjs`: same for `/nopas/`; drop the `['match','bowling','survivors']` loop for
  ids from the list; keep the 2 Invasion phase cards.
- New `check-nopas-steal.mjs`, `check-nopas-rush.mjs` modelled on `check-nopas-bowling.mjs` (widths,
  disclosures, gallery, anchors, local links, Play link, banned-phrase regex for the anti-goals).
- `check-release.mjs`: route count 19 → 21. `check-themes`, `check-theme-states`,
  `audit-theme-contrast`: add the two routes.
- Nav: keyboard open/close/Escape and mobile sub-list, in an existing script or a new `check-nav.mjs`.
- A count-free grep gate (section 7).

## Left to the builder

- Exact visual design of the spotlight band and the Games menu within the existing comic style.
- Card image choice per game and image crops (no personal names/Studio chrome).
- Colours for the two new games (from their art), checked for contrast in both themes.
- Whether `/nopas/` keeps a short Bowling/Survivors teaser or only cards (design says cards).
- Per-page `ogImage` for the two new pages (nice-to-have; `BaseLayout` already accepts `ogImage`).
- Joke lines, within the voice rules.
