# Scenario: `phase-setup`

Sidebar loop for the `/nopas` Phase 01 (Setup) card. The prep-montage beat:
defenders crafting and gathering before the invasion.

> **Canonical (Setup phase):** "Defenders choose lanes, gather resources, and
> **craft**; aliens scout." The real prep actions are **building craftables** —
> **Barricade Wall** (any defender, near objective), **Button Turret** and **Repair
> Washer Station** (Tailor Engineer, via the Spanner build menu) — and **gathering
> resources** (Cloth, Denim, Buttons, Elastic, Batteries). There is no
> "board up a window" or "stuff pants in a washer" mechanic; the washing machine in
> the scene is the **Repair Washer Station** craftable.

```yaml
id: phase-setup
slot: "/nopas — Three-phase section, Phase 01 (Setup) card"
format: sidebar
resolution: 720x405
fps: 24
duration_s: 4
loop: native-seamless
logline: "The calm before the invasion: a Tailor Engineer builds a Button Turret / Barricade Wall with the Spanner while a Citizen hauls resources, the mothership scouting high above."
tone: "'Panic efficiently.' Busy, comedic prep energy — a never-ending build/haul to-do list, perfect for a loop."
location: "Suburbia street near an objective: a build pad, a Repair Washer Station, and a barricade line going up."
lighting: "Calm pre-dawn / early morning; quiet before the storm."
cast:
  - Tailor Engineer (building with the Spanner)
  - Citizen (hauling/carrying a resource bundle) — or a second Defender
requires:
  - tailor-engineer-rig
  - citizen-rig
  - spanner-build-vfx          # Spanner build/repair beam + a craftable rising as it builds
  - button-turret-prop         # or barricade-wall-prop / repair-washer-station-prop
  - barricade-wall-prop
fallback:
  - "build VFX MISSING: a craftable model that rises/assembles via TweenService with a Spanner build beam + sparks; loop the build-then-reset, or hold on a finished piece with idle."
  - "resource-haul: a Citizen/Defender carrying a small bundle Part on a repeating walk cycle."
camera:
  type: static
  marks: { mark: "medium wide framing the build pad + barricade line + a hauler lane, 16:9" }
  fov: 55
  drift: "optional slow ~1 stud dolly for life"
beats:
  - { t: 0.0, action: "Tailor aims the Spanner; a Button Turret / Barricade Wall is assembling" }
  - { t: 1.0, action: "the craftable finishes rising; Tailor gives an approving tap" }
  - { t: 2.0, action: "Citizen/Defender hauls a resource bundle across behind" }
  - { t: 3.0, action: "Tailor starts the next build = loops back to t=0" }
output:
  dest: "src/assets/clips/nopas/phase-setup.{webm,mp4}"
  budget: "< 2 MB webm"
```

**Notes:** Choreograph the builder and the hauler on overlapping cycles so the
loop point has continuous motion. Keep actions repetitive (build, haul) — that's
what sells a seamless prep loop, and it's what Setup phase actually is.
