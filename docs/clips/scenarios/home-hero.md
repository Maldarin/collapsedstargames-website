# Scenario: `home-hero`

Studio-brand hero loop for the homepage. Sells scale and the "collapsed star"
identity, not a specific mechanic. One small canonical depants in the mid-ground
is the only gameplay wink.

> **Canonical:** the De-Pantsinator is a **targeted red beam hold** on a single
> victim (→ white flash → safety shorts), NOT an "overhead sweep" or a "yoink".
> Keep the wink tiny and far: a brief red beam catches the mid-ground Citizen, who
> then panics. The mothership beam is a separate system — don't conflate them.

```yaml
id: home-hero
slot: "/ (studio home) — hero section backdrop behind the CSG logo"
format: hero
resolution: 1920x1080
fps: 30
duration_s: 8
loop: palindrome
logline: "The mothership descends over a Suburbia street at dusk; far below, a brief red De-Pantsinator beam catches a Citizen (white flash → safety shorts) as the camera cranes up into the starfield."
tone: "Brand-scale awe. Slow cinematic crane that ENDS on open sky/stars so it matches the site's literal Starfield motif. The single tiny depants in the mid-ground is the only joke — keep it small and far."
location: "Suburbia street with a clear sightline up to the sky; mothership prop overhead."
lighting: "Dusk — ClockTime ~18.5, warm key + cool fill; mothership underglow (alien green/magenta)."
cast:
  - Mothership (overhead, slow descent)
  - Citizen (Screamer) — mid-ground, gets the beam wink
  - 2x Minion (street level, ambient)
requires:
  - mothership-model
  - DePantsinator-beam-vfx
  - citizen-rig
  - minion-rig
fallback:
  - "mothership-model MISSING: spawn a large saucer Part with a PointLight + downward Beam; slow-descend via TweenService."
  - "DePantsinator-beam-vfx MISSING: a brief red (255,50,50) beam from a far Collector to the Citizen + a small red aura, then a quick white flash + swap to safety shorts. Targeted hold, not a sweep."
camera:
  type: scripted
  marks:
    markA: "low, street level, looking down the road toward the mothership (pitch up ~10deg)"
    markB: "craned up ~40 studs, tilted up to frame mostly sky + the saucer silhouette (loop point on the stars)"
  fov: 55
beats:
  - { t: 0.0, action: "start camera crane A->B; mothership begins slow descent" }
  - { t: 3.0, action: "brief red De-Pantsinator beam catches the mid-ground Citizen (small, far) → quick white flash → safety shorts" }
  - { t: 3.6, action: "Citizen does a quick panic hop (now in shorts)" }
  - { t: 7.0, action: "camera settles framed on sky/stars — clean loop point" }
output:
  dest: "src/assets/clips/home/hero.{webm,mp4}"
  budget: "< 2 MB webm"
```

**Notes:** This is the one clip where the gameplay is deliberately incidental —
it represents the studio, not NOPAS specifically. If it reads as too game-y,
drop the beam beat entirely and let it be a pure mothership-over-suburbia
descent.
