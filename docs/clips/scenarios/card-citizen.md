# Scenario: `card-citizen`

Square class-card loop for the Citizen page. Pure comedy beat: Pure Panic.

> **Canonical:** Citizens are **non-combat** — `ClassConfig.Citizen.weapons = {}`
> (no weapons, no gadgets). There is **no "Pocket Sand"** and the design's emote-
> distraction is **not implemented**. The real, implemented Citizen behavior is the
> **panic**: when depantsed they ragdoll, then **panic-run** (`PANIC_SPEED 23.4`)
> toward the map edge with hands up, and despawn. The helplessness *is* the joke —
> the Citizen flails; it never fights back.

```yaml
id: card-citizen
slot: "/nopas/defenders/citizen — aspect-square portrait slot"
format: card
resolution: 800x800
fps: 24
duration_s: 3
loop: palindrome
logline: "A Citizen (the Screamer) flails in full helpless panic as a Minion looms — hands flying, no weapon, pure 'NOT MY PANTS' energy."
tone: "'AAAAHHH! NOT MY PANTS!' Maximum zany. This is the comedy engine of the game — the Citizen is defenseless, so the joke is the flailing panic itself. Ridiculous, centered, big."
location: "Neutral staged area; golden citizen accent (#ffc14d)."
lighting: "Bright, flat, friendly key — this one's a joke, not a hero shot."
cast:
  - Citizen (Screamer) (center)
  - Minion (looms in from one side)
requires:
  - citizen-rig
  - citizen-panic              # flail -> hands-up panic (the real depants reaction)
  - minion-rig
fallback:
  - "citizen-panic MISSING: rapid arm-flail emote + small hop/jitter; hands-up cower as the minion nears. NO weapon/gadget — the Citizen has none."
camera:
  type: static
  marks: { mark: "front, centered on the Citizen, minion entry edge visible" }
  fov: 45
beats:
  - { t: 0.0, action: "Citizen mid-panic flail" }
  - { t: 0.6, action: "Minion looms in; Citizen throws hands up, recoiling" }
  - { t: 1.0, action: "Citizen panic-flails harder / bolts a step back (no counterattack — it has no weapon)" }
  - { t: 1.4, action: "Citizen keeps flailing helplessly" }
output:
  dest: "src/assets/clips/defenders/citizen/card.{webm,mp4}"
  budget: "< 1 MB webm"
```

**Notes:** Palindrome works great — a flail bouncing forward/back reads as
continuous panic. This is the most shareable card; the comedy is the
defenselessness. Optional alt beat: catch the Citizen getting depantsed (red beam
→ safety shorts) and panic-running — also fully canonical.
