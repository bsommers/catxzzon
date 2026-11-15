import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/art/cat.js';
import { artManifest } from '../src/core/defs.js';

const t0 = performance.now();
const art = build();
const ms = performance.now() - t0;
const rows = artManifest().filter((a) => a.module === 'cat');
const frames = (v) => (Array.isArray(v) ? v : [v]);
const opaque = (f) => { let n = 0; for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i] >= 128) n++; return n; };

test('cat: every manifest row present with exact size and frame count, no extras', () => {
  for (const r of rows) {
    assert.ok(art[r.name], 'missing ' + r.name);
    const fr = frames(art[r.name]);
    assert.equal(fr.length, r.frames, r.name + ' frames');
    for (const f of fr) assert.deepEqual([f.w, f.h], [r.w, r.h], r.name + ' size');
  }
  assert.deepEqual(Object.keys(art).sort(), rows.map((r) => r.name).sort());
});

test('cat: sprites have transparent background and visible content', () => {
  for (const r of rows) for (const f of frames(art[r.name])) {
    const n = opaque(f);
    assert.ok(n > 0 && n < f.w * f.h, r.name);
  }
});

test('cat: build is deterministic and under 400 ms', () => {
  const again = build();
  for (const r of rows) frames(art[r.name]).forEach((f, i) => assert.deepEqual(f.rgba, frames(again[r.name])[i].rgba, r.name + ' frame ' + i));
  assert.ok(ms < 400, `build took ${ms.toFixed(0)} ms`);
});

test('cat_ship: outlined, every frame distinct, flame is emissive', () => {
  const ship = art.cat_ship, OUT = [0x1a, 0x14, 0x20];
  const keys = new Set(ship.map((f) => Buffer.from(f.rgba).toString('base64')));
  assert.equal(keys.size, 10, 'bank/anim frames must differ');
  for (const f of ship) {
    let outline = 0, emissive = 0;
    for (let i = 0; i < f.w * f.h; i++) {
      if (f.rgba[i * 4 + 3] < 128) continue;
      if (f.rgba[i * 4] === OUT[0] && f.rgba[i * 4 + 1] === OUT[1] && f.rgba[i * 4 + 2] === OUT[2]) outline++;
      if (f.mat[i * 4] > 200) emissive++;
    }
    assert.ok(outline > 60, 'outline pixels ' + outline);
    assert.ok(emissive >= 8, 'flame pixels ' + emissive);
  }
});

test('cat_head: frame 1 is grey', () => {
  const g = art.cat_head[1];
  for (let i = 0; i < g.w * g.h; i++) if (g.rgba[i * 4 + 3]) assert.ok(Math.abs(g.rgba[i * 4] - g.rgba[i * 4 + 1]) <= 14, 'grey pixel');
});
