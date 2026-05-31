# Scenario: `phase-invasion`

Sidebar loop for the `/nopas` Phase 02 (Invasion) card. The peak-chaos beat:
defenders holding a chokepoint against the swarm.

```yaml
id: phase-invasion
slot: "/nopas — Three-phase section, Phase 02 (Invasion) card"
format: sidebar
resolution: 720x405
fps: 24
duration_s: 5
loop: native-seamless
logline: "Defenders hold a doorway — Button Turret firing, Security Officer blasting — as a stream of Minions piles against the barricade and beams light the sky."
tone: "Part action game, part base defense, part complete neighborhood disaster. Energetic, readable chaos. The turret's rhythmic fire anchors the loop."
location: "Suburbia doorway / chokepoint with a barricade; mothership + beams in the sky."
lighting: "Mid-invasion — alien-green beam light raking across, dramatic."
cast:
  - Security Officer (left of doorway, firing Button Blaster)
  - Button Turret (right, firing)
  - 4x Minion (streaming at the barricade)
requires:
  - security-officer-rig
  - button-blaster-vfx
  - button-turret-prop
  - turret-muzzle-vfx
  - minion-rig
  - DePantsinator-beam-vfx   # ambient sky beams
fallback:
  - "vfx MISSING: Beam/ParticleEmitter muzzle flashes; spawn minions on a loop that walk into the barricade and despawn."
camera:
  type: static
  marks: { mark: "3/4 on the doorway showing both shooters + the minion stream, 16:9" }
  fov: 58
beats:
  - { t: 0.0, action: "turret + Blaster firing rhythm established" }
  - { t: 1.0, action: "minion wave hits the barricade" }
  - { t: 2.5, action: "sky beam sweeps across (moving highlight)" }
  - { t: 3.5, action: "fresh minion wave (cycle restarts to match t=0)" }
output:
  dest: "src/assets/clips/nopas/phase-invasion.{webm,mp4}"
  budget: "< 2 MB webm"
```

**Notes:** Keep the muzzle-fire and minion spawn cadence on a clean repeating
cycle so the in/out point loops without a visible cut. Don't over-pack the
frame — 4 minions reads better than 20 at this size.
