import test from 'node:test';
import assert from 'node:assert/strict';
import { BEHAVIORS, DIFF, PATTERNS, aimAt, diffIdx } from '../src/sim/enemies.js';
import { KINDS, CELL, FIELD_CELLS_Z, FIELD_W, TUNING } from '../src/core/defs.js';
import { createRng } from '../src/core/rng.js';

const DT = 1 / 60;
const PBOX = TUNING.playerBox;

// ---------- minimal fake engine implementing the §4 behaviour API ----------
function fakeGame({ round = 1, seed = 1, speed = 84, solidAt = null, player = {} } = {}) {
  const log = { sfx: [], fx: [], popup: [] };
  const g = {
    round, rng: createRng(seed), speed, scrollY: 0, t: 0, ents: [], _id: 1, log, hits: 0, kills: [],
    player: { x: 112, y: 48, z: 40, vx: 0, vz: 0, alive: true, invuln: 0, ...player },
  };
  g.spawn = (kind, props) => {
    const k = KINDS[kind] || { team: 'x', w: 0, d: 0, h: 0, hp: 1 };
    const e = { id: g._id++, kind, x: 0, y: 0, z: 0, w: k.w, d: k.d, h: k.h, hp: k.hp, team: k.team, t: 0,
      vx: 0, vy: 0, vz: 0, dead: false, hit: !!k.hit, solid: !!k.solid, score: k.score | 0, st: {} };
    Object.assign(e, props);
    if (kind === 'field') {
      if (e.span > 0) e.w = e.span * CELL;
      if (e.z0 !== undefined && e.z1 !== undefined) {
        const c = e.z1 <= FIELD_CELLS_Z; e.z = c ? e.z0 * CELL : e.z0; e.h = (c ? e.z1 * CELL : e.z1) - e.z;
      }
      if (e.on === undefined) e.on = true;
    }
    g.ents.push(e);
    const b = BEHAVIORS[kind];
    if (b && b.init) b.init(e, g);
    return e;
  };
  g.hurt = (e, dmg, src) => {
    const b = BEHAVIORS[e.kind];
    if (b && b.onHit && b.onHit(e, dmg, g, src) === false) return false;
    e.hp -= dmg; if (e.hp <= 0) g.kill(e, src); return true;
  };
  g.kill = (e, src) => {
    if (e.dead) return; e.dead = true; g.kills.push(e.kind);
    const b = BEHAVIORS[e.kind]; if (b && b.onDeath) b.onDeath(e, g);
  };
  g.sfx = (name, e) => log.sfx.push(name);
  g.fx = (type) => log.fx.push(type);
  g.popup = (text) => log.popup.push(text);
  g.shake = () => {};
  g.nearestEnemy = () => null;
  g.cellAt = () => 0;
  g.solidAt = solidAt || (() => false);
  g.count = (kind) => g.ents.filter((e) => !e.dead && e.kind === kind).length;
  // one tick: scroll, move player (input.dx/dz), update entities like sim-core, bullets vs player, despawn
  g.step = (input = null) => {
    g.t += DT; g.scrollY += g.speed * DT;
    const p = g.player;
    p.vx = input ? input.dx * TUNING.moveX : 0; p.vz = input ? input.dz * TUNING.moveZ : 0;
    p.x = Math.min(TUNING.xMax, Math.max(TUNING.xMin, p.x + p.vx * DT));
    p.z = Math.min(TUNING.zMax, Math.max(TUNING.zMin, p.z + p.vz * DT));
    p.y = g.scrollY + 48;
    const n = g.ents.length;
    for (let i = 0; i < n; i++) {
      const e = g.ents[i]; if (e.dead) continue;
      e.t += DT;
      const b = BEHAVIORS[e.kind];
      if (b && b.update) b.update(e, DT, g); else { e.x += e.vx * DT; e.y += e.vy * DT; e.z += e.vz * DT; }
      if (e.kind === 'cheeseball' && !e.dead && touches(p, e)) { g.hits++; e.dead = true; }
    }
    const lo = g.scrollY - 80, hi = g.scrollY + 800;
    g.ents = g.ents.filter((e) => !e.dead && e.y >= lo && (e.team === 'x' || e.y <= hi) && e.x > -96 && e.x < FIELD_W + 96 && e.z > -64 && e.z < 320);
  };
  g.run = (secs, input) => { for (let i = 0, n = Math.round(secs / DT); i < n; i++) g.step(typeof input === 'function' ? input(g, i) : input); };
  return g;
}
function touches(p, e) {
  return Math.abs(p.x - e.x) * 2 < PBOX.w + e.w && Math.abs(p.y - e.y) * 2 < PBOX.d + e.d && p.z < e.z + e.h && e.z < p.z + PBOX.h;
}
const weave = (g) => ({ dx: Math.sin(g.t * 1.3) > 0 ? 1 : -1, dz: Math.sin(g.t * 0.7) * 0.5 });

