# Deploy: Cloudflare Pages + GoDaddy Domain

The site builds as static Astro and deploys to Cloudflare Pages, with the
`collapsedstargames.com` domain (currently at GoDaddy) pointed at Cloudflare.

**Recommended setup:** move DNS to Cloudflare entirely. Keep the domain
registration at GoDaddy, just change the nameservers. This unlocks Cloudflare
Pages' automatic apex-domain handling and gets you free TLS, CDN, and DDoS
protection without paying for anything.

---

## One-time setup

### Step 1 — Push the repo to GitHub

Cloudflare Pages deploys from GitHub. If the website repo isn't on GitHub yet:

```bash
cd D:/Projects/collapsedstargames-website
git init
git add .
git commit -m "Initial commit: studio site + NOPAS pages + lore"
```

Create a new repo on GitHub (`collapsedstargames-website`), then:

```bash
git remote add origin https://github.com/<your-user>/collapsedstargames-website.git
git branch -M main
git push -u origin main
```

### Step 2 — Create a Cloudflare account

[Sign up at cloudflare.com](https://cloudflare.com/) (free). The Pages tier is
free for unlimited sites, 500 builds/month, unlimited bandwidth.

### Step 3 — Connect Cloudflare Pages to the GitHub repo

1. Cloudflare dashboard → **Workers & Pages** → **Create application** →
   **Pages** tab → **Connect to Git**
2. Authorize Cloudflare's GitHub app, give it access to `collapsedstargames-website`
3. Pick the repo → **Begin setup**

**Build configuration:**

| Field | Value |
|---|---|
| Production branch | `main` |
| Framework preset | **Astro** (Cloudflare auto-detects) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(empty)* |
| Environment variables | *(none required)* |

Save and deploy. First build typically completes in ~60–90 seconds. You'll get
a default URL like `collapsedstargames-website.pages.dev` immediately.

**Verify the default URL works** before touching DNS — open the .pages.dev URL
and click through every page. Theme toggle, all class pages, the lore page,
images, fonts — confirm they all load. Catching issues here is much easier
than after the custom domain is wired up.

### Step 4 — Add the custom domain in Cloudflare Pages

In the Pages project → **Custom domains** → **Set up a custom domain** →
enter `collapsedstargames.com`.

Cloudflare will tell you it needs control of DNS to manage the apex domain.
Two options:

**Option A — Move DNS to Cloudflare (recommended).** Cloudflare adds your
domain as a free Site, gives you two nameservers, and handles everything from
there.

**Option B — Keep DNS at GoDaddy.** Apex domains require A records pointing to
Cloudflare Pages' IPs. More setup, more brittle. Skip this unless you have a
specific reason.

---

## Option A — Move DNS to Cloudflare (recommended)

### Step 5A.1 — Add the domain as a Cloudflare Site

Cloudflare dashboard → **Add a Site** → enter `collapsedstargames.com` → pick
**Free** plan.

Cloudflare scans your existing GoDaddy DNS and imports records. Review them
carefully — anything you have set up (email forwarding, etc.) should be
preserved. Confirm import.

### Step 5A.2 — Change nameservers at GoDaddy

Cloudflare gives you two nameservers like:

```
ada.ns.cloudflare.com
liam.ns.cloudflare.com
```

(Yours will be different — copy them from Cloudflare's setup page.)

In **GoDaddy → My Products → Domain Settings → Nameservers** for
`collapsedstargames.com`:

1. Choose **Custom nameservers**
2. Replace GoDaddy's defaults with the two Cloudflare nameservers
3. Save

DNS propagation usually takes **5–30 minutes** but can take up to 48 hours.
Cloudflare emails you when the change is verified.

### Step 5A.3 — Cloudflare Pages auto-configures records

Once Cloudflare controls DNS, go back to the Pages project's **Custom domains**
tab. Cloudflare automatically adds the right records:

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `@` (apex) | `<project>.pages.dev` | Proxied (orange cloud) |
| CNAME | `www` | `collapsedstargames.com` | Proxied (orange cloud) |

The orange-cloud proxy enables free TLS, CDN edge caching, and DDoS shielding.
**Leave it on** unless you have a specific reason to bypass.

### Step 5A.4 — Verify

Wait ~5 minutes after nameserver propagation, then:

```bash
curl -I https://collapsedstargames.com
curl -I https://www.collapsedstargames.com
```

Both should return `HTTP/2 200` with a `cf-ray` header. SSL is automatic.

---

## Option B — Keep DNS at GoDaddy (only if you must)

In GoDaddy DNS for `collapsedstargames.com`, add:

| Type | Host | Points to | TTL |
|---|---|---|---|
| CNAME | `www` | `<project>.pages.dev` | 600 |
| A | `@` | *(see below — multiple A records)* | 600 |

For the apex, Cloudflare Pages doesn't publish stable A records, so this is
ugly. The cleanest path is to use a third-party ANAME / ALIAS service like
[Hover](https://hover.com/) or move DNS to Cloudflare anyway. **Strongly
prefer Option A.**

---

## Ongoing deployment

Every push to `main` triggers a Cloudflare Pages build. Build status is
visible in the Pages dashboard.

**Preview deploys:** any push to a non-main branch deploys to a preview URL
like `<branch-name>.collapsedstargames-website.pages.dev`. Great for review
before merging.

**Roll back:** Pages dashboard → **Deployments** → pick a previous successful
deploy → **Rollback to this deployment**. Instant, no rebuild.

**Manual rebuild:** Pages dashboard → **Deployments** → **Retry deployment**
on the latest, or click **Create deployment** to trigger one without a new
commit.

---

## Performance / cache tips

Astro outputs static files with content-hashed filenames (`hero.BixbHC6B.webp`).
Cloudflare caches these aggressively by default, which is correct — changes
produce new filenames, so cache invalidation is automatic.

For the HTML files (which don't have hashed names), Cloudflare's default is
to cache for 2 hours. If you want faster propagation of HTML changes, you can
override:

Cloudflare dashboard → **Caching → Cache Rules** → **Create rule**:

- Match: `Hostname equals collapsedstargames.com AND URI Path ends with .html`
- Action: Edge TTL = 1 minute

Or just leave it — 2 hours is fine for a marketing site that updates a few
times a week.

---

## Cost expectations

| Service | Tier | Cost |
|---|---|---|
| Cloudflare Pages | Free | $0 (unlimited bandwidth, 500 builds/month) |
| Cloudflare DNS / proxy | Free | $0 |
| GoDaddy domain renewal | Standard | ~$15/year |
| GitHub (public repo) | Free | $0 |

Total ongoing: **~$15/year**, which is just the domain registration. The site
itself is free to host at any reasonable scale.

If the site goes viral and burns through the free build minutes (extremely
unlikely for a marketing site with weekly updates), upgrade to Pages Pro
($20/month, 5,000 builds/month).

---

## Troubleshooting

**Build fails with "Cannot find module" in Cloudflare**
Verify `package.json` has all dependencies under `dependencies` (not
`devDependencies` — Cloudflare runs `npm install`, not `npm install --dev`).
Astro itself, Tailwind, sharp (for image processing), and Playwright (if used
in build scripts) all need to be regular dependencies.

**Site shows old content after a deploy**
Browser cache. Hard refresh (Ctrl+Shift+R) or open in incognito. If still
stale after several minutes, Cloudflare's edge cache is at fault — go to
**Caching → Configuration → Purge Everything** and refresh.

**Theme toggle resets on every page navigation**
This shouldn't happen — the toggle persists via `localStorage`. If it does,
verify the inline `<script is:inline>` in `BaseLayout.astro` is being served
unmodified (some build optimizers strip inline scripts).

**Images don't load in production but work in dev**
Check that `astro:assets` imports use relative paths from `src/assets/`,
not absolute paths or `public/` paths. Astro's image pipeline only optimizes
files under `src/assets/`.

**Custom domain pending forever**
DNS propagation can be slow. Check at [dnschecker.org](https://dnschecker.org)
— if nameservers haven't propagated to most of the world yet, just wait.
Cloudflare's email confirmation is the source of truth.

**404 on a page that exists**
Astro generates pretty URLs by default (`/lore/` → `lore/index.html`). If a
specific page 404s in production but works in dev, check that the file is at
`src/pages/<path>/index.astro` (not just `<path>.astro` — trailing-slash
preference matters). Cloudflare's default is to respect trailing slashes.

---

## Pre-launch checklist

Before flipping DNS to point at Cloudflare:

- [ ] All pages tested in both light + dark mode in the `.pages.dev` URL
- [ ] All asset paths working (logo, class portraits, citizen images, battle scenes)
- [ ] Theme toggle persists across navigation
- [ ] Open Graph image set on each page (`ogImage` prop on BaseLayout)
- [ ] Meta descriptions reasonable on each page
- [ ] No broken links (use `npx broken-link-checker https://<project>.pages.dev`)
- [ ] Favicon visible in browser tabs
- [ ] Mobile layout sane (test at iPhone-12 width: 390px)
- [ ] Footer year auto-updates (it does — uses `new Date().getFullYear()`)
- [ ] Lore canon respected (no "planet", no "Alabama", no contradictions)

When all of the above pass, switch nameservers at GoDaddy and you're live.
