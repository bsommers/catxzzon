# qa-bot report

## What I built
- `src/sim/autopilot.js`: `createAutopilot(game,{skill})` -> object with `input(g,dt)` (aliases `step/update/think`), plus `auditStage(stage,spd)`, `unfairRows`, `target`, `skill`. Also `export default`. Matches the `src/main.js` adapter (`createAutopilot(g)` then `.input(g,dt)`).
  - Gap planner: fine (4-unit) x/z lattice per blocked row (voxels + non-pulsing fields), body-exact (player box shrunk 1 like `playerHitsVoxels`). Backward boolean DP over nose-entry/tail-exit position sets with separable box dilation; forward greedy walk gives per-row waypoints followed by a SEEK move.
  - Dodging: 10x10 two-phase forward simulation (0.3-0.75 s) against voxels, fields (with pulse prediction), cheeseballs/cans/spuds/jets/boss (velocity from previous-tick positions, declared vx/vy/vz for freshly spawned), with hysteresis.
  - Fire always on; refuel: lines up on fuel tins when free, and a detour quest when there is time; bombs on the boss (cooldown) or on 5+ close enemies; boss arena bypasses wall planning and aims at the boss body.
  - Skill 0..1: reaction delay, decision noise, shorter horizon, smaller margin, shorter plan lookahead, no two-phase search under 0.5.
- `tools/botplay.mjs --stage N --round R --seeds a..b [--skill s] [--lives n] [--maxt s] [--assist] [--verbose]`: reach/deaths(y:cause)/score/time/fuel per seed, death hot spots, LEVEL-UNFAIR windows from the independent audit, exit 1 if skill=1 fails stage 0 on >25% of seeds. `--assist` makes the player invulnerable inside impossible windows so the rest of the stage can be tested.
- `test/autopilot.test.mjs` (9 tests).

## Verification evidence
- `npm test`: 159/159 pass (includes the 9 new ones, ~8 s).
- Mutation checks (restored after): gap planning removed -> staircase test fails; bombs removed -> boss test fails; hazard cost removed -> 2 tests fail; audit disabled -> audit test fails.
- Brute force (random controls through the real `updatePlayer` + `grid`, scratch script) confirmed seed 7 rows cy74->76 cannot be passed.
- Stage 0 round 1 seeds 1..8 unassisted: 0/8 clear, every first death sits on a LEVEL-UNFAIR window (see below). With `--assist`: 6/8 clear (seeds 1,2 die late to fields/walls at y~3200-4200; fuel deaths at y~4000 remain in a few seeds). Space (stage 1) rounds 1 and 3, seeds 1..8: 8/8 clear, 0 deaths. Boss (stage 3) seeds 1..4: all clear (one fuel death).

## Deviations from the contract
- None to the API. `botplay` treats "cleared" as leaving the stage index (stageclear/victory) with the default 3 lives.

## Mistakes I made and how I fixed them
- Sim voxel check used a margin larger than a 1-cell gap, so every gap looked like a collision (fixed: exact box); the sim checked collisions one scroll step too late (game collides before the scroll advances); two-phase moves could not stop on a target (added SEEK sentinel); dither between up/down (hysteresis cost); greedy cell-center DP was too optimistic about travel time between rows (rewrote with entry/exit sets); chain switch point must be the row exit, not centre.

## Learnings for a future agent
- Collision order in `game.update`: player moves, collides at current y, then scroll advances.
- Effective player box vs voxels is 8x10x6 (SHRINK 1). A body crosses a 1-cell row in (16+10)/speed = ~0.31 s but only ~6 units of free flight exist between rows two apart.
- Cheeseballs have `vx,vy,vz` set at spawn; other movers must be tracked by differencing.

## Requests for other modules
- **levels (HIGH):** `tools/validate-level.mjs`/`levels/util.js reach()` times travel centre-to-centre (`Δrows*16/speed`), ignoring the 10-12 unit body depth, so it accepts staircases that cannot be flown. Example: stage 0 round 1 seed 7, rows cy72/74/76/78: gap at x80-128 then x16-64 two rows (32 units) later needs 24+ units lateral in ~6 units of travel (0.07 s * 150). Rows with different gaps need free flight of (Δy - 26)/speed * 150 >= required shift, i.e. about 6 empty rows for a 100-unit shift, or overlapping gap x-ranges when rows are 2 apart. `node tools/botplay.mjs --stage 0 --seeds 1..8` prints the offending y windows per seed (LEVEL-UNFAIR@y=...); ~3-13 windows per seed, all rounds. `ap.auditStage(stage, speed)` can be wired into the validator (pure, Node-safe).
- **levels:** fuel: tins sit directly in front of wall rows or at x far from the gap, so a bot rarely gets a ground-level shot; consider tins in open runs.
- **sim-core/levels:** respawn goes back to the area start, so an unfair window kills 3x in a row at the same spot.
- **render (not mine):** `node tools/check-imports.mjs` reports `src/render/scene.js` imports missing `GROUND_ROWS_AHEAD` from `ground.js`.
