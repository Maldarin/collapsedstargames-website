# Scenario: `card-commander`

Square class-card loop for the Commander page portrait slot. Signature beat: the
Quad Lasers.

```yaml
id: card-commander
slot: "/nopas/collectors/commander — aspect-square portrait slot"
format: card
resolution: 800x800
fps: 24
duration_s: 3
loop: native-seamless
logline: "The Commander mech braces and sweeps its Quad Lasers across frame; the mech recoils with each volley."
tone: "Low angle for menace, contained in the square. Loop on the muzzle-flash cycle so it reads as continuous suppressing fire."
location: "Neutral staged area with the orange radial glow the commander card uses."
lighting: "Key + warm orange rim to match the Commander accent (#ffae3d)."
cast:
  - Commander (mech, center)
requires:
  - commander-mech-rig
  - quad-laser-vfx
fallback:
  - "quad-laser-vfx MISSING: spawn 4 Beam Parts from the mech arms + ParticleEmitter muzzle flashes pulsing on a loop."
camera:
  type: static
  marks: { mark: "low front 3/4 looking up at the mech torso/arms, full mech in frame with square margin" }
  fov: 45
beats:
  - { t: 0.0, action: "mech braced, arms raised" }
  - { t: 0.5, action: "Quad Lasers fire — sweep left" }
  - { t: 1.2, action: "sweep right (recoil shudder)" }
  - { t: 2.0, action: "volley cycle repeats" }
  - { t: 2.8, action: "pose matches t=0 = loop point" }
output:
  dest: "src/assets/clips/collectors/commander/card.{webm,mp4}"
  budget: "< 1 MB webm"
```

**Notes:** The recoil shudder sells the weight. Keep the laser sweep arc inside
the square crop — don't let beams exit and re-enter unevenly or the loop breaks.
