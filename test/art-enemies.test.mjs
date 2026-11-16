import test from 'node:test'; import assert from 'node:assert/strict';
import { build } from '../src/art/enemies.js';
import { artManifest } from '../src/core/defs.js';
test('enemies matches manifest', () => {
  const b = build();
  for (const a of artManifest().filter((x) => x.module === 'enemies')) {
    const fr = [].concat(b[a.name]); assert.equal(fr.length, a.frames, a.name);
    for (const f of fr) {
      assert.equal(f.w, a.w); assert.equal(f.h, a.h);
      let op = 0; for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i] >= 128) op++;
      assert.ok(op > 0 && op < f.w * f.h, a.name + ' has background and content');
    }
  }
});
test('enemies deterministic and fast', () => {
  const t = performance.now(), x = build(), ms = performance.now() - t, y = build();
  assert.ok(ms < (process.env.CI ? 3000 : 400));
  for (const k of Object.keys(x)) x[k].forEach((f, i) => assert.deepEqual(Buffer.from(f.rgba), Buffer.from(y[k][i].rgba)));
});
test('frames differ (animation)', () => {
  const b = build();
  for (const k of ['rat_turret', 'can_rocket', 'radar_dish', 'hot_spud', 'mouse_jet'])
    assert.notDeepEqual(Buffer.from(b[k][0].rgba), Buffer.from(b[k][1].rgba), k);
});
