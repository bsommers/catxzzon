import test from 'node:test';
import assert from 'node:assert/strict';
import { bossBehavior, BOSS, BOSS_NAME, phaseFor, phaseFloor } from '../src/sim/boss.js';
import { TAUNTS, TUNING, FIELD_W, CELL } from '../src/core/defs.js';
import { mkGame, toArena, botStep, idle, DT } from './boss-harness.mjs';

const count = (log, type, pred) => log.filter((l) => l.type === type && (!pred || pred(l.p))).length;
function runUntil(g, pred, maxT, step = idle) { const t0 = g.t; while (!pred() && g.t - t0 < maxT) step(g); return pred(); }
const fakeShot = (b, zOff) => ({ kind: 'hairball', team: 'p', x: b.x, y: b.y - 20, z: b.z + zOff, h: 5 });
function openWindow(g, b) { return runUntil(g, () => b.vuln, 20); }

test('exports a behaviour object with init/update/onHit/onDeath; phase math', () => {
  for (const k of ['init', 'update', 'onHit', 'onDeath']) assert.equal(typeof bossBehavior[k], 'function', k);
  const M = TUNING.bossHits;
  assert.equal(phaseFor(M, M), 1); assert.equal(phaseFor(phaseFloor(1, M), M), 1);
  assert.equal(phaseFor(phaseFloor(1, M) - 1, M), 2); assert.equal(phaseFor(phaseFloor(2, M) - 1, M), 3);
  assert.equal(phaseFloor(3, M), 0);
});

test('Jesse enters at stage.bossY + homeDy inside the side walls, emits boss + taunt', () => {
  const { g, log } = mkGame(3);
  const b = toArena(g);
  assert.ok(b, 'boss spawned');
  assert.equal(g.stage.bossY, 1200);
  assert.equal(b.hp, TUNING.bossHits);
  assert.equal(b.mode, 'enter');
  const ev = log.find((l) => l.type === 'boss');
  assert.deepEqual(ev.p, { name: BOSS_NAME, phase: 1, hp01: 1 });
  const tn = log.find((l) => l.type === 'taunt');
  assert.ok(TAUNTS.includes(tn.p.text) && tn.p.dur > 0);
  assert.ok(count(log, 'shake') > 0);
  runUntil(g, () => b.mode === 'fight', 5);
  assert.ok(Math.abs(b.y - (1200 + BOSS.homeDy)) <= 12, `home y ${b.y}`);
  for (let i = 0; i < 600; i++) {
    idle(g);
    assert.ok(b.x - b.w / 2 >= CELL && b.x + b.w / 2 <= FIELD_W - CELL, `x ${b.x} clear of side walls`);
    assert.ok(b.z >= BOSS.zMin && b.z <= BOSS.zMax);
  }
});

test('armoured outside the window; head only hit-able (flashing) after a volley, at head height', () => {
  const { g } = mkGame(4);
  const b = toArena(g);
  g.hurt(b, 1, fakeShot(b, 50));
  assert.equal(b.hp, TUNING.bossHits, 'no damage while entering');
  runUntil(g, () => b.mode === 'fight' && b.st.act === 'charge', 6);
  g.hurt(b, 1, fakeShot(b, 50));
  assert.equal(b.hp, TUNING.bossHits, 'no damage while charging');
  const missiles0 = g.ents.filter((e) => e.kind === 'bossmissile').length;
  assert.ok(openWindow(g, b), 'window opens');
  assert.ok(g.ents.filter((e) => e.kind === 'bossmissile').length > missiles0, 'window follows a missile volley');
  const glows = new Set(); for (let i = 0; i < 12; i++) { idle(g); glows.add(b.glow); }
  assert.ok(glows.size >= 2, 'head flashes while vulnerable');
  g.hurt(b, 1, fakeShot(b, 5));
  assert.equal(b.hp, TUNING.bossHits, 'low shot hits the throne');
  g.hurt(b, 1, fakeShot(b, 50));
  assert.equal(b.hp, TUNING.bossHits - 1, 'head shot lands');
});

test('window closes after cap hits; damage clamps at phase floor and the phase-2 transition drops tuna + nip', () => {
  const { g, log } = mkGame(5);
  const b = toArena(g);
  runUntil(g, () => b.mode === 'fight', 5);
  assert.ok(openWindow(g, b));
  for (let i = 0; i < BOSS.cap[0] + 3; i++) g.hurt(b, 1, fakeShot(b, 50));
  assert.equal(b.hp, TUNING.bossHits - BOSS.cap[0], 'capped hits per window');
  assert.equal(b.vuln, false);
  // bombs bypass the window but not the phase floor
  for (let i = 0; i < 5; i++) g.hurt(b, 10, { kind: 'yarn', team: 'p', x: b.x, y: b.y, z: b.z, h: 8 });
  assert.equal(b.hp, phaseFloor(1, b.maxHp));
  assert.equal(b.phase, 2); assert.equal(b.mode, 'trans');
  assert.ok(log.some((l) => l.type === 'boss' && l.p.phase === 2));
  assert.ok(g.ents.some((e) => e.kind === 'tuna') && g.ents.some((e) => e.kind === 'nip'), 'drops between phases');
  g.hurt(b, 10, { kind: 'yarn', team: 'p', x: b.x, y: b.y, z: b.z, h: 8 });
  assert.equal(b.hp, phaseFloor(1, b.maxHp), 'invulnerable during transition');
});

