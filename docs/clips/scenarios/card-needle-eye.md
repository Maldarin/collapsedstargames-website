# Scenario: `card-needle-eye`

Square class-card loop for the Needle Eye page. Signature beat: Sewing Needle
Rifle rooftop pin.

> **Canonical (verified):** Needle Eye is a real class (`ClassConfig.NeedleEye`,
> displayName "Needle Eye") — a fragile rooftop marksman. Weapons: **Pin Pistol**,
> **Sewing Needle Rifle** (precision rifle, the focus here), **Pin Mine** (trap);
> class ability is the **Grappling Hook** reposition. "Sewing Needle Rifle rooftop
> pin + scope glint" is accurate. (Note "pin" = a clean rifle hit; the literal trap
> is the separate Pin Mine.)

```yaml
id: card-needle-eye
slot: "/nopas/defenders/needle-eye — aspect-square portrait slot"
format: card
resolution: 800x800
fps: 24
duration_s: 3
loop: native-seamless
logline: "Needle Eye, perched on a rooftop, lines up the Sewing Needle Rifle; a scope glint flashes; a precise shot pins a distant Minion."
tone: "'One shot. One slack.' Cold precision, dry humor. The scope glint is the loop accent; no wasted motion."
location: "Rooftop edge with a low skyline behind; light-blue accent (#8edcff)."
lighting: "Cool key + light-blue rim; a lens-glint highlight on the scope."
cast:
  - Needle Eye (foreground, prone/kneeling on rooftop)
  - Minion (distant, the target)
requires:
  - needle-eye-rig
  - needle-rifle-anim
  - scope-glint-vfx
  - minion-rig
fallback:
  - "scope-glint-vfx MISSING: a brief Sparkle/Beam flash on the scope + a quick specular Part."
  - "needle-rifle-anim MISSING: aim pose + a tracer Beam from muzzle to target on the shot beat."
camera:
  type: static
  marks: { mark: "over-the-shoulder from behind/beside Needle Eye, target readable in the distance" }
  fov: 38
beats:
  - { t: 0.0, action: "Needle Eye settled in aim pose" }
  - { t: 0.6, action: "scope glint flashes" }
  - { t: 1.0, action: "shot fires — tracer pins the distant minion" }
  - { t: 1.6, action: "return to steady aim pose = loop point" }
output:
  dest: "src/assets/clips/defenders/needle-eye/card.{webm,mp4}"
  budget: "< 1 MB webm"
```

**Notes:** Keep the aim pose nearly still so the loop hides on the steady hold;
the glint + tracer are the only big motions.
