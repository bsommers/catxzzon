import test from 'node:test';
import assert from 'node:assert/strict';
import { drawBackground } from '../src/render/background.js';
import { createParticles, MAX_PARTICLES } from '../src/render/particles.js';
import { createBus } from '../src/core/events.js';
import { EVENTS } from '../src/core/defs.js';

function mockCtx() {
  const calls = { n: 0, drawImage: 0, fillRect: 0, arc: 0, lineTo: 0, rects: [] };
  const grad = { addColorStop() {} };
  return new Proxy({ calls }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      return (...a) => { calls.n++; if (k in calls) calls[k]++; if (k === 'fillRect') calls.rects.push(a); };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const FX = ['boom_small', 'boom_big', 'crumbs', 'spark', 'splat', 'smoke', 'ring', 'trail', 'spud_burst', 'confetti'];
const game = (bg, kind) => ({ stage: { bg, kind }, scrollY: 300, speed: 100, player: { x: 112, y: 350, z: 40, alive: true }, nipT: 0, state: 'play' });

test('every bg/kind draws without art and with a stub registry', () => {
  for (const [bg, kind] of [['dusk', 'fortress'], ['void', 'space'], ['night', 'boss'], ['bogus', 'x']]) {
    const c = mockCtx(); drawBackground(c, game(bg, kind), 12.5); assert.ok(c.calls.n > 10, bg);
    const art = { get: () => ({ width: 32, height: 32 }) };
    const c2 = mockCtx(); drawBackground(c2, game(bg, kind), 3, art); assert.ok(c2.calls.drawImage > 0, 'sprites used');
  }
  drawBackground(mockCtx(), {}, 0);   // empty game does not throw
});

test('space stage draws more potatoes than fortress', () => {
  const art = { get: (n) => (n === 'spud_bg' ? { width: 32, height: 32 } : null) };
  const a = mockCtx(), b = mockCtx();
  drawBackground(a, game('void', 'space'), 1, art); drawBackground(b, game('void', 'fortress'), 1, art);
  assert.ok(a.calls.drawImage > b.calls.drawImage, `${a.calls.drawImage} vs ${b.calls.drawImage}`);
});

test('speed streaks scale with speed', () => {
  const lines = (sp) => { const c = mockCtx(); const g = game('void', 'space'); g.speed = sp; drawBackground(c, g, 1); return c.calls.lineTo; };
  assert.ok(lines(160) - lines(0) >= 20);
});

test('particles handle every fx type in §6 and stay within the pool cap', () => {
  assert.ok(EVENTS.includes('fx'));
  const bus = createBus(), p = createParticles(bus, null);
  for (const type of FX) {
    const before = p.count;
    bus.emit('fx', { type, x: 100, y: 200, z: 30, opts: type === 'ring' ? { r: 90 } : undefined });
    assert.ok(p.count > before, `${type} spawns particles`);
  }
  bus.emit('fx', { type: 'nonsense', x: 0, y: 0, z: 0 });   // ignored
  for (let i = 0; i < 100; i++) bus.emit('fx', { type: 'boom_big', x: 1, y: 1, z: 1 });
  assert.ok(p.count <= MAX_PARTICLES && p.count === MAX_PARTICLES, 'cap ' + p.count);
});

test('particles expire and crumbs fall under gravity', () => {
  const bus = createBus(), p = createParticles(bus, null);
  bus.emit('fx', { type: 'crumbs', x: 112, y: 0, z: 100, opts: { n: 1, spd: 0 } });
  const ys = [];
  for (let i = 0; i < 40; i++) { p.update(1 / 60); const c = mockCtx(); p.draw(c, 0); if (c.calls.rects.length) ys.push(c.calls.rects[0][1]); }
  assert.ok(ys.length > 20);
  assert.ok(ys[ys.length - 1] > ys[0] + 10, 'crumb screen-y increases (falls): ' + ys[0] + ' -> ' + ys[ys.length - 1]);
  bus.emit('fx', { type: 'crumbs', x: 0, y: 0, z: 100, opts: { n: 10 } });
  for (let i = 0; i < 300; i++) p.update(1 / 60);
  assert.equal(p.count, 0);
});

test('cat trail: engine flame while alive, rainbow when nip, none when dead', () => {
  const bus = createBus(), p = createParticles(bus, null), g = game('void', 'space');
  for (let i = 0; i < 30; i++) p.update(1 / 60, g);
  const flame = p.count; assert.ok(flame > 5);
  g.player.alive = false; const c0 = p.count; for (let i = 0; i < 5; i++) p.update(1 / 60, g);
  assert.ok(p.count <= c0, 'no new trail when dead');
  const p2 = createParticles(bus, null); g.player.alive = true; g.nipT = 5;
  for (let i = 0; i < 30; i++) p2.update(1 / 60, g);
  assert.ok(p2.count > flame, 'nip trail is denser');
});

test('draw is cheap at full pool', () => {
  const bus = createBus(), p = createParticles(bus, null);
  for (let i = 0; i < 60; i++) bus.emit('fx', { type: 'boom_big', x: 112 + i, y: 300, z: 40 });
  const c = mockCtx(), t0 = performance.now();
  for (let i = 0; i < 60; i++) { p.update(1 / 600); p.draw(c, 250); }
  assert.ok((performance.now() - t0) / 60 < 4, 'ms/frame');
});
