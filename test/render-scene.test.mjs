// render-scene: registry fallbacks, voxel index (culling / painter order), sprite anchors, cheese-field geometry,
// the fly-through gate reticle, and the renderer driven against a recording mock canvas (no DOM needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ART, CELL, FIELD_W, TUNING, VIEW } from '../src/core/defs.js';
import { project } from '../src/core/iso.js';
import { createBus } from '../src/core/events.js';
import { buildAll, inDiamond, cubeFace } from '../src/art/registry.js';
import { PixBuf } from '../src/art/pixbuf.js';
import { buildVoxelIndex, isoDepth, lightLevel } from '../src/render/blocks.js';
import { spriteTopLeft, CENTER_ANCHORS, catFrame, frameOf, fieldGeom, fieldLevel, strandZ } from '../src/render/sprites.js';
import { createScene } from '../src/render/scene.js';
import { createRenderer, guardBus } from '../src/render/renderer.js';
import { makeDemoGame } from '../src/render/demo.js';

// ---------------------------------------------------------------------------------------------------- helpers
/** Recording mock canvas: every unknown ctx method is a counted no-op, properties are plain assignments. */
function mockFactory(counts = {}) {
  const grad = { addColorStop() {} };
  return function mockCanvas(w, h) {
    const target = { canvas: null };
    const ctx = new Proxy(target, {
      get(t, k) {
        if (k in t) return t[k];
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
        if (k === 'createImageData' || k === 'getImageData') return (a, b) => ({ data: new Uint8ClampedArray(a * b * 4), width: a, height: b });
        return () => { counts[k] = (counts[k] || 0) + 1; };
      },
      set(t, k, v) { t[k] = v; return true; },
    });
    const c = { width: w, height: h, style: {}, getContext: () => ctx, toDataURL: () => 'data:,' };
    target.canvas = c;
    return c;
  };
}
/** Run fn with console.warn / console.error captured; returns { warns, errors }. */
async function quiet(fn) {
  const w = console.warn, e = console.error, out = { warns: [], errors: [] };
  console.warn = (...a) => out.warns.push(a.map(String).join(' '));
  console.error = (...a) => out.errors.push(a.map(String).join(' '));
  try { await fn(); } finally { console.warn = w; console.error = e; }
  return out;
}
const noArt = () => buildAll({ modules: [], forcePix: true });
const PB = TUNING.playerBox;

// ---------------------------------------------------------------------------------------------------- registry
test('registry: synchronous placeholders for every ART row, sizes from the manifest', async () => {
  const art = buildAll({ modules: [], forcePix: true });
  assert.equal(typeof art.ready.then, 'function', 'ready is a promise');
  assert.ok(typeof art.get === 'function', 'registry is returned synchronously (main.js does not await it)');
  for (const row of ART) {
    const fr = art.get(row.name, 0);
    assert.ok(fr, `placeholder for ${row.name}`);
    assert.deepEqual(art.size(row.name), { w: row.w, h: row.h }, `size of ${row.name}`);
    assert.equal(art.frames(row.name), row.frames, `frames of ${row.name}`);
    assert.equal(art.has(row.name), false, 'placeholders are not "real" art');
  }
  assert.equal((await art.ready), art);
  assert.equal(art.done, true);
});

test('registry: missing, throwing and malformed art modules leave placeholders and never reject', async () => {
  const importer = (m) => {
    if (m === 'gone') return Promise.reject(new Error("Cannot find module './gone.js'"));
    if (m === 'boom') return Promise.resolve({ build() { throw new Error('kaboom'); } });
    return Promise.resolve({ nothing: true });            // no build() export
  };
  const art = buildAll({ modules: ['gone', 'boom', 'odd'], importer, forcePix: true });
  const v0 = art.version;
  await art.ready;
  assert.deepEqual(art.missing, ['gone']);
  assert.equal(art.errors.length, 2);
  assert.match(art.errors.join('|'), /boom: kaboom/);
  assert.match(art.errors.join('|'), /odd: no build\(\) export/);
  assert.equal(art.loaded.length, 0);
  assert.equal(art.version, v0, 'nothing was installed');
  assert.ok(art.get('cat_ship', 3), 'still drawable');
});

