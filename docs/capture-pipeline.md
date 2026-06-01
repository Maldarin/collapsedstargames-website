# Video & GIF Capture Pipeline

Recording clips of *Not Our Pants, Alien Swine!* for the website. The pipeline
is: **Studio playtest → OBS recording → ffmpeg post-processing → drop into
`src/assets/clips/`**.

> **Automating it:** [`clips/capture-harness.md`](clips/capture-harness.md) is a
> repeatable MCP-driven harness (Roblox Studio MCP + OBS MCP) that stages,
> records, and hands off each clip. It defers to this doc for OBS settings,
> ffmpeg recipes, and the `src/assets/clips/` layout. The specific shots are
> defined in [`clips/scenarios/`](clips/scenarios/) — one file per clip.

---

## What we want to capture

Aim for short, looping clips that show one clean idea per clip. Class ability
demonstrations, depants moments, mothership beams, Final Stand cannon volleys,
citizen panic, mech rampage, etc.

| Clip type | Length | Use case |
|---|---|---|
| **Hero loop** | 8–15s | Top of a page, behind a logo, auto-looping |
| **Ability demo** | 3–6s | Inside a class page's ability card |
| **Scene / GIF** | 2–4s | Mid-page filler, social-media share |
| **Trailer clip** | 30–60s | Longer marketing piece (one of these is plenty) |

---

## Tools

- **Roblox Studio** — for staged scenarios (you control the camera and the
  scene), or **live game** for organic chaos
