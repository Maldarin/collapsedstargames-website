# Scenario: `bowling-hero`

First real media for Minion Panic Bowling. The page at `/nopas/bowling/`
currently ships with no bowling footage or screenshots (only repurposed Minion
stills) — this clip replaces the hero backdrop, and a good still from the same
take replaces the "More ways to play" card image on `/nopas/`.

> **Canonical mechanic (do not invent):** Bowling runs in the dedicated
> Minion Panic Bowling place (secondary place in the NOPAS universe; see
> `nopas-lobby/design docs/minion_panic_bowling_IMPLEMENTATION.md`). Pins are
> ten live Minions in a standard ten-pin rack. Before the throw they fidget,
> taunt, and cover their eyes; on impact they enter controlled ragdoll and
> tumble. The sweeper/tractor beam clears knocked-down Minions during reset.
> Server owns the ball — capture from a real match or Studio debug tools
> (`_G.BowlingDebug`), not a staged fake lane.

```yaml
id: bowling-hero
slot: "/nopas/bowling — hero section backdrop (+ still for /nopas More-ways-to-play card)"
format: hero
resolution: 1920x1080
fps: 30
duration_s: 7
loop: palindrome
logline: "A ball rockets down the lane at ten fidgeting Minion pins; they flinch, the strike lands, Minions ragdoll and tumble everywhere, and the overhead scoreboard flashes the celebration."
tone: "Sports-broadcast drama applied to a deeply silly subject. Low lane-level angle behind the ball; the comedy is the pins reacting BEFORE impact."
location: "Any of the four lanes in the bowling room; frame so at least one neighboring lane and the overhead scoreboard read in the background."
lighting: "In-room lighting as-is; lane spots and scoreboard glow carry it."
cast:
  - 1x bowler (any avatar, mid-throw follow-through)
  - 10x Minion pins (idle fidget -> flinch -> ragdoll tumble)
requires:
  - bowling-place-access      # capture inside the Minion Panic Bowling place
  - minion-pin-idle           # fidget/taunt/cover-eyes idle before the throw
  - strike-knockdown          # full ten-pin ragdoll tumble
fallback:
  - "If a live strike is hard to land on camera, use Studio debug (_G.BowlingDebug simulate strike) and shoot the resulting knockdown."
beats:
  - { t: 0.0, action: "lane-level camera behind/beside the ball as it's released; pins fidget in the distance" }
  - { t: 1.5, action: "ball closes in; visible pin flinch/cover-eyes reactions" }
  - { t: 2.5, action: "IMPACT — full strike, Minions ragdoll and scatter" }
  - { t: 4.0, action: "tumble settles; one Minion slides past camera" }
  - { t: 5.5, action: "scoreboard strike celebration in frame; sweeper starts; settle for loop point" }
output:
  dest: "src/assets/clips/bowling/hero.{webm,mp4}"
  budget: "< 2 MB webm"
```

**Notes:** The readable story is **fidgeting pins → flinch → strike → comedic
tumble**. The pre-impact pin reactions are the hook — hold on them long enough
to register before the ball arrives. Grab extra stills at the impact frame:
the `/nopas/` card wants a 16:9 crop with Minions mid-scatter. A second
Mayhem-flavored take (a mutation event or Kingpin crown visible) is worth
banking for future feature-card images but is not required for the first pass.