test('registry: frame index wraps, unknown names get a placeholder instead of throwing', async () => {
  const art = noArt();
  const n = art.frames('cat_ship');
  assert.equal(art.get('cat_ship', n + 1), art.get('cat_ship', 1));
  assert.equal(art.get('cat_ship', -1), art.get('cat_ship', n - 1));
  const { warns } = await quiet(() => { assert.ok(art.get('no_such_sprite', 0)); assert.ok(art.get('no_such_sprite', 5)); });
  assert.equal(warns.length, 1, 'warned once, not per frame');
  assert.deepEqual(art.size('no_such_sprite'), { w: 16, h: 16 });
});

test('registry: ground tiles are clipped to the 2:1 diamond (art ships them with filled corners)', async () => {
  // a fake castle module whose tiles are fully opaque rectangles, exactly like the real sheet tiles
  const tile = () => { const p = new PixBuf(32, 16); p.rgba.fill(255); return p; };
  const importer = () => Promise.resolve({ build: () => ({ gnd_cracker: [tile(), tile(), tile(), tile()], gnd_gouda: [tile(), tile(), tile(), tile()], gnd_keep: [tile(), tile(), tile(), tile()] }) });
  const art = buildAll({ modules: ['castle'], importer, forcePix: true });
  await art.ready;
  assert.equal(art.has('gnd_cracker'), true, 'real tiles installed');
  for (const name of ['gnd_cracker', 'gnd_gouda', 'gnd_keep']) {
    const p = art.pix(name, 3);
    const alpha = (x, y) => p.rgba[(y * p.w + x) * 4 + 3];
    assert.equal(alpha(0, 0), 0, `${name} corner is transparent`);
    assert.equal(alpha(p.w - 1, p.h - 1), 0);
    assert.ok(alpha(p.w >> 1, p.h >> 1) > 0, `${name} centre is opaque`);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (!inDiamond(x, y, p.w, p.h)) assert.equal(alpha(x, y), 0);
  }
  assert.equal(inDiamond(16, 8), true);
  assert.equal(inDiamond(0, 0), false);
  assert.equal(cubeFace(16, 4), 'top');
  assert.equal(cubeFace(4, 20), 'left');
  assert.equal(cubeFace(28, 20), 'right');
  assert.equal(cubeFace(0, 0), null);
});

// ---------------------------------------------------------------------------------------------------- voxels
const cube = () => { const c = []; for (let cx = 3; cx < 6; cx++) for (let cy = 3; cy < 6; cy++) for (let cz = 0; cz < 3; cz++) c.push({ cx, cy, cz, t: 1 }); return c; };

test('voxel index: hidden cubes are culled, visible ones come out in painter order', () => {
  const vox = buildVoxelIndex(cube());
  assert.equal(vox.count, 27);
  assert.equal(vox.visible, 19, 'front (-y), right (+x) and top faces of a 3x3x3 block');
  assert.equal(vox.hidden, 8);
  const cells = vox.visibleCells(0, 10);
  assert.equal(cells.length, 19);
  for (let i = 1; i < cells.length; i++) assert.ok(cells[i].d >= cells[i - 1].d, 'ascending depth');
  for (const c of cells) assert.ok(c.cy === 3 || c.cx === 5 || c.cz === 2, `cell ${c.cx},${c.cy},${c.cz} has an exposed face`);
  assert.equal(vox.visibleCells(0, 10), cells, 'cached while the row window is unchanged');
  assert.equal(vox.visibleCells(4, 4).length, 5, 'row window limits what is drawn (cy=4: right column + top row)');
  assert.equal(vox.visibleCells(20, 30).length, 0);
});

