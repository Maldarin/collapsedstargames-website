# Scenario: `phase-setup`

Sidebar loop for the `/nopas` Phase 01 (Setup) card. The prep-montage beat:
defenders/citizens scrambling to get ready before the invasion.

```yaml
id: phase-setup
slot: "/nopas — Three-phase section, Phase 01 (Setup) card"
format: sidebar
resolution: 720x405
fps: 24
duration_s: 4
loop: native-seamless
logline: "During the calm before the invasion, a Citizen frantically boards up a window / stuffs pants into a washing machine while a Defender hauls a barricade into place."
tone: "'Panic efficiently.' Busy, comedic prep energy. Reads as a never-ending to-do list — perfect for a loop."
location: "Suburbia house exterior/interior with a window + a washing machine + barricade props."
lighting: "Calm pre-dawn / early morning; quiet before the storm."
cast:
  - Citizen (Crowd Follower) (boarding window / stashing pants)
  - Defender (any, dragging a barricade)
requires:
  - citizen-rig
  - defender-rig
  - window-prop
  - washing-machine-prop
  - barricade-prop
fallback:
  - "props MISSING: spawn simple stand-in Parts (a board over a window frame, a box for the washer, sandbag Parts for the barricade)."
camera:
  type: static
  marks: { mark: "medium wide framing the window + washer + barricade lane, 16:9" }
  fov: 55
  drift: "optional slow ~1 stud dolly for life"
beats:
  - { t: 0.0, action: "Citizen hammering a board over the window" }
  - { t: 1.0, action: "Citizen turns, stuffs pants into the washer" }
  - { t: 2.0, action: "Defender drags a barricade across behind" }
  - { t: 3.0, action: "Citizen resumes hammering = loops back to t=0" }
output:
  dest: "src/assets/clips/nopas/phase-setup.{webm,mp4}"
  budget: "< 2 MB webm"
```

**Notes:** Choreograph the two actors on overlapping cycles so the loop point
has continuous motion. Keep actions repetitive (hammering, dragging) — that's
what sells a seamless prep loop.
