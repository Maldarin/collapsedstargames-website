# Scenario: `phase-final-stand`

Sidebar loop for the `/nopas` Phase 03 (Final Stand) card. The epic finale beat:
the Pants Factory fights back.

```yaml
id: phase-final-stand
slot: "/nopas — Three-phase section, Phase 03 (Final Stand) card"
format: sidebar
resolution: 720x405
fps: 24
duration_s: 5
loop: native-seamless
logline: "Pants Factory roof cannons volley-fire up at the looming mothership; its shields flicker and spark on impact as a slow camera tilt rises toward the ship."
tone: "'Hold the factory. Bring the mothership down.' Climactic and grand — the one sidebar that earns a slow scripted tilt instead of a locked frame."
location: "Suburbia Pants Factory rooftop, mothership looming directly above."
lighting: "Dramatic night/dusk; cannon muzzle flashes + shield-flicker as key accents."
cast:
  - Pants Factory (with roof cannons)
  - Mothership (above, taking fire)
requires:
  - pants-factory-model
  - roof-cannon-prop
  - cannon-fire-vfx
  - mothership-model
  - shield-flicker-vfx
fallback:
  - "roof-cannon-prop MISSING: spawn 2-3 cannon Parts that recoil + emit muzzle flash + a projectile Beam upward."
  - "shield-flicker-vfx MISSING: a translucent dome around the ship that flashes opacity/color on each hit."
camera:
  type: scripted
  marks:
    markA: "low on the factory roof, cannons in lower frame, ship in upper frame"
    markB: "slow tilt up emphasizing the mothership taking hits"
  fov: 55
beats:
  - { t: 0.0, action: "camera slow tilt A->B begins; cannons fire first volley" }
  - { t: 1.2, action: "projectiles hit ship; shields flicker" }
  - { t: 2.5, action: "second volley; bigger shield spark" }
  - { t: 4.0, action: "tilt settles on the ship; volley cadence continues for loop" }
output:
  dest: "src/assets/clips/nopas/phase-final-stand.{webm,mp4}"
  budget: "< 2 MB webm"
```

**Notes:** This is the most production-heavy sidebar (needs the factory + ship).
If those models aren't built yet, this is the best candidate to defer until last.
Native-seamless works if the tilt is slow and the volley cadence is regular;
otherwise palindrome it.
