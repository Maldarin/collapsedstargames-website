# Clip Capture Harness

A repeatable way to capture the website's video clips of *Not Our Pants, Alien
Swine!* by driving **Roblox Studio** (staging + scripted camera) and **OBS
Studio** (recording) through their MCP servers, then handing off an exact ffmpeg
recipe.

This doc is the **operator's manual**. The companion `scenarios/` folder holds
one config file per clip. The intended workflow:

1. Open a fresh Claude Code chat **with both the Roblox Studio MCP and the OBS
   MCP connected**, and the NOPAS place open in Studio.
2. Paste the **Harness Prompt** (below), then one line: `Run scenario:
   <scenario-id>` (e.g. `Run scenario: nopas-hero`).
3. The assistant reads `docs/clips/scenarios/<id>.md`, stages it, records it,
   and hands back the raw file path + the ffmpeg command to finish it.

Recording settings, ffmpeg recipes, and the `src/assets/clips/` layout live in
[`../capture-pipeline.md`](../capture-pipeline.md) — this harness defers to it
for anything not specified here.

---

## The Harness Prompt

> Copy everything in this block into a fresh chat that has the Roblox Studio MCP
> and OBS MCP connected, then tell it which scenario to run.

```
You are driving Roblox Studio (via the Roblox Studio MCP) and OBS Studio (via the
OBS MCP) to capture a single video clip for the Collapsed Star Games website.

Read docs/clips/scenarios/<ID>.md for the scenario config. Then execute these
phases IN ORDER, reporting a one-line status after each. Stop and ask me if a
phase can't be satisfied.

PHASE A — PREFLIGHT / INVENTORY (Roblox Studio MCP)
- Confirm the NOPAS place is open and you can run Luau in it.
- Locate the capture region (a part/folder named in the scenario's `location`, or
  the default Suburbia street). Locate every rig, ability module, prop, and VFX
  listed under `requires`. Run Luau to search Workspace/ReplicatedStorage/
  ServerStorage by name.
- Report a checklist: each `requires` item as FOUND or MISSING.

PHASE B — PROVISION MISSING
- For each MISSING item, apply the matching note in the scenario's `fallback`
  (e.g. weld + TweenService-detach a jeans mesh to fake a depants, or spawn a
  placeholder beam Part with a Beam/ParticleEmitter). Do NOT invent gameplay —
  only stage what the shot needs. Re-run the inventory; everything must be
  FOUND-or-stubbed before continuing.

PHASE C — STAGE
- Spawn/move each `cast` member to its named mark (use the scenario's
  coordinates, or place them sensibly in frame and report where).
- Set time-of-day / lighting per `lighting`.
- Hide gameplay UI for the capture: set StarterGui.*.Enabled = false for HUD
  ScreenGuis, and run `game:GetService("StarterGui"):SetCoreGuiEnabled(
  Enum.CoreGuiType.All, false)`. Silence prints with `print = function() end` if
  the place is noisy.

PHASE D — CAMERA (scripted unless scenario says static)
- Set workspace.CurrentCamera.CameraType = Enum.CameraType.Scriptable and
  FieldOfView = <fov>.
- Build the camera move from the scenario's `camera` block. Pattern:
    local cam = workspace.CurrentCamera
    cam.CameraType = Enum.CameraType.Scriptable
    cam.FieldOfView = <fov>
    cam.CFrame = <markA CFrame>
    local TS = game:GetService("TweenService")
    local ti = TweenInfo.new(<duration_s>, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut)
    -- start the tween in PHASE F, on the same cue as t=0 of the beat sheet:
    -- TS:Create(cam, ti, { CFrame = <markB CFrame> }):Play()
- For `type: static`, just set cam.CFrame once and don't tween.
- Do a silent dry-run of the move (no recording) and verify the action stays in
  frame for the whole clip. Adjust marks/FOV if it clips out.

PHASE E — OBS SETUP (OBS MCP) — validate before rolling
- Set video out to the scenario's resolution + fps:
  obs-set-video-settings { baseWidth, baseHeight, outputWidth, outputHeight,
  fpsNumerator: <fps>, fpsDenominator: 1 } using the scenario's `resolution`
  for ALL four width/height fields (capture native-aspect; square clips use a
  square canvas).
- Confirm with obs-get-video-settings.
- Ensure a Game Capture / Window Capture source targets the Studio play/edit
  window: obs-get-input-list, then verify it's the active scene's source via
  obs-get-scene-items on the current scene (obs-get-current-scene).
- Mute audio: obs-set-input-mute on desktop/mic inputs (obs-get-special-inputs
  to find them). Web clips ship silent.
- Recording format/encoder/CRF: leave as configured per capture-pipeline.md
  (mkv, x264/NVENC, CRF 18 / CQP 20). Confirm the output dir with
  obs-get-record-directory.
- Sanity check obs-get-stats: activeFps should match the target, 0 skipped
  frames before rolling.

PHASE F — REHEARSE + RECORD
- Final silent rehearsal of the full beat sheet timeline.
- obs-start-record. Immediately fire the beat sheet on its timeline (t=0 is the
  start of recording): trigger camera tween + each `beats[]` action at its `t`.
- Hold ~1s past the last beat, then obs-stop-record. Confirm with
  obs-get-record-status (outputActive=false) and capture the returned file path.
- Record 2–3 takes if cheap; note the best take's timestamp window.

PHASE G — HANDOFF
- Report: raw file path, best in/out timestamps, and the exact ffmpeg command(s)
  from capture-pipeline.md to produce BOTH outputs:
    * MP4 (h.264, -movflags +faststart, -an)
    * WebM (VP9, -an)
  Apply the palindrome filter if `loop: palindrome`.
- State the destination path from the scenario's `output.dest` and the size
  budget; if the encode is over budget, raise CRF/CQP and re-encode.
- Do NOT commit clips automatically — leave the finished files for me to review.

Begin with PHASE A for scenario: <ID>
```

