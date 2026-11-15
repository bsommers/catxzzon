# CATXZZON — Architecture & Contracts

Binding contract for all modules. If your module disagrees with it, your module is wrong. If the contract is wrong/ambiguous, do the sensible thing and record the deviation + "Requests" in your report (`docs/swarm/reports/<id>.md`).

## 1. Vision
An 80s **Zaxxon** clone (isometric diagonal-scrolling shooter with altitude) in the KÄSEKRIEG universe. You are **Major Marmalade**, the big orange tabby — and your *spaceship is the cat* (a cat flying superman-style, tail = engine flame). You raid **Schloss Gorgonzola**, the rat-and-mouse castle built from cheese, defended by grey-uniformed rats (emblem: **black cheese wedge in a white disc on red**; never real-world insignia). Space potatoes tumble in the background. Force fields are **yellow/orange spray-cheese strands**; rockets are **spray-cheese cans** ("SQUEEZ CHEEZ", no real brands). The boss is **Big Boss Jesse**, a huge rat who looks like Jesse, our late grey dilute tortie cat (blue-grey fur, cream + apricot patches, amber eyes, imperious). Credits dedicate the game to Jesse.
Pillars: (1) **tight, readable altitude play** (shadow, altimeter, gaps), (2) **juice** (shake, hit-stop, crumbs, combo callouts, rainbow catnip mode), (3) **charm** (cat puns, Jesse taunts, potatoes with sunglasses), (4) **zero assets, zero deps**: all art drawn by code into `PixBuf`s, all audio synthesized, plain ES modules, no bundler.
Rules: original art only; sim randomness only from `game.rng` (never `Math.random`); sim/core/levels/art code must run in Node (no DOM at import time); touch only files you own (§3); never edit `src/core/*` frozen files, `src/art/pixbuf.js`, `src/ui/font.js` or this file.

## 2. Canonical data
`src/core/defs.js` (read it): `CELL=16`, field `x∈[0,224]`, `z∈[0,128]`, `VIEW`, `TUNING`, `KINDS`, `BLOCKS`, `STAGES`, `SFX`, `MUSIC`, `EVENTS`, `ART` manifest (`tools/sheet.mjs <module>` validates your art module against it), `TAUNTS`. `src/core/iso.js`: `project/unproject/depthKey/cellDepth`.
World axes: **x lateral, y forward (scroll), z up.** Screen: forward = up-right, +x = down-right, +z = up; the camera sees the −y face, +x face and top of boxes. Light from upper-left.
Entity box: `[x±w/2] × [y±d/2] × [z, z+h]` (x,y = footprint centre, z = base). Voxel cell `(cx,cy,cz)` occupies `[cx*16,+16] × [cy*16,+16] × [cz*16,+16]`.

## 3. Layout & ownership
```
index.html style.css src/main.js        ui-shell
src/core/{defs,iso,rng,events}.js       FROZEN        src/art/pixbuf.js, src/ui/font.js  FROZEN
src/core/input.js                       ui-shell
src/art/{cat,fx,castle,enemies,boss,spuds}.js   one art agent each (export build())
src/art/registry.js                     render-scene  (builds all modules once -> canvases)
src/render/{renderer,scene,ground,blocks,sprites}.js   render-scene
src/render/{background,particles}.js    render-fx
src/sim/{game,player,shots,grid,score,stageflow}.js    sim-core
src/sim/enemies.js                      sim-enemies   src/sim/boss.js   sim-boss
src/sim/autopilot.js                    qa-bot
src/levels/{index,fortress,space,boss,util}.js          levels
src/audio/{audio,sfx}.js  audio/music.js                audio-sfx / audio-music
src/ui/{hud,screens,menus}.js           ui-hud / ui-shell
tools/{serve,shot,sheet}.mjs            factory (done)  tools/botplay.mjs qa-bot  tools/validate-level.mjs levels
```
Tests: `test/<id>.test.mjs` (node:test, `npm test`). Previews/screens go to `out/`.

