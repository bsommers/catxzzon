// polish: juice overlay (banners, callouts, boss intro/defeat, sunglasses spuds, meow bubbles), HUD jesse_bust, main wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBus } from '../src/core/events.js';
import { createJuice, CALLOUTS, SHADES_EVERY } from '../src/ui/juice.js';
import { drawHud, setHudArt } from '../src/ui/hud.js';

function mockCtx() {
  const calls = { fillRect: 0, drawImage: [], text: 0 };
  const noop = () => {};
  const ctx = new Proxy({ calls, globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: false, fillStyle: '#000' }, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'fillRect') return () => { calls.fillRect++; };
      if (k === 'drawImage') return (...a) => { calls.drawImage.push(a); };
      return noop;
    },
    set(o, k, v) { o[k] = v; return true; },
  });
  return ctx;
}
const fakeGame = (o = {}) => ({ scrollY: 0, player: { x: 112, y: 60, z: 30, alive: true }, bossHp01: null, ents: [], score: 0, lives: 3, round: 1, stageIdx: 0, fuel: 80, ...o });

test('banners show only for the live game and skip the victory splash', () => {
  const bus = createBus(), j = createJuice({ bus });
  bus.emit('banner', { text: 'CHEDDAR CITADEL', sub: 'STAGE 1', dur: 2 });
  assert.equal(j.state.banner, null, 'inactive (attract) -> no banner');
  j.active = true;
  bus.emit('banner', { text: 'CHEDDAR CITADEL', sub: 'STAGE 1', dur: 2 });
  assert.equal(j.state.banner.text, 'CHEDDAR CITADEL');
  bus.emit('banner', { text: 'VICTORY!', sub: 'FOR JESSE' });
  assert.equal(j.state.banner.text, 'CHEDDAR CITADEL', 'victory handled by main splash');
  j.update(2.5, fakeGame());
  assert.equal(j.state.banner, null, 'banner expires');
});

test('combo callouts fire once per level crossing and re-arm after the chain breaks', () => {
  const bus = createBus(), j = createJuice({ bus }); j.active = true;
  bus.emit('combo', { n: 2, mult: 2 });
  assert.equal(j.state.callout, null);
  bus.emit('combo', { n: 3, mult: 3 });
  assert.equal(j.state.callout.text, CALLOUTS[0][1]);
  j.state.callout = null;
  bus.emit('combo', { n: 4, mult: 3 });
  assert.equal(j.state.callout, null, 'same level does not repeat');
  bus.emit('combo', { n: 5, mult: 5 });
  assert.equal(j.state.callout.text, 'PURRFECT!');
  bus.emit('score', { score: 10, delta: 10, combo: 1 });   // chain broken
  j.state.callout = null;
  bus.emit('combo', { n: 3, mult: 3 });
  assert.equal(j.state.callout.text, 'PAWSOME!', 're-armed');
});

test('every Nth spud burst loses its sunglasses; non-spud fx do not', () => {
  const bus = createBus(), j = createJuice({ bus }); j.active = true;
  for (let i = 0; i < SHADES_EVERY * 2; i++) bus.emit('fx', { type: 'boom_small', x: 1, y: 1, z: 1 });
  assert.equal(j.state.shades.length, 0);
  for (let i = 0; i < SHADES_EVERY * 2; i++) bus.emit('fx', { type: 'spud_burst', x: 100, y: 50, z: 20 });
  assert.equal(j.state.shades.length, 2);
  assert.ok(j.state.coolText, 'DEAL WITH IT caption');
  j.update(2, fakeGame());
  assert.equal(j.state.shades.length, 0, 'shades expire');
  const qb = createBus(), quiet = createJuice({ bus: qb });   // inactive = attract demo: no gags
  for (let i = 0; i < SHADES_EVERY * 2; i++) qb.emit('fx', { type: 'spud_burst', x: 1, y: 1, z: 1 });
  assert.equal(quiet.state.shades.length, 0);
});

test('pickups make the cat meow (bubble + meow sfx) without recursing on its own sfx', () => {
  const bus = createBus(), j = createJuice({ bus }); j.active = true;
  const sfx = []; bus.on('sfx', (p) => sfx.push(p.name));
  bus.emit('sfx', { name: 'pickup_tuna' });
  assert.ok(j.state.bubble && j.state.bubble.text.length > 0);
  assert.deepEqual(sfx.sort(), ['meow_b', 'pickup_tuna']);
  bus.emit('fuel', { fuel: 10, low: true });
  assert.equal(j.state.bubble.text, 'TUMMY EMPTY!');
});

test('boss intro starts when the boss appears and the defeat card when its hp hits 0', () => {
  const bus = createBus(), j = createJuice({ bus }); j.active = true;
  const g = fakeGame();
  j.update(1 / 60, g); assert.equal(j.state.intro, null);
  g.bossHp01 = 1; j.update(1 / 60, g);
  assert.ok(j.state.intro, 'intro running');
  j.update(1 / 60, g); assert.equal(j.stats.intros, 1, 'only once');
  g.bossHp01 = 0; j.update(1 / 60, g);
  assert.ok(j.state.defeat, 'defeat card'); assert.equal(j.state.intro, null);
  bus.emit('stage', { idx: 3 });
  assert.equal(j.state.defeat, null, 'new stage clears it');
});

test('draw runs every layer without throwing and uses the jesse_bust art', () => {
  const bus = createBus();
  const bust = { width: 64, height: 64 };
  const art = { get: (n) => (n === 'jesse_bust' ? bust : null) };
  const j = createJuice({ bus, art }); j.active = true;
  bus.emit('banner', { text: 'A', sub: 'B' }); bus.emit('combo', { mult: 8 }); bus.emit('sfx', { name: 'pickup_nip' });
  for (let i = 0; i < SHADES_EVERY; i++) bus.emit('fx', { type: 'spud_burst', x: 100, y: 40, z: 10 });
  const g = fakeGame({ bossHp01: 1 }); j.update(0.5, g);
  const ctx = mockCtx();
  for (let t = 0; t < 4; t += 0.25) { j.update(0.25, g); j.draw(ctx, g, t, 0); }
  assert.ok(ctx.calls.fillRect > 20);
  assert.ok(ctx.calls.drawImage.some((a) => a[0] === bust), 'intro bust drawn');
});

test('HUD boss bar draws the jesse_bust sprite when art is set, vector fallback otherwise', () => {
  const g = fakeGame({ bossHp01: 0.5, hiscore: 0, bombs: 2, combo: 0, nipT: 0, laserT: 0 });
  const bust = { width: 64, height: 64 };
  setHudArt(null);
  let ctx = mockCtx(); drawHud(ctx, g, 1);
  assert.equal(ctx.calls.drawImage.length, 0);
  setHudArt({ get: () => bust });
  ctx = mockCtx(); drawHud(ctx, g, 1);
  assert.ok(ctx.calls.drawImage.some((a) => a[0] === bust && a[3] === 44), '44px crop of the bust');
  setHudArt(null);
});

test('main.js wiring: demo scene, hit-stop freezes the sim, juice overlay, attract mutes banners', () => {
  const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(src, /get\('scene'\) === 'demo'/);
  assert.match(src, /renderer\.hitstop > 0\) \{ acc = 0; \}/);
  assert.match(src, /setOverlay/);
  assert.match(src, /ATTRACT_MUTED = new Set\(\[[^\]]*'banner'/);
  assert.match(src, /setHudArt/);
});
