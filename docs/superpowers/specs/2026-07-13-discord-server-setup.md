# Discord Server Setup — Pre-Public-Launch Pack

**Date:** 2026-07-13
**Server:** Not Our Pants, Alien Swine! (NOPAS) community · guild `1512237266800742570`
**Goal:** Organize the server, lock down staff channels, add a Roblox-verification gate, and populate every channel with launch-ready content — before opening to the public. Purpose is **hype/community AND playtest feedback, equally**.

This doc has three parts: **A. Design** (the decisions), **B. Channel content** (copy-paste), **C. Runbook** (do this in order).

---

## A. Design

### Structure (categories → channels)

**🛸 START HERE** — visible to everyone, even before verifying
- `#welcome` (read-only) · `#rules` (read-only) · `#verify` *(new — the Bloxlink gate)*

**📣 INFO** — Verified only
- `#announcements` · `#roadmap` · `#faq`

**💬 COMMUNITY** — Verified only
- `#general` · `#nopas-chat` · `#fan-art` · `#events` · 🔊 `General` (voice)

**🐛 PLAYTEST & FEEDBACK** — Verified (bug-reports); Tester (hub)
- `#bug-reports` (Verified) · `#playtester-hub` *(new — Tester only)*

**🔒 STAFF** — Moderator only, hidden from everyone else
- `#moderator-only` · `#mod-log` · `#bug-triage` · `#dev-chat` · `#content-calendar` · `#security-and-exploits`

### Roles

Current: `@everyone`, `Moderator` (3), `Server Booster` (auto), `NOPAS Bot`.

Add:
- **Verified** — Bloxlink grants on Roblox-account link. Unlocks INFO / COMMUNITY / #bug-reports.
- **Tester** — unlocks `#playtester-hub`. Bloxlink auto-assigns from a Roblox group (if you have one), otherwise assigned by hand.
- **Bloxlink** bot role — created when the bot is added.

**Hierarchy (top → bottom), critical:**
`Moderator` → `NOPAS Bot` → `Bloxlink` → `Server Booster` → `Tester` → `Verified` → `@everyone`

Both bots MUST sit above `Tester`/`Verified`: Bloxlink assigns those roles, and NOPAS Bot times-out/kicks members who hold them. (Discord blocks a role from managing/acting on a role above it.)

### Verification: Bloxlink (not our bot)

- **Bloxlink = the onboarding gate.** Users link their Roblox account → get **Verified** → the server unlocks. Standard for Roblox communities; blocks spam bots; gives real Roblox identity (alt-resistant); can auto-assign **Tester** from a Roblox group rank.
- **NOPAS Bot = moderation** (auto-filter, AI review, `/warn /mute /kick /ban`, anti-raid) — unchanged, runs alongside Bloxlink.

### Two bot-side tweaks

1. **Repoint mod-log** to the dedicated `#mod-log` channel (currently pointed at `#moderator-only`). One-line SQL against Neon (see Runbook step C-15).
2. **Reconcile anti-raid** with the gate: since unverified users can't see/post in channels behind the Bloxlink gate, the bot's per-user account-age restriction is largely redundant. Leave as-is (harmless) or set `minAccountAgeDays` to `0` to disable the per-user restrict while keeping mass-join lock. Config-only, no redeploy.

### Permission model

- **START HERE:** `@everyone` = View ✓, Send ✗ on #welcome/#rules; #verify = View ✓ (they click Bloxlink's button — no Send needed).
- **INFO / COMMUNITY / #bug-reports:** `@everyone` View ✗; `Verified` View ✓.
- **#playtester-hub:** override to `Tester` View ✓ only (remove Verified view on this one channel).
- **STAFF:** `@everyone` View ✗; `Moderator` View ✓.

### Open detail

- **Tester auto-role** depends on whether a **Roblox group** exists for testers. If yes → Bloxlink group-rank bind → Tester. If no → assign Tester by hand for now. Resolve during Bloxlink config (Runbook A-5).

---

## B. Channel content (copy-paste, NOPAS voice)

### #welcome
```
# 👽 Welcome to Not Our Pants, Alien Swine! 🩳

The official community for **NOPAS** — a fast, funny, class-based invasion game coming to Roblox. The alien Collectors want your pants. The United Pants Defense Force (UPDF) says: not today.

🔑 **To unlock the server, link your Roblox account in #verify.**
Once you're verified you'll get the **Verified** role and see every channel — chat, fan art, the roadmap, bug reports, and more.

New here? Read **#rules**, then say hi in **#general**.
Earth has pants. We have beams. Let's go. 🛸
```

