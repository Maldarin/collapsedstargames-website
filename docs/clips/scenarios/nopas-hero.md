# Scenario: `nopas-hero` ⭐

The marquee clip. The DePantsinator — the game's main mechanic — shown as the
money shot: a Collector beam yanks a citizen's jeans clean off and tractors them
up toward the ship. Heroic framing, zany payoff.

```yaml
id: nopas-hero
slot: "/nopas — hero section backdrop"
format: hero
resolution: 1920x1080
fps: 30
duration_s: 7
loop: palindrome
logline: "An Overlord fires the DePantsinator at a Citizen; the jeans separate and tractor up the beam toward the mothership while the Citizen freezes mid-panic."
tone: "The money shot. Low 3/4 hero angle so the jeans separating is silhouetted against the beam; a quick punch-in lands on the gasp. Action-movie framing, comedy payoff."
location: "Suburbia street, mothership visible above for the beam to travel toward."
lighting: "Late afternoon golden hour; strong beam emission as the key light on the Citizen."
cast:
  - Overlord (foreground-left, hovering, firing)
  - Citizen (Screamer) (center, the target)
  - 2x Minion (background, ambient menace)
  - Mothership (above, beam destination)
requires:
  - overlord-rig
  - DePantsinator-beam-vfx
  - citizen-pants-detach   # the jeans becoming a separate, tractorable object
  - tractor-beam-vfx
  - citizen-panic-anim
fallback:
  - "citizen-pants-detach MISSING: clone the citizen's lower-body/pants mesh as its own Part, hide the original, and TweenService the clone up the beam path."
  - "tractor-beam-vfx MISSING: reuse DePantsinator beam Part; attach the pants clone to a tween up the beam toward the saucer."
  - "citizen-panic-anim MISSING: play a flail emote or rapid CFrame jitter on the citizen rig for ~1s."
camera:
  type: scripted
  marks:
    markA: "low 3/4 on the Citizen, Overlord in left third, sky behind (push-in start)"
    markB: "tighter punch-in on the Citizen's reaction at the depants beat"
  fov: 50
beats:
  - { t: 0.0, action: "camera slow push-in A->B; Overlord raises the DePantsinator" }
  - { t: 2.2, action: "Overlord fires; beam connects with Citizen" }
  - { t: 3.0, action: "jeans detach + begin tractoring up the beam" }
  - { t: 3.2, action: "Citizen freeze-frame panic (the gasp beat)" }
  - { t: 5.5, action: "jeans reach toward the saucer; camera holds tight" }
  - { t: 6.5, action: "settle for loop point" }
output:
  dest: "src/assets/clips/nopas/hero.{webm,mp4}"
  budget: "< 2 MB webm"
```

**Notes:** This is the single most important clip on the site — the user's
stated example. Shoot extra takes. The readability of the *jeans separating* is
the whole point; if the beam washes it out, dim the beam emission or add a rim
light on the pants. Keep the Citizen's silhouette clean (no minions overlapping
it at the depants beat).