test('voxel index: bad cells are dropped, has/typeAt/topUnder answer queries', () => {
  const vox = buildVoxelIndex([...cube(), { cx: 40, cy: 1, cz: 0, t: 1 }, { cx: 1, cy: 1, cz: 0, t: 0 }, null, { cx: 2, cy: -1, cz: 0, t: 1 }, { cx: 0, cy: 9, cz: 0, t: 7 }]);
  assert.equal(vox.count, 28);
  assert.equal(vox.has(3, 3, 0), true);
  assert.equal(vox.has(2, 3, 0), false);
  assert.equal(vox.has(40, 1, 0), false);
  assert.equal(vox.typeAt(0, 9, 0), 7);
  const x = 4.5 * CELL, y = 4.5 * CELL;
  assert.equal(vox.topUnder(x, y, 100), 3 * CELL, 'flying above the block: shadow lands on its top');
  assert.equal(vox.topUnder(x, y, 20), CELL, 'inside the stack: the highest top at or below z');
  assert.equal(vox.topUnder(x, y, 0), 0);
  assert.equal(vox.topUnder(10, 10, 100), 0, 'open ground');
  assert.equal(vox.minCy, 3);
  assert.equal(vox.maxCy, 9);
});

test('painter key: nearer (smaller y), righter (larger x) and higher things draw later', () => {
  assert.ok(isoDepth(50, 100, 0) > isoDepth(50, 116, 0));
  assert.ok(isoDepth(66, 100, 0) > isoDepth(50, 100, 0));
  assert.ok(isoDepth(50, 100, 16) > isoDepth(50, 100, 0));
  // an entity standing on a voxel top must sort after the voxel it stands on (the reason depthKey's 0.01*z is not used)
  const cell = isoDepth(4.5 * CELL, 4.5 * CELL, 2 * CELL), ent = isoDepth(4.5 * CELL, 4.5 * CELL, 3 * CELL + 6);
  assert.ok(ent > cell);
  assert.deepEqual([-1, 0, 1, 2, 3, 9].map(lightLevel), [0, 0, 1, 2, 3, 3]);
});

// ---------------------------------------------------------------------------------------------------- sprites
test('sprite anchors: bottom-centre on the front corner of the box; cat sprites centred on the box', () => {
  const x = 100, y = 300, z = 24, w = 14, d = 10, h = 12, sw = 40, sh = 30;
  const tl = spriteTopLeft('turret', sw, sh, x, y, z, w, d, h);
  const front = project(x + w / 2, y - d / 2, z, 0);
  assert.equal(tl.x + sw / 2, front.sx);
  assert.equal(tl.y + sh, front.sy);
  const up = spriteTopLeft('turret', sw, sh, x, y, z + 16, w, d, h);
  assert.equal(up.x, tl.x);
  assert.equal(tl.y - up.y, 16 * VIEW.C, 'altitude moves the sprite straight up');
  const c = spriteTopLeft('cat_ship', 48, 48, x, y, z, PB.w, PB.d, PB.h), mid = project(x, y, z + PB.h / 2, 0);
  assert.equal(c.x + CENTER_ANCHORS.cat_ship.cx, mid.sx);
  assert.equal(c.y + CENTER_ANCHORS.cat_ship.cy, mid.sy);
});

test('frames: bank picks the cat frame pair, a numeric e.frame from the sim always wins', () => {
  assert.equal(catFrame(-2, 0), 0);
  assert.equal(catFrame(0, 0), 4);
  assert.equal(catFrame(2, 0), 8);
  assert.equal(catFrame(9, 0), 8, 'clamped');
  assert.equal(catFrame(-9, 0), 0);
  assert.equal(catFrame(undefined, 0), 4);
  assert.equal(catFrame(0, 1 / 14 + 0.001), 5, 'engine flicker frame');
  assert.equal(frameOf({ kind: 'turret', frame: 3 }, {}, 0, { flashT: 1 }), 3);
  assert.equal(frameOf({ kind: 'turret' }, {}, 0, { flashT: 1 }), 5, 'hit flash frame');
  assert.equal(frameOf({ kind: 'hairball', t: 0 }, {}, 0, {}), 0);
});

