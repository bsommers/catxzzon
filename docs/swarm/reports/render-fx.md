# render-fx report

## What I built
- `src/render/background.js`: `drawBackground(ctx, game, t, art?)` (+ `setBackgroundArt(art)`). Baked-once sky gradients (dusk/void/night), tiling nebula bands, 150 twinkle stars (sprite `star` for the big ones), baked-potato planet and gouda moon (offscreen bakes), 4 parallax layers of tumbling `spud_bg` potatoes (circle fallback), french-fry comets (frame 8 + additive tail), speed streaks scaling with `game.speed`. Space stage: 1.7x potatoes, 1.8x parallax speed, 1.6x tumble, more comets/streaks.
- `src/render/particles.js`: `createParticles(bus, art)` -> `{update(dt, game?), draw(ctx, camY), clear(), dispose(), spawn(type,x,y,z,opts), count}`. SoA pool of 1500, handles all fx types (boom_small, boom_big, crumbs, spark, splat, smoke, ring, trail, spud_burst, confetti); additive pass for glow; crumbs have gravity + one bounce; cat engine flame / rainbow nip trail when `update` is given `game`.
- `test/render-fx.test.mjs` (7 tests).

## Verification evidence
- `node --test test/render-fx.test.mjs`: 7 pass. Mutation checks (no gravity, streaks off, potato multiplier off, pool cap off) each made a test fail, then restored.
- Headless Chrome shots `out/shots/fx-{void,dusk,night}.png` (via `out/fx-preview.html`) inspected; fixed halo rectangles and nebula seam.
- Perf in headless Chrome: background 0.25 ms/frame, particles 1.23 ms/frame at 1496 live particles.

## Deviations from the contract
- `drawBackground` takes an optional 4th arg `art` (or call `setBackgroundArt`), since contract signature has no registry.
- `particles.update(dt, game)` takes an optional `game` for the cat trail (contract: `update(dt)`); without it no trail is emitted.

## Mistakes I made and how I fixed them
- `opts.spd || 95` swallowed spd=0; now `??`. Halo bake gradient was clipped to a rectangle; nebula wasn't periodic (visible seam). Fixed both.
- Preview harness first emitted explosions behind the camera.

## Learnings for a future agent
- Use out/fx-preview.html?bg=&kind=&nip=1 with tools/shot.mjs --wait-for window.__ready.
- Streak count is fixed; only length/alpha scale with speed.

## Requests for other modules
- render-scene: call `particles.update(dt, game)` (pass game) and `drawBackground(ctx, game, t, art)`; `t` should be a continuous render clock in seconds.
