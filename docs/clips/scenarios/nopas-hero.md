# Scenario: `nopas-hero` ⭐

The marquee clip. The De-Pantsinator — the game's signature mechanic — shown as
the money shot, **exactly as it plays in-game**: a Collector holds the red
de-pants beam on a Citizen, a red aura swells over the 3-second channel, then a
white flash and the victim instantly swaps to silly safety shorts and panics.

> **Canonical mechanic (do not invent):** The De-Pantsinator does **0 damage**.
> It is a **3-second held channel** (`WeaponConfig.DePantsinator.channelDuration = 3`).
> `DepantsClientSystem` draws a **red beam** (`Color3 255,50,50`, LightEmission
> 0.8) from the weapon to the target plus a **red aura** (`255,50,50`,
> Brightness 5) that **grows** around the target as the channel fills. The target
> is **frozen** for the duration. On completion: a **white Neon flash/puff**
> (`Color3 1,1,1`), the target's pants are destroyed and replaced with a
> **`SafetyShorts`** Pants (family-friendly), feet recolor to skin tone, then the
> target **ragdolls** (~0.5s drop + 1.5s ragdoll + 0.5s getup) and **panic-runs**
> (`PANIC_SPEED 23.4`) toward the map edge with hands up. **There is no pants
> object that detaches, flies, or travels up any beam.** The mothership beam is a
> separate endgame/teleport system — it is NOT part of depantsing.

```yaml
id: nopas-hero
slot: "/nopas — hero section backdrop"
format: hero
resolution: 1920x1080
fps: 30
duration_s: 7
loop: palindrome
logline: "An Overlord holds the red De-Pantsinator beam on a panicking Citizen; the red aura swells over the 3s channel, a white flash pops, and the Citizen is left in silly safety shorts mid-flail."
tone: "The money shot, played straight to the mechanic. Low 3/4 hero angle on the victim, the red beam + swelling aura as the key light; a punch-in lands on the flash-and-shorts payoff. Action-movie framing, comedy result."
location: "Open Suburbia residential street (well clear of the mothership's footprint at origin — shoot near the houses so the sky reads as sky, not ship belly)."
lighting: "Late-afternoon golden hour; the red beam + red aura are the dominant key light on the Citizen during the channel."
cast:
  - Overlord (foreground-left, hovering, holding the beam)
  - Citizen (center, the target — frozen, then depantsed)
  - 1-2x Minion (background, ambient menace, optional)
requires:
  - overlord-rig
  - DePantsinator-beam-vfx     # red beam 255,50,50 + growing red aura + white completion flash
  - safety-shorts-swap         # SafetyShorts Pants + skin-tone feet (DepantsServerSystem)
  - citizen-panic              # ragdoll -> panic-run, hands up
fallback:
  - "DePantsinator-beam-vfx MISSING in edit/staging: build a red Neon beam (255,50,50) weapon->target + a red PointLight/aura sphere that scales up over 3s + a white Neon flash sphere that pops and fades at completion. Match DepantsClientSystem colors exactly."
  - "safety-shorts-swap: at completion, swap the Citizen's Pants to a bright safety-shorts look (or recolor upper legs to shorts + lower legs/feet to skin). Never expose — always shorts/long-johns."
  - "citizen-panic: at completion, brief recoil/ragdoll then a hands-up flail; a CFrame jitter ~1s reads as panic for a still cinematic."
camera:
  type: scripted
  marks:
    markA: "low 3/4 on the Citizen, Overlord in left third, holding the beam (push-in start)"
    markB: "tighter punch-in landing on the white flash + safety-shorts reveal"
  fov: 50
beats:
  - { t: 0.0, action: "camera slow push-in A->B; Overlord raises the De-Pantsinator and the red beam connects to the Citizen" }
  - { t: 0.3, action: "Citizen freezes; red aura begins to swell around them" }
  - { t: 3.0, action: "aura at full; WHITE FLASH/PUFF — channel completes" }
  - { t: 3.3, action: "pants swap to safety shorts; Citizen recoils/ragdolls" }
  - { t: 4.5, action: "Citizen pops up into a hands-up panic flail" }
  - { t: 6.5, action: "settle for loop point (Overlord smug, Citizen mid-panic in shorts)" }
output:
  dest: "src/assets/clips/nopas/hero.{webm,mp4}"
  budget: "< 2 MB webm"
```

**Notes:** This is the single most important clip on the site. The readable
story is **red beam → swelling red aura → white flash → silly shorts + panic** —
that IS the game. Keep the Citizen's silhouette clean and the red aura strong as
the channel fills (it's the tension build). The safety-shorts reveal + flail is
the comedy payoff; play the flash big. Shoot extra takes. Coordinates are
placeholders — the harness places cast/camera sensibly and reports the marks it
used, to be hardened here after the first good take.