## 4. Simulation API (`src/sim/game.js`, owner sim-core)
```js
import { createGame } from './sim/game.js';
const g = createGame({ seed, bus, round: 1, stageIdx: 0, startStage?: 0, buildStage }); // buildStage injected = levels/index.js
g.update(dt, input);   // fixed step 1/60 recommended; dt <= 1/30
```
`input = { dx:-1..1, dz:-1..1 (+1 = climb), fire:bool, bomb:bool (edge, set true for one update), pause?:bool }`.
State read by render/ui (treat as read-only): `g.t, g.state ('intro'|'play'|'dying'|'stageclear'|'gameover'|'victory'), g.round, g.stageIdx, g.stage (Stage), g.scrollY, g.speed, g.player, g.ents (array), g.grid, g.score, g.hiscore, g.lives, g.fuel, g.bombs, g.combo, g.nipT, g.laserT, g.bossHp01 (null if none), g.rng, g.bus`.
`g.player = { x,y,z, vx,vz, bank (-2..2 smoothed float), invuln (s), alive }`. Player `y = scrollY + VIEW.PLAYER_LEAD`.
Entity: `{ id, kind, x,y,z, w,d,h, hp, team, t (age s), vx,vy,vz, dead:false, ...props, st:{} /*behaviour scratch*/ }`.
Engine API available to behaviours: `g.spawn(kind, props)` (fills box/hp/team from KINDS; props override) → entity; `g.hurt(e, dmg, src)`; `g.kill(e, src)` (score, combo, drops, `fx`, calls `onDeath`); `g.sfx(name, e?)`; `g.fx(type, x,y,z, opts?)`; `g.popup(text, x,y,z, color?)`; `g.shake(mag, dur)`; `g.rng`; `g.player`; `g.scrollY`; `g.nearestEnemy(x,y,z)`; `g.cellAt(cx,cy,cz)`; `g.solidAt(x,y,z)` (true if inside a voxel).
**Behaviours** (`sim-enemies` exports `BEHAVIORS`, `sim-boss` exports `bossBehavior`): `{ init(e,g), update(e,dt,g), onHit?(e,dmg,g,src), onDeath?(e,g) }` keyed by kind; sim-core calls them each tick for every live entity whose kind has one. Spawn entries `{kind:'formation',…}` are expanded by `BEHAVIORS.formation.init` into individual `mousejet`s via `g.spawn`.
**Rules (sim-core):** entities are activated when `y < scrollY+SPAWN_AHEAD`, removed when `y < scrollY−DESPAWN_BEHIND` or `dead`. Player vs voxel/`solid` entity/enemy bullet (not invulnerable) = lose a life (`state:'dying'` ~1.2 s, then respawn at the start of the same area with `invulnAfterDeath`). Fuel drains `fuelDrain/s`; empty = death; `tuna` kill gives fuel; `nip` = 8 s overdrive (invulnerable, fast fire, rainbow trail, kills solid hazards on touch); `yarnpick` +1 bomb; `laserpick` = homing shots 7 s. Hairballs travel +y, die on voxels/range/hit; hit test is full 3D AABB (**altitude matters**). Bomb: yarn shell lobbed forward, bursts on contact/at 220 units, radius 90, damages hit-able enemies, 10 dmg to boss. Combo: kills within 1.5 s chain (`×1..×8` multiplier `SCORES.comboCap`). Bonuses: **thread the needle** (pass through a ≤1-cell-tall gap row without touching: `SCORES.thread`, sfx `thread_needle`), **clean sweep**, stage clear + remaining-fuel bonus. Extra lives at `TUNING.extraLifeAt`. Stage flow: `stageflow.js` loads `buildStage(stageIdx, round, seed)`, emits `stage`/`banner`, runs `intro` (2.2 s title card, scroll continues), `play`, then on reaching `stage.length` (fortress/space) → `stageclear` → next stage; the `boss` stage ends when the boss dies → `victory` splash → round+1 (speed up, denser) loops to stage 0. `lives==0` → `gameover`. Boss stage scroll stops at `stage.bossY` (arena); sim-boss drives Jesse.

## 5. Level API (`src/levels/index.js`, owner levels)
`buildStage(stageIdx, round, seed) → Stage` (shape documented in `defs.js`). Deterministic per `(stageIdx, round, seed)`. Fortress = approach runs (flat decor, tuna tins, pads, turrets on ground) → **walls** (1 cell thick rows of voxels, height 2–7 cells, with **gaps**: 1–3 cells wide, at varied altitudes; mouse-hole arches/windows decorate) → **force fields** (spray-cheese barriers: `field` spawns, `span` cells wide, `z0..z1`) → **tower clusters** with turrets/radar on top → **gates** combining walls + fields. Space stage = formations of `mousejet`, `spud` hazards, tuna/nip pickups, no cells. Boss stage = courtyard (flags, rune decor, side walls) leading to `bossY`. Difficulty ramps within the stage and per round. **Fairness guarantee:** every wall row must have a gap reachable from the previous row's gap at player speed (`tools/validate-level.mjs` proves it for many seeds/rounds). Keep ≥1 tuna tin per ~700 units. Pickups (`nip`,`yarnpick`,`laserpick`) every ~1200 units. Cell budget ≤ 6000/stage.

