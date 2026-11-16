// Renderer debug harness (owner: render-scene): a hand-built scene driven by a FAKE game object, no sim needed.
//   import { runDemo } from './render/demo.js'; runDemo(canvas)          // or open a page with ?scene=demo
// Query params: stage=fortress|keep|space|boss  nip=1  crt=1  lowfuel=1  hud=0  t=<seconds to pre-run>  freeze=1
// makeDemoGame() is pure and Node-safe (used by test/render-scene.test.mjs).
import { CELL, BLOCKS, KINDS, VIEW, TUNING, FIELD_W } from '../core/defs.js';
import { createBus } from '../core/events.js';

const B = BLOCKS, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SECTION = 44;                                  // rows per repeating fortress section

export function makeDemoStage(kind = 'fortress') {
  const cells = [], spawns = [], decor = [];
  const put = (cx, cy, cz, t) => cells.push({ cx, cy, cz, t });
  const yc = (cy) => cy * CELL + CELL / 2, xc = (cx) => cx * CELL + CELL / 2;
  const sp = (kind2, x, y, z = 0, props = {}) => spawns.push({ y, kind: kind2, x, z, ...props });
  function wall(cy, h, gap, top = B.crown) {
    for (let cx = 0; cx < 14; cx++) for (let cz = 0; cz < h; cz++) {
      if (gap && cx >= gap.x0 && cx <= gap.x1 && cz >= gap.z0 && cz <= gap.z1) continue;
      const open = gap && cx >= gap.x0 && cx <= gap.x1;
      let t = cz === 0 ? B.rind : cz === h - 1 ? top : (cx * 7 + cz * 3 + cy) % 9 === 0 ? B.window : (cx + cz * 2) % 5 === 0 ? B.swiss : B.cheddar;
      if (cz === 0 && cx % 6 === 2 && !open) t = B.mousehole;
      if (open && cz === gap.z1 + 1) t = B.gold;
      put(cx, cy, cz, t);
    }
  }
  function tower(cx0, cy0, n, h, flag) {
    for (let cx = cx0; cx < cx0 + n; cx++) for (let cy = cy0; cy < cy0 + n; cy++) for (let cz = 0; cz < h; cz++) {
      put(cx, cy, cz, cz === 0 ? B.rind : cz === h - 1 ? B.crown : (cx + cy + cz) % 4 === 0 ? B.window : cz % 3 === 2 ? B.cracker : B.cheddar);
    }
    if (flag) put(cx0 + n - 1, cy0 + n - 1, h, B.flag);
  }
  if (kind !== 'space') {
    const reps = kind === 'boss' ? 1 : 8;
    for (let r = 0; r < reps; r++) {
      const b = 7 + r * SECTION;
      if (kind === 'boss') {                           // courtyard: side walls, runes, flags
        for (let cy = 4; cy < 60; cy += 2) { for (let cz = 0; cz < 3; cz++) { put(0, cy, cz, cz === 2 ? B.crown : B.rind); put(13, cy, cz, cz === 2 ? B.crown : B.rind); } if (cy % 8 === 4) { put(0, cy, 3, B.flag); put(13, cy, 3, B.flag); } }
        for (let y = 80; y < 900; y += 96) { decor.push({ y, x: 112, type: 'rune' }); decor.push({ y: y + 40, x: 56, type: 'seam' }); }
        continue;
      }
      wall(b, 2, { x0: 9, x1: 11, z0: 0, z1: 1 }, B.swiss);
      sp('turret', xc(2), yc(b + 3)); sp('tuna', xc(6), yc(b + 4)); sp('pad', xc(11), yc(b + 5)); sp('nip', xc(8), yc(b + 6), 40);
      wall(b + 9, 5, { x0: 4, x1: 7, z0: 2, z1: 3 });
      sp('turret', xc(2), yc(b + 9), 5 * CELL); sp('turret', xc(11), yc(b + 9), 5 * CELL);
      sp('tuna', xc(3), yc(b + 13)); sp('yarnpick', xc(10), yc(b + 13), 56); sp('pad', xc(7), yc(b + 14));
      for (let cx = 0; cx < 14; cx++) if (cx < 4 || cx > 9) for (let cz = 0; cz < 5; cz++) put(cx, b + 18, cz, cz === 0 ? B.rind : cz === 4 ? B.crown : (cx + cz) % 3 ? B.cheddar : B.swiss);
      sp('field', 7 * CELL, yc(b + 18), 0, { span: 6, z0: 0, z1: 64, pulse: 2.6, phase: r * 0.7 });
      tower(1, b + 24, 2, 6, true); tower(9, b + 25, 3, 4, false); tower(5, b + 29, 1, 3, true);
      sp('radar', xc(1) + 8, yc(b + 24) + 8, 6 * CELL); sp('turret', xc(10), yc(b + 26), 4 * CELL); sp('turret', xc(6), yc(b + 26));
      sp('laserpick', xc(7), yc(b + 31), 30); sp('tuna', xc(12), yc(b + 31)); sp('can', xc(4), yc(b + 32), 30);
      wall(b + 36, 7, { x0: 8, x1: 10, z0: 3, z1: 5 });
      sp('field', 9.5 * CELL, yc(b + 36), 3 * CELL, { span: 3, z0: 3 * CELL, z1: 6 * CELL });
      sp('pad', xc(3), yc(b + 40)); sp('turret', xc(9), yc(b + 41));
      for (const [dx, dy, type] of [[40, 30, 'crater'], [170, 70, 'hole'], [100, 200, 'rune'], [60, 330, 'crater'], [190, 480, 'crater'], [30, 520, 'hole'], [112, 620, 'rune']]) decor.push({ y: b * CELL + dy, x: dx, type });
      decor.push({ y: b * CELL + 110, x: 112, type: 'seam' }, { y: b * CELL + 440, x: 112, type: 'seam' });
    }
  }
  const base = { fortress: { ground: 'cracker', bg: 'dusk', kind: 'fortress' }, keep: { ground: 'gouda', bg: 'night', kind: 'fortress' },
    space: { ground: 'none', bg: 'void', kind: 'space' }, boss: { ground: 'keep', bg: 'night', kind: 'boss' } }[kind] || { ground: 'cracker', bg: 'dusk', kind: 'fortress' };
  spawns.sort((a, b) => a.y - b.y);
  return { id: 'demo-' + kind, name: 'RENDER DEMO', length: 5200, music: null, ...base, cells, spawns, decor, bossY: kind === 'boss' ? 300 : undefined };
}

