# sim-boss report: Big Boss Jesse

## What I built
- `src/sim/boss.js` exports `bossBehavior = { init, update, onHit, onDeath }` (plus `BOSS` tuning, `phaseFor`, `phaseFloor`, `BOSS_NAME`, default export).
  - **Enter** (2.4 s, can't be hurt): Jesse walks in from `stage.bossY + 440` to his home at `stage.bossY + 290`. On the way he stomps (shake), sends `boss {name:'BIG BOSS JESSE',phase:1,hp01:1}` and taunts `TAUNTS[0]`.
  - **Movement**: he strafes sideways and changes altitude toward targets picked with the rng and biased toward the player's lane. He stays at x in [50,174], so the 56-wide body clears the side walls at cx 0/13, and at z in [8,46]. He moves at half speed while his head is open.
  - **Fight cycle**: charge (frame 3) → missile volley (frame 4, `bossmissile` cans that home on x/z, can be shot, hp 2) → short delay → **OPEN window**. In the window `e.vuln` is true, the frame and `e.glow` flash, and only shots at or above 45% of his height hurt him. Lower shots hit the throne (tink + spark). After 4 or 5 hits the visor slams shut. Then he recovers.
  - **Phase 2** (at 2/3 HP): every recovery adds a cheeseball fan (5 balls). Every other recovery adds a spray-cheese laser wall made of `field` spawns with `bossWall:1`. Walls come in three types: a 4-cell block that sweeps sideways and bounces off the lane edges, a low band to fly over, and a high band to fly under. All of them advance toward the player.
  - **Phase 3** (at 1/3 HP, enraged, frame 6): faster and bigger volleys (6 cans), 7-ball fans, a second fan during recovery, and a mousejet `formation` summoned every 13 s.
  - **Between phases**: he can't be hurt for 2.6 s. He taunts, hisses, and triggers shake + flash. Live missiles explode. He drops a **tuna straight ahead** (holding fire shoots it open) and a **nip** next to it. During the fight he also drops a tuna whenever fuel is below 45, at most once per 11 s.
  - **Damage**: `onHit` handles all damage and always returns false. Damage is clamped at the phase floor, so a bomb can't skip a phase. Bombs (`src.kind==='yarn'`) ignore the window but not the floor.
  - **Death**: the lethal hit starts a 3 s dying sequence (frame 7): chain `boom_big/boom_small` + crumbs every ~0.2 s, rising shake, and missiles, walls and cheeseballs cleared. It calls `g.winStage(3)`, and at 2.9 s `g.kill(e, g.player)` pays the 25000 score. sim-core's `bossDown` timer then brings victory at 3.0 s.
  - **Taunts** (all from `defs.TAUNTS`): on entry, at each phase, after a visor slam, sometimes while charging (at most one per 7 s), and when the player dies. The dying line is not from TAUNTS (see Deviations).
  - **Rounds**: missile/fan speed and missile turn rate go up 10% per extra round, capped at +30%.
- `test/boss.test.mjs`: 9 node:test tests against the real `createGame` + `buildStage(3)`. `test/boss-harness.mjs` holds shared helpers: game + bus recorder, go to the arena, a perfect-aim bot.

## Verification evidence
- `node --test test/boss.test.mjs`: 9/9 pass. Full `npm test`: 128/128 pass (2026-11-16 00:11 UTC).
- Balance probe, 5 seeds × rounds 1/3, with a god-mode bot that aims perfectly: Jesse dies **55–58 s** after he spawns, phases flip at ~16.5 s and ~37 s, and fuel never drops below 35. Without god mode the same bot never dodges: it hit game over on seeds 1 and 3 (killed by missiles and walls) and only just won seed 2 after 2 deaths. So Jesse is threatening and beatable, and a real player should land in the 60–90 s range.
- Mutation check: 9 mutants, **9/9 killed**. Mutants: removed vulnerable-window gate, removed head-zone check, removed per-window cap, removed phase-floor clamp, removed `winStage`, disabled missile homing, removed fans, removed jets, removed nip drop. The source was restored and checked with `diff`.
- Determinism test runs with `Math.random` replaced by a function that throws. Two runs with the same seed give the same signature.

## Deviations from the contract
- **Missiles and walls are steered by Jesse, not by their own behaviours.** `mergeBehaviors` in game.js gives a behaviour object that has `update` only to kind `boss`. So the boss steers its own `bossmissile`s (sim-core moves them by their velocity) and bounces its `field` walls. If Jesse dies early, his missiles fly straight on.
- **Kill timing**: the boss entity stays alive during the 3 s death sequence (`hit=false`, `hp=0`, `g.bossHp01=0`). The engine kill happens at 2.9 s. Victory timing still follows `bossDown` via `g.winStage(3)`.
- The dying line `'NOOO... MY CHEESE...'` is not in `defs.TAUNTS`. Every other taunt is.
- Render hints added on the boss entity: `e.frame` (always numeric, so it overrides the BOSS_ANIM lookup), `e.vuln`, `e.glow`, `e.phase`, `e.mode`, `e.act`. Walls carry `bossWall:1` and `bossChild`.

## Mistakes I made and how I fixed them
- First version: the tuna dropped beside the player, and the bot ran out of fuel (fuelMin 0). Fix: drop it dead ahead and raise the low-fuel threshold to 45.
- Phase 2 fired fans only on odd cycles, which was too rare (5 balls in 25 s). Now there is a fan every recovery and a wall every other recovery.
- The homing test compared positions over 0.75 s, which was too short at phase-1 turn rates. It now checks that the missile's velocity turns toward the player.

## Learnings for a future agent
- `g.hurt` calls `onHit` first. Returning false skips the default damage, which lets you own hp, the window logic and the phase floors.
- `bossDown` runs only once (guarded by `_bossDownT`). Call `g.winStage(d)` early, then `g.kill` before `d` runs out, and you get score plus victory with no double timer.
- `respawn()` in the arena kills cheeseballs and boss missiles but not walls. Walls from before the death can still be coming, but the player has 2.2 s of invulnerability.

## Requests for other modules
- **render-scene**: use `e.glow`/`e.vuln` on the boss for a head-glow overlay. `e.frame` is always set (7 while dying). Draw `field` entities with `bossWall` like normal strands; they move and have `vx`.
- **sim-core** (optional): if kind maps are wanted, `mergeBehaviors` could also accept `{boss, bossmissile}` when the object has `update`. Not needed now.
- **qa-bot**: in the arena, shoot missiles first, match the boss's head z (`b.z + 0.72*b.h`) while `b.vuln`, and read `bossWall` fields' z band to dodge them.
