# Swarm manifest — CATXZZON

## @meta
project: CATXZZON
tagline: Zaxxon, but you are the cat. Spray-cheese forcefields, space potatoes, Big Boss Jesse.

## @preamble
You are subagent `{{id}}` ({{name}}) in a parallel swarm building **CATXZZON** in `{{root}}`. Model tier: {{model}}.

Rules:
1. `ARCHITECTURE.md` (and any shared definitions file) is the binding contract. Read only what your task needs: list the
   sections (`grep -n '^## ' ARCHITECTURE.md`), Read those with offset/limit, grep shared files instead of reading them whole.
2. You own ONLY: {{owns}}. Besides those you may write your tests under `test/`, your report, and scratch output.
   Other agents are writing other modules **right now**: their files may be missing or half-written. Code against the
   contract, guard with fallbacks, never edit a file you do not own; list what you need under "Requests" in your report.
3. Progress reporting (drives a live dashboard): first `node tools/swarm-tracker/bin/track.mjs {{id}} start "<plan in a few words>"`;
   then `track.mjs {{id}} progress <pct> "<what just landed>"` at 4 or more milestones; finally
   `track.mjs {{id}} done "<one-line result>"` (or `blocked` / `failed` with the reason). Run from {{root}} or set TRACKER_ROOT.
4. Verify for real before claiming done: run it, test it, look at it. For logic/guard tests, do a quick mutation check (break the code, see the test fail, restore). The orchestrator will re-run your tests itself. Report failures honestly.
5. If you must wait for another agent's file, poll (`for i in $(seq 90); do [ -f <path> ] && break; sleep 10; done`),
   then proceed with a fallback if it still is not there.
6. Finish by writing `docs/swarm/reports/{{id}}.md` with sections: **What I built** · **Verification evidence** ·
   **Deviations from the contract** · **Mistakes I made and how I fixed them** · **Learnings for a future agent** ·
   **Requests for other modules**. Report shared-library defects here too, do not only work around them.
7. Keep chat output minimal (status lines only). Final reply: 8 lines max.
8. Save work to disk early and often; the swarm can be interrupted by usage limits. If your owned files already exist,
   you are RESUMING: inspect them and continue instead of starting over.
9. Install no new dependencies. No git commands unless told. Never kill processes you did not start.
10. Context budget — your whole context is re-sent on every tool call, so keep it small: read files with offset/limit
    or grep, never whole large files; pipe command output through `tail`/`grep` (40 lines max); look at an image only
    when you will act on it (about 6 in total; prefer numeric checks); never re-read a file you just wrote.
11. Checkpoints — keep `docs/swarm/progress/{{id}}.md` (30 lines max: **Done** · **Next steps, in order** ·
    **Gotchas** · **Commands to verify**) and update it at every milestone. If it exists when you start, you are a fresh
    agent continuing the job: read it first, trust it, do not re-derive. After about 25 tool calls, or at a milestone with
    substantial work left, update the checkpoint and END your turn with a last line `CONTINUE: <next step>`. Only write
    the report and call `track.mjs ... done` when the whole task is finished.
12. Stamp times with `date -u`; never type a timestamp.

Your task:

