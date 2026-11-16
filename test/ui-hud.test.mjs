import test from 'node:test';
import assert from 'node:assert/strict';
import { drawHud, createPopups } from '../src/ui/hud.js';
import { createBus } from '../src/core/events.js';
import { TUNING } from '../src/core/defs.js';

function mockCtx() {
  const log = { rects: [], texts: 0 };
  const ctx = new Proxy({ log }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'fillRect') return (x, y, w, h) => log.rects.push({ x, y, w, h, c: ctx.fillStyle });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return ctx;
}
const mkGame = (o = {}) => ({ bus: createBus(), score: 1234, hiscore: 5000, lives: 3, bombs: 2, fuel: 80, combo: 0, comboT: 0,
  nipT: 0, laserT: 0, round: 1, stageIdx: 0, stage: { kind: 'fortress' }, bossHp01: null, player: { z: 40, invuln: 0 }, ...o });
const fillOf = (ctx, color) => ctx.log.rects.filter(r => r.c === color).length;

test('drawHud draws inside the 640x360 canvas and does not throw on minimal game', () => {
  const ctx = mockCtx(); drawHud(ctx, mkGame(), 1);
  assert.ok(ctx.log.rects.length > 50);
  drawHud(mockCtx(), { score: 0, lives: 0, bombs: 0, fuel: 0, player: null }, 0);
  for (const r of ctx.log.rects) assert.ok(r.x >= -2 && r.x + r.w <= 642 && r.y >= -2 && r.y + r.h <= 362, JSON.stringify(r));
});

test('low fuel flashes red; normal fuel does not', () => {
  const lowOn = mockCtx(); drawHud(lowOn, mkGame({ fuel: 10 }), 0);       // floor(0*4)%2==0 -> flash on
  const lowOff = mockCtx(); drawHud(lowOff, mkGame({ fuel: 10 }), 0.3);   // flash off
  const ok = mockCtx(); drawHud(ok, mkGame({ fuel: TUNING.fuelMax }), 0);
  assert.ok(fillOf(lowOn, '#ff4a4a') > fillOf(lowOff, '#ff4a4a'));
  assert.ok(fillOf(lowOn, '#ff4a4a') > fillOf(ok, '#ff4a4a'));
});

test('altimeter marker follows altitude', () => {
  const lo = mockCtx(); drawHud(lo, mkGame({ player: { z: 5, invuln: 0 } }), 0);
  const hi = mockCtx(); drawHud(hi, mkGame({ player: { z: 120, invuln: 0 } }), 0);
  const my = c => Math.min(...c.log.rects.filter(r => r.c === '#ff9a2e' && r.x < 12 && r.w === 3).map(r => r.y));
  assert.ok(my(hi) < my(lo) - 100);
});

test('lives and bombs counts change drawing; boss bar only with boss', () => {
  const a = mockCtx(); drawHud(a, mkGame({ lives: 1 }), 0);
  const b = mockCtx(); drawHud(b, mkGame({ lives: 5 }), 0);
  assert.ok(b.log.rects.length > a.log.rects.length);
  const n = mockCtx(); drawHud(n, mkGame(), 0);
  const bs = mockCtx(); drawHud(bs, mkGame({ bossHp01: 0.5 }), 0);
  assert.ok(bs.log.rects.length > n.log.rects.length + 100);
});

test('taunt bubble appears from bus event and expires', () => {
  const g = mkGame({ bossHp01: 1 });
  drawHud(mockCtx(), g, 0);
  const base = mockCtx(); drawHud(base, g, 0.05);
  g.bus.emit('taunt', { text: 'HELLO KITTEN', dur: 1 });
  drawHud(mockCtx(), g, 0.1);
  const on = mockCtx(); drawHud(on, g, 0.2);
  assert.ok(on.log.rects.length > base.log.rects.length);
  for (let tt = 0.3; tt < 1.4; tt += 0.1) drawHud(mockCtx(), g, tt); const off = mockCtx(); drawHud(off, g, 1.5);
  assert.ok(off.log.rects.length <= base.log.rects.length);
});

test('popups spawn from bus, rise, expire, and are capped', () => {
  const bus = createBus(), p = createPopups(bus);
  bus.emit('popup', { text: '+100', x: 100, y: 50, z: 20, color: '#fff' });
  assert.equal(p.count, 1);
  const c0 = mockCtx(); p.draw(c0, 0); assert.ok(c0.log.rects.length > 0);
  p.update(0.5); p.update(0.7); assert.equal(p.count, 0);
  for (let i = 0; i < 200; i++) bus.emit('popup', { text: 'x', x: 0, y: 0, z: 0 });
  assert.ok(p.count <= 24);
});
