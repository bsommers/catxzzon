# sim-enemies report

## What I built
`src/sim/enemies.js` exports `BEHAVIORS` (plus `DIFF`, `diffIdx`, `aimAt`, `PATTERNS`) for: `cheeseball` (enemy bullet: moves, expires after `life`, splats on voxels; the boss's bullets get it too), `turret` (stationary; idle -> telegraph (`e.tele` 0..1 + blinking frame 4) -> burst of aimed cheeseballs; fires only when the player is 24..range units in front; aim frames 0-3 by iso diagonal, 4 flash, 5 hit), `pad` (arms when `0 < pad.y-player.y <= trigger` (default 170), blinks, launches 1 can (round 1-2) or a 2-can salvo (round 3+); frames 0/1/2), `can` (boost climb, then homes on x and altitude with turn-rate-limited velocity steering, forward drift in later rounds, hisses every 0.55 s, gives up and climbs away once past the player, explodes on voxels), `field` (static = always on; `pulse`/`phase` duty cycle by round, `e.warn` flicker before switching on, `field_zap` sfx, `e.glow`, frame 1 when glowing), `tuna` (flashing highlight), `radar` (spins, `e.ang` + 4 frames, "DISH-ABLED!" popup when shot by the player), `formation` (expands into `n` mousejets via `g.spawn` and marks itself dead; patterns vee/line/swoop/ring/zig, enter from far ahead and off-field on `side`, weave, shoot, peel off sideways/back and despawn), `mousejet` (works standalone too; `e.bank` -2..2, frame = bank+2), `spud` (drifts toward the player, bounces inside the field, tumbles; on death splits into two small spuds (10^3 box, hp 1, 40 pts) that do not split again), pickups `nip/yarnpick/laserpick` (bob +-4 around base z, rotate, 4-frame cycle).
All difficulty lives in one table `DIFF` indexed by round (1, 2, 3, 4+).

## Verification evidence
- `node --test test/enemies.test.mjs`: 16/16 pass (fake engine implementing the §4 API, plus an integration test inside the real `createGame`). `npm test`: 106/106 pass.
- Determinism: same seed gives an identical snapshot, a different seed differs; the whole scenario runs with `Math.random` replaced by a throwing stub.
- Tuning numbers (test diagnostics): turret shots/30 s r1=8 r2=22 r3=42; weaving player vs a 20-turret gauntlet (3 seeds): hits r1=0 r2=4 r3=5; jet shots r1=7 r3=17.
- Real levels (`buildStage` space stage, 40 s, blind jinking bot, 3 seeds): deaths r1 1-2, r2 2-3, r3 4-6.
- Mutation check: 7/7 mutants caught (no turret lead, unlimited can turn rate, small spuds split, fixed field duty, skipped telegraph, ignored pad trigger, bullets passing through walls).

## Deviations from the contract
- Pulsing-field duty cycle is 0.5/0.55/0.6 (r1/r2/r3+) instead of sim-core's default 0.6. It is never higher than the default, so the level fairness validator stays conservative.
- `spud` treats `vx/vy/vz === 0` as "randomise" (because spawn fills 0 by default), so an explicit `vx: 0` gets randomised.
- Aiming always compensates for the forward scroll and leads only lateral/vertical motion by the round's `lead` factor (round 1 = 0, so a player who keeps moving is safe).

## Mistakes I made and how I fixed them
- Queued (chained) formation jets waited up to approx. 1050 units ahead, beyond the engine's despawn line (scrollY+800), so they were removed before flying in. They now wait at rel0 + 40/s of delay.
- The round 3 second can re-armed too late (the player had already passed). It is now a quick salvo.
- Round 3 space was brutal (approx. 7 deaths in 40 s) because levels already scale jet density 71 -> 124. I lowered the per-jet fire rate and lead, and jets stop shooting once peeling or closer than 120 units.

## Learnings for a future agent
- sim-core does NOT integrate `vx/vy/vz` for kinds that have `update()`, and skips its default field pulse. The behaviour must do both.
- `g._parent` is set during `init`, so jets spawned by `formation.init` are grouped automatically (WAVE CLEAR bonus).
- Level density already ramps by round, so per-entity difficulty multiplies with it. Measure with the real `buildStage`.

## Requests for other modules
- render-scene: please use the render hints `e.frame` (matches the defs.ART frame meanings), `e.tele` (turret glow), `e.on/e.warn/e.glow` (field strands), `e.bank` (mousejet), `e.ang`, `e.heat` and `e.small` (scale `hot_spud` to 10/16 when small).
- qa-bot: round 3 space is hard for blind input. Dodging cheeseballs (steer away from the nearest incoming one) matters.
- No shared-library defects found.
