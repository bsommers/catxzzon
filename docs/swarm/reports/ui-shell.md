# ui-shell report

## What I built
- `index.html` (640x360 canvas), `style.css`, `src/main.js` (loading -> title+attract -> play -> pause/options -> gameover/initials -> title; credits; error overlay; fixed 1/60 loop with interpolation; `?autostart ?seed ?stage ?round ?bot ?debug`).
- `src/core/input.js` (keyboard, Gamepad, touch; `poll()` sim input, `menu()` edges), `src/core/settings.js` (settings + `catxzzon.hi` table, guarded storage).
- `src/ui/menus.js` (menu model, options/pause/title items, drawing), `src/ui/screens.js` (procedural dripping-cheese CATXZZON logo, title, loading, hi table, initials, game over, scrolling credits with FOR JESSE, victory overlay, error).
- All modules dynamically imported with fallbacks (missing renderer => flat backdrop + HUD; missing autopilot => scripted weave).

## Verification evidence
- `node --test test/ui-shell.test.mjs`: 7 pass. Mutation checks: hiRank tie comparison and invert removal both made tests fail; restored.
- tools/shot.mjs screenshots (out/shots/ui-title.png, ui-play.png): title/logo/menu and pause menu render; no JS errors, only 404s for not-yet-landed modules (renderer, autopilot, boss).

## Deviations from the contract
- Pause is handled by main (sim not stepped while paused; `pause` bus event emitted by main; `input.pause` is never forwarded to sim).
- Orchestrator note: main calls `createPopups(bus)` once and `popups.update` per tick. It calls `popups.draw` only if `renderer.drawsPopups` is falsy (renderer.js did not exist yet). If render-scene calls popups itself it should set `drawsPopups = true` on its return object, otherwise popups would draw twice or after the HUD.
- Attract game uses a bus wrapper that drops `sfx`/`music` so the demo is silent.
- Autopilot API unknown: adapter tries createAutopilot/createBot/default/autopilot/think.

## Mistakes I made and how I fixed them
- Subtitle/menu overlapped logo drips; moved down. Fallback drew HUD on attract; now only for the real game. Test expected digital 1 from 0.9 analog stick; fixed test. Tie-score mutation was initially uncaught; added test.

## Learnings for a future agent
- font glyphs are 5x7 one-pixel strokes; logo scales cells (S=9) and builds drips from bottom-edge cells.

## Requests for other modules
- render-scene: set `drawsPopups` if it already draws popups; export `createRenderer(canvas,{bus,art}).setCRT`.
- qa-bot: export one of createAutopilot(game)->{input|step|update|think(game,dt)} returning {dx,dz,fire,bomb}.
