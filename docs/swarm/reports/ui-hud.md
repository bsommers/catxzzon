# ui-hud report

## What I built
`src/ui/hud.js` exports `drawHud(ctx, game, t)` and `createPopups(bus)` (`update(dt)`, `draw(ctx, camY)`, `count`).
HUD: 1UP score + HI (top), lives (cat heads, lost ones greyed, min 3 slots) and bombs (yarn balls) bottom-left, vertical altimeter
at left (cell ticks in fortress/boss, 2-cell ticks in space, ship chevron, ground shadow chip, numeric readout, rainbow marker in
catnip, blink when invulnerable), bevelled fuel gauge bottom-centre with flashing LOW FUEL, combo "XN" + decay bar, round flags
(small = 1, gold = 5) + stage name top-right, catnip/laser timer bars bottom-right, boss bar with Jesse bust, nameplate, % and
taunt speech bubble. Popups rise from the projected world position, blink out, cap 24. Pure fillRect + font.js, Node-safe.

## Verification evidence
`node --test test/ui-hud.test.mjs`: 6/6 pass. Mutation checks (low-fuel threshold, altimeter z, popup cap): each made a test fail, restored.
Visual check via tools/shot.mjs on a scratch page (boss stage, low fuel, combo, popup, taunt): layout clean, no console errors.

## Deviations from the contract
None. Taunt bubble uses bus `taunt` events; if the boss is alive and no taunts arrive, HUD cycles `TAUNTS` itself every ~7 s.

## Mistakes I made and how I fixed them
- First layout overlapped altimeter/lives/combo and boss panel covered HI score; moved lives/bombs bottom-left, shifted panels.
- Used the multiplication sign which font.js lacks (renders '?'); switched to 'X'.
- Taunt listener was registered lazily, missing early events; createPopups(bus) now also subscribes.
- Test: drawHud caps dt at 0.1 s per call, so expiry test must step in small increments.

## Learnings for a future agent
- font.js has no multiplication sign; check `glyphChars()`.
- HUD keeps per-bus state in a WeakMap; call `createPopups(bus)` (or drawHud) before the first taunt event.
- drawHud takes wall time `t`; durations advance by the delta between calls (clamped 0.1 s).

## Requests for other modules
- ui-shell / render-scene: call `createPopups(game.bus)` once at startup, `popups.update(dt)` per tick, `popups.draw(ctx, game.scrollY)` before `drawHud`.
- sim-boss: emit `boss {name}` and `taunt {text,dur}` (HUD has fallbacks).