/** Fake game with the read-only surface the renderer/HUD use, plus step(dt) to animate it. */
export function makeDemoGame(opts = {}) {
  const kind = opts.stage || 'fortress', bus = opts.bus || createBus(), stage = makeDemoStage(kind);
  let nextId = 1;
  const g = {
    t: 0, state: 'play', round: 1, stageIdx: 0, stage, scrollY: opts.scrollY ?? 60, speed: TUNING.baseSpeed, ents: [], grid: null,
    score: 12500, hiscore: 50000, lives: 3, fuel: opts.lowFuel ? 14 : 78, bombs: 2, combo: 3, nipT: opts.nip ? 99 : 0, laserT: 0,
    bossHp01: kind === 'boss' ? 0.7 : null, bus, rng: null,
    player: { x: FIELD_W / 2, y: 0, z: 50, vx: 0, vz: 0, bank: 0, invuln: 0, alive: true },
  };
  function spawn(kind2, props) {
    const k = KINDS[kind2] || {};
    const e = { id: nextId++, kind: kind2, x: 0, y: 0, z: 0, w: k.w, d: k.d, h: k.h, hp: k.hp, team: k.team, t: 0, vx: 0, vy: 0, vz: 0, dead: false, st: {}, ...props };
    if (e.span > 0) e.w = e.span * CELL;
    g.ents.push(e);
    return e;
  }
  g.spawn = spawn;
  for (const s of stage.spawns) spawn(s.kind, s);
  const jets = [], balls = [], shots = [], spuds = [];
  for (let i = 0; i < 5; i++) jets.push(spawn('mousejet', {}));
  for (let i = 0; i < 6; i++) balls.push(spawn('cheeseball', { ph: i / 6 }));
  for (let i = 0; i < 4; i++) shots.push(spawn('hairball', { ph: i / 4 }));
  if (kind === 'space') for (let i = 0; i < 14; i++) spuds.push(spawn('spud', { x: 20 + ((i * 53) % 190), y: 120 + i * 70, z: 20 + ((i * 37) % 90), ang: i, small: i % 5 === 4, heat: (i % 4) / 3 }));
  const boss = kind === 'boss' ? spawn('boss', { x: FIELD_W / 2, y: 330, z: 0 }) : null;
  const missiles = boss ? [spawn('bossmissile', {}), spawn('bossmissile', {})] : [];
  const crowd = [];
  if (opts.stress) {                                  // perf harness (?stress=2): ~3000 drawn voxels + ~400 live sprites
    for (let cy = 8; cy < 320; cy += 2) for (let cx = 0; cx < 14; cx++) {
      if (cx === (cy >> 1) % 14 || cx === ((cy >> 1) + 1) % 14) continue;
      for (let cz = 0; cz < 5 * opts.stress + (cy % 4); cz++) stage.cells.push({ cx, cy, cz, t: 1 });
    }
    for (let i = 0; i < 370; i++) crowd.push(spawn(i % 3 ? 'hairball' : 'cheeseball', { ph: i }));
  }
  let fxT = 0.4, bigT = 2.6;

  g.step = (dt) => {
    g.t += dt;
    if (!(boss && g.scrollY >= 60)) g.scrollY += g.speed * dt;
    const t = g.t, p = g.player, px = FIELD_W / 2 + 74 * Math.sin(t * 0.8), pz = 52 + 38 * Math.sin(t * 1.17 + 0.6);
    p.vx = (px - p.x) / dt; p.vz = (pz - p.z) / dt; p.x = px; p.z = pz; p.y = g.scrollY + VIEW.PLAYER_LEAD;
    p.bank += (clamp(p.vx / 45, -2, 2) - p.bank) * Math.min(1, dt * 10);
    if (g.nipT > 0 && g.nipT < 90) g.nipT = Math.max(0, g.nipT - dt);
    for (const e of g.ents) {
      e.t += dt;
      if (e.kind === 'field' && e.pulse > 0) { const ph = (((e.t + (e.phase || 0)) % e.pulse) + e.pulse) % e.pulse / e.pulse; e.on = ph < 0.62; e.warn = !e.on && ph > 0.88; e.glow = e.on ? 0.8 + 0.2 * Math.sin(e.t * 18) : e.warn ? ((e.t * 16) & 1) * 0.5 : 0; }
      if (e.kind === 'can') e.z = 20 + ((e.t * 46) % 100);
      if (e.kind === 'spud') { e.ang += dt * 2.4; e.x += Math.sin(e.t + e.id) * 8 * dt; }
      if (e.kind === 'turret') e.tele = Math.max(0, Math.sin(e.t * 1.7 + e.id));
    }
    jets.forEach((e, i) => {
      const a = t * 1.1 + i * 0.55, nx = FIELD_W / 2 + 62 * Math.sin(a);
      e.bank = clamp(Math.cos(a) * 2.2, -2, 2); e.x = nx; e.y = g.scrollY + 230 + i * 22 + 26 * Math.sin(t * 0.5); e.z = 62 + 22 * Math.sin(a * 1.3);
    });
    balls.forEach((e, i) => { const u = (t * 0.33 + e.ph) % 1; e.x = 30 + i * 32; e.y = g.scrollY + 420 - u * 460; e.z = 24 + i * 9; });
    shots.forEach((e) => { const u = (t * 1.1 + e.ph) % 1; e.x = p.x; e.y = p.y + 14 + u * 300; e.z = p.z + 2; });
    if (boss) {
      boss.x = FIELD_W / 2 + 46 * Math.sin(t * 0.6); boss.z = 6 + 5 * Math.sin(t * 2.1); boss.y = Math.max(330, g.scrollY + 250);
      boss.frame = [0, 1, 0, 1, 2, 2, 3, 3, 4, 4, 0, 1, 6, 6][Math.floor(t * 2) % 14];
      missiles.forEach((m, i) => { const u = (t * 0.25 + i * 0.5) % 1; m.x = boss.x + (i ? 40 : -40) * (1 - u); m.y = boss.y - u * 260; m.z = 40 + 30 * Math.sin(u * 6); });
      g.bossHp01 = 0.5 + 0.4 * Math.sin(t * 0.3);
    }
    for (let i = 0; i < crowd.length; i++) {
      const e = crowd[i];
      e.x = 8 + ((i * 37.7 + t * (9 + (i % 7))) % (FIELD_W - 16)); e.y = g.scrollY - 30 + ((i * 53.3 + t * 40) % 420); e.z = 20 + ((i * 29) % 100) + 6 * Math.sin(t * 3 + i);
    }
    fxT -= dt; bigT -= dt;
    if (fxT <= 0) {
      fxT = 0.55;
      const x = 30 + ((t * 97) % 170), y = g.scrollY + 120 + ((t * 61) % 240), z = 10 + ((t * 43) % 60);
      bus.emit('fx', { type: ['boom_small', 'crumbs', 'spark', 'smoke', 'splat', 'ring'][Math.floor(t * 3) % 6], x, y, z, opts: {} });
      bus.emit('popup', { text: String(100 * (1 + (Math.floor(t) % 5))), x, y, z: z + 10, color: '#ffe14a' });
    }
    if (bigT <= 0) {
      bigT = 3.4;
      bus.emit('fx', { type: 'boom_big', x: p.x + 30, y: p.y + 150, z: 30 });
      bus.emit('fx', { type: 'confetti', x: p.x, y: p.y + 120, z: 50 });
      if (opts.juice !== false) { bus.emit('shake', { mag: 4, dur: 0.3 }); bus.emit('flash', { color: '#fff2c0', a: 0.3, dur: 0.12 }); bus.emit('hitstop', { ms: 50 }); }
    }
  };
  return g;
}

