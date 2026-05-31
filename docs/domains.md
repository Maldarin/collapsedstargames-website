# Domains: NOPAS forwarding (GoDaddy)

The game lives at `https://collapsedstargames.com/nopas/` (canonical host).
Two extra domains redirect into it. Both are registered at **GoDaddy** and use
GoDaddy's free **Domain Forwarding** (301) — no Cloudflare zone needed for them.

| Domain | Forwards to | Type |
|---|---|---|
| `nopasgame.com` (+ `www`) | `https://collapsedstargames.com/nopas/` | Permanent (301) |
| `nopasgame.shop` (+ `www`) | `https://collapsedstargames.com/shop/` | Permanent (301) |

## Setup steps (per domain)

Do this **after** the site has deployed with the `/nopas/` and `/shop/` pages
live (otherwise the forward lands on a 404 until the next deploy).

1. **GoDaddy → My Products** → find the domain → **DNS** / **Manage** →
   **Forwarding** (under "Additional Settings" or the **Forwarding** tab).
2. **Add forwarding** (Domain, not Subdomain):
   - **Forward to:** the target URL from the table above (include `https://`
     and the trailing `/nopas/` or `/shop/`).
   - **Forward type:** **Permanent (301)** — *not* Temporary (302). 301 transfers
     SEO authority and is cached by browsers/search engines.
   - **Settings:** **Forward only** (do *not* pick "Forward with masking" —
     masking hides the real URL in an iframe and breaks SEO + deep links).
3. **Save.** GoDaddy may prompt to update the domain's nameservers/records to
   its forwarding service — accept it.
4. GoDaddy provisions a TLS certificate for the forward automatically; this can
   take a few minutes up to ~an hour. Until then `https://` may show a brief
   certificate warning. `http://` works immediately.

Repeat for both domains. GoDaddy forwarding covers the apex and `www`
automatically.

## Verify

After the cert provisions:

```bash
curl -sI https://nopasgame.com   | findstr /I "HTTP location"
curl -sI https://nopasgame.shop  | findstr /I "HTTP location"
```

Expect `HTTP/.. 301` and a `Location:` header pointing at the target URL.
Then open each in a browser and confirm it lands on the live page.

## Old /game/ links

Handled in-app, not at the registrar: `public/_redirects` 301s every
`/game/...` path to the matching `/nopas/...` path on Cloudflare Pages. Nothing
to configure in GoDaddy for that.

## If `.shop` becomes a real store later

Registrar forwarding is throwaway. When you build an actual storefront, move
`nopasgame.shop` onto its own Cloudflare Pages project (or a store host) and
drop the GoDaddy forward. See `docs/deploy.md` for the Cloudflare Pages pattern.