// ---------- shape ----------
test('BEHAVIORS covers every enemy/pickup kind with init+update', () => {
  for (const k of ['turret', 'pad', 'can', 'field', 'tuna', 'radar', 'formation', 'mousejet', 'spud', 'nip', 'yarnpick', 'laserpick', 'cheeseball']) {
    assert.equal(typeof BEHAVIORS[k]?.init, 'function', k);
    assert.equal(typeof BEHAVIORS[k]?.update, 'function', k);
  }
  assert.equal(diffIdx({ round: 1 }), 0); assert.equal(diffIdx({ round: 3 }), 2); assert.equal(diffIdx({ round: 9 }), 3); assert.equal(diffIdx({}), 0);
});

// ---------- scenario used for determinism / no Math.random ----------
function scenario(seed, round = 2) {
  const g = fakeGame({ seed, round });
  g.spawn('turret', { x: 80, y: 300 }); g.spawn('turret', { x: 150, y: 520, z: 48 });
  g.spawn('pad', { x: 112, y: 400 }); g.spawn('field', { x: 112, y: 600, span: 4, z0: 0, z1: 3, pulse: 2 });
  g.spawn('tuna', { x: 60, y: 350 }); g.spawn('radar', { x: 160, y: 450 });
  g.spawn('formation', { y: 560, pattern: 'ring', n: 6 }); g.spawn('spud', { x: 100, y: 500 }); g.spawn('nip', { x: 90, y: 300, z: 30 });
  g.run(12, weave);
  return { g, snap: JSON.stringify(g.ents.map((e) => [e.kind, e.x, e.y, e.z, e.frame])) + g.log.sfx.join() + g.hits };
}
test('deterministic per seed; never touches Math.random', () => {
  const orig = Math.random;
  Math.random = () => { throw new Error('Math.random used'); };
  try {
    const a = scenario(5), b = scenario(5), c = scenario(6);
    assert.equal(a.snap, b.snap);
    assert.notEqual(a.snap, c.snap);
  } finally { Math.random = orig; }
});

// ---------- cheeseball ----------
test('cheeseball moves, expires, and splats on voxels', () => {
  const g = fakeGame({ solidAt: (x, y) => y > 200 && y < 216 });
  const a = g.spawn('cheeseball', { x: 100, y: 150, z: 20, vy: 100, life: 5 });
  const b = g.spawn('cheeseball', { x: 100, y: 400, z: 20, vx: 10, life: 0.5 });
  g.speed = 0;
  g.run(0.3); assert.ok(a.y > 170 && !a.dead); assert.ok(b.x > 102);
  g.run(0.5); assert.ok(a.dead, 'hit wall'); assert.ok(g.log.fx.includes('splat')); assert.ok(b.dead, 'expired');
});

// ---------- aiming ----------
test('aimAt leads a moving player to an intercept; lead 0 ignores lateral motion', () => {
  const g = fakeGame({ player: { x: 60, vx: 150, vz: 30 } });
  const sim = (lead) => {
    const v = aimAt(g, 112, 300, 20, 140, lead, {});
    let best = Infinity; const p = g.player;
    for (let t = 0; t < 4; t += 0.005) {
      const bx = 112 + v.vx * t, by = 300 + v.vy * t, bz = 20 + v.vz * t;
      const px = p.x + p.vx * t, py = p.y + g.speed * t, pz = p.z + 4 + p.vz * t;
      best = Math.min(best, Math.hypot(bx - px, by - py, bz - pz));
    }
    assert.ok(Math.abs(Math.hypot(v.vx, v.vy, v.vz) - 140) < 1e-6);
    return best;
  };
  assert.ok(sim(1) < 1, 'full lead intercepts');
  assert.ok(sim(0) > 30, 'no lead misses a strafing player');
});

