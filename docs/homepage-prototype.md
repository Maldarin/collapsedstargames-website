# Homepage prototype review

All 18 redesigned routes and the global light/dark revision are owner-approved. The owner has authorized the final audit, commit, push and publication through the existing Cloudflare Pages workflow. Earlier review entries below record the approval history; their pending-status notes have been superseded.

## Review locally

Run `npm run dev -- --host 127.0.0.1 --port 4321`, then open http://127.0.0.1:4321/.

The homepage gives Match, NOPAS Bowling, and NOPAS Survivors identical desktop card dimensions and the same beta status. On phones they stack in the same order. No fixed beta date or playable-now claim appears. The approved character pages retain their existing Match guidance and lore. Lore, Stats and Shop are also redesigned and approved.

Artwork is labeled separately from development screenshots. The owner rejected the 13.4-second local clip as development footage that does not represent gameplay. It and its poster are preserved on disk but removed from the homepage promotional slot. No automatic motion is required to understand the page. Existing YouTube click-to-play cards are reused.

## Small missing-media list for the next pass

1. Match: one clean 8–12 second capture of a defender/Collector encounter, including one clear pants gag. Use it to replace the illustrated mode thumbnail with a still from gameplay.
2. Bowling: one clean 6–10 second roll through impact, with the debug console hidden and the pins visible before the strike banner.
3. Survivors: one clean 8–12 second horde encounter showing a readable attack and reaction, with debug labels hidden.

Capture landscape at 1080p, keep the key action near center for mobile crops, and export one still per clip. These are improvements for the next iteration, not blockers for this prototype.

## Verification

`npm run build` builds all 18 routes. `node scripts/check-homepage.mjs` checks desktop/mobile layout, equal mode dimensions, navigation, YouTube facade activation, reduced-motion behavior, and browser errors. Set `HOMEPAGE_SCREENSHOT_DIR` to choose an output folder; otherwise screenshots go to the OS temporary directory. Requires the local preview and a Playwright Chromium installation.

The existing Google Fonts import was moved before Tailwind so the build no longer drops it for invalid CSS import ordering. No dependency versions were changed.

## Redesign follow-up queue

- [x] Approved homepage, including studio lockup, head-safe hero framing and selected Minion pins screenshot.
- [x] Approved NOPAS overview with equal Match, Bowling and Survivors discovery.
- [x] Bowling guide implemented in the approved visual language and verified at desktop/mobile sizes; approved by the user before Survivors work began.
- [x] Dedicated NOPAS Survivors subpage implemented at `/nopas/survivors/`, linked from the homepage and overview, and verified across five screen widths. Covers broader intended design, class roles, co-op, upgrades, progression and the owner-confirmed three beta events. User-approved before character section work began.

The website's current Bowling and Survivors screenshots are approved. Bowling now uses the user's selected `Screenshot 2026-09-11 125442.png`, copied as `src/assets/bowling/minion-pins.png`; additional footage above is optional future improvement, not a provisional status for these approved images.

## Survivors verification

`node scripts/check-nopas-survivors.mjs` verifies five widths, heading fit, all images, local links and anchors, discovery from homepage/overview, mobile menu and reduced motion. Set `SURVIVORS_SCREENSHOT_DIR` for review output. Build, homepage and overview regression checks also pass. Source rationale is in `docs/survivors-content-evidence.md`; owner intent supersedes temporary five-wave/single-class implementation limits.

- [x] Both faction rosters and all nine character detail routes redesigned and verified. Original Match abilities/lore retained, artwork shown fully, and faction navigation added. Owner-approved on 2026-09-11 for both Defenders/Collectors rosters and all nine individual character pages ("Looks great", followed by "Sounds good").

## Character section review

The Defenders and Collectors rosters now use large artwork cards, distinct blue/purple palettes, ink borders and shared typography. Individual pages preserve the existing Match guidance, equipment, lore and quotes; a Match label distinguishes those kits from Survivors. Citizens stay non-combat. Existing Minion development captures remain distinct from illustrated heroes. No new mechanics were invented or re-certified against game code in this visual pass.

`node scripts/check-characters.mjs` passes all 11 changed routes at 320, 390, 768, 1024 and 1440px, checking content headings against the original files, image loading and contain framing, all 13 unique local links, anchors, keyboard navigation/focus, mobile menu, reduced motion and browser errors. The final build passes all 18 routes. All four approved-page regression scripts pass. `node scripts/capture-characters.mjs` captures both rosters and Security Officer, Overlord, Citizens and Minions on desktop/mobile; set `CHARACTERS_SCREENSHOT_DIR` for output. No deployment or game edits.

