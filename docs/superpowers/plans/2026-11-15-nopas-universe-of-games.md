# NOPAS Universe of Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the site from "three ways to play" into the NOPAS universe of games: a Steal a Minion spotlight plus a game grid on `/` and `/nopas/`, new `/nopas/steal-a-minion/` and `/nopas/pants-rush/` pages, a "Games ▾" nav menu, all driven by one games list.

**Architecture:** `src/lib/games.mjs` (plain data, importable by pages and check scripts) is the single source for game ids, names, links, spotlight and extras. `src/components/game-images.ts` maps ids to imported images. Two components, `GameSpotlight.astro` and `GameGrid.astro`, render that data on both landing pages. New game pages copy the Bowling page's structure. Playwright check scripts read `games.mjs` instead of hard-coded counts.

**Tech Stack:** Astro 6, Tailwind 4 + page CSS in `src/styles/`, `astro:assets` `<Image>`, `sharp` (crops), Node `--test` (unit), Playwright check scripts against `astro dev --host 127.0.0.1 --port 4321`.

**Spec:** `docs/superpowers/specs/2026-11-15-nopas-universe-of-games-design.md` — read it first; it holds the page contents and the anti-goals.

## Global Constraints

- Headline copy on `/` and `/nopas/`: **"One ridiculous universe."** / **"Every kind of chaos."**
- No game count in any copy: never "three"/"five" (ways|modes|games), "all three", "3 modes" outside `src/content/patch-notes/`.
- Spotlight = `steal-a-minion`. Grid order: Pants Rush (NEW), NOPAS: Invasion, Minion Survivors, Minion Panic Bowling.
- Pants Factory Manager line, verbatim: *"Pants Factory Manager is coming soon. Build pants. Build an empire!"* No page, no features, no dates.
- Never on any page: Player Battle search, minion stakes, weekly/Friday minion schedule, earn rates ("/sec", per-hour), daily caps, boss badges, Shrinkinator/Ballooninator in Pants Rush, "next map", internal names (SAM, NAB, PFM, NMPA_, Era), minion-species or trophy counts.
- "Pants Factory Manager" = the new game; "the Pants Factory" = Invasion/Pants Rush location; "Pants Factory Floor" = Survivors map.
- Every Play button is `PLAY_URL` from `src/lib/links.mjs`, `target="_blank" rel="noopener"`. No `roblox.com/games/` links.
- Every page: one `main h1`, meta description, no horizontal overflow or clipped headings at 320/390/768/1024/1440, both themes.
- Screenshots: no usernames, Studio chrome, Roblox menu chrome, cursors or earn-rate tooltips. Captions say "Development screenshot" or "Game artwork".
- Keep existing anchor ids working: `/#match`, `/#bowling`, `/#survivors`, `/nopas/#match`, `/nopas/#bowling`, `/nopas/#survivors`.
- Dev server for every check: `npx astro dev --host 127.0.0.1 --port 4321` (plain `astro dev` binds IPv6 only and the checks can't reach it).

## Review Focus

1. **A spotlight id that matches no game, or a duplicate id/href** must fail the build/tests loudly, not render an empty band. → Task 1 tests.
2. **Games menu by keyboard:** Enter/Space opens, Escape closes and returns focus to the button, Tab past the last item closes it, outside click closes it; the header doesn't wrap at 768 and 1024. → Task 7 `check-nav.mjs`.
3. **Old links still land:** `/#bowling`, `/nopas/#survivors` etc. resolve to an element after the detail sections are removed. → Tasks 5 and 6 checks.
4. **New colours in dark theme** pass contrast and the "vivid accents preserved" check. → Task 8 adds routes and the `.game-card` selector to the theme scripts.
5. **Banned phrases leaking onto the new pages** (Global Constraints list). → banned-phrase regex in Tasks 3 and 4 checks, plus the repo-wide copy gate in Task 8.

---

### Task 1: The games list

**Files:**
- Create: `src/lib/games.mjs`
- Test: `src/lib/games.test.mjs` (picked up by `npm run test:unit`)

**Interfaces:**
- Produces:
  - `GAMES: Game[]` in display order, where `Game = { id, name, href, tag, blurb, color, status, isNew, navLabel }` (all strings except `isNew: boolean`).
  - `SPOTLIGHT_ID: string` = `"steal-a-minion"`.
  - `spotlightGame(): Game` (throws `Error("SPOTLIGHT_ID matches no game")` if missing).
  - `gridGames(): Game[]` (GAMES without the spotlight, order kept).
  - `EXTRAS: {name, line}[]` = Arcade, AFK Lounge.
  - `COMING_SOON: {name, line}` for Pants Factory Manager.

- [ ] **Step 1: Write the failing tests** in `src/lib/games.test.mjs`:
  - `GAMES ids are exactly steal-a-minion, pants-rush, match, survivors, bowling` (deepEqual on `GAMES.map(g=>g.id)`).
  - `ids and hrefs are unique`.
  - `hrefs`: steal-a-minion → `/nopas/steal-a-minion/`, pants-rush → `/nopas/pants-rush/`, match → `/nopas/#match`, survivors → `/nopas/survivors/`, bowling → `/nopas/bowling/`.
  - `spotlightGame().id === "steal-a-minion"` and `gridGames().map(g=>g.id)` equals `["pants-rush","match","survivors","bowling"]`.
  - `isNew` is true only for steal-a-minion and pants-rush.
  - `COMING_SOON.line === "Pants Factory Manager is coming soon. Build pants. Build an empire!"`.
  - `EXTRAS.map(e=>e.name)` equals `["Arcade","AFK Lounge"]`.
  - `no copy names a game count`: every string in GAMES/EXTRAS/COMING_SOON fails `/\b(three|five|3|5) (ways|modes|games)\b|all three/i`.
  - `no banned phrases`: every string fails `/player battle|stakes|\/sec|friday|weekly|badge|shrinkinator|ballooninator|next map/i` and the case-sensitive `/\bSAM\b|\bPFM\b|NMPA_/`. ("Nab" is the game's player-facing verb, so it is not banned.)

- [ ] **Step 2: Run** `npm run test:unit`. Expected: FAIL (`Cannot find module './games.mjs'`).

- [ ] **Step 3: Implement `src/lib/games.mjs`.** Reuse today's Invasion/Bowling/Survivors tag + blurb from `src/pages/index.astro:15-19` and their colours (`#74caff`, `#ffda56`, `#a9ef79`). New entries:
  - Steal a Minion: tag `"COLLECT. SNEAK. STEAL."` (the in-game tagline), blurb `"Fill your lot with minions. Buy them, sneak them out of the Evidence Locker, or nab them from the neighbours. They can nab yours too."`
  - Pants Rush: tag `"THIS TIME, YOU'RE THE ALIEN."`, blurb `"Raid the suburbs for pants, solo or with a crew of four. Six phases, six bosses, one very golden finale."`
  - Colours for the two new games: the implementer picks from the title logo / character art; Task 8's contrast audit is the gate.
  - `navLabel`: the short name used in the Games menu (same as `name` except `"Invasion"` for match).
  - `status` is `"Open Beta"` for all five.
  - EXTRAS: Arcade — `"Four free cabinet games in the Lobby, with high scores shared with Bowling."`; AFK Lounge — `"Sit on a couch. Earn coins slowly. Peak defender behaviour."`

- [ ] **Step 4: Run** `npm run test:unit`. Expected: all pass (18 existing + new).

- [ ] **Step 5: Commit** `feat(nopas): one games list for the NOPAS universe`.

---

### Task 2: Assets for the new games

Folded here once so Tasks 3–5 can run in any order.

**Files:**
- Create: `src/assets/steal-a-minion/{title.png,rift-yard.png,research-arena.png,know-your-minions.png}`, `src/assets/pants-rush/{hallway.png,commander-deploy.png,commander.png,overlord.png,minion.png}`, `src/assets/brand/pants-factory-manager-title.png`
- Create: `scripts/import-game-art.mjs` (one-off, kept for re-runs)

**Interfaces:**
- Produces: the files above at those exact paths.

- [ ] **Step 1: Write `scripts/import-game-art.mjs`.** It extracts from the game repo with `git -C D:/Projects/not-my-pants-alien-scum show origin/main:<path>` (binary-safe via `execFileSync` with `encoding: 'buffer'`), and from `D:/NOPAS/website-update/`. It writes with `sharp`. Sources:
  - `assets/lobby-polish/Steal-a-Minion-Title.png` → `steal-a-minion/title.png`
  - `assets/nab/graphics/updf-know-your-minions.png` → `steal-a-minion/know-your-minions.png`
  - `assets/lobby-polish/Pants-Factory-Manager-Title.png` → `brand/pants-factory-manager-title.png`
  - `art/pants-rush-ui-20261107/{commander,overlord,minion}.png` → `pants-rush/`
  - `steal-a-minion-1.png` → `rift-yard.png`: crop `{left:100, top:0, width:1050, height:932}`. This removes the stray cursor at about (80,405) and the "Suds Squire … +14/sec" tooltip (x≥1160).
  - `steal-a-minion-2.png` → `research-arena.png`: crop `top:150` (removes the Roblox menu chrome and the FLY CAMERA row).
  - `pants-rush-2.png` → `hallway.png` as is.
  - `pants-rush-1.png` → `commander-deploy.png`: crop `{left:0, top:340, width:1185, height:585}`. This removes the "COMMANDER" banner, the name card with the owner's username, the "PANTS RUSH • COLLECTOR DEPLOYMENT" bar and the Studio "Output" strip.
  - Downscale anything wider than 2400 px.
- [ ] **Step 2: Run** `node scripts/import-game-art.mjs`, then open every output image. Expected: no username, cursor, Studio/Roblox chrome or "/sec" text visible. Re-tune a crop if any is.
- [ ] **Step 3: Commit** `chore(nopas): import Steal a Minion, Pants Rush and Pants Factory Manager art`.

---

### Task 3: `/nopas/steal-a-minion/`

**Files:**
- Create: `src/pages/nopas/steal-a-minion/index.astro`, `src/styles/nopas-steal.css`
- Test: `scripts/check-nopas-steal.mjs`

**Interfaces:**
- Consumes: `GAMES`, `gridGames` (Task 1), `PLAY_URL`, the Task 2 images.
- Produces: route `/nopas/steal-a-minion/` with section ids `#how-it-works`, `#features`, `#gallery`; hero class `.steal-hero` containing `.hero-play a`.

- [ ] **Step 1: Write `scripts/check-nopas-steal.mjs`** in the style of `scripts/check-nopas-bowling.mjs`. It asserts:
  - no overflow and no clipped h1–h3 at 320/390/768/1024/1440
  - exactly one `main h1` containing "Steal a Minion" (case-insensitive)
  - `.steal-hero .hero-play a` href = `PLAY_URL` and target `_blank`
  - the page text matches `/Lobby/` and `/Steal a Minion door|PLAY/` (how to get there)
  - `.steal-feature` count ≥ 5, each a `<details>` that toggles with Enter
  - `#gallery figure` count = 4, all images load (`naturalWidth>0`)
  - all `a[href^="#"]` resolve, and all local links return 200 **except** other games' pages that may not exist yet (`/nopas/pants-rush/`): those are checked only for href equality with `GAMES` (Task 9 / `check-release` verifies every link resolves)
  - the closing band links to every other game's `href` from `GAMES` (`/nopas/#match` is checked as an anchor)
  - **banned phrases:** page text does not match `/player battle|stakes|\/sec|per second|friday|weekly|\b42\b|16 trophies|nab a minion/i` nor the case-sensitive `/\bSAM\b|\bPFM\b|NMPA_/`
  - reduced motion, mobile menu, no page errors
- [ ] **Step 2: Run it** (dev server up). Expected: FAIL at `page.goto` (404 / missing h1).
- [ ] **Step 3: Build the page** per spec §4 (hero, at-a-glance band, how it works, features, gallery, closing band). Base the structure and classes on `src/pages/nopas/bowling/index.astro`, reusing `nopas-overview.css`. `nopas-steal.css` holds only page-specific styles. Meta description names the game and "open beta on Roblox". The back-link is "← All NOPAS games" → `/nopas/#games`. The closing band is generated from `GAMES` minus this game.
- [ ] **Step 4: Run** `node scripts/check-nopas-steal.mjs`. Expected: `PASS: …`.
- [ ] **Step 5: Commit** `feat(nopas): Steal a Minion page`.

---

### Task 4: `/nopas/pants-rush/` and the stats anchor

**Files:**
- Create: `src/pages/nopas/pants-rush/index.astro`, `src/styles/nopas-rush.css`
- Modify: `src/pages/nopas/stats/index.astro` (add `id="rush"` to the Pants Rush `<section>`)
- Test: `scripts/check-nopas-rush.mjs`

**Interfaces:**
- Consumes: Task 1, Task 2 images, `PLAY_URL`.
- Produces: route `/nopas/pants-rush/`; `.rush-hero .hero-play a`; `#phases` with six `.rush-phase` items; `/nopas/stats/#rush`.

- [ ] **Step 1: Write `scripts/check-nopas-rush.mjs`** (same pattern as Task 3). Asserts:
  - the same layout, hero and Play checks
  - the text says how to get there: `/PLAY.*Invasion.*Pants Rush/`
  - `.rush-phase` count = 6, with texts in order: High School / The Hall Monitor, Garage Alley / The Seam Ripper, Playground Plaza / The Recess Menace, Gas & Go / Dr. Peepers, Water Tower / Needle Eye, Pants Factory / Golden Pants
  - a link to `/nopas/stats/#rush` exists, and on that page `#rush` exists
  - `#gallery figure` count ≥ 4, all loaded
  - **banned phrases:** `/badge|shrinkinator|ballooninator|next map|daily|\bcaps?\b|NMPA/i`
  - local links return 200 (by Task 4 both new pages exist, so no exception is needed)
  - the closing band links to the other games
- [ ] **Step 2: Run it.** Expected: FAIL (404).
- [ ] **Step 3: Build the page** per spec §5. Take the phase/boss names from Step 1's list (they match `PantsRushConfig.luau`). Write "No purchases needed", as the spec allows. Add `id="rush"` on the stats page.
- [ ] **Step 4: Run** `node scripts/check-nopas-rush.mjs` and `PUBLIC_STATS_API="http://127.0.0.1:8791" npm run build && npm run test:stats`, then `npm run build` again without the env. Expected: both PASS; dist rebuilt clean.
- [ ] **Step 5: Commit** `feat(nopas): Pants Rush page`.

---

### Task 5: Spotlight + grid components, homepage

**Files:**
- Create: `src/components/game-images.ts`, `src/components/GameSpotlight.astro`, `src/components/GameGrid.astro`, `src/styles/games.css`
- Modify: `src/pages/index.astro`, `src/styles/homepage.css` (remove now-unused `.mode-*` rules)
- Test: `scripts/check-homepage.mjs`

**Interfaces:**
- Consumes: `spotlightGame`, `gridGames`, `EXTRAS`, `COMING_SOON` (Task 1); images (Task 2).
- Produces:
  - `GAME_IMAGES: Record<string, { image: ImageMetadata; alt: string; label: string }>` keyed by game id; Steal a Minion also gets `logo`.
  - `<GameSpotlight />`: no props, renders `section.game-spotlight[data-game-id]` with `.game-spotlight-play` (PLAY_URL) and `.game-spotlight-more` (the game href).
  - `<GameGrid skipIds={[]} />`: renders `#games` containing `.game-card[data-game-id]` links. Each card's `id` = game id (so `#match`/`#bowling`/`#survivors` keep resolving) unless the id is in the optional `skipIds: string[]` prop (default `[]`). `/nopas/` passes `skipIds={["match"]}` because its Invasion `section#match` already owns that id, and duplicate ids fail `check-release`. It then `.game-extras` with EXTRAS and the COMING_SOON line (optionally with the PFM logo).

- [ ] **Step 1: Update `scripts/check-homepage.mjs`.** Import `GAMES, SPOTLIGHT_ID, gridGames` from `../src/lib/games.mjs`. Replace the `.mode-card`/`3` assertions with:
  - `.game-spotlight` count 1, with `data-game-id === SPOTLIGHT_ID`
  - `.game-spotlight-play` href `PLAY_URL`
  - `.game-spotlight-more` href = the spotlight's href
  - `.game-card` ids equal `gridGames().map(g=>g.id)`, each card's href = that game's href, and all cards share one width/height at 1440
  - `#bowling`, `#survivors` and `#match` each match exactly one element
  - `.game-extras` text contains every EXTRAS name and `COMING_SOON.line`
  - `h1` text matches `/One ridiculous universe\.\s*Every kind of chaos\./`
  - `<title>` and body text don't match `/three (ways|modes|games)|all three/i`
- [ ] **Step 2: Run it.** Expected: FAIL (no `.game-spotlight`).
- [ ] **Step 3: Implement the components and wire the homepage.** Hero h1 per Global Constraints; count-free ticker (e.g. `ONE UNIVERSE ✦ EVERY KIND OF CHAOS ✦ ZERO SPARE PANTS`); count-free title/description that name the games from `GAMES`. The section heading becomes "THE NOPAS UNIVERSE OF GAMES" / "Same aliens. New problems." The `modes` array and `.mode-grid` markup are removed. Characters, videos and studio sections stay unchanged.
- [ ] **Step 4: Run** `node scripts/check-homepage.mjs`. Expected: `All homepage checks passed.`
- [ ] **Step 5: Commit** `feat(nopas): spotlight Steal a Minion and the game grid on the homepage`.

---

### Task 6: Explore page `/nopas/`

**Files:**
- Modify: `src/pages/nopas/index.astro`, `src/styles/nopas-overview.css` (drop unused `.overview-mode*`, `.overview-extra-modes`, `.overview-detail` rules)
- Test: `scripts/check-nopas-overview.mjs`, `scripts/check-nopas-survivors.mjs` (its "discovery from both pages" step must still find `a[href="/nopas/survivors/"]` on `/` and `/nopas/`)

**Interfaces:**
- Consumes: `GameSpotlight`, `GameGrid` (Task 5).
- Produces: `/nopas/` with `#games` (grid), `#match` (unchanged Invasion section, 2 `.overview-phase`), `#gameplay`, `#factions`; cards carry ids `bowling`, `survivors`.

- [ ] **Step 1: Update `scripts/check-nopas-overview.mjs`.** Replace the `.overview-mode`/3 assertions and the `['match','bowling','survivors']` click loop with the Task 5 spotlight/grid assertions on this page. Then:
  - `section#match` exists with 2 `.overview-phase`
  - `#bowling` and `#survivors` each match one element
  - the h1 is the new headline, and no "three" copy appears
  - the latest-patch teaser still renders
  - the existing anchor, local-route, video, mobile-menu and theme checks are kept
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Rewrite the page top** (new headline, lede naming the games from `GAMES`, count-free title/description). Use `<GameSpotlight/>` + `<GameGrid skipIds={["match"]}/>` in place of `#modes`. Remove `.overview-extra-modes` (the Bowling/Survivors detail sections). In the Invasion section, drop the "01 /" prefix from the eyebrow and change "All three modes ↑" to "All NOPAS games ↑" → `#games`.
- [ ] **Step 4: Run** `node scripts/check-nopas-overview.mjs` and `node scripts/check-nopas-survivors.mjs`. Expected: both PASS.
- [ ] **Step 5: Commit** `feat(nopas): explore page leads with the universe of games`.

---

### Task 7: "Games ▾" nav menu

**Files:**
- Modify: `src/layouts/BaseLayout.astro` (desktop list at ~`:69-75`, mobile list at ~`:155-162`, inline script at ~`:220+`)
- Test: `scripts/check-nav.mjs` (new)

**Interfaces:**
- Consumes: `GAMES` (Task 1).
- Produces:
  - **Desktop:** `button#games-menu-toggle[aria-expanded][aria-controls="games-menu"]` and `ul#games-menu` (hidden unless expanded), with one link per `GAMES` entry (text = `navLabel`, href = `href`) and then "All games" → `/nopas/`.
  - **Mobile:** inside `#mobile-menu`, a "Games" label followed by `ul#mobile-games` with the same links.

- [ ] **Step 1: Write `scripts/check-nav.mjs`.**
  - **At 1440 on `/`:**
    - `#games-menu` is hidden.
    - Focus the toggle, then Enter: `aria-expanded="true"`, and link hrefs equal `[...GAMES.map(g=>g.href), "/nopas/"]`.
    - Escape: collapsed, and focus is back on the toggle.
    - Open it, then Tab through all its links plus one more: collapsed.
    - Open it, then click `main`: collapsed.
    - Click "Pants Rush": lands on `/nopas/pants-rush/`.
  - **At 768 and 1024:** the header height equals its height at 1440 (no wrap), and there's no overflow.
  - **At 390:** open the mobile menu; `#mobile-games a` hrefs are the same list; clicking "Steal a Minion" navigates there.
  - **Both themes:** the opened menu is visible, and its text colour isn't equal to its background colour.
  - No page errors.
- [ ] **Step 2: Run it.** Expected: FAIL (`#games-menu-toggle` not found).
- [ ] **Step 3: Implement.** Replace the "NOPAS" `<li>` with the disclosure; follow the existing mobile-menu script's pattern for aria/state. Make sure no other nav link is removed.
- [ ] **Step 4: Run** `node scripts/check-nav.mjs`, `node scripts/check-characters.mjs` and `node scripts/check-utilities.mjs` (they exercise the mobile menu). Expected: all PASS.
- [ ] **Step 5: Commit** `feat(site): Games menu in the header`.

---

### Task 8: Count-free copy everywhere, gates and route lists

**Files:**
- Modify:
  - `src/pages/nopas/bowling/index.astro` — back-link `:38`; closing band `:76`
  - `src/pages/nopas/survivors/index.astro` — back-link `:20`; closing band `:50`
  - `src/pages/nopas/stats/index.astro` — `:188` "Explore all three modes ↗"
  - any other hit from the gate
- Modify:
  - `scripts/check-release.mjs` — route count `19` → `21`
  - `scripts/check-themes.mjs`, `scripts/check-theme-states.mjs`, `scripts/audit-theme-contrast.mjs` — add `/nopas/steal-a-minion/` and `/nopas/pants-rush/` to the route lists
  - `scripts/check-themes.mjs` — replace `.mode-card,.overview-mode` with `.game-card,.game-spotlight` in the accent selector
  - `scripts/check-theme-states.mjs` — `['home-modes','/','.mode-grid']` → `['home-games','/','#games']`
- Create: `src/lib/copy-gate.test.mjs`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write `src/lib/copy-gate.test.mjs`.** It reads every file under `src/pages`, `src/components` and `src/layouts`, skipping `src/content/patch-notes`. It asserts that none match `/\b(three|five) (ways to play|modes|games)\b|all three|3 modes/i`, and that none contain `roblox.com/games/`.
- [ ] **Step 2: Run** `npm run test:unit`. Expected: FAIL, listing the Bowling, Survivors and Stats hits (and any others).
- [ ] **Step 3: Fix each hit.** Back-links become "← All NOPAS games" → `/nopas/#games`. Closing bands use a count-free eyebrow ("ONE RIDICULOUS UNIVERSE. EVERY KIND OF CHAOS.") and link the other games from `GAMES`. Stats: "Explore all NOPAS games ↗". Then update the script route lists and selectors listed above.
- [ ] **Step 4: Run** `npm run test:unit` and the theme scripts (`check-themes`, `check-theme-states`, `audit-theme-contrast`). Expected: unit tests PASS; theme checks PASS; contrast `failures 0`.
- [ ] **Step 5: Commit** `feat(nopas): count-free copy and checks cover the new pages`.

---

### Task 9: Whole-site verification

No new code. Fix anything found, committing per fix.

- [ ] **Step 1:** `npm run build`, then confirm `grep -rl 127.0.0.1:8791 dist` returns nothing.
- [ ] **Step 2:** With the dev server up, run every check:
  - `check-homepage`, `check-nopas-overview`, `check-nopas-steal`, `check-nopas-rush`, `check-nopas-bowling`, `check-nopas-survivors`, `check-characters`, `check-lore`, `check-utilities`, `check-nav`
  - `check-themes`, `check-theme-states`, `audit-theme-contrast`
  - `check-release`
  - `npm run test:unit`, `npm run test:patch-notes` (then rebuild `dist`), `npm run test:stats` (its own build/env dance)

  Expected: all PASS. The one known exception is `check-release`'s external-link step, which may fail on `youtube.com` with "Header overflow" (an environment issue predating this work). Report it; don't patch around it.
- [ ] **Step 3:** Screenshot `/`, `/nopas/`, `/nopas/steal-a-minion/` and `/nopas/pants-rush/` at 1440 and 390 in both themes, plus the open Games menu. View them and confirm the Global Constraints by eye: no usernames, cursors or "/sec" in images; the PFM line is verbatim; the spotlight is Steal a Minion.
- [ ] **Step 4:** Leave the branch ready for review. Do not push or merge; the owner signs off on every push.
