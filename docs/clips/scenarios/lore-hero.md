# Scenario: `lore-hero`

"UPDF Archives" found-footage tone for the lore page. Deadpan, archival,
slightly unsettling — the comedy is in the mundane detail.

```yaml
id: lore-hero
slot: "/lore — hero section backdrop"
format: hero
resolution: 1920x1080
fps: 30
duration_s: 7
loop: native-seamless
logline: "Archival 'first contact' footage: the first mothership enters Earth's airspace over Suburbia while a single pair of pants flaps on a clothesline in the beam-wind."
tone: "Locked 'security-cam' angle with subtle drift — sells the archival voice ('A Tuesday.'). Apply CRT scanlines / slight desaturation / timestamp overlay in post. The clothesline pants are the punchline."
location: "Suburbia backyard with a clothesline; mothership entering frame high."
lighting: "Flat overcast daytime, slightly washed; archival look finalized in post."
cast:
  - Mothership (entering from top of frame, slow)
  - Pants (single pair on a clothesline, foreground)
  - Citizen (distant, looking up, frozen)
requires:
  - mothership-model
  - clothesline-prop
  - pants-prop
fallback:
  - "clothesline-prop MISSING: two thin posts + a rope Part (Beam or thin cylinder) with a pants mesh hung on it."
  - "pants-prop MISSING: reuse the citizen jeans mesh; add a gentle sway via TweenService or a hinge."
camera:
  type: static
  marks:
    mark: "fixed wide on the backyard, clothesline in the lower third, sky + descending ship in the upper two thirds"
  fov: 65
  drift: "optional ~1-2 stud slow dolly to feel like a handheld/locked cam — keep it subtle"
beats:
  - { t: 0.0, action: "mothership slowly enters from top of frame" }
  - { t: 1.0, action: "beam-wind starts; clothesline pants flap" }
  - { t: 3.0, action: "distant Citizen turns to look up, freezes" }
  - { t: 6.0, action: "ship still descending; loop point (motion is continuous + slow for seamless)" }
output:
  dest: "src/assets/clips/lore/hero.{webm,mp4}"
  budget: "< 2 MB webm"
```

**Notes:** Native-seamless because everything moves slowly and continuously —
pick in/out points where the ship and pants are mid-motion so the loop hides.
The CRT/scanline/timestamp treatment is an ffmpeg/post step, not in-engine; note
it in the handoff. Pairs with the lore page's "A Tuesday." copy.
