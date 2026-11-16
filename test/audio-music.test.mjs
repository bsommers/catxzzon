import test from 'node:test';
import assert from 'node:assert/strict';
import { MUSIC } from '../src/core/defs.js';
import { createMusic, buildTrack, TRACK_NAMES, URGENT_TEMPO, LOOKAHEAD, FADE, midiHz } from '../src/audio/music.js';
import { createStubContext } from '../src/audio/audio.js';

const mk = (o = {}) => { const ctx = createStubContext(); const out = ctx.createGain(); return { ctx, out, m: createMusic({ ctx, out, volume: 0.7, timer: false, ...o }) }; };
const run = (ctx, m, sec, dt = 0.05) => { for (let t = 0; t < sec; t += dt) { ctx.advance(dt); m.tick(); } };

test('every MUSIC name has a >=16 bar track', () => {
  assert.deepEqual([...TRACK_NAMES].sort(), [...MUSIC].sort());
  for (const n of MUSIC) {
    const t = buildTrack(n);
    assert.ok(t.bars >= 16, n);
    const lead = t.buckets.flat().filter((e) => e.v === 'lead');
    assert.ok(lead.length >= 30, n + ' lead too sparse');
    // all 16 bars carry some lead/bass content
    for (let b = 0; b < 16; b++) assert.ok(t.buckets.slice(b * 16, b * 16 + 16).flat().length > 0, `${n} bar ${b} empty`);
  }
});

test('notes are in a sane pitch range and tunes are distinct', () => {
  const sigs = new Set();
  for (const n of MUSIC) {
    const t = buildTrack(n);
    for (const e of t.buckets.flat()) for (const m of [].concat(e.midi ?? [])) { assert.ok(m >= 20 && m <= 108, `${n} midi ${m}`); assert.ok(Number.isFinite(midiHz(m))); }
    sigs.add(JSON.stringify(t.buckets.slice(0, 32)));
  }
  assert.equal(sigs.size, MUSIC.length);
});

test('peak simultaneous velocity stays under the clipping budget', () => {
  for (const n of MUSIC) {
    const t = buildTrack(n); let worst = 0;
    for (let s = 0; s < t.steps; s++) {
      let sum = 0;
      for (let back = 0; back < 16 && s - back >= 0; back++) for (const e of t.buckets[s - back]) {
        if (e.v === 'k' || e.v === 's' || e.v === 'h') { if (back === 0) sum += e.vel; continue; }
        if (e.len > back) sum += e.vel * [].concat(e.midi).length;
      }
      worst = Math.max(worst, sum);
    }
    assert.ok(worst < 1.1, `${n} peak ${worst.toFixed(2)}`);
  }
});

test('sequencer schedules notes ahead of the clock and counts match the pattern', () => {
  const { ctx, m } = mk();
  assert.equal(m.play('fortress'), true);
  assert.ok(ctx.log.starts > 0, 'lookahead scheduled on play');
  const t = buildTrack('fortress'), stepSec = 60 / t.bpm / 4;
  run(ctx, m, 4 * 16 * stepSec);      // ~4 bars
  const expectEvents = t.buckets.slice(0, 64).flat().length;
  const got = m.stats.notes + m.stats.drums;
  assert.ok(got >= expectEvents * 0.9 && got <= expectEvents * 1.25, `${got} vs ${expectEvents}`);
  assert.ok(m.stats.played.length > 60);
});

test('loops wrap for looping tracks and non-looping tracks end', () => {
  { const { ctx, m } = mk(); m.play('boss'); const t = buildTrack('boss'); run(ctx, m, t.steps * 60 / t.bpm / 4 + 2);
    assert.ok(m.stats.played.filter((s) => s === 0).length >= 2, 'boss looped'); }
  { const { ctx, m } = mk(); m.play('victory'); const t = buildTrack('victory'); run(ctx, m, t.steps * 60 / t.bpm / 4 + 2);
    assert.equal(m.stats.played.filter((s) => s === 0).length, 1, 'victory played once'); assert.equal(m.stats.played.length, t.steps); }
});

test('urgent flag raises tempo', () => {
  const count = (urgent) => { const { ctx, m } = mk(); m.setUrgent(urgent); m.play('space'); run(ctx, m, 10); return m.stats.played.length; };
  const slow = count(false), fast = count(true);
  assert.ok(Math.abs(fast / slow - URGENT_TEMPO) < 0.06, `${fast}/${slow}`);
});

test('crossfade: old track fades out then is removed; same-name play is a no-op', () => {
  const { ctx, m } = mk();
  m.play('title'); run(ctx, m, 1);
  m.play('title'); assert.equal(m.activeCount, 1);
  m.play('boss'); assert.equal(m.activeCount, 2); assert.equal(m.current, 'boss');
  run(ctx, m, FADE + 0.3); assert.equal(m.activeCount, 1);
  m.stop(); run(ctx, m, FADE + 0.3); assert.equal(m.activeCount, 0); assert.equal(m.current, null);
});

test('invalid names rejected; setVolume clamps; scheduling stays within lookahead', () => {
  const { ctx, m } = mk();
  assert.equal(m.play('nope'), false);
  m.setVolume(5); assert.equal(m.volume, 1); m.setVolume(-1); assert.equal(m.volume, 0);
  m.play('space'); assert.ok(m.stats.played.length * (60 / 96 / 4) <= LOOKAHEAD + 0.5);
});

test('audio.js integration: createAudio drives music via the injected module', async () => {
  const { createAudio } = await import('../src/audio/audio.js');
  const ctx = createStubContext(); const calls = [];
  const a = createAudio({ bus: { on: () => () => {} }, ctx, musicModule: { createMusic: (o) => { assert.ok(o.ctx && o.out); return { play: (n) => calls.push(n), stop() {}, setVolume() {} }; } } });
  a.resume?.(); await new Promise((r) => setTimeout(r, 20)); a.music('boss');
  assert.ok(calls.includes('boss') || a.currentMusic === 'boss');
});