---

## Scenario config schema

Every file in `scenarios/` is one clip, as a fenced `yaml` block plus prose
notes. Fields:

| Field | Meaning |
|---|---|
| `id` | kebab-case, matches the filename and the website slot |
| `slot` | where it lives on the site (page + section) |
| `format` | `hero` \| `card` \| `sidebar` |
| `resolution` | `WIDTHxHEIGHT` — also OBS canvas size (native-aspect capture) |
| `fps` | 24 or 30 |
| `duration_s` | clip length target before trim |
| `loop` | `palindrome` \| `native-seamless` \| `none` |
| `logline` | the one idea the clip shows |
| `tone` | directorial note — the heroic + zany intent |
| `location` | capture region in the place (or "default Suburbia street") |
| `lighting` | time-of-day / mood |
| `cast` | rigs/NPCs needed in frame |
| `requires` | rigs, ability modules, props, VFX that must exist |
| `fallback` | how to stub each `requires` item if MISSING |
| `camera` | `{ type: scripted\|static, marks/path, fov }` |
| `beats` | timeline `{ t, action }` the harness fires (t in seconds from record start) |
| `output` | `{ dest, budget }` under `src/assets/clips/...` |

> Coordinates in scenario files are **placeholders** unless noted — the harness
> places cast/camera sensibly and reports the actual marks it used, so the
> numbers can be hardened into the file after the first successful take.

---

## Clip index

⭐ = priority / signature.

### Hero loops — 1920×1080, 5–8s, scripted

| ID | Slot | Idea |
|---|---|---|
| [`home-hero`](scenarios/home-hero.md) | `/` studio hero | Mothership descent over Suburbia, crane into the starfield |
| [`nopas-hero`](scenarios/nopas-hero.md) ⭐ | `/nopas` hero | The marquee depants — red beam channel → white flash → citizen in safety shorts |
| [`collectors-hero`](scenarios/collectors-hero.md) | `/nopas/collectors` hero | Villain power-shot: mech + Overlord + minions |
| [`defenders-hero`](scenarios/defenders-hero.md) | `/nopas/defenders` hero | UPDF squad rally under a sweeping beam |
| [`lore-hero`](scenarios/lore-hero.md) | `/lore` hero | "Archives" found-footage first-contact descent |

### Class-card square loops — 600×600 (cap 800), 2–4s, 24fps, seamless

| ID | Class page | Beat |
|---|---|---|
| [`card-overlord`](scenarios/card-overlord.md) | Overlord | DePantsinator fires, pants pop off, shrug |
| [`card-commander`](scenarios/card-commander.md) | Commander | Quad Lasers sweep + mech recoil |
| [`card-security-officer`](scenarios/card-security-officer.md) | Security Officer | Blart Bash dash-slam |
| [`card-tailor-engineer`](scenarios/card-tailor-engineer.md) | Tailor Engineer | Button Turret deploy + spin-up |
| [`card-dr-peepers`](scenarios/card-dr-peepers.md) | Dr. Peepers | Med Gun heal beam glow pulse |
| [`card-athlete`](scenarios/card-athlete.md) | Athlete | Dodge Dash → Citizen Carry scoop |
| [`card-needle-eye`](scenarios/card-needle-eye.md) | Needle Eye | Needle Rifle rooftop pin + scope glint |
| [`card-citizen`](scenarios/card-citizen.md) | Citizen | Pure Panic flail + Pocket Sand toss |

### Sidebar loops — 720×405, 3–5s, 24fps, seamless

| ID | Slot | Idea |
|---|---|---|
| [`phase-setup`](scenarios/phase-setup.md) | `/nopas` Phase 01 | Citizen boarding a window / stashing pants |
| [`phase-invasion`](scenarios/phase-invasion.md) | `/nopas` Phase 02 | Defenders holding a doorway vs minions |
| [`phase-final-stand`](scenarios/phase-final-stand.md) | `/nopas` Phase 03 | Pants Factory cannons volley the mothership |
| [`lore-underpants-summit`](scenarios/lore-underpants-summit.md) | `/lore` aside | The Summit delegation depantsed in one volley |
| [`lore-mothership-descent`](scenarios/lore-mothership-descent.md) | `/lore` aside | First saucer enters airspace "on a Tuesday" |

---

## OBS / format reconciliation cheat-sheet

| Format | OBS canvas (base = output) | fps | ffmpeg loop | Budget |
|---|---|---|---|---|
| Hero | 1920×1080 | 30 | palindrome | < 2 MB webm |
| Class-card | 800×800 (downscale to 600 if needed) | 24 | native-seamless or palindrome | < 1 MB webm |
| Sidebar | 720×405 | 24 | native-seamless or palindrome | < 2 MB webm |

- Capture **native aspect** (set OBS output to the target W×H) rather than
  cropping a 16:9 capture — cleaner square cards and tighter loops.
- Always ship **both** MP4 (h.264 `+faststart`) and WebM (VP9), audio stripped.
- Seamless: prefer a genuinely loopable action (idle bob, beam pulse); use the
  palindrome filter only when a clean loop point doesn't exist naturally.