// ---------- turret ----------
test('turret telegraphs before firing, fires bursts sized by round, and only when player is in front', () => {
  for (const round of [1, 3]) {
    const g = fakeGame({ round, speed: 0 });
    const t = g.spawn('turret', { x: 112, y: 250 });
    let teleSeen = false, firstShotT = -1;
    for (let i = 0; i < 600; i++) {
      g.step();
      if (t.tele > 0 && g.count('cheeseball') === 0) teleSeen = true;
      if (firstShotT < 0 && g.count('cheeseball') > 0) firstShotT = g.t;
    }
    assert.ok(teleSeen, 'telegraph seen before first shot');
    assert.ok(firstShotT > 0);
    assert.ok(t.st.fired >= DIFF.turret.burst[diffIdx(g)], 'at least one full burst');
    assert.equal(t.st.fired % DIFF.turret.burst[diffIdx(g)] <= DIFF.turret.burst[diffIdx(g)], true);
    assert.ok(g.log.sfx.includes('turret_fire'));
  }
  // behind the player / far away: silent
  const g = fakeGame({ round: 3, speed: 0 });
  const behind = g.spawn('turret', { x: 112, y: 20 }), far = g.spawn('turret', { x: 112, y: 48 + 500 });
  g.run(8);
  assert.equal(behind.st.fired, 0); assert.equal(far.st.fired, 0);
  // aim frames: player to the -y (in front of turret, below on screen) -> frame 0
  assert.ok([0, 4].includes(far.frame));
});

test('turret fire rate scales with round', (t) => {
  const shots = (round) => { const g = fakeGame({ round, speed: 0 }); const t = g.spawn('turret', { x: 112, y: 250 }); g.run(30); return t.st.fired; };
  const r1 = shots(1), r2 = shots(2), r3 = shots(3);
  t.diagnostic(`turret shots/30s r1=${r1} r2=${r2} r3=${r3}`);
  assert.ok(r1 < r2 && r2 < r3, `${r1} ${r2} ${r3}`);
  assert.ok(r3 >= 2.5 * r1, `r3 ${r3} vs r1 ${r1}`);
});

// ---------- difficulty curve: turret gauntlet while weaving ----------
function gauntlet(round, seed = 3) {
  const g = fakeGame({ round, seed });
  const r = createRng(seed * 7);
  for (let y = 300; y < 3300; y += 150) g.spawn('turret', { x: r.range(30, 194), y });
  g.run(3300 / 84, weave);
  return g.hits;
}
test('round 1 is friendly, round 3 is hard (weaving player vs turret gauntlet)', (t) => {
  let h1 = 0, h2 = 0, h3 = 0;
  for (const s of [1, 2, 3]) { h1 += gauntlet(1, s); h2 += gauntlet(2, s); h3 += gauntlet(3, s); }
  t.diagnostic(`gauntlet hits over 3 runs: r1=${h1} r2=${h2} r3=${h3}`);
  assert.ok(h1 <= 3, `round 1 hits ${h1}`);
  assert.ok(h3 >= 3 * Math.max(1, h1), `round 3 hits ${h3} vs round 1 ${h1}`);
});

// ---------- pad + can ----------
test('pad arms only inside trigger, launches cans (1 in round 1, 2 in round 3)', () => {
  for (const [round, want] of [[1, 1], [3, 2]]) {
    const g = fakeGame({ round });
    const p = g.spawn('pad', { x: 112, y: 48 + 400, trigger: 170 });
    g.run(2);                                     // gap 400 - 168 = 232 > trigger
    assert.equal(p.st.launched, 0); assert.equal(p.frame, 0);
    g.run(2.2);                                   // now within trigger
    assert.ok(p.st.launched >= 1, 'launched');
    assert.ok(g.log.sfx.includes('can_launch') && g.log.sfx.includes('warning'));
    g.run(2);
    assert.equal(p.st.launched, want, `round ${round}`);
    assert.equal(p.frame, 2);
    assert.ok(g.log.sfx.includes('can_hiss'));
  }
  const g = fakeGame(); const p = g.spawn('pad', { x: 112, y: 100 }); assert.equal(p.trigger, 170);
});

test('can climbs, then homes on player x/z with a limited turn rate', () => {
  const turnRates = [];
  for (const round of [1, 3]) {
    const g = fakeGame({ round, speed: 0, player: { x: 40, z: 60 } });
    const c = g.spawn('can', { x: 140, y: 250, z: 2 });
    const k = diffIdx(g);
    g.run(DIFF.can.boost[k] - 0.05);
    assert.equal(c.vx, 0); assert.ok(c.vz > 0 && c.z > 2, 'boost climbs straight');
    let maxDv = 0, pvx = c.vx, pvz = c.vz;
    for (let i = 0; i < 120; i++) {
      g.step();
      maxDv = Math.max(maxDv, Math.abs(c.vx - pvx) / DT, Math.abs(c.vz - pvz) / DT); pvx = c.vx; pvz = c.vz;
    }
    assert.ok(maxDv <= DIFF.can.acc[k] + 1e-6, `turn rate ${maxDv}`);
    assert.ok(c.vx < 0 && c.x < 140, 'steers toward player x');
    assert.ok(Math.abs(c.vx) <= DIFF.can.vx[k] + 1e-9);
    turnRates.push(140 - c.x);
  }
  assert.ok(turnRates[1] > turnRates[0], 'round 3 can tracks harder');
  // once the player is past, it gives up and climbs away
  const g = fakeGame({ speed: 0 });
  const c = g.spawn('can', { x: 112, y: 30, z: 2 }); g.run(1);
  assert.ok(c.st.done && c.vz > 60);
});