test('cheese fields: geometry, live level and wavy strands pinned at the posts', () => {
  const f = fieldGeom({ id: 4, x: 112, y: 400, z: 20, w: 16, h: 40, span: 4 });
  assert.equal(f.y, 400);
  assert.equal(f.x1 - f.x0, 4 * CELL - 6, 'span cells wide, inset to the post centres');
  assert.equal((f.x0 + f.x1) / 2, 112);
  assert.equal(f.z0, 20);
  assert.equal(f.z1, 60);
  assert.ok(f.n >= 2);
  const g = fieldGeom({ x: 50, y: 10, z0: 8, z1: 9 });
  assert.equal(g.z1, 14, 'a degenerate band is widened so ropes exist');
  assert.equal(g.n, 2);

  assert.equal(fieldLevel({ on: true }, 0), 1);
  assert.equal(fieldLevel({ on: false }, 0), 0);
  const warn = fieldLevel({ on: false, warn: true, glow: 1 }, 0);
  assert.ok(warn > 0 && warn < 1, 'warning flicker is drawn dimmer than a live field');
  assert.equal(fieldLevel({ pulse: 2 }, 0.1), 1, 'fallback duty cycle: on for the first 60%');
  assert.equal(fieldLevel({ pulse: 2 }, 1.5), 0);
  assert.ok(fieldLevel({ pulse: 2 }, 1.9) > 0, 'last 12%: warning');
  assert.equal(fieldLevel({}, 5), 1, 'static field');

  for (let i = 0; i < f.n; i++) {
    assert.equal(strandZ(f, i, f.x0, 0.3), strandZ(f, i, f.x0, 7.7), 'pinned at the left post');
    assert.equal(strandZ(f, i, f.x1, 0.3), strandZ(f, i, f.x1, 7.7), 'pinned at the right post');
    for (let s = 0; s <= 8; s++) for (const t of [0, 0.4, 2.2]) {
      const z = strandZ(f, i, f.x0 + ((f.x1 - f.x0) * s) / 8, t);
      assert.ok(z > f.z0 - 6 && z < f.z1 + 6, `strand ${i} stays near its band (z=${z})`);
    }
  }
  const mid = (f.x0 + f.x1) / 2;
  assert.notEqual(strandZ(f, 1, mid, 0.3), strandZ(f, 1, mid, 0.9), 'animated in the middle');
  assert.ok(strandZ(f, f.n - 1, f.x0, 0) > strandZ(f, 0, f.x0, 0), 'ropes are stacked bottom to top');
});

// ---------------------------------------------------------------------------------------------------- gate reticle
function gateScene(cells, ents = []) {
  const mk = mockFactory(), art = noArt(), scene = createScene({ art }, mk);
  const game = makeDemoGame({ stage: 'fortress', juice: false });
  game.stage.cells = cells; game.stage.decor = []; game.ents.length = 0;
  for (const e of ents) game.ents.push(e);
  game.scrollY = 0; game.player.x = 112; game.player.y = 48; game.player.z = 40;
  const ctx = mk(700, 420).getContext('2d');
  const draw = () => scene.draw(ctx, game, { alpha: 0, dt: 1 / 60, now: 1 });
  draw();
  return { scene, game, draw };
}
/** Full-width wall at row cy=10 (y = 160), 6 high, with a 2x2 window at cx 6..7, cz 2..3. A 3-column tower at cy=5. */
function wallCells() {
  const c = [];
  for (let cx = 0; cx < 14; cx++) for (let cz = 0; cz < 6; cz++) if (!((cx === 6 || cx === 7) && (cz === 2 || cz === 3))) c.push({ cx, cy: 10, cz, t: 1 });
  for (let cx = 0; cx < 3; cx++) for (let cz = 0; cz < 4; cz++) c.push({ cx, cy: 5, cz, t: 1 });
  return c;
}

