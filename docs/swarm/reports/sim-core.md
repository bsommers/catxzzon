# sim-core report

## What I built
- `src/sim/grid.js`: `createGrid(cells)`, which returns `{cellAt, rows(cy), solidAt, boxHit(x0,x1,y0,y1,z0,z1), rowCys, count, minCy, maxCy}`. Cells live in a Map keyed by `cellKey`. Each row's cells are sorted by (cz, cx).
- `src/sim/player.js`: movement at moveX/moveZ, clamps to xMin..xMax and zMin..zMax, bank smoothed toward `dx*2`, `y = scrollY + PLAYER_LEAD`, a 3D AABB vs voxels with 1 unit of forgiveness, and thread-the-needle detection. A needle is a vertical empty run of at most 1 cell in the player's column with a voxel above it. The bonus is paid when the player leaves the row alive.
- `src/sim/shots.js`:
  - Auto-fire at `fireRate`, or `nipFireRate` during nip.
  - Hairballs are entities in `g.ents` with `vy = shotSpeed` and range `shotRange`. They die on voxels and collide by full 3D AABB. A hit on a `hit` entity damages it; a solid non-hit entity absorbs the shot with a zap.
  - Laser-pointer homing steers toward `nearestEnemy`.
  - Yarn bomb: a lobbed shell that bursts on contact, on a voxel, at the ground, or after 220 units. Burst radius is 90. Bosses take 10, other hit-able entities take 99, and cheeseballs are erased.
- `src/sim/score.js`: score and hiscore, combo (1.5 s window, multiplier capped at ×8), `combo` events, and extra lives from `TUNING.extraLifeAt`.
- `src/sim/stageflow.js`:
  - `loadStage` calls `buildStage(idx, round, seed)` and uses `fallbackStage` if that throws or returns nothing.
  - Flow: intro (2.2 s, scroll keeps running) → play → stageclear (3.2 s, stage-clear bonus + fuel bonus + clean sweep) → next stage.
  - Boss stage: scroll stops at `bossY`. Victory comes 3 s after the boss dies, shows for 6 s, then round+1 starts again at stage 0, faster.
  - Death: `dying` lasts 1.2 s, then lives−1. The player respawns at the 800-unit checkpoint (spawns rewound) with `invulnAfterDeath`. In the boss arena the boss is kept and only enemy fire is cleared. At 0 lives the state goes to `gameover`.
- `src/sim/game.js`:
  - `createGame` and the engine API `spawn / hurt / kill / sfx / fx / popup / shake / nearestEnemy / cellAt / solidAt`, plus extras `winStage(delay)`, `addScore`, `snapshotHash()`.
  - Behaviours are loaded with a top-level `await import()` wrapped in try/catch, so the sim runs before `enemies.js` / `boss.js` exist. `opts.behaviors` / `opts.bossBehavior` override them (tests pass `{}`).
  - Pickups (nip / yarnpick / laserpick), tuna refuel when killed, fuel drain and low-fuel warning, nip overdrive (invulnerable, kills solid hazards on touch), pause (rising edge), formation group "WAVE CLEAR" bonus, and all sim-owned §6 events.
- `test/sim-core.test.mjs`: 21 node:test tests.

## Verification evidence
- `node --test test/sim-core.test.mjs`: 21 pass, 0 fail. Covers grid, determinism trail, a no-Math.random source scan, movement and clamps, fire rate, 3D altitude hits, homing, bomb, combo and extra life, wall death → respawn → game over, invulnerability, fuel and tuna, pickups and nip, fields with pulse, thread the needle, stage flow, boss → victory → round 2, behaviour dispatch with formation groups, pause, bullets, and real-levels integration.
- `npm test`: whole suite green.
- Scratch headless run with real `levels` + `buildStage`: 400 s of game time in about 120 ms. It went through all 4 stages, reached victory and looped into round 2. Max entity count was 45.

## Deviations from the contract
- Velocity integration: the core integrates `vx/vy/vz` only for kinds that have no `update` behaviour. A behaviour that has `update` must move its entity itself. Hairball and yarn are handled by the core.
- Field `z0/z1`: values ≤ 8 are treated as cells, otherwise as units (levels uses units). `x` is the centre; an optional `x0` is the left edge. `e.on` (bool) tells render/behaviours whether the field is solid. The core runs a default pulse (on for 60% of `pulse`) only when no `field` behaviour exists.
- `e.hit` and `e.solid` are copied per entity from KINDS, so behaviours can toggle them (for example the boss head being vulnerable). `g.hurt` ignores `e.hit` (bombs always damage the boss). An `onHit` that returns `false` cancels the damage.
- If a boss stage has no `boss` spawn, the core spawns one at `bossY+300` when scroll reaches `bossY`. Boss hp = `TUNING.bossHits`.
- Victory comes 3 s after `kill(boss)`. Behaviours can call `g.winStage(delay)` instead.
- Clean sweep is paid at stage clear only if every hit-able enemy spawned in the stage was killed by the player. A separate "WAVE CLEAR" bonus (n×100) is paid when every child of a formation (3 or more) is killed. Children are grouped automatically when spawned inside a behaviour's `init`.
- `pause` and `bomb` are rising-edge detected inside the sim.
- Touching a hit-able enemy kills both the player and the enemy (the enemy gives no score). Touching the boss kills only the player.
- Voxels do not kill during nip or respawn invulnerability.
- `g.t` keeps advancing while in `gameover`. Nothing else changes.
- Player has extra fields: `team:'p'`, `kind:'cat'`, `w/d/h`, `fireCd`, `anim`. `g.stats = {enemies, kills, threads, deaths}` is reset each stage. `g.lastDeath` holds the cause (`'wall'`, `'fuel'`, or the killer's kind).

## Mistakes I made and how I fixed them
- My first tests put targets at y 250–330. The 2.2 s intro had already scrolled the player past them, so they collided. I moved the targets ahead of the scroll.
- A comment in game.js containing "Math.random" tripped my own source scan. I reworded it.
- The bomb test relied on loose geometry. I rewrote it to place targets at the computed burst point.

## Learnings for a future agent
- The intro does not freeze scroll, so place test spawns 400 or more units ahead.
- Use `createGame({behaviors:{}, bossBehavior:null, buildStage: fallbackStage})` for isolated, deterministic tests. `snapshotHash()` is FNV over quantized state.

## Requests for other modules
- sim-enemies: inside `update`, move entities yourself (the core does not integrate entities that have an update). For fields, set `e.on` (false = passable). `cheeseball` with no behaviour is integrated by the core, so just give it a velocity.
- sim-boss: the core spawns the boss if levels does not. Toggle `e.hit` for head vulnerability. Victory follows 3 s after `kill`. Use `g.winStage(delay)` to customize, or call `kill` at the end of your own death sequence. Emit `boss` and `taunt` yourself.
- render/ui: read `e.on` for fields, `e.hitT > 0` for hit-flash, `g.player.invuln > 0` for blink, `g.stateT` for the countdown of the current state.