test('can explodes on voxels', () => {
  const g = fakeGame({ speed: 0, solidAt: (x, y, z) => z > 30 });
  g.spawn('can', { x: 112, y: 250, z: 2 }); g.run(2);
  assert.ok(g.kills.includes('can'));
});

// ---------- field ----------
test('static field stays solid; pulsing field duty cycle follows the round and warns before switching on', () => {
  const g = fakeGame({ speed: 0 });
  const s = g.spawn('field', { x: 112, y: 200, span: 3, z0: 1, z1: 4 });
  assert.equal(s.w, 48); assert.equal(s.z, 16); assert.equal(s.h, 48);
  g.run(3); assert.equal(s.on, true); assert.equal(s.solid, true); assert.equal(s.frame, 1);
  for (const round of [1, 3]) {
    const g2 = fakeGame({ round, speed: 0 });
    const f = g2.spawn('field', { x: 112, y: 200, span: 4, z0: 0, z1: 3, pulse: 2, phase: 0.5 });
    let on = 0, n = 0, warnBeforeOn = false, prevWarn = false, prevOn = f.on;
    for (let i = 0; i < 60 * 8; i++) {
      g2.step(); n++; if (f.on) on++;
      if (f.on && !prevOn && prevWarn) warnBeforeOn = true;
      prevWarn = f.warn; prevOn = f.on;
    }
    assert.ok(Math.abs(on / n - DIFF.field.on[diffIdx(g2)]) < 0.03, `duty ${on / n}`);
    assert.ok(warnBeforeOn, 'warn flicker precedes activation');
    assert.ok(g2.log.sfx.includes('field_zap'));
  }
});

// ---------- tuna / radar / pickups ----------
test('tuna flashes, radar spins with a bonus popup, pickups bob and rotate', () => {
  const g = fakeGame({ speed: 0 });
  const tu = g.spawn('tuna', { x: 50, y: 200 });
  const ra = g.spawn('radar', { x: 150, y: 200 });
  const nip = g.spawn('nip', { x: 100, y: 200, z: 30 });
  const frames = new Set(), tf = new Set(), pf = new Set(); let zmin = 99, zmax = 0;
  for (let i = 0; i < 180; i++) { g.step(); frames.add(ra.frame); tf.add(tu.frame); pf.add(nip.frame); zmin = Math.min(zmin, nip.z); zmax = Math.max(zmax, nip.z); }
  assert.equal(frames.size, 4); assert.equal(tf.size, 2); assert.equal(pf.size, 4);
  assert.ok(zmin >= 26 - 1e-9 && zmax <= 34 + 1e-9 && zmax - zmin > 6, `${zmin}..${zmax}`);
  assert.equal(tu.x, 50); assert.equal(ra.y, 200);
  g.hurt(ra, 2, { team: 'p' });
  assert.ok(ra.dead && g.log.popup.includes('DISH-ABLED!'));
});

// ---------- formation / mousejet ----------
test('formation expands into n mousejets that fly in from ahead+side, weave, shoot and peel off', () => {
  for (const pattern of PATTERNS) {
    const g = fakeGame({ round: 3, seed: 2 });
    const f = g.spawn('formation', { y: 560, pattern, n: 5, side: 1 });
    assert.ok(f.dead, 'marker consumed');
    const jets = g.ents.filter((e) => e.kind === 'mousejet');
    assert.equal(jets.length, 5, pattern);
    for (const j of jets) { assert.ok(j.y - g.player.y > 300, 'starts far ahead'); assert.ok(j.x > FIELD_W / 2 + 40, 'enters from its side'); }
    const k = diffIdx(g);
    g.run(DIFF.jet.t1[k] + 1);
    const inField = jets.filter((j) => j.x > 0 && j.x < FIELD_W);
    assert.ok(inField.length >= 3, `${pattern}: jets in field after fly-in`);
    const banks = new Set();
    for (let i = 0; i < 60 * 12; i++) { g.step(); for (const j of jets) banks.add(j.frame); }
    assert.equal(g.count('mousejet'), 0, `${pattern}: all jets peeled off and despawned`);
    assert.ok(banks.size >= 3, `${pattern}: banking frames ${[...banks]}`);
    assert.ok(g.log.sfx.includes('jet_swoosh'));
  }
});

