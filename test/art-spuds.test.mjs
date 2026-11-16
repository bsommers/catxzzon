import test from 'node:test'; import assert from 'node:assert/strict';
import { build } from '../src/art/spuds.js';
import { artManifest } from '../src/core/defs.js';
test('spuds matches manifest', () => {
  const b = build();
  for (const a of artManifest().filter((x) => x.module === 'spuds')) {
    const fr = [].concat(b[a.name]); assert.equal(fr.length, a.frames, a.name);
    for (const f of fr) {
      assert.equal(f.w, a.w); assert.equal(f.h, a.h);
      let op = 0; for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i] >= 128) op++;
      assert.ok(op > 0 && op < f.w * f.h, a.name);
    }
  }
});
test('spuds deterministic and fast', () => {
  const t = performance.now(), a = build(), ms = performance.now() - t, b = build();
  assert.ok(ms < (process.env.CI ? 3000 : 400), 'build ' + ms);
  assert.deepEqual(Buffer.from(a.planet_baked.rgba), Buffer.from(b.planet_baked.rgba));
  assert.deepEqual(Buffer.from(a.spud_bg[11].rgba), Buffer.from(b.spud_bg[11].rgba));
});
