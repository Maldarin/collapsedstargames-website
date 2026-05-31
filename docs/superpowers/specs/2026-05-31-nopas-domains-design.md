# NOPAS domains + `/game/` → `/nopas/` rename — design

**Date:** 2026-05-31
**Status:** Approved (design), pending implementation

## Goal

Two newly purchased domains — `nopasgame.com` and `nopasgame.shop` (both
registered at GoDaddy) — should drive traffic to the game section of
`collapsedstargames.com`. As part of this, rename the game's route from
`/game/` to `/nopas/` so the canonical URL matches the brand (the game is
"Not Our Pants, Alien Swine!" → **NOPAS**), without breaking any existing
links.

`collapsedstargames.com` stays the canonical host. The new domains 301-redirect
into it.

## Decisions

| Question | Decision |
|---|---|
| Domain behavior | Redirect new domains **and** rename route to `/nopas/` |
| Canonical host | `collapsedstargames.com` (new domains redirect to it) |
| Visible labels | Hybrid — acronym **NOPAS** in nav/buttons; full title + "fast, funny… invasion game" tagline stays on the page |
| `.shop` intent | Reserve for a future store — gets a "coming soon" placeholder page now |
| New-domain redirect mechanism | **GoDaddy registrar domain forwarding** (301, HTTPS) |

## Part A — Code changes

All changes are in this Astro static site (deployed to Cloudflare Pages).

### A1. Rename route folder
`src/pages/game/` → `src/pages/nopas/` (git mv). This moves:
- `index.astro` (game landing)
- `defenders/` (index + athlete, citizen, dr-peepers, needle-eye,
  security-officer, tailor-engineer)
- `collectors/` (index + commander, overlord)

Astro derives URLs from folder structure, so this changes `/game/...` →
`/nopas/...` for the whole tree.

### A2. Update internal links (~40 occurrences across 13 files)
Replace every `href="/game/..."` with `href="/nopas/..."`. Affected files:
- `src/layouts/BaseLayout.astro` (nav)
- `src/pages/index.astro` (homepage featured-game links ×2)
- `src/pages/lore/index.astro` (cross-links ×5)
- All moved pages' breadcrumbs and "next class" cross-links

Verification: after changes, `grep -r "/game/"` over `src/` must return **zero**
matches.

### A3. Label changes (hybrid branding)
- `BaseLayout.astro` nav: `The Game` → `NOPAS`
- `index.astro` button text: `Explore the game →` → `Explore NOPAS →`
  (and its `aria-label` accordingly)
- No change to the game page hero: it already shows the full
  "Not Our Pants, Alien Swine!" logo + tagline, which is the "+ tagline" half
  of the hybrid choice.

### A4. Old-URL redirects
Add `public/_redirects` (Cloudflare Pages native, copied verbatim into `dist/`):
```
/game/*  /nopas/:splat  301
```
Path-preserving: `/game/defenders/citizen/` → `/nopas/defenders/citizen/`.
Ensures old/shared/indexed links and bookmarks never 404.

### A5. `.shop` placeholder page
New `src/pages/shop/index.astro` — a "NOPAS Shop — Coming Soon" holding page
using `BaseLayout` and the existing site styling. Reserves the slot; the
`.shop` domain forwards here. No store logic now.

## Part B — GoDaddy domain forwarding (user-executed)

For each new domain, in **GoDaddy → My Products → domain → Domain Forwarding**:

| Domain | Forward to | Type | Settings |
|---|---|---|---|
| `nopasgame.com` | `https://collapsedstargames.com/nopas/` | Permanent (301) | Forward only, HTTPS, update nameservers if prompted |
| `nopasgame.shop` | `https://collapsedstargames.com/shop/` | Permanent (301) | Forward only, HTTPS |

Notes:
- Use **Permanent (301)**, not temporary (302), so search engines transfer
  authority and remember the redirect.
- Enable forwarding for both the apex and `www` (GoDaddy's forwarding covers
  both by default).
- GoDaddy may take a few minutes to an hour to issue the forwarding TLS cert;
  the redirect can briefly show a cert warning until it provisions.

Documented in `docs/domains.md` with the exact click-path.

## Out of scope (YAGNI)
- Building an actual store for `.shop`.
- Moving the new domains' DNS to Cloudflare (registrar forwarding is enough;
  revisit if `.shop` becomes a real storefront).
- Any redesign of the game pages beyond the label tweaks above.

## Verification checklist
- [ ] `npm run build` succeeds; `dist/nopas/index.html` exists, no `dist/game/`.
- [ ] `dist/_redirects` present with the `/game/*` rule.
- [ ] `dist/shop/index.html` exists.
- [ ] No `/game/` href remains in `src/`.
- [ ] Nav shows "NOPAS"; homepage button shows "Explore NOPAS".
- [ ] (Post-deploy) `nopasgame.com` → `/nopas/`, `nopasgame.shop` → `/shop/`,
      old `/game/...` paths 301 to `/nopas/...`.
