# Scenario: `defenders-hero`

UPDF squad rally for the Defenders faction page. Heroic last-stand energy with
one comedic citizen for the wink.

```yaml
id: defenders-hero
slot: "/nopas/defenders — hero section backdrop"
format: hero
resolution: 1920x1080
fps: 30
duration_s: 6
loop: palindrome
logline: "The Defender squad holds a line — Officer Blart front and center, the Athlete vaulting a couch, the Tailor's Button Turret popping up, Dr. Peepers' Shield Generator dome flaring — under the mothership's looming glow."
tone: "Heroic low push-in on the team silhouette, like a movie poster coming alive. A lone Citizen panic-sprints across the foreground for the gag."
location: "Suburbia barricaded street / driveway with cover props (couch, sandbags); the mothership looms above."
lighting: "Dramatic dusk; denim-blue rim light; the mothership's glow/searchlight rakes the scene as a moving highlight (NOT a De-Pantsinator beam — the depants beam is a targeted red hold, not an overhead sweep)."
cast:
  - Security Officer (Officer Blart) (center front, braced)
  - Athlete (vaulting a couch, left)
  - Tailor Engineer (right, behind a deploying turret)
  - Dr. Peepers (behind, shield dome up)
  - Citizen (Screamer) (foreground, sprinting across)
requires:
  - security-officer-rig
  - athlete-rig
  - tailor-engineer-rig
  - dr-peepers-rig
  - button-turret-prop
  - shield-generator-dome-vfx
  - citizen-rig
  - mothership-model         # looming glow / searchlight overhead (replaces the non-canonical "De-Pantsinator sweep")
fallback:
  - "mothership glow MISSING: a large overhead light + slow-moving highlight Part; do NOT use a De-Pantsinator beam as an overhead sweep — that weapon is a targeted red channel, not a searchlight."
  - "button-turret-prop MISSING: spawn a small turret Part that rises (TweenService) and emits muzzle-flash particles."
  - "shield-generator-dome-vfx MISSING: spawn a translucent hemisphere Part with a glowing SurfaceAppearance/ForceField material; fade in on cue."
camera:
  type: scripted
  marks:
    markA: "low, wide, framing the whole squad in silhouette against the mothership glow"
    markB: "slow push-in centering on Officer Blart"
  fov: 60
beats:
  - { t: 0.0, action: "camera push-in A->B; squad in braced poses" }
  - { t: 1.0, action: "Athlete vaults the couch" }
  - { t: 1.8, action: "Button Turret rises + fires a burst" }
  - { t: 2.4, action: "Shield dome flares up around Dr. Peepers" }
  - { t: 3.0, action: "mothership glow/searchlight sweeps across the scene (moving highlight)" }
  - { t: 3.5, action: "Citizen panic-sprints across the foreground (the gag)" }
  - { t: 5.5, action: "settle on Blart for loop point" }
output:
  dest: "src/assets/clips/defenders/hero.{webm,mp4}"
  budget: "< 2 MB webm"
```

**Notes:** Faction accent is denim-blue — match lighting. Lots of cast; stagger
the action beats so the eye can follow. If it's too busy, cut the Athlete vault
and keep turret + dome + citizen.