test('gate reticle: reports the next wall plane and whether the cat box fits through', () => {
  const { scene } = gateScene(wallCells());
  const through = scene.findGate(112, 48, 40, PB);
  assert.ok(through, 'wall within range');
  assert.equal(through.y, 10 * CELL, 'near face of the wall row');
  assert.equal(through.blocked, false, 'lined up with the window');
  assert.equal(scene.findGate(60, 48, 40, PB).blocked, true, 'solid wall ahead');
  assert.equal(scene.findGate(112, 48, 20, PB).blocked, true, 'below the window sill');
  assert.equal(scene.findGate(112, 48, 59, PB).blocked, true, 'top of the box clips the lintel');
  assert.equal(scene.findGate(112, 48, 100, PB).blocked, false, 'over the top');
  assert.equal(scene.findGate(101, 48, 40, PB).blocked, false, 'box edge just inside the window (x 97..105)');
  assert.equal(scene.findGate(99, 48, 40, PB).blocked, true, 'box edge clips the jamb (x 95..103)');
  assert.equal(scene.findGate(124, 48, 40, PB).blocked, false, 'touching the right jamb (x1 = 128) is not a hit: the sim uses open intervals');
  assert.equal(scene.findGate(125, 48, 40, PB).blocked, true);
  assert.equal(scene.findGate(112, 48, 57, PB).blocked, false, 'touching the lintel (z1 = 64) is not a hit');
  assert.equal(scene.findGate(112, 48, 31, PB).blocked, false, 'touching the sill (z0 = 32)');
  assert.equal(scene.findGate(112, 48, 30.5, PB).blocked, true);
  const tower = scene.findGate(20, 48, 20, PB);
  assert.equal(tower.y, 10 * CELL, 'a 3-column tower is not a wall: the reticle skips to the real wall');
  assert.equal(scene.findGate(112, -200, 40, PB), null, 'nothing within range');
  assert.equal(scene.findGate(112, 170, 40, PB), null, 'already past it');
});

test('gate reticle: thick walls are tested through their whole depth', () => {
  const cells = [];
  for (let cx = 0; cx < 14; cx++) for (let cz = 0; cz < 4; cz++) {
    if (cx !== 7) cells.push({ cx, cy: 10, cz, t: 1 });          // window in the first row ...
    cells.push({ cx, cy: 11, cz, t: 1 });                        // ... bricked up by the second
  }
  const { scene } = gateScene(cells);
  const g = scene.findGate(120, 48, 20, PB);
  assert.equal(g.y, 160);
  assert.equal(g.blocked, true);
  assert.equal(scene.findGate(120, 48, 70, PB).blocked, false);
});

test('gate reticle: a live cheese field in the lane comes first; switched off or out of lane it is ignored', () => {
  const field = { id: 9, kind: 'field', x: 112, y: 100, z: 30, w: 64, d: 4, h: 30, on: true, dead: false, t: 0 };
  const s = gateScene(wallCells(), [field]);
  let g = s.scene.findGate(112, 48, 40, PB);
  assert.equal(g.y, 100);
  assert.equal(g.blocked, true, 'inside the z band of the ropes');
  g = s.scene.findGate(112, 48, 70, PB);
  assert.equal(g.y, 100);
  assert.equal(g.blocked, false, 'over the ropes');
  assert.equal(s.scene.findGate(112, 48, 60, PB).blocked, false, 'touching the top of the band is not a hit (strict <, like playerTouches)');
  assert.equal(s.scene.findGate(112, 48, 59.5, PB).blocked, true, 'fields use the full box, no grace');
  assert.equal(s.scene.findGate(112, 48, 22, PB).blocked, false);
  assert.equal(s.scene.findGate(112, 48, 22.5, PB).blocked, true);
  assert.equal(s.scene.findGate(200, 48, 40, PB).y, 160, 'field does not span this lane');
  assert.equal(s.scene.findGate(148, 48, 40, PB).y, 100, 'box edge inside the field width (x 80..144)');
  assert.equal(s.scene.findGate(149, 48, 40, PB).y, 160, 'box edge only touching the field width');
  field.on = false; s.draw();
  assert.equal(s.scene.findGate(112, 48, 40, PB).y, 160, 'field is off: next obstacle is the wall');
  field.on = true; field.y = 400; s.draw();
  assert.equal(s.scene.findGate(112, 48, 40, PB).y, 160, 'field beyond the wall');
});