### #rules
```
# 📜 NOPAS Community Rules

Welcome, Defender (or Collector). Keep it fun and keep it safe:

**1. Keep it family-friendly.** NOPAS is a Roblox game — chat stays clean, silly, and safe. Don't try to sneak past filters.
**2. Be respectful.** No harassment, bullying, hate speech, threats, or personal attacks. Treat everyone like a teammate.
**3. No NSFW or disturbing content.** No sexual content, gore, or creepy behavior. Ever.
**4. Protect your privacy.** Never share personal info — real names, addresses, phone numbers, socials, or your age — and don't ask others for theirs.
**5. No spam or self-promo.** No unsolicited links, ads, server invites, or DMing members to promote things.
**6. No cheats, exploits, or leaks.** Don't share hacks/exploits or leak private test content. Found a security issue? DM a mod.
**7. Listen to staff.** Moderators have the final say. If you're unsure, ask.

Breaking rules can mean a warning, timeout, kick, or ban. Staying here means you agree to these rules plus Discord's Terms of Service and Community Guidelines.
```

### #verify
```
# ✅ Verify to unlock the server

We use **Bloxlink** to link your Roblox account. It takes about 30 seconds and unlocks all the channels.

**How to verify:**
1. Click the **Verify** button below (or type `/verify`).
2. Follow Bloxlink's steps to link your Roblox account.
3. Done — you'll get the **Verified** role and the rest of the server appears! 🎉

Why we do this: it keeps the community safe, blocks spam bots, and lets us hand testers their **Tester** role automatically.

Trouble verifying? Ping a **@Moderator** here and we'll help.
```
*(The actual "Verify" button is posted by Bloxlink — see Runbook A-4.)*

### #announcements  *(pin this)*
```
# 📣 The NOPAS community is officially open! 👽🩳

Thanks for being here early. This is home base for **Not Our Pants, Alien Swine!** as we march toward the Roblox launch.

What to do right now:
• ✅ Verify in #verify to unlock everything
• 🗺️ Peek at the #roadmap to see what we're building
• 🐛 Hunt bugs and share feedback in #bug-reports
• 🎨 Post your Collector/Defender art in #fan-art
• 💬 Hang out in #general and #nopas-chat

Big updates — including playtest drops — land here. Turn on notifications so you don't miss them.
Earth has pants. We have beams. See you out there. 🛸
```

### #roadmap  *(pin this)*
```
# 🗺️ NOPAS Roadmap

Where we are and where we're headed — a living post we update as things move.

**✅ Now**
• Core classes online: the Collectors (Overlord, Commander, Minions) vs. the UPDF defenders
• Community server open + playtesting ramping up

**🔜 Next**
• Wider playtests — verify and watch #announcements for access
• Map & mode polish
• Balance passes driven by your #bug-reports and feedback

**🎯 Later**
• Public Roblox launch
• More classes, maps, and cosmetics

Dates are goals, not promises — game dev is wobbly, and your feedback shapes the order. 💜
```

### #faq  *(pin this)*
```
# ❓ Frequently Asked Questions

**What is NOPAS?**
"Not Our Pants, Alien Swine!" — a fast, funny, class-based invasion game. The alien Collectors try to steal Earth's pants; the United Pants Defense Force (UPDF) defends. Coming to Roblox.

**When does it release?**
It's in development — follow #announcements and #roadmap. No confirmed date yet.

**How do I get to play or test it?**
Playtesting runs through this server. Verify in #verify, watch #announcements, and testers get access plus a **Tester** role.

**What platforms?**
It's on Roblox — PC, Mobile, and Console (anywhere Roblox runs).

**How much does it cost?**
Free to play on Roblox.

**How do I report a bug?**
Use the template in #bug-reports.

**How do I become a moderator?**
We're not recruiting mods right now — be a great community member and we'll notice.

**Who makes NOPAS?**
Collapsed Star Games. 👋
```

### #bug-reports  *(pin this)*
```
# 🐛 Report a Bug

Help us squash bugs! Please use this format (answer what you can):

**Platform:** PC / Mobile / Console
**Roblox username:**
**What happened:**
**Steps to reproduce:**
**Expected behavior:**
**Screenshot / video:** (if you have one)
**Private server or public match:**
**Time it happened:**

One bug per message keeps things trackable. Thanks, bug hunters! 🔍
```

### #playtester-hub  *(pin this)*
```
# 🧪 Playtester Hub

Welcome, tester — you're on the front line. 🫡

**Your mission:**
• Play the latest test builds and try to break things (on purpose).
• Report anything weird in #bug-reports using the template.
• Share honest feedback here — what's fun, what's confusing, what's missing.

**Ground rules:**
• Test content is confidential — no leaks, streams, or outside screenshots unless we say it's okay.
• Be constructive and specific: "The Commander's rocket jump launches me through the floor on the alley map" beats "it's broken."

Thank you for helping make NOPAS great. 🛸
```

