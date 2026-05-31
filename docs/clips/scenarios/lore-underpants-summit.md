# Scenario: `lore-underpants-summit`

Sidebar loop for the `/lore` aside near "Diplomacy: Concluded." The signature
lore set-piece, shot as deadpan archival footage.

```yaml
id: lore-underpants-summit
slot: "/lore — aside figure beside 'The Underpants Summit / Diplomacy: Concluded'"
format: sidebar
resolution: 720x405
fps: 24
duration_s: 4
loop: palindrome
logline: "At a formal summit table, a row of human 'delegates' is depantsed in a single coordinated Collector beam volley while the aliens look on, unbothered."
tone: "Maximum deadpan. Shot like dry C-SPAN/archival footage — the lore page literally says 'no audio commentary required.' The synchronized depants is the joke; play it completely straight."
location: "A formal meeting room / summit table set-piece (or a staged interior)."
lighting: "Flat institutional fluorescent; archival desaturation + timestamp added in post."
cast:
  - 3x Citizen (Delegates) (seated/standing at the table)
  - 2x Collector (Overlord or Minion) (across the table)
requires:
  - citizen-rig
  - collector-rig
  - DePantsinator-beam-vfx
  - citizen-pants-detach
  - summit-table-prop
fallback:
  - "summit-table-prop MISSING: a long table Part + chairs; flags optional for the institutional gag."
  - "citizen-pants-detach MISSING: clone+hide jeans meshes; pop all delegates' pants on the SAME frame for the synchronized volley."
camera:
  type: static
  marks: { mark: "locked wide on the table, all delegates + aliens in frame, 16:9 — security-cam framing" }
  fov: 60
beats:
  - { t: 0.0, action: "delegates seated, gesturing diplomatically" }
  - { t: 1.0, action: "aliens raise beams in unison" }
  - { t: 1.5, action: "SINGLE coordinated volley — all delegates depantsed on the same frame" }
  - { t: 2.2, action: "delegates freeze in horror; aliens unbothered" }
output:
  dest: "src/assets/clips/lore/underpants-summit.{webm,mp4}"
  budget: "< 2 MB webm"
```

**Notes:** The comedy depends on **synchronization** — every delegate's pants
must come off on the exact same frame. Drive all detach tweens off one cue.
Palindrome loop (volley forward, reverse) reads as an absurd repeating gag.
Post-process to look like degraded archival tape to match the page voice.
