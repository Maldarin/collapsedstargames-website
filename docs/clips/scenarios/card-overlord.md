# Scenario: `card-overlord`

Square class-card loop for the Overlord page portrait slot (`overlord.astro`
`aspect-square`). One signature beat: the DePantsinator.

```yaml
id: card-overlord
slot: "/nopas/collectors/overlord — aspect-square portrait slot"
format: card
resolution: 800x800
fps: 24
duration_s: 3
loop: native-seamless
logline: "The Overlord fires the DePantsinator; a Citizen's pants pop off; the Overlord gives an unbothered shrug."
tone: "Centered, contained, comedic. Loop on the beam pulse so it reads as an endless 'middle-management menace' idle."
location: "Neutral staged area / void with the magenta radial glow that the page uses behind the portrait."
lighting: "Portrait key + magenta rim to match the page accent."
cast:
  - Overlord (center, hovering)
  - Citizen (Screamer) (small, lower frame, the target)
requires:
  - overlord-rig
  - DePantsinator-beam-vfx
  - citizen-pants-detach
fallback:
  - "citizen-pants-detach MISSING: clone + hide the jeans mesh, pop it off with a short tween + bounce."
camera:
  type: static
  marks: { mark: "front 3/4 on the Overlord, Citizen in lower third, both fully in frame with margin for the square crop" }
  fov: 40
beats:
  - { t: 0.0, action: "Overlord idle hover; raises DePantsinator" }
  - { t: 0.8, action: "beam fires (pulse)" }
  - { t: 1.2, action: "Citizen pants pop off + tiny hop" }
  - { t: 1.8, action: "Overlord shrug" }
  - { t: 2.6, action: "return to idle hover = loop point matches t=0" }
output:
  dest: "src/assets/clips/collectors/overlord/card.{webm,mp4}"
  budget: "< 1 MB webm"
```

**Notes:** For a true seamless loop, the Overlord's hover pose at the end must
match the start. Keep the Citizen small so the focus stays on the Overlord.