/** Run the harness on a canvas. Returns { game, renderer, art, stop }. Sets window.__demoReady when the first frames are up. */
export async function runDemo(canvas, q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')) {
  const [{ createRenderer }, { buildAll }] = await Promise.all([import('./renderer.js'), import('../art/registry.js')]);
  const bus = createBus(), art = buildAll();
  const renderer = createRenderer(canvas, { bus, art, crt: q.get('crt') === '1', hud: q.get('hud') === '0' ? false : 'auto' });
  const game = makeDemoGame({ stage: q.get('stage') || 'fortress', bus, nip: q.get('nip') === '1', lowFuel: q.get('lowfuel') === '1', juice: q.get('juice') !== '0', stress: Math.max(0, Math.min(4, parseInt(q.get('stress') || '0', 10) || 0)) });
  await Promise.all([art.ready, renderer.ready]);
  const STEP = 1 / 60, T = parseFloat(q.get('t') || '0') || 0, n = Math.round(T / STEP), lead = Math.min(n, 90);
  let clockMs = 1000;
  for (let i = 0; i < n; i++) {                       // deterministic pre-run; the last 1.5 s are drawn so particles/trails exist
    game.step(STEP);
    if (i >= n - lead) renderer.draw(game, 0, (clockMs += STEP * 1000));
  }
  renderer.draw(game, 0, (clockMs += STEP * 1000));
  let running = q.get('freeze') !== '1', last = 0, acc = 0;
  function frame(ms) {
    if (!running) return;
    const dt = last ? Math.min(0.1, (ms - last) / 1000) : STEP;
    last = ms; acc += dt;
    while (acc >= STEP) { game.step(STEP); acc -= STEP; }
    renderer.draw(game, acc / STEP);
    requestAnimationFrame(frame);
  }
  if (running) requestAnimationFrame(frame);
  const api = { game, renderer, art, stop() { running = false; } };
  if (typeof window !== 'undefined') { window.__demo = api; window.__demoReady = true; }
  return api;
}

// Auto-start when a page that imports this module is opened with ?scene=demo and has <canvas id="game">.
if (typeof document !== 'undefined' && typeof location !== 'undefined' && new URLSearchParams(location.search).get('scene') === 'demo') {
  const c = document.getElementById('game');
  if (c && !window.__demoStarted) { window.__demoStarted = true; runDemo(c).catch((e) => { console.error('[demo]', e); window.__demoError = String(e && e.stack || e); }); }
}
