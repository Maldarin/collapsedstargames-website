# Scenario: `card-security-officer`

Square class-card loop for the Security Officer (Officer Blart) page. Signature
beat: Blart Bash.

```yaml
id: card-security-officer
slot: "/nopas/defenders/security-officer — aspect-square portrait slot"
format: card
resolution: 800x800
fps: 24
duration_s: 3
loop: palindrome
logline: "Officer Blart dashes forward and shoulder-slams a Minion off its feet (Blart Bash)."
tone: "'Not on my watch, swine.' Tiny punch-in on impact; the comedy is the minion tumbling. Heroic anchor energy."
location: "Neutral staged area; denim-blue accent glow."
lighting: "Key + denim-blue rim to match the Defender accent."
cast:
  - Security Officer (Officer Blart) (center-left, dashing right)
  - Minion (center-right, gets bashed)
requires:
  - security-officer-rig
  - blart-bash-anim
  - minion-rig
fallback:
  - "blart-bash-anim MISSING: CFrame-dash the rig forward + play a shove/punch emote; apply impulse to the minion on contact."
camera:
  type: static
  marks: { mark: "side-on 3/4 capturing the dash lane left->right, both rigs in frame" }
  fov: 42
beats:
  - { t: 0.0, action: "Blart braced (anchor pose)" }
  - { t: 0.6, action: "Blart Bash dash forward" }
  - { t: 1.0, action: "shoulder-slam connects; minion tumbles back" }
  - { t: 1.6, action: "minion airborne, Blart settles" }
output:
  dest: "src/assets/clips/defenders/security-officer/card.{webm,mp4}"
  budget: "< 1 MB webm"
```

**Notes:** Palindrome loop because a dash doesn't return to start naturally —
forward-then-reverse reads fine for a short card and avoids a hard cut.