## @role:art
Role appendix: art module. Read ARCHITECTURE.md §7 and your rows of `ART` in src/core/defs.js (`grep -n "'<module>'" src/core/defs.js`). Look at your sheet at x4 scale and iterate at least twice; sprites must be charming, readable at 1x, clearly cheese/cat/rat themed, consistent palette (warm cheese yellows/oranges, deep violet shadows, #1a1420 outline). Run `node tools/sheet.mjs <module> --scale 4`; it must print OK.
## @role:sim
Role appendix: sim module. Pure deterministic JS, no DOM. Write node:test tests for your module. Never use Math.random. Keep per-tick allocations low (reuse objects; no per-frame closures in hot loops).
## @role:render
Role appendix: render module. Browser canvas 2D at 640x360 (VIEW). Verify visually with tools/shot.mjs (headless Chrome) and fix what looks wrong; target is *beautiful*, not merely working. 60 fps with ~400 live entities and ~3000 visible voxels.
## @role:audio
Role appendix: audio module. WebAudio synth only. Provide an offline/stub path so Node tests can import and call everything. Verify by rendering to an OfflineAudioContext-free analysis (e.g. simulate the scheduler against a recording stub and assert note counts), plus clipping guards (limiter on master).
## @role:ui
Role appendix: ui module. Canvas 2D pixel UI using src/ui/font.js. Verify visually with tools/shot.mjs.
## @role:qa
Role appendix: qa module. Be skeptical; your job is to find what is broken and fix what you own, and report the rest precisely.

## sim-core | opus | p1 | sim | Sim core
owns: src/sim/game.js, src/sim/player.js, src/sim/shots.js, src/sim/grid.js, src/sim/score.js, src/sim/stageflow.js, test/sim-core.test.mjs
Implement ARCHITECTURE.md §4 exactly: `createGame`, player movement/bank/clamps, auto-fire hairballs (3D AABB hits, laser-pointer homing), yarn bomb, fuel/lives/score/combo/extra lives/pickups/nip overdrive, voxel grid (`createGrid(cells)`, `cellAt`, `rows(cy)`, `solidAt`), collisions, thread-the-needle & clean-sweep bonuses, stage flow with intro/clear/boss/victory/round loop, all bus events in §6. Dispatch to `BEHAVIORS` / `bossBehavior` (import with try/catch fallback to empty maps so you work before those modules land). Include a minimal inline test level so tests do not depend on `levels`. `g.update` must be deterministic given seed+inputs. Also export `createGame().snapshotHash()` for determinism tests.

## render-scene | fable | p1 | render | Iso renderer
owns: src/render/renderer.js, src/render/scene.js, src/render/ground.js, src/render/blocks.js, src/render/sprites.js, src/art/registry.js, test/render-scene.test.mjs
Implement ARCHITECTURE.md §8: the isometric painter's-algorithm renderer — scrolling ground tiles, voxel castle rows (cull hidden cubes, draw only near rows), entity sprites with bottom-centre anchor, ground shadows + altitude line, animated spray-cheese force-field strands (procedural glowing wavy cheese ropes between `field_post` sprites, z0..z1 band, pulse on/off), screen shake/flash/hit-stop, rainbow trail and aura for catnip, boss rendering, CRT option. This is the visual heart of the game: make it gorgeous (subtle lighting gradient, depth fog toward the top-right, glow on cheese, camera feel). Until art modules exist, fall back to coloured placeholder boxes via registry (the registry must tolerate missing modules). Provide a debug harness page `?scene=demo` (own file `src/render/demo.js`) that renders a hand-built scene with a fake game object so you can screenshot without the sim. Draw hooks: call `drawBackground`/`createParticles`/`drawHud`/screens if importable (dynamic import with fallback). Coordinate math must use src/core/iso.js.

## art-cat | opus | p1 | art | Art: cat ship, shots, items
owns: src/art/cat.js, test/art-cat.test.mjs
Module `cat`: all rows with module 'cat'. The hero `cat_ship` (Major Marmalade as a flying spaceship) is THE most important sprite in the game: orange tabby with stripes, round head with pointed ears, goggles/scarf optional, paws outstretched like wings, tail curled as a glowing engine flame, seen from behind/above facing up-right, 5 bank angles x 2 flame frames. Also portrait x3 (expressive!), hairball, yarn, nip, laser dot, aura, HUD cat head.

## art-fx | sonnet | p1 | art | Art: effects, force-field posts
owns: src/art/fx.js, test/art-fx.test.mjs
Module `fx`: explosions that look like exploding cheese splats (not generic fire), crumbs, sparks, smoke, shockwave ring, the spray-cheese-can `field_post` (nozzle up, glowing frame), the tileable `strand` (spray-cheese rope pattern, yellow/orange, glossy highlights, drips), and enemy `cheeseball`.

## art-castle | sonnet | p1 | art | Art: castle cubes & ground
owns: src/art/castle.js, test/art-castle.test.mjs
Module `castle`: the rat-and-mouse cheese castle as 32x32 iso cubes (top face lit, left/front face medium, right face dark; consistent geometry: top diamond 32x16 at the top of the sprite, so cubes tile seamlessly when stacked at (cx,cy,cz) offsets of (+16,+8), (+16,-8), (0,-16) pixels), ground tiles (2:1 diamonds, 4 variants, seamless), decals. Write `test/art-castle.test.mjs` that checks cube silhouettes tile (top-diamond pixel coverage) and tiles are seamless across edges.

## sim-enemies | opus | p1 | sim | Enemy behaviours
owns: src/sim/enemies.js, test/enemies.test.mjs
Export `BEHAVIORS` per ARCHITECTURE.md §4 for kinds: turret (aimed cheeseball bursts with telegraph, lead the player, fire rate scales with round; stationary), pad+can (pad arms when player y is within `trigger`, launches spray-cheese can that climbs and homes laterally/altitude-wise with limited turn rate; hissing), field (static or pulsing spray-cheese barrier: box spans `span` cells wide x `z0..z1`; solid when active), tuna, radar (spins; bonus), formation (expands into mousejets: vee/line/swoop/ring/zig patterns that fly in from the top-right, shoot occasionally, peel off), mousejet, spud (hot potatoes: drift and tumble, split into two small spuds on death), pickups (bob/rotate). Tune so round 1 is friendly and round 3 is hard. Test with a fake game object (implement the engine API from §4 minimally in the test).

## levels | sonnet | p2 | sim | Level generator
owns: src/levels/index.js, src/levels/fortress.js, src/levels/space.js, src/levels/boss.js, src/levels/util.js, tools/validate-level.mjs, test/levels.test.mjs
Implement ARCHITECTURE.md §5. Make the fortress stages *fun*: varied wall rhythms (zig-zag gaps, stacked double walls, tight 1x1 mouse-hole gaps with fields behind them), turret nests on towers, rocket-pad ambushes, tuna tin alleys, 'altitude staircases', set-piece gates. `validate-level.mjs` runs many seeds x rounds 1-4 x all stages and proves reachability with a simple (x,z) search over wall rows, reports spawn counts and cell counts, exits non-zero on failure. Deterministic.

## sim-boss | opus | p2 | sim | Big Boss Jesse
owns: src/sim/boss.js, test/boss.test.mjs
Export `bossBehavior` per §4: Jesse enters at the arena (y = stage.bossY), hovers at the far end of the lane in his cheese-throne walker, strafes laterally and changes altitude. Phases by HP: (1) fires `bossmissile` spray-cheese cans (homing, shootable) in volleys; his head is only vulnerable (hit-able, flashing) briefly after a volley — shooting missiles away is the Zaxxon tactic; (2) adds cheeseball fans and sweeping spray-cheese laser walls (`field` spawns that sweep); (3) enraged, faster, bigger volleys, summons mousejets. Emits `boss` and `taunt` (use defs.TAUNTS) events, screen shake, death sequence of 3 s with chain explosions, then victory. TUNING.bossHits total. Beatable with skill in ~60-90 s; hand the player nip/tuna drops between phases.

## art-enemies | sonnet | p2 | art | Art: rat enemies
owns: src/art/enemies.js, test/art-enemies.test.mjs
Module `enemies`: rat gunner turret (grey rat, spiked helmet, red armband with cheese-wedge emblem, in a gun nest), spray-cheese-can silo and flying can rocket, tuna tin, cheese-wheel radar dish, mouse jet, angry hot spud. Humour and clear silhouettes.

## art-boss | opus | p2 | art | Art: Big Boss Jesse
owns: src/art/boss.js, test/art-boss.test.mjs
Module `boss`: Jesse, 112x120, 8 frames. A giant rat in a cheese-throne walker whose face and coat are unmistakably a *grey dilute tortie cat*: soft blue-grey base, cream and apricot patches, amber eyes, a dramatic dark-grey/cream split face, small round ears, long tail. Imperious and funny. Plus the angry-eyed homing can missile and the 64x64 bust (HUD/intro). A loving tribute; make it great.

## art-spuds | sonnet | p2 | art | Art: space potatoes
owns: src/art/spuds.js, test/art-spuds.test.mjs
Module `spuds`: the 12 space-potato variants (personality!), baked-potato planet, gouda moon, twinkle stars.

## render-fx | sonnet | p2 | render | Background + particles
owns: src/render/background.js, src/render/particles.js, test/render-fx.test.mjs
Export `drawBackground(ctx, game, t)` (gradient sky per stage.bg: dusk/void/night, parallax of 3-4 depth layers of tumbling space potatoes (sprites from `art.get('spud_bg', i)` via a passed registry; fallback to circles), twinkle stars, slow baked-potato planet and gouda moon, nebula bands, speed streaks scaling with game.speed; more/faster potatoes in the space stage; shooting 'french-fry comets') and `createParticles(bus, art)` handling every `fx` event type in §6 (pooled, ≤1500 particles, additive glow where nice, cheese crumbs with gravity, trails behind the cat). Must be pretty AND cheap.

## audio-sfx | sonnet | p2 | audio | Audio: engine + SFX
owns: src/audio/audio.js, src/audio/sfx.js, test/audio-sfx.test.mjs
ARCHITECTURE.md §9: `createAudio`, master chain with limiter, volume/mute, bus subscription, voice limiting, and every name in `SFX` (satisfying: crunchy cheese booms, squeaky pops for rats, hiss for cans, zap for strands, cat meows synthesized with formant sweeps, pitch-varied hairball shots). Expose a `tools/sfx-wav.mjs` script that renders each SFX to out/sfx/*.wav via a pure-JS offline path so they can be inspected by peak/RMS.

## audio-music | sonnet | p2 | audio | Audio: music
owns: src/audio/music.js, test/audio-music.test.mjs
Sequencer + synthesized tracks for every name in `MUSIC` (ARCHITECTURE.md §9). Compose real tunes with motifs, bass lines, drum patterns (noise kick/snare/hat), arps, loops; crossfade on change; tempo-sync fuel-low urgency (an `urgent` flag that raises tempo). Export `createMusic(audioCtx, destination)` used by audio.js (coordinate: audio-sfx owns audio.js and will import `createMusic` with a try/catch fallback).

## ui-hud | sonnet | p3 | ui | HUD
owns: src/ui/hud.js, test/ui-hud.test.mjs
Export `drawHud(ctx, game, t)` per ARCHITECTURE.md §10: score/hi, lives, bombs, fuel gauge with low warning flash, the classic Zaxxon altimeter (vertical gauge at left, ship marker, shadow marker, danger zones when a wall gap is ahead at that altitude is NOT needed — keep it clean), combo meter, round flags, boss HP bar + Jesse bust + taunt speech bubble, catnip/laser timers, floating popups (`popup` events: also export `createPopups(bus)` with update/draw). Stylish arcade look: chunky bevelled bars in cheese colours.

## ui-shell | sonnet | p3 | ui | App shell & screens
owns: index.html, style.css, src/main.js, src/core/input.js, src/ui/screens.js, src/ui/menus.js, src/core/settings.js, test/ui-shell.test.mjs
ARCHITECTURE.md §10: boot, loop, input (keyboard/gamepad/touch), settings (volume, CRT, invert, autofire), title screen with logo (draw 'CATXZZON' in big chunky dripping spray-cheese letters procedurally), attract mode (autopilot from `src/sim/autopilot.js` if present; else scripted weave), pause/options, game over with initials, hi-score table, victory credits ('FOR JESSE' dedication), loading screen while art builds, error overlay. Wire renderer/audio/sim with dynamic imports + fallbacks so the page works with any subset of modules.

## qa-bot | sonnet | p3 | qa | Autopilot & botplay
owns: src/sim/autopilot.js, tools/botplay.mjs, test/autopilot.test.mjs
`createAutopilot(game, {skill})` returns `input` each tick: plans a path through wall gaps (use g.grid and the next wall rows), dodges fields/cans/bullets, shoots turrets/tuna when fuel low, uses bombs on the boss. `tools/botplay.mjs --stage N --round R --seeds 1..8 [--skill 0..1]` runs headless, prints reach/deaths/score/time, exits non-zero if skill=1 bot fails stage 0 on >25% of seeds. Use it to find unfair level segments and report them.

## pkg-build | sonnet | p4 | pkg | Web build + tiny cross-platform executables
owns: tools/build-web.mjs, tools/package-desktop.mjs, desktop/, .github/workflows/release.yml, docs/BUILD.md, test/pkg-build.test.mjs
Goal: (1) `node tools/build-web.mjs` -> dist/web/ : a minified, bundled static build (single index.html + one JS file + css; esbuild is allowed as a build-time devDependency, via `npx --yes esbuild@0.25`; if unavailable fall back to copying src unbundled) AND dist/catxzzon.html: ONE self-contained file (all JS/CSS inlined) playable by double-clicking from file://. Report sizes (gzip too). (2) `node tools/package-desktop.mjs [--platform linux|win|mac|all]` builds STANDALONE desktop executables as small as possible using **Neutralinojs** (prebuilt ~2-3 MB binaries that use the OS webview; download pinned release binaries from github.com/neutralinojs/neutralinojs releases into a cache dir `assets-cache/` (gitignored), verify they run `--version` where possible; wrap dist/web into resources.neu-style bundle or the `neu build --release` equivalent without installing global packages). Targets: linux-x64, windows-x64, mac-x64+arm64 (all buildable from this Linux host), output to dist/desktop/ as `catxzzon-<ver>-<os>-<arch>[.exe|.zip|.tar.gz]` + SHA256SUMS; add a launcher fallback: if the webview is unavailable, start a tiny embedded static server and open the default browser (`--browser` flag). Provide window config (960x540 start, resizable, fullscreen toggle F11, title, icon generated from the cat sprite via src/art/cat.js -> PNG using the PNG encoder in tools/sheet.mjs). Compare against Electron in docs/BUILD.md (size table, tradeoffs, Linux needs webkit2gtk, Windows WebView2). (3) `.github/workflows/release.yml`: on tag `v*` build web + all desktop targets and attach to a GitHub Release (use only first-party actions/checkout, setup-node, upload-artifact, and `gh release create`). SMOKE THE SHIPPED ARTIFACTS, not dist/web: use `tools/smoke_web.sh` for catxzzon.html; unpack each release archive into a fresh temp dir and run the linux binary (see /home/bill/src/fun/game-factory/tools/smoke_linux.sh for the pattern); for Windows use the VM pattern in /home/bill/src/fun/game-factory/tools/smoke_windows.sh (VM at ~/src/infra/win-devvm; adapt for the Neutralino exe: push zip, sha256 check, run `--version`/headless, verify clean) if the VM is reachable, and report skipped otherwise. Also test on this host: build the web bundle, load dist/catxzzon.html via tools/shot.mjs `--url file://...` once the game exists (poll for src/main.js), and run the linux binary with `--version`/headless smoke if possible.

## docs-site | sonnet | p4 | docs | GitHub docs, README & GitHub Pages site
owns: README.md, docs/HOW-TO-PLAY.md, docs/ARCH-OVERVIEW.md, docs/HOW-IT-WAS-MADE.md, docs/site/, .github/workflows/pages.yml, docs/LEARNINGS.md, LICENSE
Like the sibling repos (see /home/bill/src/fun/duum README.md, docs/site/ and /home/bill/src/fun/callofcheeseduty-ratops/{README.md,docs,site,.github/workflows/pages.yml} for style; do not copy text). Write: a README with badges, hero screenshot, feature list, controls, quick start (play in browser link, download executables from Releases, `npm start`), project layout, credits (dedication: "For Jesse"), license (Apache-2.0 LICENSE file); HOW-TO-PLAY; ARCH-OVERVIEW (mermaid/ASCII diagrams of sim/render/audio/ui); HOW-IT-WAS-MADE (the agent swarm: roster table with models, the tracker, learnings, link docs/LEARNINGS.md and reports); GitHub Pages site `docs/site/index.html` (hero, screenshots from out/shots, "PLAY NOW" button to ./play/, downloads table, swarm/tracker section, about Jesse) and `.github/workflows/pages.yml` that runs `node tools/build-web.mjs` (owned by pkg-build; poll for it) and deploys site at / and the playable game at /play/. Screenshots: use tools/shot.mjs (absolute --out paths) and tools/contact_sheet.sh (montage) for galleries; once the game runs (poll for src/main.js; else placeholders). Also screenshot the swarm tracker (`?poll`) into docs/site/img for the HOW-IT-WAS-MADE page.

## polish | opus | p5 | render | Integration, juice & wow pass
owns: src/main.js, src/render/*, src/ui/*, src/core/input.js, src/core/settings.js, index.html, style.css, test/polish.test.mjs
Everything is built and passes tests; you are the final integration/feel pass. Play the REAL game with tools/shot.mjs (absolute --out paths, `--keys`, `--frames`, `?autostart=1&seed=1&stage=0..3&bot=1`) and review frames for each stage including a boss fight (`?stage=3&bot=1`). Look hard for: unreadable altitude cues, sprites mis-anchored/clipped, z-order glitches at walls/towers, force-field and can visuals not reading as spray cheese, HUD overlaps or clipped text, menus (title, pause, options, game over+initials, credits 'FOR JESSE') actually screenshotted and fixed, HUD should use `jesse_bust` art instead of its own vector Jesse, audio wiring (first-gesture resume, mute, music per stage), low-fuel feedback, juice (shake, hit-stop, crumb bursts, combo callouts, rainbow catnip mode, boss intro and death), performance (real-game frame time via ?debug=1 must be <10 ms/frame on this machine; fix hot spots), touch/gamepad sanity, `?scene=demo` wiring. Add 3 creative delights you judge best (e.g. potato-with-sunglasses easter eggs, meow reactions, a title-screen flourish, Jesse intro cinematic). Run npm test + tools/check-imports.mjs at the end; write docs/swarm/reports/polish.md; retake docs/site/img screenshots (title, citadel, spuds, keep, lair, plus a boss fight) with tools/shot.mjs and tools/contact_sheet.sh for your own review.

## bot-tune | sonnet | p5 | qa | Autopilot lookahead fixes
owns: src/sim/autopilot.js, tools/botplay.mjs, test/autopilot.test.mjs
Read docs/swarm/reports/levels-fix.md 'Remaining deaths'. Fix: commit earlier to 1-cell holes with full lookahead; hazard dodging must not override a committed path through a 1-cell gap; account for tin height; after a respawn vary the approach so the same spot is not repeated 3 times. Target: skill-1 bot clears stage 0 round 1 on >=90% of seeds 1..24, stage 0 round 4 on >=60%, stage 2 round 1 >=85%, and beats the boss on >=60% of seeds with lives=3. Mutation-check your tests. Report numbers in docs/swarm/reports/bot-tune.md.
