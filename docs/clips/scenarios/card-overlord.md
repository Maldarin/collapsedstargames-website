# Scenario: `card-overlord`

Square class-card loop for the Overlord page portrait slot (`overlord.astro`
`aspect-square`). One signature beat: the De-Pantsinator channel.

> **Canonical:** the De-Pantsinator is a **3-second held channel** — a **red beam**
> (`Color3 255,50,50`) from the weapon to the target plus a **red aura**
> (`255,50,50`, Brightness 5) that **grows** on the target, ending in a **white
> flash** and an instant swap to **safety shorts**. There is NO detaching/
> popping-off pants mesh. For a seamless card loop, loop the **channel hold** (beam
> on + aura pulsing) — that's the canonical, loopable "menace idle."

```yaml
id: card-overlord
slot: "/nopas/collectors/overlord — aspect-square portrait slot"
format: card
resolution: 800x800
fps: 24
duration_s: 3
loop: native-seamless
logline: "The Overlord holds the red De-Pantsinator beam on a small Citizen; the red aura pulses as the channel works; the Overlord stays smugly unbothered."
tone: "Centered, contained, comedic. Loop on the beam-hold + aura pulse so it reads as an endless 'middle-management menace' channel."
location: "Neutral staged area / void with the magenta radial glow that the page uses behind the portrait."
lighting: "Portrait key + magenta rim to match the page accent; the red beam/aura are the live key on the Citizen."
cast:
  - Overlord (center, hovering, holding the beam)
  - Citizen (Screamer) (small, lower frame, the frozen target)
requires:
  - overlord-rig
  - DePantsinator-beam-vfx     # red beam 255,50,50 + growing/pulsing red aura
fallback:
  - "DePantsinator-beam-vfx MISSING in staging: red Neon beam (255,50,50) Overlord->Citizen + a red aura sphere/PointLight on the Citizen that pulses in scale/brightness on a loop."
camera:
  type: static
  marks: { mark: "front 3/4 on the Overlord, Citizen in lower third, both fully in frame with margin for the square crop" }
  fov: 40
beats:
  - { t: 0.0, action: "Overlord hovers, beam on the Citizen, aura at a low pulse" }
  - { t: 1.0, action: "aura swells (channel building); Overlord unbothered" }
  - { t: 2.0, action: "aura pulses brightest" }
  - { t: 2.9, action: "aura eases back to the low pulse = loop point matches t=0" }
output:
  dest: "src/assets/clips/collectors/overlord/card.{webm,mp4}"
  budget: "< 1 MB webm"
```

**Notes:** Loop the **channel** (beam + aura pulse) rather than the one-shot
completion — the depants finish (white flash → safety shorts) doesn't loop. If a
finish is wanted, make a separate non-looping variant. Keep the Citizen small so
focus stays on the Overlord.
