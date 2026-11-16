# render-scene report (2026-11-16T00:26:41Z)

## What I built
- `src/art/registry.js`: `buildAll()` returns a registry **synchronously** (coloured placeholders for every ART row), upgrades the
  same canvases in place as art modules load (`.ready`, `.version`, `.missing`, `.errors`), clips `gnd_*` tiles to the diamond,
  builds additive `glow()` halos from emissive pixels. Missing / throwing / malformed modules keep their placeholders.
- `src/render/blocks.js`: voxel index (hidden-cube culling, per-row painter lists cached per row window, `topUnder`, cast-shadow rows), height-shaded cube sprites.
- `src/render/ground.js`: scrolling pre-rendered row strips, slab edge, wall cast shadows, decor, holo lane grid for space stages.
- `src/render/sprites.js`: frame choice (sim hints win), bottom-centre anchors (cat centred on its box), hit flash, shadows, altitude ruler,
  spray-cheese strands (wavy ropes pinned at the posts, blobs, drips, additive bloom, ghost when off, flicker on warning), rainbow trail,
  **fly-through gate reticle**.
- `src/render/scene.js`: one painter pass merging cached voxel cells with sorted dynamic drawables (sprites, strand slices, posts, shadows on
  voxel tops, altitude segments, reticle). `findGate()` finds the next wall row (>= 5 of 14 columns) or live field in the cat's lane within
  184 units and tests the sim's collision box against it: mint brackets = fits, red pulsing brackets + cross = will hit.
- `src/render/renderer.js`: background hook -> world layer (light gradient, depth fog toward the top-right, far fade) -> particles -> cheese
  bloom -> popups -> catnip edge glow -> low-fuel pulse -> flash -> HUD -> overlay -> CRT (scanlines, vignette, bloom). Shake, flash,
  hit-stop, eased camera sway. Hooks are dynamic imports with fallbacks; a hook that keeps throwing is disabled after 60 frames.
  `guardBus()` isolates render-side listeners (particles, popups) so they cannot throw into the sim tick.
- `src/render/demo.js` + scratch page `out/render-demo.html`: fake game harness (`?stage=fortress|space|boss|keep&nip=1&crt=1&lowfuel=1&stress=N&t=S&freeze=1`).
- `test/render-scene.test.mjs`: 18 tests.

## Verification evidence
- `node --test test/render-scene.test.mjs`: 18 pass, 0 fail. `npm test`: 161 pass, 0 fail.
- Mutation checks (20 mutants, each applied, tests run, source restored): culling off, painter order reversed, tower counted as wall, thick wall
  not scanned, off fields block, field z band ignored, anchor on back corner, strands not pinned, hit-stop uncapped, hit-stop never freezes,
  throwing hook never disabled, no diamond clip, module error rejects ready, particles on raw bus, no opts fill, guard rethrows,
  gate x / z closed intervals, field touching counts, field lane touching counts: all killed.
- Headless Chrome (tools/shot.mjs), looked at: `out/shots/render-demo.png`, `game1.png`, `stage1.png`, `stage3.png`, `game-wall.png` (bot at a
  wall, mint reticle; zoomed crop checked against the wall geometry), and a montage of `game-blocked.png` (red reticle), `render-boss.png`,
  `render-space.png` (catnip trail + aura + grid), `render-keep.png` (CRT + low fuel).
- `--strict` exit 0 for `/index.html?autostart=1&seed=1`, `?stage=1&seed=1`, `?stage=3&seed=1` (after art-boss delivered `src/art/boss.js`;
  before that the only strict error was its 404).
- Perf (renderer.stats.ms = JS time inside draw(), headless Chrome): demo scene 1.4 ms (259 voxels drawn, 33 sprites); `?stress=2`
  7.7 ms at 60 fps with 2567 voxels drawn (3597 in the row window) and 398 sprites; 10.0 ms with `--gpu none`.