## Remaining existing routes

Final route approval status:

- [x] `/lore/` — Owner-approved, including regenerated UPDF image and final field-guide parenthetical.
- [x] `/nopas/stats/` — Redesigned, verified and owner-approved.
- [x] `/shop/` — Coming-soon page redesigned, verified and owner-approved.

All 18 page routes have owner-approved designs. Stats and Shop approval received on 2026-09-11: “Okay looks good I approve of those.” Match is a section of the approved NOPAS overview, not a separate existing route. A subsequent global theme behavior revision is documented below; no commits or deployment are authorized.

## Lore review

The original narrative, timeline (16 entries), glossary (14 terms), five in-universe documents and all accepted Lore imagery are preserved. Twelve numbered chapters now have a desktop sticky index and mobile chapter menu. Documents use native keyboard-accessible disclosures. The text column, illustrated panels and comic palette match the approved pages.

Owner canon correction: Collectors are aliens, never a pig/swine species. “Alien Swine” is solely a Defender pejorative. The rejected `lore-know-your-enemy.png` poster said “Definitely a swine”; it is no longer imported/displayed, but the source file remains. Its replacement is an editable Know Your Enemy panel using established `classes/Minions/Minion_solo.png`, accurate role copy, and an explicit explanation of the insult. Other Lore images remain.

`node scripts/check-lore.mjs` passes five viewport widths, heading fit, all 12 chapter links, five keyboard disclosures, original content headings, timeline/glossary counts, internal links, loaded images, rejected-image removal, mobile menu and no browser errors. Use `LORE_SCREENSHOT_DIR` for screenshots. Build passes all 18 routes; homepage, overview and all 11 character route regression checks pass. Desktop/mobile hero, narrative, document and replacement-panel screenshots visually inspected. No game changes, image generation or deployment.

### UPDF image regeneration

Owner separately requested regeneration of the section-four UPDF founding image to fix malformed UPDF lettering and a missing background arm. Built-in imagegen used the original as reference, followed by a targeted background-volunteer anatomy edit. Accepted replacement: `src/assets/lore/lore-updf-founded-v2.png`; original preserved. The board lettering and complete arm chains were visually reviewed before integration. No other imagery was regenerated.

Owner approved the regenerated UPDF image ("Looks good"). Full Lore page subsequently owner-approved. Owner requested the field-guide sentence: "The Collectors are aliens, not pigs (at least we think)." The preceding Defender-insult explanation is unchanged.

Full Lore approval received on 2026-09-11: "Looks good, approved." Verified final field-guide copy: “Alien Swine” is a Defender insult. The Collectors are aliens, not pigs (at least we think). Remaining unreviewed redesign sections: Stats and Shop.

## Stats and Shop review

Both remaining routes match the approved comic style. Stats retains its existing script (verified unchanged after line-ending normalization), public API configuration, twelve metrics, player lookup, keyboard tabs and live regions. No fake data or credentials added. The public API returned real leaderboard rows and a player lookup during verification; service availability remains external to this static site. Shop retains coming-soon availability, existing logo, contact and NOPAS navigation, with no products, prices or checkout added. The sixteen approved page sources were untouched.

The existing `npm run test:stats` suite passes lookup, formatting, metric,404 and offline checks. Final build restored to production API after fixture test, with18 routes built. `node scripts/check-utilities.mjs` passes five widths, images, links, input validation, loading/empty states, keyboard focus/selection and no browser errors. Actual public player lookup also rendered on desktop/mobile. Screenshots reviewed; use `UTILITY_SCREENSHOT_DIR` for capture output. Both pages await owner approval. No deployment.

## Homepage footage correction

Owner explicitly rejected `src/assets/clips/nopas/hero.webm` / `hero.mp4` as gameplay representation. Prior technical playback verification did not establish marketing suitability and is superseded. The featured local-video panel is removed; existing three published click-to-play cards remain and the hero action now says Watch videos. Rejected source files remain preserved. The owner approved this homepage state on 2026-09-11: “Let's just leave that spot out ... page looks fine ... right now ... old one removed.” The footage action is resolved by intentional removal, with no replacement slot or further candidate search needed.