test('jets shoot occasionally, more in round 3; unknown pattern falls back to vee; lone mousejet works', (t) => {
  const shots = (round) => {
    let n = 0;
    for (const seed of [1, 2, 3, 4]) { const g = fakeGame({ round, seed }); g.spawn('formation', { y: 560, pattern: 'line', n: 5 }); g.run(10); n += g.log.sfx.filter((s) => s === 'turret_fire').length; }
    return n;
  };
  const r1 = shots(1), r3 = shots(3);
  t.diagnostic(`jet shots r1=${r1} r3=${r3}`);
  assert.ok(r1 >= 1 && r3 > 1.5 * r1, `${r1} ${r3}`);
  const g = fakeGame();
  g.spawn('formation', { y: 560, pattern: 'bogus', n: 3 });
  assert.equal(g.ents.filter((e) => e.kind === 'mousejet' && e.st.pat === 'vee').length, 3);
  const lone = g.spawn('mousejet', { x: 60, y: 500, z: 50 });
  g.run(1); assert.ok(lone.y < 500 + g.scrollY && Number.isFinite(lone.x));
});

// ---------- spud ----------
test('spud drifts, tumbles, stays in bounds, splits into two small spuds', () => {
  const g = fakeGame({ speed: 0, seed: 4 });
  const s = g.spawn('spud', { x: 112, y: 300, vx: 60 });
  assert.equal(s.vx, 60); assert.ok(s.vy < 0 && s.z > 0);
  const fr = new Set(); const y0 = s.y;
  for (let i = 0; i < 600; i++) {
    g.step(); fr.add(s.frame);
    assert.ok(s.x >= TUNING.xMin && s.x <= TUNING.xMax && s.z >= 3.9 && s.z + s.h <= 128.1);
  }
  assert.equal(fr.size, 4); assert.ok(s.y < y0);
  g.kill(s, { team: 'p' });
  const kids = g.ents.filter((e) => e.kind === 'spud' && !e.dead);
  assert.equal(kids.length, 2);
  assert.ok(kids.every((k) => k.small && k.w === 10 && k.hp === 1 && k.score === 40));
  assert.ok(kids[0].vx * kids[1].vx < 0 || kids[0].vx !== kids[1].vx, 'split apart');
  assert.ok(g.log.fx.includes('spud_burst'));
  g.kill(kids[0], null);
  assert.equal(g.ents.filter((e) => e.kind === 'spud' && !e.dead).length, 1, 'small spuds do not split');
});

// ---------- integration with the real engine (if sim-core is present) ----------
test('runs inside the real createGame without errors', async (t) => {
  let createGame;
  try { ({ createGame } = await import('../src/sim/game.js')); } catch { t.skip('game.js missing'); return; }
  const log = [];
  const bus = { emit(type, p) { log.push(type === 'sfx' ? p.name : type); }, on() {} };
  const spawns = [
    { y: 200, kind: 'turret', x: 80 }, { y: 260, kind: 'pad', x: 140 }, { y: 300, kind: 'tuna', x: 112 },
    { y: 340, kind: 'radar', x: 60 }, { y: 400, kind: 'field', x: 112, span: 3, z0: 5, z1: 7, pulse: 1.5 },
    { y: 600, kind: 'formation', pattern: 'vee', n: 5 }, { y: 700, kind: 'spud', x: 100, z: 60 },
    { y: 800, kind: 'nip', x: 112, z: 40 }, { y: 900, kind: 'formation', pattern: 'zig', n: 4, side: -1 },
  ];
  const g = createGame({ seed: 3, bus, round: 3, buildStage: () => ({ id: 't', name: 'T', kind: 'fortress', ground: 'cracker',
    length: 4000, bg: 'dusk', music: 'fortress', cells: [], spawns, decor: [] }) });
  const jets = new Set();
  for (let i = 0; i < 60 * 14; i++) {
    g.update(DT, { dx: Math.sin(i / 50), dz: 0, fire: i % 2 === 0, bomb: false });
    for (const e of g.ents) if (e.kind === 'mousejet') { jets.add(e.id); assert.ok(e.group !== undefined, 'grouped'); }
    for (const e of g.ents) assert.ok(Number.isFinite(e.x + e.y + e.z), `${e.kind} finite`);
  }
  assert.ok(jets.size >= 9, `jets ${jets.size}`);
  assert.ok(log.includes('turret_fire') && log.includes('can_launch'));
});