- **Not verified**: frame time of the real game (main.js does not expose the renderer); a real boss fight end to end in the browser (only the
  demo boss scene and the guard test); frame pacing on a real display; GPU raster cost (stats.ms does not include it). The stress scene draws
  2567 voxels, not the full 3000 of the target.

## Deviations from the contract
- Painter key is `isoDepth = x - y + z` (entity box centre vs cell base centre), not `depthKey` (0.01*z): with depthKey, entities standing on
  voxel tops sorted behind the voxel.
- `?scene=demo` is **not** wired into `index.html` (main.js is not mine). The harness lives at `/out/render-demo.html` (scratch output, may be cleaned).
- Extras beyond section 8: gate reticle, player shadow ring + centre pip, shadows landing on voxel tops, `setOverlay`, `deferCRT`/`applyCRT`,
  `drawsPopups`, `guardBus`, `stats`. Cheese strands are drawn inside the painter pass (so they sort against walls and the cat); only their
  bloom is drawn after particles.
- `particles.update(dt, game)` and `drawBackground(ctx, game, t, art)` are called with the extra argument the orchestrator specified.

## Mistakes I made and how I fixed them
- The demo crashed on its first browser run: it emitted `fx ring` without opts and the particle handler threw. Node mock-canvas smoke had run with
  `hooks: false`, so it never loaded particles. Fixed the demo payload, then added `guardBus` and a test that loads the real hooks.
- My first diamond-clip test passed with the clip removed (placeholder tiles are already diamonds). Rewrote it with opaque tiles from a fake module.
- One mutant was a syntax error, which "killed" every test for the wrong reason. Replaced it with a valid one.
- The CRT pass (default ON) was too dark (scanline 0.19, vignette 0.62): HUD corners dimmed. Now 0.12 / 0.42 with bloom 0.24. Fog 0.34/0.72 -> 0.26/0.62.
- The player shadow was unreadable on the dark keep floor and the space grid was invisible under CRT: brighter ring + pip, brighter grid.

## Learnings for a future agent
- Run the browser harness early. A Node mock canvas proves "does not throw" for your own code only.
- `bus.emit` is synchronous and unguarded: a cosmetic listener can break the sim. Wrap what you subscribe on behalf of others.
- Check tests with mutants that parse, and make sure the fixture can actually fail (a fixture that already satisfies the property proves nothing).
- For readability checks, crop and zoom (`convert -crop ... -filter point -resize 400%`) instead of guessing from a full frame.
- `--wait-for` with a JS predicate on `window.__catxzzon.game` gets a screenshot at the moment that matters (wall 40 to 80 units ahead).

## Requests for other modules
- **render-fx** (`src/render/particles.js:146`, defect): `(o && o.color) !== undefined ? o.color : C.white` throws when opts is null.
  Should be `o && o.color !== undefined ? o.color : C.white`. `src/sim/boss.js:324` (boss death) emits `ring` with no opts. The renderer
  now shields this, but any other subscriber on the raw bus would still crash the tick.
- **core** (`src/core/events.js` emit): isolate listeners with try/catch so one bad listener cannot unwind into the sim.
- **ui-shell / main.js**: add `if (q.get('scene') === 'demo') { (await import('./render/demo.js')).runDemo(canvas); return; }`; expose
  `renderer` on `window.__catxzzon` so QA can read `renderer.stats`; `main.js:187` creates a second popup layer on the raw bus (it is skipped
  for drawing via `drawsPopups`, but it still listens); menus are drawn after the CRT pass, use `renderer.setOverlay(fn)` to put them under it.
- **audio-sfx** (`src/audio/sfx.js:29,67`): `'saw'` is not a valid OscillatorType (Chrome warns, should be `'sawtooth'`).
- **sim**: the reticle mirrors `player.js` (SHRINK = 1 + open intervals for voxels, full box `playerTouches` for fields). If either changes, the
  constants in `scene.js findGate` must follow, or export one shared `playerFits(x, z, row)` helper.
