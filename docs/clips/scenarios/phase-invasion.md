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
logline: "Defenders hold a doorway — Button Turret firing, Security Officer blasting — as a stream of Minions piles against the barricade under the mothership's glow."
tone: "Part action game, part base defense, part complete neighborhood disaster. Energetic, readable chaos. The turret's rhythmic fire anchors the loop."
location: "Suburbia doorway / chokepoint with a barricade; mothership looming in the sky."
lighting: "Mid-invasion — the mothership's glow rakes across, dramatic (faction green/magenta tint is fine for the ship; note the De-Pantsinator beam itself is red and targeted, not a sky sweep)."
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
  - mothership-model         # looming glow in the sky (replaces the non-canonical "De-Pantsinator sky beams")
fallback:
  - "vfx MISSING: Beam/ParticleEmitter muzzle flashes; spawn minions on a loop that walk into the barricade and despawn."
  - "sky element: use the mothership's glow/searchlight, NOT De-Pantsinator beams (that weapon is a targeted red ground channel)."
camera:
  type: static
  marks: { mark: "3/4 on the doorway showing both shooters + the minion stream, 16:9" }
  fov: 58
beats:
  - { t: 0.0, action: "turret + Blaster firing rhythm established" }
  - { t: 1.0, action: "minion wave hits the barricade" }
  - { t: 2.5, action: "mothership glow sweeps across (moving highlight)" }
  - { t: 3.5, action: "fresh minion wave (cycle restarts to match t=0)" }
output:
  dest: "src/assets/clips/nopas/phase-invasion.{webm,mp4}"
  budget: "< 2 MB webm"
```

**Notes:** Keep the muzzle-fire and minion spawn cadence on a clean repeating
cycle so the in/out point loops without a visible cut. Don't over-pack the
frame — 4 minions reads better than 20 at this size.