## 6. Events (`bus.emit(type, payload)`; types in `defs.EVENTS`)
`sfx {name,x?,y?,z?}` · `music {name|null}` · `fx {type,x,y,z,opts?}` types: `boom_small boom_big crumbs spark splat smoke ring trail spud_burst confetti` · `shake {mag,dur}` · `flash {color,a,dur}` · `hitstop {ms}` · `popup {text,x,y,z,color}` · `stage {idx,name,round}` · `banner {text,sub?,dur}` · `score {score,delta,combo}` · `life {lives}` · `fuel {fuel,low}` · `boss {phase,hp01,name}` · `taunt {text,dur}` · `combo {n,mult}` · `bomb {x,y,z}` · `gameover {score}` · `victory {round}` · `pause {on}`. Sim emits; render/audio/ui subscribe. Audio listens to `sfx`/`music` only.

## 7. Art API (`src/art/<module>.js`)
`export function build() → { [name]: PixBuf | PixBuf[] }` exactly matching `ART` rows (size, frame count). Pure & deterministic (use `createRng(seed)`/`hash2`); build time for a module ≤ 400 ms. Use `PixBuf` (`rect, line, ellipse, circle, poly, blit, outline, noise, ramp, shade, mix`). Each sprite: 1px outline `#1a1420`, 3-4 tone shading ramps, light from upper-left, **readable at 1×**. Validate + look: `node tools/sheet.mjs <module> --scale 4` then view `out/previews/<module>.png`.
`src/art/registry.js` (render-scene): `buildAll() → { get(name, frame=0) → HTMLCanvasElement|OffscreenCanvas, size(name), frames(name) }` (Node-safe fallback returns PixBufs).

## 8. Render API (`src/render/renderer.js`, owner render-scene)
`createRenderer(canvas, { bus, art }) → { draw(game, alpha), resize(), setCRT(on), shot() }`. Draws at 640×360 in painter order: background (render-fx `drawBackground(ctx, game, t)`) → ground tiles (scrolling checker per `stage.ground`, none in space) → decor → shadows (ellipse on z=0 under every `shadow` entity, **plus a thin vertical altitude line from player to its shadow**) → voxel rows + entities merged by `depthKey` → particles (render-fx `createParticles(bus)` with `.update(dt) .draw(ctx, camY)`) → force-field strands (animated cheese ropes between posts, bright additive glow) → screen effects (shake, flash, hit-stop freeze) → HUD (ui-hud `drawHud(ctx, game, t)`) → screens overlay (ui-shell). Camera `camY = g.scrollY`. Optional CRT pass (scanlines + vignette + slight bloom) toggled by setting.
Player ship sprite frame from `bank`. Rainbow trail when `nipT>0`. Low-fuel red pulse. Boss sprite is large: anchor bottom-centre, 8 frames named in the ART row.

## 9. Audio API
`createAudio({ bus }) → { resume(), setVolume({master,sfx,music}), play(name), music(name|null), muted }` — also self-subscribes to `sfx`/`music` bus events. WebAudio only; synthesize everything (noise bursts, FM, square/saw chip, simple sequencer). Every name in `SFX` and `MUSIC` must exist. Music: looping chiptune-ish tracks, ≥ 16 bars, distinct moods (fortress = march with minor brass-ish saw; space = floaty arps; boss = driving; title = heroic jingle; victory; gameover). Must be Node-importable (guard `AudioContext`) and testable with an offline stub.

## 10. UI
`src/main.js` wires everything; fixed-timestep loop (1/60) with render interpolation; `?autostart=1` skips the title; `?seed=N`; `?stage=N&round=R`; `?bot=1` autopilot plays; `?debug=1` shows FPS/entity count. Input: keyboard (arrows/WASD move+climb, Space/Z fire, X/Shift bomb, P/Esc pause, M mute, C CRT, Enter select), Gamepad API, touch (left half stick, right buttons). Option: invert altitude. Screens: **title** (logo, attract demo driven by autopilot, hi-score table, "PRESS FIRE"), stage banner, pause menu (resume/options/quit), game over + 3-letter initials entry (localStorage `catxzzon.hi`), victory/credits ("For Jesse"). HUD (`drawHud`): score, hi, lives (cat heads), bombs (yarn icons), **fuel gauge** with low-fuel warning, **altimeter** (classic vertical gauge at left: ship marker + stage-appropriate tick marks), combo ×N, round flags, boss HP bar + nameplate, catnip/laser timers, taunt speech bubble. Pixel font = `src/ui/font.js` (`drawText(ctx,text,x,y,{scale,color,...})`).

## 11. QA
`node tools/shot.mjs --url "/index.html?autostart=1&seed=1" --out out/shots/x.png --wait 1500` screenshots via headless Chrome. `tools/botplay.mjs` runs `src/sim/autopilot.js` through every stage headless and reports reach/deaths/score. `npm test` must stay green. Tracker: `npm run plan && npm run tracker` → http://127.0.0.1:4790/ (port via `TRACKER_PORT`).
