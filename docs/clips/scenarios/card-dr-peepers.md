# Scenario: `card-dr-peepers`

Square class-card loop for the Dr. Peepers page. Signature beat: Med Gun heal
beam.

> **Canonical (WeaponConfig.MedGun):** continuous single-target **heal beam**,
> `weaponType = "BeamChannel"`, 55-stud range, **20 HP/s** on allies / 15 HP/s on
> citizens, up to 110% overheal. Use the **actual in-game Med Gun beam color** from
> `HealBeamVFX` — it's config-driven (engine default is white with a soft endpoint
> pulse), so don't hard-code "green" unless that matches the live VFX; the mint
> (#5eddb0) is just the page accent. Dr. Peepers also has the Clinic SMG, Shield
> Generator, Virus Grenade, and the Emergency House-Call leap.

```yaml
id: card-dr-peepers
slot: "/nopas/defenders/dr-peepers — aspect-square portrait slot"
format: card
resolution: 800x800
fps: 24
duration_s: 3
loop: native-seamless
logline: "Dr. Peepers points the Med Gun at a wounded Defender; the heal beam connects and pulses; the patient straightens up."
tone: "Clutch-save calm. The glow pulse is the loop. 'Why is everyone glowing?' Warm, reassuring, slightly absurd."
location: "Neutral staged area; mint-green accent glow (#5eddb0)."
lighting: "Key + mint rim; the heal beam is a secondary light source (match the live Med Gun beam color)."
cast:
  - Dr. Peepers (center-left, aiming Med Gun)
  - Defender (any, center-right, being healed)
requires:
  - dr-peepers-rig
  - med-gun-heal-beam-vfx
  - defender-rig
fallback:
  - "med-gun-heal-beam-vfx MISSING: spawn a Beam between the gun muzzle and the patient (use the live Med Gun beam color) + a soft pulsing PointLight + an endpoint pulse on the patient every few ticks."
camera:
  type: static
  marks: { mark: "two-shot 3/4, beam path fully visible, both rigs in square margin" }
  fov: 42
beats:
  - { t: 0.0, action: "Peepers raises Med Gun" }
  - { t: 0.5, action: "heal beam connects; heal glow begins" }
  - { t: 1.0, action: "glow pulses; patient straightens up" }
  - { t: 2.0, action: "steady pulsing beam (hold)" }
  - { t: 2.8, action: "pulse phase matches t=0 = seamless loop" }
output:
  dest: "src/assets/clips/defenders/dr-peepers/card.{webm,mp4}"
  budget: "< 1 MB webm"
```

**Notes:** The beam should pulse on a clean sine so any in/out point loops.
Capture a couple extra pulse cycles for flexibility.
