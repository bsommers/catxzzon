import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, createStubContext, LIMITS } from '../src/audio/audio.js';
import { describe, renderSfx, stats, SFX_NAMES, duration } from '../src/audio/sfx.js';
import { createBus } from '../src/core/events.js';
import { SFX } from '../src/core/defs.js';

test('every SFX name has a non-empty recipe, finite short render, no clipping', () => {
  assert.equal(SFX_NAMES, SFX);
  for (const n of SFX) {
    const v = describe(n);
    assert.ok(v.length >= 1, n);
    assert.ok(duration(v) >= 0.05 && duration(v) < 3, n);
    const s = stats(renderSfx(n, 22050));
    assert.ok(Number.isFinite(s.peak) && Number.isFinite(s.rms), n);
    assert.ok(s.peak > 0.1, `${n} too quiet: ${s.peak}`);
    assert.ok(s.peak <= 1.0, `${n} clips: ${s.peak}`);
  }
});

test('render is deterministic; pitch changes the output', () => {
  const a = renderSfx('shot', 22050), b = renderSfx('shot', 22050), c = renderSfx('shot', 22050, { pitch: 1.1 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('boom has more low energy than tink; meow voices are formant-filtered', () => {
  assert.ok(stats(renderSfx('boom_big', 22050)).rms > stats(renderSfx('tink', 22050)).rms);
  assert.ok(describe('meow_a').some((v) => v.parallel && v.filters.length >= 3));
});

test('master chain ends in a limiter; bus sfx events schedule voices', () => {
  const bus = createBus(), ctx = createStubContext(), au = createAudio({ bus, ctx });
  const lim = ctx.log.nodes.find((n) => n.kind === 'compressor');
  assert.ok(lim && lim.ratio.value >= 10 && lim.threshold.value < 0);
  const before = ctx.log.starts;
  bus.emit('sfx', { name: 'boom_big', x: 10 });
  assert.equal(au.stats.played, 1);
  assert.equal(ctx.log.starts - before, describe('boom_big').length);
  assert.ok(ctx.log.nodes.some((n) => n.kind === 'panner'));
});

test('unknown names ignored; all SFX playable on the stub', () => {
  const ctx = createStubContext(), au = createAudio({ ctx });
  assert.equal(au.play('nope'), false);
  for (const n of SFX) { au.play(n); ctx.advance(1); }
  assert.equal(au.stats.played, SFX.length);
});

test('voice limiting: retrigger gate, per-name cap, priority bypass', () => {
  const ctx = createStubContext(), au = createAudio({ ctx });
  assert.equal(au.play('shot'), true);
  assert.equal(au.play('shot'), false);          // retrigger gate
  let ok = 0;
  for (let i = 0; i < 10; i++) { ctx.advance(LIMITS.retrigger + 0.001); if (au.play('can_hiss')) ok++; }
  assert.equal(ok, LIMITS.perName);
  ctx.advance(0.04); assert.equal(au.play('boom_boss'), true);
  assert.ok(au.stats.dropped >= 7);
  ctx.advance(5); assert.equal(au.play('can_hiss'), true);   // voices expired
});

test('volume, mute, music bookkeeping', () => {
  const bus = createBus(), ctx = createStubContext(), au = createAudio({ bus, ctx });
  const master = ctx.log.nodes.filter((n) => n.kind === 'gain')[0];
  au.setVolume({ master: 2, sfx: -1 });
  assert.deepEqual([au.getVolume().master, au.getVolume().sfx], [1, 0]);
  assert.equal(master.gain.value, 1);
  au.muted = true; assert.equal(master.gain.value, 0);
  au.toggleMute(); assert.equal(master.gain.value, 1);
  bus.emit('music', { name: 'boss' }); assert.equal(au.currentMusic, 'boss');
  assert.equal(au.music('bogus'), false);
  au.music(null); assert.equal(au.currentMusic, null);
});

test('imports and runs in Node without AudioContext', async () => {
  const au = createAudio({ bus: createBus() });
  assert.equal(au.play('shot'), false);
  await au.resume();
  assert.equal(au.muted, false);
});