- **OBS Studio** ([obsproject.com](https://obsproject.com/)) — free, captures a
  specific window at a fixed resolution
- **ffmpeg** — required for the post-processing pipeline. Install with
  `winget install Gyan.FFmpeg` on Windows or grab the static build from
  [ffmpeg.org](https://ffmpeg.org/)
- **Optional:** `gifski` for high-quality GIFs (`winget install gifski`)

---

## Recording settings in OBS

**Settings → Output (Advanced mode):**
- Recording format: **`mkv`** (recoverable if it crashes — convert to mp4 in
  post). Avoid `flv`.
- Encoder: `x264` (CPU) or `NVENC H.264` (NVIDIA GPU — much faster)
- Rate control: `CRF` with value `18` (visually lossless) or `CQP 20` for NVENC
- Keyframe interval: `2` (helps with seeking; doesn't affect quality)
- Preset: `veryfast` for NVENC or `medium` for x264

**Settings → Video:**
- Base resolution: `1920×1080` (your monitor's resolution)
- Output resolution: `1920×1080` for hero clips, `1280×720` for everything else
- FPS: `60` for ability demos and any motion-heavy capture; `30` for
  ambient/cinematic shots

**Settings → Audio:**
- Mute desktop audio unless you specifically want the in-game sounds.
- For most web clips, you'll want **silent video** (clips auto-play muted; sound
  is a separate marketing problem).

**Sources:**
- Add a **Game Capture** source targeting the Roblox window. Use "Capture
  specific window" mode and pick the Studio playtest window.

---

## In-Studio setup

For the cleanest captures:

1. **Run a clean playtest** — start from a save state with no debug HUDs,
   diagnostic prints stripped (or use `print = function() end` in the F9 console
   to silence them mid-session).
2. **Hide UI** — press Escape, *Settings → UI Style*, choose minimum, or
   disable specific HUD modules. The compass, EventLog, and ammo HUD can
   distract from the action.
3. **Frame the shot in third-person** — the camera in this game is third-person
   anyway; just hold a position before triggering the ability.
4. **Trigger the ability cleanly** — for a Shrinkinator demo, position the
   target, line up the camera, fire. Stop recording within 1–2 seconds of the
   impact.
5. **Record more than you need** — disk space is cheap. Trim in post.

For staged shots (the depants moment, citizen panic, mothership beam over the
factory), use Studio's *Move* and *Rotate* tools to position a Camera Part and
script a fly-through. Way more polished than handheld camera-in-character.

---

## ffmpeg post-processing recipes

All recipes assume your raw recording is at `raw.mkv`. Output files go in
`src/assets/clips/` so Astro can pick them up.

### 1. Trim a section + convert to MP4 (fallback / Safari)

```bash
ffmpeg -i raw.mkv -ss 00:00:04 -to 00:00:11 \
  -c:v libx264 -crf 22 -preset slow -movflags +faststart \
  -an out.mp4
```

- `-ss` / `-to`: start and end timestamps (HH:MM:SS)
- `-crf 22`: visually clean for web, ~50–70% smaller than CRF 18
- `-preset slow`: better compression, ~5–10× slower than `veryfast`
- `-movflags +faststart`: lets browsers start playing before the file fully
  downloads (critical for web)
- `-an`: drops audio. Most web clips don't need sound.

### 2. WebM (smaller, better quality on Chrome/Firefox)

```bash
ffmpeg -i raw.mkv -ss 00:00:04 -to 00:00:11 \
  -c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 \
  -an out.webm
```

VP9 typically produces files **40–60% smaller** than the equivalent MP4 at the
same visual quality. Always ship both — use a `<video>` with two `<source>`
tags:

```html
<video autoplay muted loop playsinline>
  <source src="/clips/depants.webm" type="video/webm">
  <source src="/clips/depants.mp4" type="video/mp4">
</video>
```

### 3. Tiny GIF for old contexts (Discord embeds, README, etc.)

GIFs are HUGE compared to video — only use them when video isn't supported.

```bash
# Generate a palette first for much better quality
ffmpeg -i raw.mkv -ss 4 -t 7 -vf "fps=15,scale=480:-1:flags=lanczos,palettegen" palette.png
# Apply the palette
ffmpeg -i raw.mkv -ss 4 -t 7 -i palette.png \
  -lavfi "fps=15,scale=480:-1:flags=lanczos [x]; [x][1:v] paletteuse" \
  out.gif
```

Targets: keep GIFs under **5 MB** if humanly possible. Drop the FPS first
(15 → 12), then the width (480 → 360) until you hit the budget.

### 4. High-quality GIF via gifski (better than ffmpeg's GIF output)

```bash
# Decode to PNG frames at 24 fps
ffmpeg -i raw.mkv -ss 4 -t 7 -vf fps=24,scale=640:-1 frame_%04d.png
# Encode with gifski
gifski -o out.gif --fps 24 --quality 90 frame_*.png
# Cleanup
rm frame_*.png
```

### 5. Make a clip loop seamlessly (palindrome trick)

Useful for hero clips where you want the loop to feel continuous:

```bash
ffmpeg -i clip.mp4 -filter_complex \
  "[0]reverse[r];[0][r]concat,setpts=N/FRAME_RATE/TB" \
  -an loop.mp4
```

This plays the clip forward then backward — bounces between start and end with
no visible cut.

---

## File-size budgets

Astro auto-imports videos with `src/assets/clips/...` and ships them as static
files (no transformation — pick the right output yourself).

| Slot | Target size | Notes |
|---|---|---|
| Class ability demo (3–6s, 720p, WebM) | < 500 KB | One per ability |
| Hero loop (10s, 1080p, WebM) | < 2 MB | One per page max |
| GIF (4s, 480px) | < 2 MB | Use sparingly |
| Trailer (60s, 1080p, MP4) | < 15 MB | Probably not on the website at all — drop to YouTube and embed |

---

## Embedding in Astro

Place files in `src/assets/clips/{class}/{ability}.webm` (and `.mp4`). Then in
the relevant page:

```astro
---
// Astro doesn't process videos through the Image pipeline, so use raw imports:
import depantsClip from "../assets/clips/security-officer/blart-bash.webm";
import depantsMp4 from "../assets/clips/security-officer/blart-bash.mp4";
---

<video autoplay muted loop playsinline class="w-full rounded-lg" preload="metadata">
  <source src={depantsClip} type="video/webm" />
  <source src={depantsMp4} type="video/mp4" />
</video>
```

Always include `muted` (browsers block auto-play with sound), `playsinline`
(iOS Safari fullscreens video by default without this), and `preload="metadata"`
(saves bandwidth — only loads the first frame until visible).

For lazy-loading on-scroll, wrap the video in an Intersection Observer or use
the `loading="lazy"` attribute on a `<picture>`-equivalent if supported.

---

## Suggested clip shot list (priority order)

**Phase 1 — most impactful for marketing:**

1. **The depants moment** — Overlord holds the red De-Pantsinator beam on a
   citizen (3s channel, red aura swells), white flash, citizen instantly in
   safety shorts and panicking. 4–6 seconds. Hero clip for the home page game
   tease. (Canonical: no detaching/flying pants — it's a clothing swap.)
2. **Mothership Final Stand cannon volley** — Pants Factory roof cannons firing
   at the mothership, mothership shields flicker, hull damage. 8–10 seconds.
3. **Mech rampage** — Commander quad-laser barrage through a wall, minions
   pouring in behind. 5–8 seconds.
4. **Tractor beam suspending a citizen** — citizen mid-air, panicked, Defender
   running underneath. 4–5 seconds.

**Phase 2 — class ability demos (one per ability card):**

- Button Blaster (SO sidearm fire)
- Blart Bash (SO dash)
- Spanner repair (TE)
- Button Turret deploy + fire (TE)
- Laundry Dispenser deploy + supply pickup (TE)
- Dryer Door Shield deploy + tank a beam (TE)
- Med Gun heal beam (Dr. Peepers)
- Shield Generator dome (Dr. Peepers)
- Emergency House-Call leap (Dr. Peepers)
- Handgun + Sweeper combo (Athlete)
- Dodge Dash + citizen carry (Athlete)
- Needle rifle pin from a rooftop (NeedleEye)
- Grappling hook reposition (NeedleEye)
- Pin Mine trigger on a minion path (NeedleEye)
- Overlord Freeze Ray (Collector)
- Overlord Evil Eye Drone scout (Collector)
- Commander Quad Laser sweep (Collector)
- Commander Rocket Jump (Collector)

**Phase 3 — environment / lore:**

- Suburbia Pants Factory exterior with cannons firing
- Citizen panic personalities montage (5 short clips, one per archetype)
- The mothership descending in Setup phase
- The Underpants Summit footage (jokingly recreate as a static surveillance
  still, since this is in-world UPDF training footage)

---

## Where captured clips live in the project

```
collapsedstargames-website/
  src/assets/clips/
    home/
      hero-loop.webm
      hero-loop.mp4
    defenders/
      security-officer/
        button-blaster.webm
        blart-bash.webm
      tailor-engineer/
        button-turret.webm
        dryer-door-shield.webm
      ...
    collectors/
      overlord/
      commander/
    citizens/
      panic-archetypes.webm
    mothership/
      cannon-volley.webm
      shield-flicker.webm
```

Once a clip is in the right folder, wire it into the corresponding ability card
on the class page (or wherever it fits) using the embedding pattern above.

---

## Optimization checklist before committing

- [ ] WebM file < target budget? (Re-encode at higher CRF if not)
- [ ] MP4 fallback also generated?
- [ ] Audio stripped if not needed?
- [ ] `+faststart` flag used on MP4? (Verify with
  `ffprobe -v error -show_format file.mp4` — `start_time=0` and `moov` atom
  near the start)
- [ ] Loop seamless? (If not, palindrome it or pick a different in/out point)
- [ ] Filename in kebab-case and descriptive?
- [ ] No accidental UI overlays (debug HUD, dev cheatsheet, F9 console)?
