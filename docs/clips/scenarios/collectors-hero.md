# Scenario: `collectors-hero`

Villain-team power shot for the Collectors faction page. Make them look
menacing-but-ridiculous: corporate-evil confidence.

```yaml
id: collectors-hero
slot: "/nopas/collectors — hero section backdrop"
format: hero
resolution: 1920x1080
fps: 30
duration_s: 6
loop: palindrome
logline: "The Commander mech stomps through a picket fence as the Overlord hovers behind directing minions; in the background a red De-Pantsinator beam channels a Citizen (red aura, then a white flash leaves them in safety shorts)."
tone: "Heroic-for-the-bad-guys. Low angle looking UP at the mech for menace, plus a slight Dutch tilt for zany-sinister. Slow push-in. They are the threat and they know it."
location: "Suburbia front yard / street with a fence to crash through; mothership above."
lighting: "Overcast-ominous; alien-green rim light from the mothership and beams."
cast:
  - Commander (mech, foreground, stomping)
  - Overlord (hovering mid-ground behind the mech)
  - 3x Minion (streaming past the mech's legs)
  - Citizen (far background, held in a red De-Pantsinator channel)
requires:
  - commander-mech-rig
  - overlord-rig
  - minion-rig
  - DePantsinator-beam-vfx     # red beam 255,50,50 + growing red aura + white completion flash
  - safety-shorts-swap         # SafetyShorts on completion (DepantsServerSystem)
  - fence-prop
fallback:
  - "commander-mech-rig MISSING: use the Commander class rig at scale; add a stomp via CFrame + camera shake."
  - "fence-prop MISSING: spawn a row of thin Parts; un-anchor + apply impulse on the stomp for the crash."
  - "DePantsinator-beam-vfx (bg): red Neon beam + red aura on the far Citizen; pop a white flash + swap to safety shorts at the depants beat."
camera:
  type: scripted
  marks:
    markA: "low, looking up at the mech's torso, slight Dutch tilt (~6deg)"
    markB: "push-in tighter as the fence breaks, Overlord framed over the mech's shoulder"
  fov: 58
beats:
  - { t: 0.0, action: "camera push-in A->B; mech walking forward" }
  - { t: 1.8, action: "mech stomps through the fence (debris + small camera shake)" }
  - { t: 2.5, action: "minions stream past the legs toward camera" }
  - { t: 3.5, action: "bg De-Pantsinator beam completes — white flash, far Citizen left in safety shorts (no flying/popping pants)" }
  - { t: 5.5, action: "Overlord gives a slow, smug gesture; settle for loop" }
output:
  dest: "src/assets/clips/collectors/hero.{webm,mp4}"
  budget: "< 2 MB webm"
```

**Notes:** Faction page accent color is alien-green/magenta — lean the lighting
that way so the clip matches the page. Keep both leaders readable; if the mech
hides the Overlord, raise the Overlord's hover height.
