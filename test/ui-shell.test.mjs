import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, saveSettings, sanitizeSettings, loadHi, saveHi, hiRank, insertHi, sanitizeHi, DEFAULTS, HI_MAX } from '../src/core/settings.js';
import { createInput } from '../src/core/input.js';
import { createMenu, optionsItems } from '../src/ui/menus.js';
import * as S from '../src/ui/screens.js';

const fakeStore = (init = {}) => { const m = { ...init }; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };
const stubCtx = () => new Proxy({ calls: 0 }, { get: (t, k) => (k === 'calls' ? t.calls : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => { t.calls++; } ), set: () => true });

test('settings round-trip and sanitize', () => {
  const st = fakeStore();
  assert.deepEqual(loadSettings(st), DEFAULTS);
  saveSettings({ ...DEFAULTS, master: 0.3, crt: false }, st);
  assert.equal(loadSettings(st).master, 0.3); assert.equal(loadSettings(st).crt, false);
  assert.equal(sanitizeSettings({ master: 9, sfx: 'x', crt: 1 }).master, 1);
  assert.equal(sanitizeSettings({ sfx: 'x' }).sfx, DEFAULTS.sfx);
  assert.deepEqual(loadSettings(fakeStore({ 'catxzzon.settings': '{bad' })), DEFAULTS);
});
test('hi-score table ranking and insertion', () => {
  const l = sanitizeHi(null);
  assert.equal(l.length, HI_MAX);
  assert.equal(hiRank(l, 0), -1); assert.equal(hiRank(l, 999), -1); assert.equal(hiRank(l, 1000), -1); assert.equal(hiRank(l, 1001), HI_MAX - 1); assert.equal(hiRank(l, 99999), 0);
  const n = insertHi(l, 'ABC', 40000);
  assert.equal(n[1].name, 'ABC'); assert.equal(n.length, HI_MAX); assert.ok(n.every((e, i) => i === 0 || n[i - 1].score >= e.score));
  const st = fakeStore(); saveHi(n, st); assert.deepEqual(loadHi(st), n);
  assert.equal(sanitizeHi([{ name: 'a!bcd', score: 5 }])[0].name, 'ABC');
});
test('input: keyboard axes, edges, invert, autofire', () => {
  const inp = createInput({ target: null });
  inp.keydown('ArrowLeft'); inp.keydown('KeyW'); inp.keydown('Space');
  let p = inp.poll(); assert.equal(p.dx, -1); assert.equal(p.dz, 1); assert.equal(p.fire, true); assert.equal(p.bomb, false);
  inp.keydown('KeyX'); inp.keyup('KeyX');
  assert.equal(inp.poll().bomb, true); assert.equal(inp.poll().bomb, false);
  inp.keydown('KeyP'); assert.equal(inp.poll().pause, true); assert.equal(inp.poll().pause, false);
  inp.setInvert(true); assert.equal(inp.poll().dz, -1);
  inp.keyup('Space'); inp.setAutofire(true); assert.equal(inp.poll().fire, true);
  inp.keydown('ArrowRight'); inp.keydown('ArrowLeft'); assert.equal(inp.poll().dx, 0);
});
test('input: gamepad and menu edges', () => {
  let pad = { axes: [0.9, -0.9], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  const inp = createInput({ target: null, getPads: () => [pad] });
  let p = inp.poll(); assert.equal(p.dx, 0.9); assert.equal(p.dz, 0.9);
  pad.buttons[0].pressed = true; inp.poll(); const ev = inp.menu(); assert.equal(ev.select, true); assert.equal(inp.menu().select, false);
  inp.keydown('Enter'); assert.equal(inp.menu().select, true);
});
test('menu navigation, sliders, toggles', () => {
  const s = { ...DEFAULTS }; let changed = 0;
  const m = createMenu(optionsItems(s, () => changed++));
  m.handle({ up: true }); assert.equal(m.items[m.cursor].id, 'back');
  assert.equal(m.handle({ select: true }), 'back');
  m.cursor = 0; m.handle({ left: true }); assert.equal(s.master, 0.7);
  for (let i = 0; i < 20; i++) m.handle({ right: true }); assert.equal(s.master, 1);
  m.cursor = 4; m.handle({ select: true }); assert.equal(s.crt, !DEFAULTS.crt); assert.ok(changed > 0);
});
test('initials entry', () => {
  const m = S.createInitials('AAA');
  m.handle({ down: true }); assert.equal(m.chars[0], '9');
  m.handle({ up: true }); m.handle({ up: true }); assert.equal(m.chars[0], 'B');
  m.handle({ select: true }); m.handle({ select: true }); assert.equal(m.done, false); m.handle({ select: true });
  assert.equal(m.done, true); assert.equal(m.name, 'BAA');
});
test('screens draw without throwing and issue draw calls', () => {
  const c = stubCtx();
  S.drawLogo(c, 320, 40, 0); S.drawLoading(c, 0.5, 1); S.drawTitle(c, 1, { hi: 5 }); S.drawHiTable(c, sanitizeHi(null), 1);
  S.drawGameOver(c, 1, { score: 5, rank: 2, initials: S.createInitials(), hiList: [] }); S.drawVictory(c, 1, 2); S.drawError(c, new Error('x'), 1);
  assert.equal(S.drawCredits(c, 0), false); assert.equal(S.drawCredits(c, 400), true); assert.ok(c.calls > 100);
  assert.ok(S.CREDITS.some(([t]) => t === 'FOR JESSE'));
});
