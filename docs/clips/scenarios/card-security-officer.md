# Scenario: `card-security-officer`

Square class-card loop for the Security Officer (Officer Blart) page. Signature
beat: Blart Bash.

> **Canonical (ClassConfig.SecurityOfficer.blartBash):** Blart Bash is a **committed
> forward charge/breaching rush** (physics LinearVelocity, ~30-stud range) that
> **stops on the first enemy or wall**. It's a setup/engage tool — **light** impact
> (15 dmg) + a **0.6s stumble** on the victim, **no launch/airborne, no invuln**.
> Play it as a charge that bowls into the minion and staggers it, not a knock-them-
> flying slam. (SO's weapons are Button Blaster + Bobbin Bomber + Starch Bomb — the
> Sewing Needle Rifle moved to the Needle Eye class.)

```yaml
id: card-security-officer
slot: "/nopas/defenders/security-officer — aspect-square portrait slot"
format: card
resolution: 800x800
fps: 24
duration_s: 3
loop: palindrome
logline: "Officer Blart charges forward in a committed Blart Bash, bowling into a Minion and leaving it staggered."
tone: "'Not on my watch, swine.' Tiny punch-in on impact; the comedy is the minion staggering/reeling. Heroic anchor energy."
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
  - { t: 0.6, action: "Blart Bash charge forward (committed rush)" }
  - { t: 1.0, action: "charge connects on the minion; rush STOPS on contact; minion staggers (0.6s stumble)" }
  - { t: 1.6, action: "minion reeling, Blart settles in his anchor stance" }
output:
  dest: "src/assets/clips/defenders/security-officer/card.{webm,mp4}"
  budget: "< 1 MB webm"
```

**Notes:** Palindrome loop because a dash doesn't return to start naturally —
forward-then-reverse reads fine for a short card and avoids a hard cut.
