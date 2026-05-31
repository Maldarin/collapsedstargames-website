# Scenario: `lore-mothership-descent`

Sidebar loop for the `/lore` aside near "First Contact / A Tuesday." Ominous but
mundane — the joke is how ordinary the apocalypse looks.

```yaml
id: lore-mothership-descent
slot: "/lore — aside figure beside 'First Contact' / 'A Tuesday.'"
format: sidebar
resolution: 720x405
fps: 24
duration_s: 4
loop: native-seamless
logline: "The first mothership glides into Earth's airspace over an ordinary Suburbia street — sprinklers running, a dog, a parked car — as if nothing is wrong."
tone: "Deadpan ominous. The lore says it happened 'on a Tuesday'; sell the banality. Slow, continuous ship drift over a perfectly normal suburb = unsettling-funny."
location: "Suburbia residential street, wide; ship entering high in frame."
lighting: "Flat midday Tuesday; archival desaturation + timestamp in post."
cast:
  - Mothership (drifting in slowly from frame edge, high)
  - ambient props (sprinkler, parked car, optional dog/citizen on a lawn)
requires:
  - mothership-model
fallback:
  - "mothership-model MISSING: large saucer Part with a slow underglow; TweenService a slow continuous drift across the upper frame."
camera:
  type: static
  marks: { mark: "locked wide on the street + sky, ship drifting across the upper third, 16:9" }
  fov: 62
  drift: "none (locked) — let only the ship + sprinkler move"
beats:
  - { t: 0.0, action: "ship begins slow drift in; sprinkler ticking, ambient calm" }
  - { t: 2.0, action: "ship reaches center-upper frame, underglow brightening slightly" }
  - { t: 3.5, action: "ship continues drift (continuous motion = seamless loop)" }
output:
  dest: "src/assets/clips/lore/mothership-descent.{webm,mp4}"
  budget: "< 2 MB webm"
```

**Notes:** Native-seamless: keep the ship drift slow and linear and pick in/out
points mid-drift so the loop is invisible. The contrast between the alien ship
and the running sprinkler is the whole gag — keep the suburb mundane.