---

## C. Runbook (do these in order)

### Phase A — Bloxlink + roles
- **A-1.** Add **Bloxlink**: go to `blox.link` → *Add Bloxlink to Server* → authorize → pick this server. Grant the permissions it asks for (it needs Manage Roles).
- **A-2.** Create roles (Server Settings → Roles → Create Role): **Verified**, **Tester**.
- **A-3.** Fix hierarchy — drag roles so top→bottom is: `Moderator`, `NOPAS Bot`, `Bloxlink`, `Server Booster`, `Tester`, `Verified`, `@everyone`. (Both bots ABOVE Tester/Verified.)
- **A-4.** Configure Bloxlink to grant **Verified** on link: Bloxlink dashboard (`blox.link/dashboard` → this server → Verification) → set the verified/entry role to **Verified**. Then post Bloxlink's verification message/button in **#verify** (Bloxlink command, e.g. `/verify` message or its dashboard "verification channel" setting).
- **A-5.** *(If you have a Roblox group for testers)* Bloxlink → Binds → bind the group rank → **Tester** role. Otherwise assign **Tester** by hand for now.

### Phase B — Categories + channels
- **B-1.** Create categories (right-click the channel list → Create Category): `🛸 START HERE`, `📣 INFO`, `💬 COMMUNITY`, `🐛 PLAYTEST & FEEDBACK`, `🔒 STAFF`.
- **B-2.** Create the two new channels: `#verify` (in START HERE), `#playtester-hub` (in PLAYTEST & FEEDBACK).
- **B-3.** Drag existing channels into place:
  - START HERE: welcome, rules, verify
  - INFO: announcements, roadmap, faq
  - COMMUNITY: general, nopas-chat, fan-art, events, 🔊 General
  - PLAYTEST & FEEDBACK: bug-reports, playtester-hub
  - STAFF: moderator-only, mod-log, bug-triage, dev-chat, content-calendar, security-and-exploits

### Phase C — Permissions + content
- **C-1.** START HERE category → Edit → Permissions: `@everyone` View Channels ✓. Then on #welcome and #rules, set `@everyone` Send Messages ✗ (read-only).
- **C-2.** For **INFO**, **COMMUNITY**, and **PLAYTEST & FEEDBACK** categories → Permissions: `@everyone` View Channels ✗; add `Verified` → View Channels ✓. Use "sync channels to category" so all children inherit.
- **C-3.** `#playtester-hub` → Edit channel → Permissions (override the category): `Verified` View Channels ✗, `Tester` View Channels ✓.
- **C-4.** **STAFF** category → Permissions: `@everyone` View Channels ✗; `Moderator` View Channels ✓. Sync channels.
- **C-5.** Confirm **NOPAS Bot** can view the public channels (so auto-filter/AI review work) and **Bloxlink** can view #verify.
- **C-6.** Paste the Part-B content into each channel and **pin** the welcome/rules/verify/announcements/roadmap/faq/bug-reports/playtester-hub posts.

### Phase D — Bot config + go-live
- **D-1 (mod-log repoint).** Right-click `#mod-log` → Copy Channel ID. Then run in Neon SQL Editor (swaps only the mod-log target; alerts stay on #moderator-only):
  ```sql
  UPDATE guild_config
  SET data = jsonb_set(data, '{modLogChannelId}', '"PASTE_MOD_LOG_CHANNEL_ID"')
  WHERE guild_id = '1512237266800742570';
  ```
- **D-2 (optional anti-raid tweak).** To disable the per-user account-age restrict (redundant behind the gate) while keeping mass-join lock:
  ```sql
  UPDATE guild_config
  SET data = jsonb_set(data, '{minAccountAgeDays}', '0')
  WHERE guild_id = '1512237266800742570';
  ```
- **D-3 (test with an alt / friend).** Join fresh → you should see ONLY the START HERE channels → verify via Bloxlink → get **Verified** → the rest appears. Confirm a Verified non-mod account cannot see any STAFF channel.
- **D-4.** Post the #announcements welcome message and open the doors. 🎉

---

## Notes / future
- A **mod-action channel mirror** already posts `/warn /mute /kick /ban` into the mod-log channel (once D-1 repoints it to #mod-log).
- Slash commands are **guild-scoped** now, so they appear instantly.
- If you later want live, hands-on tweaking by Claude, we can stand up a **Discord MCP** (Phase 4 of the bot roadmap). See [[discord-bot-project]].
