# Survivors website content evidence — 2026-09-11

## Governing source priority (latest owner clarification)

The website represents the **intended broader Survivors game**, not the temporary implementation/testing slice. The owner's latest clarification supersedes an earlier code-only interpretation. Design docs govern intended player-facing scope; current code grounds mechanics and implementation status. Absence from today's code does not mean a designed feature is rejected. Do not headline five waves or the current single-class test roster as the final game.

Owner explicitly confirmed these **confirmed beta events**, even if not yet implemented: **Generator Defense**, **Protect the Citizens**, **UFO Attacks**. Mention them briefly without inventing timers, win conditions, rewards or detailed mechanics. No fixed beta date. Avoid claiming every expansive catalog feature is committed for the first beta.

## Intended gameplay brief

- Co-op third-person roguelite survival: move, aim, shoot the swarm, collect Pants Scrap, level up and assemble a build. Source: `design docs/specs/2026-09-07-minion-survivors-mode-design.md` §§1–2; `design docs/survivors/CONTRACTS.md` §§2.6, 3.3.
- In-wave level-up picks and the Laundry Line Draft between waves have different pacing; the draft combines performance and luck. Source: `design docs/survivors/upgrade-catalog.md` §1 and Contracts §2.7.
- Class roles: Security Officer anchors; Tailor Engineer controls space; Dr. Peepers sustains allies; Athlete outruns/kites; Needle Eye handles precision threats. Source: `design docs/survivors/CONTRACTS.md` §3.1 and `class-kits.md` §§2–6. Citizen and Collector-side Invasion Run remain explicitly deferred in the design; do not add them to the roster.
- Escalating enemies, bosses, upgrade synergies, arena variety and persistent Lint progression are part of the larger design. Source: `enemy-catalog.md`, `arena-design.md`, `upgrade-catalog.md`, `progression-and-rewards.md` §1. Avoid exact catalog/arena totals or first-beta completion promises.
- Owner's latest statement overrides older documents' fixed five-wave/~19-minute shape for website messaging. Avoid fixed wave/time promises. No need to imply endless mode either.

All design paths are beneath `D:/Projects/not-my-pants-alien-scum`. Existing approved website horde image and character artwork are the only media used.

## Current code cross-check (implementation snapshot, not final marketing scope)

| Mechanics/context | Active implementation source beneath game project |
| --- | --- |
| Run service wiring, pickups, level-ups, drafts, registry, damage and revival | `src/server/Systems/SurvivorsService.luau:390` Start actively binds dependencies, callbacks, remotes and heartbeat. Source hash verified. |
| Weapon hits and scrap on kills; primary/splash multipliers | `src/server/Systems/Survivors/SwarmDamageBridge.luau:52` Bind registers weapon providers. Source hash verified. |
| Upgrade examples | `src/shared/Config/SurvivorsUpgradeConfig.luau:20` active Generic catalog: Double-Stitched Rounds, Overstarched Payload, Second Wind, Greased Ankles. Damage consumers in bridge; stamina/speed pushes in service. Config index refresh reported unchanged. |
| Fresh in-run builds | SurvivorsService onRearm resets registry/level-up/bonus channels. This does not preclude intended persistent Lint progression outside a run. |
| Co-op and revive behavior | `src/server/Systems/Survivors/SurvivorsRunService.luau:668` joins; `src/server/Systems/Survivors/SurvivorsReviveService.luau:115,236` assist actions/tick. Source hashes verified. Use solo/squad language, not a certified multiplayer cap. |
| Test slice | Run.ClassId=SecurityOfficer; EnemyConfig TierOrder currently Minion/Big Minion; active run currently ends at wave five. Do NOT present these temporary limits as the game's scope. |

Read-only review only: no game files changed, no Studio or play session used. jCodemunch navigation and symbol verification were used; config indexes refreshed to check source freshness. jDocMunch's available index lacked the dedicated Survivors folder, so those unindexed docs were read directly.

## Delivery scope

Dedicated `/nopas/survivors/`, matching approved visual language, with core loop, owner-confirmed confirmed beta events, real upgrade examples, broader class roles, co-op and progression direction. Update homepage/overview navigation while preserving approved hero/layout. No deployment. Dedicated page implementation and responsive/link/build verification are complete; awaiting visual review by the owner.