test('phase 2 adds cheeseball fans and sweeping laser walls; phase 3 summons mousejets', () => {
  const { g } = mkGame(6);
  const b = toArena(g);
  runUntil(g, () => b.mode === 'fight', 5);
  b.hp = phaseFloor(1, b.maxHp) + 1; assert.ok(openWindow(g, b)); g.hurt(b, 1, fakeShot(b, 50));
  assert.equal(b.phase, 2);
  let fans = 0, walls = new Set(), swept = false;
  const seenBall = new Set();
  runUntil(g, () => {
    for (const e of g.ents) {
      if (e.kind === 'cheeseball' && !seenBall.has(e.id)) { seenBall.add(e.id); fans++; }
      if (e.kind === 'field' && e.bossWall) { walls.add(e.id); if (e.vx && e.vy < 0) swept = true; }
    }
    return false;
  }, 25);
  assert.ok(fans >= 10, `fans ${fans}`);
  assert.ok(walls.size >= 2, `walls ${walls.size}`);
  assert.ok(swept, 'a wall sweeps sideways while advancing');
  b.hp = phaseFloor(2, b.maxHp) + 1;
  runUntil(g, () => b.mode === 'fight', 5); assert.ok(openWindow(g, b)); g.hurt(b, 1, fakeShot(b, 50));
  assert.equal(b.phase, 3);
  assert.ok(runUntil(g, () => g.ents.some((e) => e.kind === 'mousejet'), 20), 'enraged Jesse summons mousejets');
});

test('spray-cheese missiles home on the player and can be shot down', () => {
  const { g } = mkGame(7);
  const b = toArena(g);
  runUntil(g, () => b.mode === 'fight', 5);
  assert.ok(runUntil(g, () => g.ents.some((e) => e.kind === 'bossmissile' && e.t > 0.5), 10));
  const m = g.ents.find((e) => e.kind === 'bossmissile');
  const p = g.player, side = m.x < FIELD_W / 2 ? 1 : -1;
  const v0 = m.vx * side;
  for (let i = 0; i < 45 && !m.dead; i++) { p.x = side > 0 ? 200 : 24; idle(g); }
  assert.ok(m.vx * side > v0 + 25, `turns toward the player (${v0} -> ${m.vx * side})`);
  assert.ok(m.hit && m.solid);
  const s0 = g.score;
  g.hurt(m, 1, p); g.hurt(m, 1, p);
  assert.ok(m.dead && g.score > s0, 'shot down for points');
});

test('death: 3 s chain explosions, then victory and the boss score', () => {
  const { g, log } = mkGame(8);
  const b = toArena(g);
  runUntil(g, () => b.mode === 'fight', 5);
  b.phase = 3; b.hp = 1; assert.ok(openWindow(g, b));
  const n0 = log.length, s0 = g.score;
  g.hurt(b, 1, fakeShot(b, 50));
  assert.equal(b.mode, 'dying'); assert.equal(b.dead, false); assert.equal(g.bossHp01, 0);
  const t0 = g.t;
  runUntil(g, () => g.state === 'victory', 5);
  assert.equal(g.state, 'victory');
  const dur = g.t - t0;
  assert.ok(dur > 2.8 && dur < 3.3, `death sequence ${dur}`);
  assert.ok(b.dead);
  const tail = log.slice(n0);
  assert.ok(tail.filter((l) => l.type === 'fx' && /^boom/.test(l.p.type)).length >= 12, 'chain explosions');
  assert.ok(tail.filter((l) => l.type === 'shake').length >= 10, 'screen shake');
  assert.ok(g.score - s0 >= 25000, 'boss score');
  assert.equal(g.ents.filter((e) => e.kind === 'bossmissile' || (e.kind === 'field' && e.bossWall)).length, 0);
});

test('beatable with skill: perfect aim kills Jesse in ~55-90 s; a cat that never dodges loses', () => {
  for (const seed of [1, 2]) {
    const { g } = mkGame(seed);
    toArena(g); const t0 = g.t;
    runUntil(g, () => g.state === 'victory', 150, botStep);
    const dur = g.t - t0 - 3;
    assert.equal(g.state, 'victory', `seed ${seed}`);
    assert.ok(dur > 45 && dur < 90, `kill time ${dur.toFixed(1)}`);
  }
  const { g } = mkGame(3);
  toArena(g); g.player.invuln = 0;
  const nogod = (gg) => botStep(gg, false);
  runUntil(g, () => g.state === 'gameover' || g.state === 'victory', 150, nogod);
  assert.equal(g.state, 'gameover');
});

test('deterministic per seed and never uses Math.random', () => {
  const orig = Math.random;
  Math.random = () => { throw new Error('Math.random used'); };
  try {
    const sig = () => {
      const { g } = mkGame(9); const b = toArena(g);
      for (let i = 0; i < 1800; i++) botStep(g);
      return [b.hp, b.x.toFixed(3), b.z.toFixed(3), g.ents.length, g.score].join('|');
    };
    assert.equal(sig(), sig());
  } finally { Math.random = orig; }
});
