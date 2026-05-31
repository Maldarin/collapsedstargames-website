# Scenario: `card-tailor-engineer`

Square class-card loop for the Tailor Engineer page. Signature beat: Button
Turret deploy + spin-up.

```yaml
id: card-tailor-engineer
slot: "/nopas/defenders/tailor-engineer — aspect-square portrait slot"
format: card
resolution: 800x800
fps: 24
duration_s: 3
loop: native-seamless
logline: "The Tailor Engineer slaps down a Button Turret; it unfolds, spins up, and fires a short burst as the Tailor gives an approving nod."
tone: "'Measure twice, fortify once.' Builder pride. Loop on the turret's idle bob/spin so it reads as a permanent deployable."
location: "Neutral staged area; golden accent glow."
lighting: "Key + golden rim to match the Tailor accent (#ffc14d / golden)."
cast:
  - Tailor Engineer (center-left)
  - Button Turret (center-right, deploys)
requires:
  - tailor-engineer-rig
  - button-turret-prop
  - turret-muzzle-vfx
fallback:
  - "button-turret-prop MISSING: spawn a folded turret model; TweenService it open + rotate the barrel; ParticleEmitter for the burst."
camera:
  type: static
  marks: { mark: "front 3/4 framing the Tailor and the deploy spot, both in square margin" }
  fov: 42
beats:
  - { t: 0.0, action: "Tailor places hand down (deploy gesture)" }
  - { t: 0.5, action: "turret unfolds + rises" }
  - { t: 1.2, action: "barrel spins up + fires a short burst" }
  - { t: 1.8, action: "Tailor approving nod; turret settles into idle bob" }
  - { t: 2.8, action: "idle bob continues = seamless loop" }
output:
  dest: "src/assets/clips/defenders/tailor-engineer/card.{webm,mp4}"
  budget: "< 1 MB webm"
```

**Notes:** The seamless point is the turret idle — capture an extra second of
pure idle bob so the loop in/out can sit anywhere in that cycle.
