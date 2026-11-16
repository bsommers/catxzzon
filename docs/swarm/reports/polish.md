# polish — Integration, juice & wow pass (report)

## What I built
- **src/ui/juice.js (new)**: a screen-space overlay that main.js wires in through `renderer.setOverlay` (so it draws under the CRT pass). It shows:
  - **Stage, STAGE CLEAR and GAME OVER banners.** The sim was already emitting `banner` events but nothing drew them. Each banner slides in with a dark band and yellow stripes.
  - **Combo callouts** PAWSOME! / PURRFECT! / CAT-ASTROPHIC! / MEOWNIFICENT! at x3/x5/x7/x8. Each fires once per chain and re-arms when the chain breaks.
  - **Boss intro and defeat cards**, both of which also count as delights (see below).
  - **Three delights**:
    1. **Jesse intro cinematic**: letterbox, hazard stripes, the `jesse_bust` at 2x sliding in, "WARNING / BIG BOSS JESSE / IMPERIAL RULER OF SCHLOSS GORGONZOLA", a hiss sound, and the enraged frame for the reveal. It is paired with a **defeat card**: "JESSE DEFEATED!", the bust tumbling off into space, and "...FOR NOW, SHE SAYS. SHE ALWAYS SAYS THAT."
    2. **Potatoes in sunglasses**: every 3rd destroyed spud loses its pixel sunglasses, which spin away at 2x. Every 6th also shows "DEAL WITH IT". This is deterministic: no `Math.random`.
    3. **Meow reactions**: speech bubbles over the cat on pickups (NOM!, NIP TIME!, RED DOT!, 9 LIVES!), plus a meow sound. The cat also says "TUMMY EMPTY!" when fuel turns low, which adds to the existing red pulse, LOW FUEL text and beeps.
  - The overlay is only active during a real game, so the attract demo stays quiet.
- **hud.js**:
  - The boss bar now shows a 1:1 44px crop of the `jesse_bust` art (enraged frame below 34% hp, white flash when hit). It is set through the new `setHudArt(art)`. The vector `jesse()` remains as a fallback when there is no art.
  - The COMBO label no longer overlaps the x3-scaled multiplier.
  - The stage name now has an ink shadow and a lighter colour. It was unreadable over walls.
- **main.js**:
  - Hit-stop now **freezes the sim**. Before, only the picture froze and the world kept moving.
  - `?scene=demo` now hands off to `render/demo.js`. Before, main never imported it, so the demo never ran.
  - Title menu sits on a panel; the attract cat used to fly through the menu text.
  - The attract bus now also mutes `banner`, `taunt`, `gameover` and `victory`.
  - Audio resume on first gesture now retries while audio is still loading. Before, a gesture during loading was used up and audio was never resumed. It also listens for `touchend`, `click` and `mousedown`.
  - `?debug=1` shows whole-frame ms (sim + render + UI), render ms, voxel and sprite counts at the bottom-right. It used to cover the 1UP score.
  - Removed the duplicate popup list (the renderer owns popups).
  - `window.__catxzzon` now exposes `renderer`, `juice`, `audio` and `perf`.
- **screens.js**: credits roll a little faster (34 px/s) over a darker dim.
- **test/polish.test.mjs**: 8 tests.
- **Site screenshots retaken** in `docs/site/img/` at 1280x720: `title`, `citadel`, `spuds`, `keep`, `lair`, plus a new `boss.png`.

## Verification evidence
- **npm test**: 173 pass, 1 fail. The failure is `test/autopilot.test.mjs` "seed 23 hysteresis trap". It started after `src/sim/autopilot.js` was modified by another agent at 00:56 UTC while I was working. I don't own it, and none of my changes touch the sim. Everything passed (171/171) before that edit.
- **tools/check-imports.mjs**: 45 files, 0 errors.
- **Mutation checks** (each broken change failed the polish tests and was restored):
  - removing the combo re-arm guard;
  - dropping the inactive (attract) guard on spud gags;
  - disabling the bust in the HUD;
  - breaking the hit-stop sim freeze.
- **Frame time**, real game, `?debug=1`, bot playing, measured after 20 s:

  | Stage | Whole frame (avg) | Render | Voxels drawn |
  |---|---|---|---|
  | Citadel | 3.85 ms (max ~5.6) | 3.3 ms | 717 |
  | Spuds | 0.84 ms | 0.6 ms | 0 |
  | Keep | 3.57 ms | 3.0 ms | 440 |
  | Lair / boss | 1.33 ms | 1.0 ms | 114 |

  Stress test (400 live entities plus repeated big explosions): **7.7 ms** average, render 5.0 ms, with spikes to about 14 ms. All are under the 10 ms target, so no hot-spot fix was needed.
- **Screens shot and reviewed**: title, options, pause, credits, game over with initials entry (rank 1, letters cycle), all four stages, boss intro, boss fight, boss defeat, low fuel, sunglasses gag, and `?scene=demo` (renders, no errors).
- **Touch**: a synthetic touch stick plus the fire button gives `poll()` = `{dx:.71, dz:.80, fire:true}`. Gamepad is covered by the existing ui-shell tests.
- **Contact sheet** for review: `scratchpad/site_sheet.jpg` (session only).

## Deviations from the contract
- `banner` events are drawn by `src/ui/juice.js`, a new file in the `src/ui/*` area I own, rather than by `hud.js`.
- `VICTORY` banners are skipped because main already draws the full "FOR JESSE" victory splash.
- The overlay plays two sounds itself by emitting `sfx` on the main bus: `meow_a`/`meow_b` and `boss_hiss`.

## Mistakes I made and how I fixed them
- I assumed `--wait` could be repeated in `tools/shot.mjs` and run between steps. In fact the last `--wait` wins, and the order is waitFor, wait, keys, eval. My first game-over shot therefore never reached game over. I switched to a `--wait-for` expression that drives the action.
- The first sunglasses were 1x and vanished inside the explosion glare, so I made them 2x.
- The first defeat card overlapped the boss bar and taunt bubble, so I moved it to mid-screen on a backing band.
- My test assumed the bus delivers events in a fixed order. My meow re-emit reached the test's listener first, so the test now compares sorted lists.

## Learnings for a future agent
- `renderer.setOverlay(fn)` is the right hook for UI that should sit under the CRT effect.
- `renderer.hitstop` exposes the remaining freeze.
- In the sim, `g.state = 'gameover'` cannot be forced. Set fuel to 0 repeatedly with invuln 0 instead.
- To force a boss kill in shots: set `b.vuln = true; G.hurt(b, 3, 'p')` on an interval.

## Requests for other modules
- **audio-sfx (bug)**: `src/audio/sfx.js:192` sets `src.type = o.src` with `'saw'`, which is not a valid OscillatorType. Chrome logs a warning and **every saw voice silently plays as a sine**, so meows, `pickup_laser` and others sound wrong. Fix: `src.type = o.src === 'saw' ? 'sawtooth' : o.src`.
- **qa-bot**: the `autopilot.test.mjs` seed-23 regression has failed since the 00:56 UTC edit to `src/sim/autopilot.js`.
- **render-scene / levels (optional)**: in the boss arena, Jesse sits at the top-right edge and the crown is sometimes clipped by the screen top and the stage-name text. A smaller `homeDy` or a camera lead tweak would frame her better.
