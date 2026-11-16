import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/art/boss.js';
import { artManifest } from '../src/core/defs.js';

const t0 = performance.now();
const art = build();
const ms = performance.now() - t0;
const rows = artManifest().filter((a) => a.module === 'boss');
const frames = (v) => (Array.isArray(v) ? v : [v]);
const opaque = (f) => { let n = 0; for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i] >= 128) n++; return n; };
const px = (f, x, y) => { const i = (y * f.w + x) * 4; return [f.rgba[i], f.rgba[i + 1], f.rgba[i + 2], f.rgba[i + 3]]; };
const same = (a, b) => a.rgba.every((v, i) => v === b.rgba[i]);

test('boss: every manifest row present with exact size and frame count, no extras', () => {
  assert.equal(rows.length, 3);
  for (const r of rows) {
    assert.ok(art[r.name], 'missing ' + r.name);
    const fr = frames(art[r.name]);
    assert.equal(fr.length, r.frames, r.name + ' frames');
    for (const f of fr) assert.deepEqual([f.w, f.h], [r.w, r.h], r.name + ' size');
  }
  assert.deepEqual(Object.keys(art).sort(), rows.map((r) => r.name).sort());
});

test('boss: sprites have transparent corners and substantial content', () => {
  for (const r of rows) for (const f of frames(art[r.name])) {
    const n = opaque(f);
    assert.ok(n > f.w * f.h * 0.25 && n < f.w * f.h, r.name + ' coverage ' + n);
    assert.equal(px(f, 0, f.h - 1)[3], 0, r.name + ' bottom-left corner transparent');
    assert.equal(px(f, f.w - 1, 0)[3], 0, r.name + ' top-right corner transparent');
  }
});

test('boss: every frame is distinct (animations actually animate)', () => {
  for (const r of rows) {
    const fr = frames(art[r.name]);
    for (let i = 0; i < fr.length; i++) for (let j = i + 1; j < fr.length; j++) assert.ok(!same(fr[i], fr[j]), `${r.name} ${i}==${j}`);
  }
});

test('boss: outlined in #1a1420 and uses the dilute-tortie + cheese palette', () => {
  const hasCol = (f, test) => { for (let i = 0; i < f.rgba.length; i += 4) if (f.rgba[i + 3] >= 128 && test(f.rgba[i], f.rgba[i + 1], f.rgba[i + 2])) return true; return false; };
  for (const r of rows) for (const f of frames(art[r.name])) assert.ok(hasCol(f, (R, G, B) => R === 0x1a && G === 0x14 && B === 0x20), r.name + ' outline');
  const j = art.jesse[0];
  assert.ok(hasCol(j, (R, G, B) => B > R + 25 && B > G && R > 80), 'blue-grey fur');
  assert.ok(hasCol(j, (R, G, B) => R > 230 && G > 200 && B > 160), 'cream patches');
  assert.ok(hasCol(j, (R, G, B) => R > 220 && G > 130 && G < 170 && B < 110), 'apricot patches');
  assert.ok(hasCol(j, (R, G, B) => R > 230 && G > 190 && B < 90), 'cheese yellow');
});

test('boss: charge/fire frames glow (emissive pods/eyes); idle does not glow as much', () => {
  const emit = (f) => { let s = 0; for (let i = 0; i < f.mat.length; i += 4) if (f.rgba[i + 3] >= 128) s += f.mat[i]; return s; };
  assert.ok(emit(art.jesse[3]) > emit(art.jesse[0]) * 1.5, 'charge glows');
  assert.ok(emit(art.jesse[4]) > emit(art.jesse[0]) * 1.5, 'fire glows');
  assert.ok(emit(art.jesse_missile[0]) > 0, 'missile exhaust is emissive');
});

test('boss: build is deterministic and under 400 ms', () => {
  const again = build();
  for (const r of rows) frames(art[r.name]).forEach((f, i) => assert.ok(same(f, frames(again[r.name])[i]), r.name + ' frame ' + i));
  assert.ok(ms < (process.env.CI ? 3000 : 400), 'build took ' + ms.toFixed(1) + ' ms');
});