// ---------------------------------------------------------------------------------------------------- renderer
test('renderer: draws every demo stage on a mock canvas without scene errors', async () => {
  for (const stage of ['fortress', 'space', 'boss', 'keep']) {
    const counts = {}, mk = mockFactory(counts), bus = createBus(), art = noArt();
    const r = createRenderer(mk(VIEW.W, VIEW.H), { bus, art, createCanvas: mk, hooks: false, crt: true });
    await r.ready;
    const g = makeDemoGame({ stage, bus, nip: stage === 'space', lowFuel: stage === 'keep' });
    let ms = 0;
    const out = await quiet(() => { for (let i = 0; i < 150; i++) { g.step(1 / 60); r.draw(g, 0.5, (ms += 16.7)); } });
    assert.deepEqual(out.errors, [], `${stage}: no console.error (scene exceptions are logged, not thrown)`);
    const s = r.stats.scene;
    assert.ok(s.sprites > 5, `${stage}: sprites drawn (${s.sprites})`);
    assert.ok(counts.drawImage > 150 * 10, `${stage}: drawImage calls (${counts.drawImage})`);
    if (stage === 'space') assert.equal(s.cells, 0, 'no voxels in space');
    else { assert.ok(s.cellsDrawn > 50, `${stage}: voxels drawn (${s.cellsDrawn})`); assert.ok(s.cellsDrawn <= s.cells); assert.ok(s.strips > 0, 'ground strips'); }
    if (stage === 'fortress') assert.ok(s.fields > 0, 'cheese fields present');
    assert.equal(r.stats.frames, 150);
  }
});

test('renderer: tolerates missing / odd game objects and throwing hooks', async () => {
  const mk = mockFactory(), bus = createBus();
  let hudCalls = 0;
  const r = createRenderer(mk(VIEW.W, VIEW.H), { bus, art: noArt(), createCanvas: mk, hooks: { drawHud() { hudCalls++; throw new Error('hud exploded'); } } });
  await r.ready;
  const g = makeDemoGame({ stage: 'fortress', bus, juice: false });
  const out = await quiet(() => {
    r.draw(null, 0, 16); r.draw(undefined); r.draw({}, 0, 48);
    r.draw({ stage: { id: 'x', kind: 'fortress', ground: 'cracker', bg: 'dusk' }, ents: [null, { kind: 'no_such_kind', x: 1, y: 1, z: 1 }, { kind: 'turret', x: NaN, y: 50, z: 0 }], scrollY: 0 }, 0, 64);
    let ms = 80;
    for (let i = 0; i < 80; i++) { g.step(1 / 60); r.draw(g, 0, (ms += 16.7)); }
  });
  assert.deepEqual(out.errors, []);
  assert.ok(hudCalls > 60 && hudCalls < 70, `a hook that keeps throwing is disabled (called ${hudCalls} times)`);
  assert.ok(out.warns.some((w) => /hook "drawHud" disabled/.test(w)));
});

