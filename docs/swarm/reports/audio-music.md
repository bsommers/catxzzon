# audio-music report
## What I built
src/audio/music.js: data-driven chiptune sequencer. 7 tracks (title, fortress, space, fortress2, boss, victory, gameover), each 16 bars with lead/bass/arp/pad/noise-kick-snare-hat. `createMusic({ctx,out,volume,timer?,applyVolume?}) -> {play,stop,setVolume,setUrgent,tick,...}`; lookahead scheduler (0.3s, 60ms timer, unref'd), 0.8s crossfade, urgent = 1.2x tempo, own compressor guard before `out`. Also exports buildTrack/TRACK_NAMES/midiHz.
## Verification evidence
test/audio-music.test.mjs: 9 tests pass (coverage of names, bars, pitch range, distinctness, peak-velocity budget, note counts vs pattern, loop/one-shot, urgency ratio, crossfade, audio.js integration). Mutations (urgency removed, loop wrap disabled) made the tests fail; restored.
## Deviations from the contract
Signature is single options object per orchestrator override. setVolume only records the value (audio.js already sets the music bus gain; applying again would double-attenuate) unless `applyVolume: true`. victory/gameover are non-looping 16-bar stingers (26s/49s).
## Mistakes I made and how I fixed them
Initial mix exceeded my peak budget (fill snares doubled pattern snares, loud kick); deduped fills, lowered levels.
## Learnings for a future agent
Tunes are judged only numerically here; nobody has listened. Tweak the TRACKS table for taste.
## Requests for other modules
None. audio.js calls setVolume/play/stop; call `setUrgent(true)` on fuel low (audio.js does not yet wire a `fuel` event to it).
