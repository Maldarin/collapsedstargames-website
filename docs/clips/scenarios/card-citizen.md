# Scenario: `card-citizen`

Square class-card loop for the Citizen page. Pure comedy beat: Pure Panic +
Pocket Sand.

```yaml
id: card-citizen
slot: "/nopas/defenders/citizen — aspect-square portrait slot"
format: card
resolution: 800x800
fps: 24
duration_s: 3
loop: palindrome
logline: "A Citizen (the Screamer) flails in full panic, then flings Pocket Sand into an approaching Minion's face."
tone: "'AAAAHHH! NOT MY PANTS!' Maximum zany. This is the comedy engine of the game — let it be ridiculous, centered, big."
location: "Neutral staged area; golden citizen accent (#ffc14d)."
lighting: "Bright, flat, friendly key — this one's a joke, not a hero shot."
cast:
  - Citizen (Screamer) (center)
  - Minion (enters from one side)
requires:
  - citizen-rig
  - citizen-panic-anim
  - pocket-sand-vfx
  - minion-rig
fallback:
  - "citizen-panic-anim MISSING: rapid arm-flail emote + small hop jitter."
  - "pocket-sand-vfx MISSING: a burst ParticleEmitter of sandy particles toward the minion + the minion recoiling."
camera:
  type: static
  marks: { mark: "front, centered on the Citizen, minion entry edge visible" }
  fov: 45
beats:
  - { t: 0.0, action: "Citizen mid-panic flail" }
  - { t: 0.6, action: "Minion enters; Citizen reaches into pocket" }
  - { t: 1.0, action: "Pocket Sand burst into the minion's face" }
  - { t: 1.4, action: "minion recoils, paws at face; Citizen resumes flailing" }
output:
  dest: "src/assets/clips/defenders/citizen/card.{webm,mp4}"
  budget: "< 1 MB webm"
```

**Notes:** Palindrome works great here — a flail bouncing forward/back reads as
continuous panic. This is the most shareable card; make it funny.