test('renderer: shake / flash / hit-stop events, CRT toggle, shot()', async () => {
  const mk = mockFactory(), bus = createBus();
  const r = createRenderer(mk(VIEW.W, VIEW.H), { bus, art: noArt(), createCanvas: mk, hooks: false });
  await r.ready;
  const g = makeDemoGame({ stage: 'fortress', bus, juice: false });
  let ms = 0;
  const frame = () => { g.step(1 / 60); r.draw(g, 0, (ms += 1000 / 60)); };
  frame(); frame();
  assert.equal(r.crt, false);
  r.setCRT(true);
  assert.equal(r.crt, true);
  assert.equal(r.shot(), 'data:,');

  bus.emit('shake', { mag: 5, dur: 0.2 });
  assert.equal(r.fx.shake, 5);
  bus.emit('shake', { mag: 2, dur: 0.2 });
  assert.equal(r.fx.shake, 5, 'a weaker shake does not cut a stronger one short');
  bus.emit('shake', { mag: 99, dur: 300 });
  assert.equal(r.fx.shake, 12, 'magnitude is capped');
  assert.ok(Math.abs(r.fx.shakeDur - 0.3) < 1e-9, 'durations above 10 are milliseconds');
  for (let i = 0; i < 30; i++) frame();
  assert.equal(r.fx.shakeT, 0, 'shake decays to rest');

  bus.emit('flash', { color: '#ff0000', a: 5, dur: 0.1 });
  assert.equal(r.fx.flashA, 0.9, 'flash alpha is capped so the screen never whites out');
  for (let i = 0; i < 10; i++) frame();
  assert.equal(r.fx.flashT, 0);

  const before = r.stats.scene.dyn;
  bus.emit('hitstop', { ms: 100 });
  assert.ok(Math.abs(r.fx.hitstop - 0.1) < 1e-9);
  bus.emit('hitstop', { ms: 5000 });
  assert.ok(Math.abs(r.fx.hitstop - 0.18) < 1e-9, 'hit-stop is capped at 180 ms');
  g.ents.length = 0;                                   // the frozen frame must not re-run the scene
  frame();
  assert.equal(r.stats.scene.dyn, before, 'scene is frozen during hit-stop');
  for (let i = 0; i < 14; i++) frame();
  assert.equal(r.fx.hitstop, 0, 'and resumes afterwards');
  assert.notEqual(r.stats.scene.dyn, before);
});

test('guardBus: a throwing render listener never unwinds into the emitter; fx payloads always carry opts', async () => {
  const bus = createBus(), safe = guardBus(bus), seen = [];
  const off = safe.on('fx', (p) => { seen.push(p); if (p.type === 'bad') throw new Error('cosmetic listener exploded'); });
  const payload = { type: 'ring', x: 1, y: 2, z: 3 };
  const out = await quiet(() => {
    bus.emit('fx', payload);
    bus.emit('fx', { type: 'bad' });
    bus.emit('fx', { type: 'bad' });
    bus.emit('fx', { type: 'boom_small', opts: { n: 3 } });
  });
  assert.equal(seen.length, 4);
  assert.deepEqual(seen[0].opts, {}, 'missing opts are filled in for the listener');
  assert.equal('opts' in payload, false, 'the shared payload object is not mutated');
  assert.deepEqual(seen[3].opts, { n: 3 });
  assert.equal(out.warns.length, 1, 'warned once per event type');
  off();
  bus.emit('fx', { type: 'ring' });
  assert.equal(seen.length, 4, 'unsubscribe still works through the guard');
  assert.equal(typeof safe.emit, 'function');
});

test('renderer: real particle / popup hooks survive sim events without opts (boss death emits fx ring with none)', async () => {
  const mk = mockFactory(), bus = createBus();
  const r = createRenderer(mk(VIEW.W, VIEW.H), { bus, art: noArt(), createCanvas: mk });
  await r.ready;
  const g = makeDemoGame({ stage: 'boss', bus, juice: false });
  const out = await quiet(() => {
    for (const type of ['ring', 'boom_small', 'boom_big', 'crumbs', 'spark', 'smoke', 'splat', 'confetti', 'no_such_fx']) {
      bus.emit('fx', { type, x: 100, y: 200, z: 30 });
      bus.emit('fx', { type, x: 100, y: 200, z: 30, opts: undefined });
      bus.emit('fx', { type });
    }
    bus.emit('fx', null); bus.emit('fx', undefined);
    bus.emit('popup', { text: '500', x: 100, y: 200, z: 30 }); bus.emit('popup', null); bus.emit('popup', {});
    let ms = 0;
    for (let i = 0; i < 40; i++) { g.step(1 / 60); r.draw(g, 0.3, (ms += 16.7)); }
  });
  assert.deepEqual(out.errors, []);
});