The following partial candidate review is retained only as history and is superseded by the final removal decision. Commander Depantsing already appears among the three retained cards and must not be duplicated as a featured replacement.

Candidate review (partial; not marketing approval): all three existing published videos are titled/described as beta gameplay. `kSqdf0DlD8s` (Commander Depantsing, 26 seconds) is the provisional first candidate for owner review because the observed opening places the Commander close to a Defender and the street action is more readable than the distant encounter observed in `-fuITOqPR1Q` (The Commander Attacks, 28 seconds). `CQkpU3rfi1E` (Defender Gets Ballooninated, 28 seconds) opens from a Defender perspective with a purple beam; the balloon payoff was not verified. All three have dense HUD overlays. Titles and descriptions alone do not establish marketing suitability; the depantsing payoff was not fully verified either. No candidate has been promoted.

Research stopped when audio interfered with the owner's voice conversation. All three research YouTube tabs were explicitly closed successfully. The owner's final decision closes candidate review; no further browsing or playback is needed. Stats and Shop were subsequently approved as recorded above.

## Global light/dark revision

Owner approved the global theme revision and all 18 pages, then authorized final verification, commit, push and publication through the established Cloudflare workflow. The earlier no-deployment restrictions are superseded by this explicit release request.

### Studio-logo follow-up — local preview only

Latest owner direction supersedes the CSS-only logo preview below: generate a faithful dark-background studio-logo variant using the official transparent reference, and constrain the green homepage ribbon to the centered content width. Both require owner approval before publication. Ribbon is capped at 1240px, centered at wide widths, and presents all three taglines in a fitted mobile row. Two built-in imagegen attempts produced brighter logo drafts but lacked alpha. Owner explicitly authorized deterministic background cleanup. The cleaned first variant, `src/assets/brand/CSG-Logo_dark-v1.png`, is now integrated locally with genuine alpha (0–255), without a backing box, border or CSS glow. Original assets and production revision remain untouched. Desktop/mobile both themes and wide-screen previews, alpha/edge checks, homepage regression and build are verified; Owner reviewed the finished preview and approved it ("Yeah, that looks great"), authorizing publication of this follow-up.

The original redesign was published and verified at revision `b276246e9e81bc2ba5b8310f0b07fe166862370f`. The earlier CSS-only preview used `CSG-Logo_clean.png` without its cream CSS backing and with a 1px edge glow; owner requested a generated brighter variant instead. The similarly named `CSG-Logo_transparent.png` is opaque with a baked checkerboard and is not used. Navigation branding and NOPAS artwork/framing are unchanged. The required preview checkpoint is satisfied; this follow-up is authorized for commit, push and publication.

Owner requested meaningful dark mode throughout all 18 approved pages while retaining vivid accents, art, layout and content. The existing pre-paint initializer, toggle and saved preference worked; new page-specific styles had hardcoded cream backgrounds and dark foreground tokens, bypassing the shared theme. A browser regression check reproduced identical homepage content backgrounds in both modes before the fix.

`src/styles/comic-themes.css`, imported by BaseLayout, scopes dark semantic reading surfaces, foregrounds, labels and borders to the existing `data-theme` attribute. Neutral cards become navy, alternating reading sections become blue/plum, and asynchronously rendered Stats content inherits readable colors. Bright buttons, mode/ability panels, faction accents and illustrations retain their colors; no media filters or content changes. Shared supporting footer text and keyboard focus remain legible. All prior design approvals and the intentional featured-video removal remain in force.

Validation: `scripts/check-themes.mjs` checks all 18 routes in both themes at desktop/mobile (72 route/theme/viewport combinations) with full-page screenshots, overflow and no video/iframe checks. `scripts/audit-theme-contrast.mjs` checks 2,734 settled flat-background text instances across both themes, including open disclosures, with zero failures; gradients and image-backed text are excluded from numerical checks and assessed visually. `scripts/check-theme-states.mjs` verifies system preference, keyboard toggle/menu, persistence across navigation/reload, unchanged image sources/filters/opacity, representative open-details contrast, and Stats populated/empty/404/offline/loading states in both themes at both sizes. Test fixtures exist only in intercepted browser requests; production Stats source and API remain unchanged. Build passes 18 routes. Screenshot evidence is in `C:/Users/blaze/.codex/visualizations/2026/09/11/01a0917b-28c1-7223-9b80-955bc00d12ff/themes`. The theme revision is ready for owner review; no deployment.
