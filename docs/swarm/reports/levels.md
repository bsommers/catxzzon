# levels report

## What I built
- `src/levels/index.js` buildStage(stageIdx, round, seed) (stageIdx wraps mod 4); `util.js` (Builder, mixSeed, speedFor, reach model, rowBlocks); `fortress.js`, `space.js`, `boss.js`; `tools/validate-level.mjs` (also exports checkReachability/validateStage); `test/levels.test.mjs`.
- Fortress set pieces (weighted by difficulty, difficulty ramps with progress, round, and stage 3): single wall, zig-zag walls (shift sized to the round's reach), stacked double walls, 1x1 mouse-hole walls followed by a spray-cheese curtain (vertical slot) or slit (horizontal), altitude staircases (gap rises/falls per row), tower clusters with turret/radar nests, tuna-tin alleys with side-wall turrets, gates (wall with decoy gaps closed by pulsing/static fields), rocket-pad ambushes before walls, plus breathers with pads/turrets/tuna/radar, decor, tuna fill (<=680 gaps), pickups ~every 1150.
- Space: formations (vee/line/swoop/ring/zig), spud bands (<=4 per 96 units, lanes >=56 apart), tuna and pickups. Boss: side-wall courtyard (flags, windows), runes, guards, supplies, bossY=1200.

## Verification evidence
- `node tools/validate-level.mjs --seeds 300` : 4800 stages (4 stages x rounds 1-4), 0 failures; rounds 5-9 x100 seeds also 0. Cells avg ~3.7-4.3k, max 5170 (<6000); spawns 90-260 per fortress.
- `node --test test/levels.test.mjs` : 8 pass (determinism, shape, validation, validator catches sealed wall and too-far gap, no Math.random).

## Deviations from the contract
- Wall height can reach 8 (full) when a gap is high; low/normal walls are 2-7 and ~35-80% get a "cap" field spanning the full width above the wall so you cannot just fly over.
- Field spawn: x = centre of span, y = row centre, z = z0 (world units) plus props `span` (cells), `z0`, `z1`; optional `pulse` (s) and `phase`. The validator treats pulsing fields as always solid.
- Fairness model: reach(rows, round) = floor(moveX/moveZ * dist/speed * 0.7 / 16) cells, speed = baseSpeed + min(50, 10*(round-1)). Assumes sim-core uses that speed ramp.
- Boss side walls sit at cx 0 and 13 (height 2-3 cells), so hugging the very edge at low altitude is lethal; cx<0 is impossible with cellKey.

## Mistakes I made and how I fixed them
- First pass exceeded the 6000 cell budget and put cells past stage length: added lean mode, larger breathers, end margin.
- Tuna-fill looped inserting at one y (clearRow searched outside the window): window-bounded search with fallback.

## Learnings for a future agent
- Keep an "anchor" cell through every layer; building gaps around it makes reachability true by construction, the validator then confirms.

## Requests for other modules
- sim-core/sim-enemies: field `span`/`z0`/`z1`/`pulse` semantics above; `pad.trigger`; formation `n/pattern/side`. Boss spawns itself relative to `stage.bossY` (1200).
