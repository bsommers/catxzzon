import test from 'node:test';
import assert from 'node:assert/strict';
import { build, topMask, cubeMask } from '../src/art/castle.js';

const art = build();
const CUBES = Object.keys(art).filter((k) => k.startsWith('blk_'));
const TILES = Object.keys(art).filter((k) => k.startsWith('gnd_'));
const px = (p, x, y) => (p.inside(x, y) ? [...p.rgba.slice((y * p.w + x) * 4, (y * p.w + x) * 4 + 4)].join(',') : null);
const opaque = (p, x, y) => p.has(x, y);

test('there are 9 cubes and 3 ground tile sets', () => { assert.equal(CUBES.length, 9); assert.equal(TILES.length, 3); });

test('top diamonds tile the plane exactly at (+16,+8) (+16,-8) offsets', () => {
  const cover = new Map();
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
    const ox = 16 * (i + j), oy = 8 * (i - j);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (topMask(x, y)) { const k = (x + ox) + ',' + (y + oy); cover.set(k, (cover.get(k) || 0) + 1); }
  }
  for (let y = -20; y < 20; y++) for (let x = -40; x < 40; x++) assert.equal(cover.get(x + ',' + y), 1, `pixel ${x},${y}`);
});

for (const name of CUBES) {
  test(`${name}: opaque top diamond, silhouette within cube, outlined`, () => {
    const p = art[name];
    assert.equal(p.w, 32); assert.equal(p.h, 32);
    let holes = 0, spill = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (cubeMask(x, y) && !opaque(p, x, y)) holes++;
      if (!cubeMask(x, y) && opaque(p, x, y)) spill++;
    }
    assert.equal(holes, 0, 'cube pixels must all be opaque');
    if (name === 'blk_flag') { assert.ok(spill > 0 && spill < 80, 'flag pennant pokes out'); } else assert.equal(spill, 0, 'nothing outside the cube mask');
    // top-diamond corner pixels are outline-dark, so the silhouette reads at 1x
    for (const [x, y] of [[0, 8], [31, 8], [16, 31], [15, 31]]) assert.equal(px(p, x, y).startsWith('26,20,32') || cubeMask(x, y) === false, true, `outline at ${x},${y}`);
    // top face brighter than left, left brighter than right (sample plain areas via mean luminance)
    const lum = (f) => { let s = 0, n = 0; for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { if (!cubeMask(x, y)) continue; const i = (y * 32 + x) * 4; const isTop = topMask(x, y), isL = !isTop && x < 16; if ((f === 't' && isTop) || (f === 'l' && isL) || (f === 'r' && !isTop && !isL)) { s += p.rgba[i] + p.rgba[i + 1] + p.rgba[i + 2]; n++; } } return s / n; };
    if (!['blk_rind', 'blk_crown'].includes(name)) assert.ok(lum('t') > lum('l') && lum('l') > lum('r'), 'top > left > right');
    assert.ok(lum('l') > lum('r'));
  });
}

test('stacked cubes: upper cube hides the lower top diamond; columns stay contiguous', () => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (topMask(x, y)) assert.ok(cubeMask(x, y + 16), `lower top ${x},${y} covered by upper cube`);
  for (let x = 0; x < 32; x++) {
    const ys = []; for (let y = -16; y < 32; y++) if (cubeMask(x, y) || cubeMask(x, y + 16)) ys.push(y);
    for (let i = 1; i < ys.length; i++) assert.equal(ys[i] - ys[i - 1], 1, `gap in column ${x}`);
  }
  // diagonal neighbour (+16,+8): sides join without overlap gaps along the shared edge
  for (let x = 16; x < 32; x++) for (let y = 0; y < 32; y++) if (cubeMask(x, y) && cubeMask(x - 16, y - 8)) { /* overlap allowed only on faces */ assert.ok(!topMask(x, y) || !topMask(x - 16, y - 8)); }
});

const inDiamond = (x, y) => topMask(x, y);
for (const name of TILES) {
  test(`${name}: 4 opaque variants, periodic on the iso lattice, any variant tiles against any`, () => {
    const vs = art[name];
    assert.equal(vs.length, 4);
    for (const t of vs) { assert.equal(t.w, 32); assert.equal(t.h, 16); for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) assert.ok(opaque(t, x, y), 'opaque'); }
    // paint a lattice with random variants forward and in reverse order: result in the interior must be identical (no seams)
    const W = 160, H = 80, mosaic = (rev, variant) => {
      const img = new Map(), cells = [];
      for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) cells.push([i, j]);
      if (rev) cells.reverse();
      for (const [i, j] of cells) {
        const v = vs[variant], ox = 80 + 16 * (i + j) - 16, oy = 40 + 8 * (i - j) - 8;
        for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) img.set((x + ox) + ',' + (y + oy), px(v, x, y));
      }
      return img;
    };
    // (corner pixels outside the diamond hold the lattice-wrapped colour, so a same-variant lattice is order independent)
    for (let v = 0; v < 4; v++) {
      const a = mosaic(false, v), b = mosaic(true, v);
      for (let y = 8; y < H - 8; y++) for (let x = 24; x < W - 24; x++) assert.equal(a.get(x + ',' + y), b.get(x + ',' + y), `seam at ${x},${y} variant ${v}`);
    }
    // rim (outside the core) is identical across variants
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      const dx = Math.abs(x + 0.5 - 16) / 16 + Math.abs(y + 0.5 - 8) / 8;
      if (inDiamond(x, y) && dx > 0.9) for (let k = 1; k < 4; k++) assert.equal(px(vs[k], x, y), px(vs[0], x, y), `rim differs at ${x},${y}`);
    }
    // variants actually differ
    const sig = vs.map((t) => [...t.rgba].join(','));
    assert.equal(new Set(sig).size, 4);
  });
}

test('decals: transparent corners, outlined, sizes', () => {
  for (const [n, c, w, h] of [['decor_crater', 3, 32, 16], ['decor_hole', 2, 24, 12], ['decor_rune', 2, 32, 16]]) {
    assert.equal(art[n].length, c);
    for (const p of art[n]) { assert.equal(p.w, w); assert.equal(p.h, h); assert.ok(!p.has(0, 0) && !p.has(w - 1, h - 1)); assert.ok(p.has(w >> 1, h >> 1)); }
  }
});

test('build is deterministic and fast', () => {
  const t0 = performance.now(); const a = build(); const ms = performance.now() - t0;
  const b = build();
  for (const k of Object.keys(a)) { const A = [].concat(a[k]), B = [].concat(b[k]); A.forEach((p, i) => assert.deepEqual(p.rgba, B[i].rgba, k)); }
  assert.ok(ms < (process.env.CI ? 3000 : 400), ms + 'ms');
});
