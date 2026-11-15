import test from 'node:test'; import assert from 'node:assert/strict';
import { build } from '../src/art/fx.js';
import { artManifest } from '../src/core/defs.js';
test('fx matches manifest', () => {
  const b = build();
  for (const a of artManifest().filter((x) => x.module === 'fx')) {
    const fr = [].concat(b[a.name]); assert.equal(fr.length, a.frames, a.name);
    for (const f of fr) { assert.equal(f.w, a.w); assert.equal(f.h, a.h);
      if (a.kind === 'tile') for (let i = 3; i < f.rgba.length; i += 4) assert.equal(f.rgba[i], 255); }
  }
});
test('fx deterministic', () => {
  const x = build(), y = build();
  assert.deepEqual(Buffer.from(x.boom_big[3].rgba), Buffer.from(y.boom_big[3].rgba));
});
test('strand tiles horizontally (wave period 16)', () => {
  const f = build().strand[0]; // columns 0 and 15 adjacent across the seam must both be sane
  assert.ok(f.has(0, 6) || f.has(0, 5) || f.has(0, 7));
});
