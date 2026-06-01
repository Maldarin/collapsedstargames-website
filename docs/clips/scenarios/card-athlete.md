# Scenario: `card-athlete`

Square class-card loop for the Athlete page. Signature beat: Dodge Roll into a
Citizen Carry scoop.

> **Canonical:** the Athlete's dodge is the **Dodge Roll** (`ClassConfig.Athlete.dodgeRoll`)
> — a quick **zigzag evasive roll** (forward + lateral jink, ~75% evade chance, brief
> ghost frames), not a straight-line "dash". **Citizen Carry** is real
> (`CitizenCarrySystem` — the Athlete can pick up and carry living NPC citizens).
> The Athlete also has a double jump; weapons are Handgun + Street Sweeper + Caltrops.

```yaml
id: card-athlete
slot: "/nopas/defenders/athlete — aspect-square portrait slot"
format: card
resolution: 800x800
fps: 24
duration_s: 3
loop: palindrome
logline: "The Athlete zigzag Dodge Rolls through frame and scoops up a panicking Citizen mid-stride (Citizen Carry)."
tone: "'Catch me if you can, swine!' Speed + last-second save. Motion blur on the roll; the citizen's flailing legs are the gag."
location: "Neutral staged area; orange accent glow (#ff7547)."
lighting: "Key + warm orange rim; slight motion streak."
cast:
  - Athlete (dashing left->right)
  - Citizen (Screamer) (mid-frame, gets scooped)
requires:
  - athlete-rig
  - dodge-roll-anim          # zigzag evasive roll (forward + lateral jink)
  - citizen-carry-anim
  - citizen-rig
fallback:
  - "dodge-roll-anim MISSING: fast zigzag CFrame translate (forward + lateral) + roll/run emote + a motion-blur trail Part."
  - "citizen-carry-anim MISSING: weld the citizen to the Athlete's arms on contact + play a run-with-load pose."
camera:
  type: static
  marks: { mark: "side-on capturing the full dash lane; citizen scoop point centered" }
  fov: 45
beats:
  - { t: 0.0, action: "Athlete crouched start pose, Citizen panicking ahead" }
  - { t: 0.4, action: "Dodge Roll — zigzag blur across frame" }
  - { t: 0.8, action: "scoop: citizen lifted into a carry" }
  - { t: 1.4, action: "Athlete carries citizen out of the scoop zone" }
output:
  dest: "src/assets/clips/defenders/athlete/card.{webm,mp4}"
  budget: "< 1 MB webm"
```

**Notes:** Palindrome — a dash-and-carry has no natural loop; forward/reverse
gives a fun 'zip in, zip out' feel for a small card.
