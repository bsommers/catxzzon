# audio-sfx report

## What I built
- `src/audio/sfx.js`: all 37 `defs.SFX` as pure recipes -> voice lists (osc/noise, exp freq curves, FM, series/parallel biquads). Two backends: WebAudio `schedule()` and pure-JS `renderPcm()`/`renderSfx()`/`stats()`. Cheese-crunch booms (hp crackle + lp rumble + thump), squeaky `spud_pop`, `can_hiss` noise, saw+FM zaps, formant-swept meows (saw through 3 parallel bandpasses), pitch-varied `shot`.
- `src/audio/audio.js`: `createAudio({bus, ctx?, AudioContextCtor?, rng?, musicModule?})` -> `resume, setVolume, getVolume, play(name,{x,gain}), music(name|null), muted (get/set), toggleMute, stats, dispose`. Chain: sfx/music gains -> master -> DynamicsCompressor limiter (-6 dB, ratio 20) -> destination. Voice limiting: 30 ms retrigger gate, 4 per name, 20 total, priority names bypass. Pan from `x`. Subscribes to bus `sfx`/`music`. Lazy AudioContext (created on `resume()` or first play); `createStubContext()` recording stub exported.
- `tools/sfx-wav.mjs`: renders `out/sfx/*.wav` and prints peak/RMS/length.
- `test/audio-sfx.test.mjs`: 8 tests.

## Verification evidence
- `node --test test/audio-sfx.test.mjs`: 8/8 pass. `node tools/sfx-wav.mjs`: 37 wavs, all peak <= 0.96, none silent.
- Mutation checks: perName cap 4->99 fails the limiting test; limiter ratio 20->1 fails the chain test; both restored.
- Not verified by ear (no audio device); sound quality judged only by numbers.

## Deviations from the contract
- `music()` delegates to optional `./music.js` (see Requests); with no module it only records the name.

## Mistakes I made and how I fixed them
- First render had booms peaking at 1.7 (pre-limiter); scaled boomBody layers (k=0.5). meow_a was too quiet (0.28): raised gain.
- Left a garbled gain expression in renderVoice; rewrote it.

## Learnings for a future agent
- Recipes are data, so tests can assert voice counts without audio; offline FM/filters are approximations of WebAudio, so peaks differ slightly.

## Requests for other modules
- audio-music: export `createMusic({ctx, out, volume}) -> {play(name), stop(), setVolume(v)}` from `src/audio/music.js` (or default export); audio.js imports it dynamically and routes it into the music gain bus.
