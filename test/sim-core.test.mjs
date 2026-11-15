import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame, fallbackStage } from '../src/sim/game.js';
import { createGrid } from '../src/sim/grid.js';
import { FLOW, roundSpeed } from '../src/sim/stageflow.js';
import { TUNING, VIEW, SCORES, CELL, STAGES, FIELD_CELLS_X } from '../src/core/defs.js';

const DT = 1 / 60;
const IDLE = { dx: 0, dz: 0, fire: false, bomb: false };

function recBus() {
  const log = [];
  const subs = new Map();
  return {
    log, count: (t) => log.filter((e) => e.type === t).length, last: (t) => [...log].reverse().find((e) => e.type === t)?.p,
    emit(type, p) { log.push({ type, p }); for (const f of subs.get(type) || []) f(p); },
    on(type, f) { if (!subs.has(type)) subs.set(type, []); subs.get(type).push(f); },
  };
}
const mkStage = (over = {}) => (idx) => ({
  id: 't', name: 'TEST', kind: STAGES[idx]?.kind || 'fortress', ground: 'cracker', length: 4000, bg: 'dusk', music: 'fortress',
  cells: [], spawns: [], decor: [], ...over, ...(typeof over === 'function' ? over(idx) : {}),
});
function game(opts = {}) {
  const bus = recBus();
  const g = createGame({ seed: 7, bus, behaviors: {}, bossBehavior: null, buildStage: opts.build || mkStage(), ...opts });
  return { g, bus };
}
function run(g, secs, input = IDLE) { for (let i = 0, n = Math.round(secs / DT); i < n; i++) g.update(DT, typeof input === 'function' ? input(i) : input); }
function toPlay(g) { run(g, FLOW.intro + 0.05); assert.equal(g.state, 'play'); }

test('grid: cellAt / rows / solidAt / boxHit', () => {
  const gr = createGrid([{ cx: 2, cy: 10, cz: 1, t: 1 }, { cx: 3, cy: 10, cz: 0, t: 4 }, { cx: 0, cy: 12, cz: 0, t: 2 }, { cx: 1, cy: 5, cz: 0, t: 0 }]);
  assert.equal(gr.count, 3);
  assert.equal(gr.cellAt(2, 10, 1), 1); assert.equal(gr.cellAt(2, 10, 0), 0); assert.equal(gr.cellAt(-1, 10, 0), 0);
  assert.equal(gr.rows(10).length, 2); assert.equal(gr.rows(10)[0].cz, 0); assert.equal(gr.rows(11).length, 0);
  assert.deepEqual(gr.rowCys, [10, 12]);
  assert.ok(gr.solidAt(2 * CELL + 1, 10 * CELL + 1, CELL + 1));
  assert.ok(!gr.solidAt(2 * CELL + 1, 10 * CELL + 1, 1));
  assert.ok(gr.boxHit(40, 50, 165, 170, 20, 24));
  assert.ok(!gr.boxHit(48, 50, 165, 170, 20, 24), 'touching face x=48 is not overlap');
  assert.ok(!gr.boxHit(0, 300, 0, 150, 0, 100));
});

test('determinism: same seed + inputs -> identical hash trail; createGame exposes snapshotHash', () => {
  const script = (i) => ({ dx: Math.sin(i / 37), dz: Math.cos(i / 53), fire: i % 90 < 60, bomb: i % 400 === 5 });
  const trail = (seed) => {
    const g = createGame({ seed, bus: recBus(), behaviors: {}, bossBehavior: null, buildStage: fallbackStage });
    const hs = [];
    for (let i = 0; i < 3000; i++) { g.update(DT, script(i)); if (i % 300 === 0) hs.push(g.snapshotHash()); }
    return hs.join(',');
  };
  assert.equal(trail(11), trail(11));
  assert.match(createGame({ seed: 1, behaviors: {} }).snapshotHash(), /^[0-9a-f]{8}$/);
});

test('sim sources never use Math.random / DOM', () => {
  for (const f of ['game', 'player', 'shots', 'grid', 'score', 'stageflow']) {
    const src = fs.readFileSync(new URL(`../src/sim/${f}.js`, import.meta.url), 'utf8');
    assert.ok(!/Math\.random|document\.|window\.|Date\.now|performance\.now/.test(src), f);
  }
});

test('player movement, clamps, bank, y follows scroll', () => {
  const { g } = game();
  run(g, 0.5, { dx: 1, dz: 1 });
  const p = g.player;
  assert.ok(p.x > 112 + 60 && p.bank > 1.5, `x=${p.x} bank=${p.bank}`);
  run(g, 3, { dx: 1, dz: 1 });
  assert.equal(p.x, TUNING.xMax); assert.equal(p.z, TUNING.zMax);
  run(g, 3, { dx: -1, dz: -1 });
  assert.equal(p.x, TUNING.xMin); assert.equal(p.z, TUNING.zMin); assert.ok(p.bank < -1.9);
  assert.equal(p.y, g.scrollY + VIEW.PLAYER_LEAD);
  assert.ok(Math.abs(g.speed - TUNING.baseSpeed) < 1e-9);
  assert.equal(roundSpeed(3), TUNING.baseSpeed + 2 * TUNING.speedPerRound);
  assert.equal(roundSpeed(99), TUNING.baseSpeed + 50);
});

test('auto-fire rate, range, nip fast fire', () => {
  const { g, bus } = game();
  toPlay(g);
  const before = bus.log.filter((e) => e.type === 'sfx' && e.p.name === 'shot').length;
  run(g, 1, { ...IDLE, fire: true });
  const shots = bus.log.filter((e) => e.type === 'sfx' && e.p.name === 'shot').length - before;
  assert.ok(Math.abs(shots - TUNING.fireRate) <= 1, `shots=${shots}`);
  const hb = g.ents.filter((e) => e.kind === 'hairball');
  assert.ok(hb.length > 0 && hb.every((h) => h.vy === TUNING.shotSpeed));
  run(g, 2);
  assert.equal(g.ents.filter((e) => e.kind === 'hairball').length, 0, 'hairballs expire at range');
  g.nipT = 5;
  const b2 = bus.count('sfx');
  run(g, 1, { ...IDLE, fire: true });
  const nipShots = bus.log.slice(b2).filter((e) => e.type === 'sfx' && e.p.name === 'shot_nip').length;
  assert.ok(Math.abs(nipShots - TUNING.nipFireRate) <= 1, `nipShots=${nipShots}`);
});

test('hairball hit test is full 3D: altitude matters', () => {
  const mk = (z) => {
    const { g } = game({ build: mkStage({ spawns: [{ y: 520, kind: 'turret', x: 112, z: 0 }] }) });
    toPlay(g); g.player.z = z;
    run(g, 2.5, { ...IDLE, fire: true });
    return g;
  };
  const low = mk(TUNING.zMin), high = mk(100);
  assert.ok(low.score >= 300 && low.stats.kills === 1, `low score ${low.score}`);
  assert.equal(high.score, 0, 'shots fly over a ground turret');
  assert.ok(high.ents.some((e) => e.kind === 'turret'));
});

test('laser pointer homing steers shots onto an off-axis target', () => {
  const mk = (laser) => {
    const { g } = game({ build: mkStage({ spawns: [{ y: 560, kind: 'radar', x: 170, z: 0 }] }) });
    toPlay(g); g.player.z = 8; g.player.x = 112; if (laser) g.laserT = 7;
    run(g, 2, { ...IDLE, fire: true });
    return g;
  };
  assert.equal(mk(false).score, 0);
  assert.ok(mk(true).score >= 500);
});

test('yarn bomb: radius damage, boss takes 10, bombs counted, edge-triggered', () => {
  const { g, bus } = game({ build: mkStage({ spawns: [
    { y: 300, kind: 'turret', x: 112, z: 20 }, { y: 310, kind: 'mousejet', x: 150, z: 30 }, { y: 320, kind: 'boss', x: 112, z: 10 },
    { y: 330, kind: 'turret', x: 112, z: 120 }] }) });
  toPlay(g);
  // place everything right ahead of the shell's burst point
  for (const e of g.ents) e.y = g.player.y + 150;
  g.ents.find((e) => e.z === 120).x = 112 - 200; // out of radius (and field), survives
  const boss = g.ents.find((e) => e.kind === 'boss'); boss.y = g.player.y + 400;
  assert.equal(g.bombs, TUNING.bombs);
  g.update(DT, { ...IDLE, bomb: true }); g.update(DT, { ...IDLE, bomb: true });
  assert.equal(g.bombs, TUNING.bombs - 1, 'held bomb = one bomb');
  run(g, 2);
  assert.equal(bus.count('bomb'), 1);
  assert.ok(!g.ents.some((e) => e.kind === 'mousejet'));
  // boss bomb
  g.bombs = 1; boss.y = g.player.y + 120; boss.x = g.player.x; boss.z = g.player.z - 20;
  const hp = boss.hp;
  g.update(DT, IDLE); g.update(DT, { ...IDLE, bomb: true }); run(g, 1.5);
  assert.equal(hp - boss.hp, 10);
  assert.ok(g.bossHp01 < 1 && g.bossHp01 > 0);
});

test('combo chain multiplier and extra lives', () => {
  const { g, bus } = game();
  toPlay(g);
  const p = g.player;
  for (let i = 0; i < 5; i++) { const e = g.spawn('mousejet', { x: 10, y: g.scrollY + 300, z: 50 }); g.kill(e, p); }
  assert.equal(g.combo, 5);
  assert.equal(g.score, 100 * (1 + 2 + 3 + 4 + 5));
  assert.equal(bus.last('combo').mult, 5);
  run(g, 1.6);
  assert.equal(g.combo, 0);
  for (let i = 0; i < 12; i++) g.kill(g.spawn('mousejet', { x: 10, y: g.scrollY + 300, z: 50 }), p);
  assert.equal(bus.last('combo').mult, SCORES.comboCap);
  const lives = g.lives;
  g.addScore(TUNING.extraLifeAt[0]);
  assert.equal(g.lives, lives + 1); assert.equal(bus.last('life').lives, lives + 1);
  assert.ok(g.hiscore >= g.score);
  g.kill(g.spawn('mousejet', { x: 10, y: g.scrollY + 300, z: 50 }), null);
  assert.equal(bus.last('score').score, g.score, 'non-player kills score nothing');
});

test('wall collision -> dying -> respawn at area start with invulnerability; game over at 0 lives', () => {
  const cells = [];
  for (let cx = 0; cx < FIELD_CELLS_X; cx++) for (let cz = 0; cz < 8; cz++) cells.push({ cx, cy: 70, cz, t: 1 });   // y=1120 solid wall
  const { g, bus } = game({ build: mkStage({ cells }) });
  const lives = g.lives;
  run(g, 16);
  assert.ok(bus.count('life') >= 1, 'died at least once');
  assert.equal(g.lastDeath, 'wall');
  // after respawn: scroll rewound to the 800 checkpoint and invulnerable
  const hb = bus.log.findIndex((e) => e.type === 'life');
  assert.ok(hb >= 0 && g.checkpointY === 800);
  // keep crashing until game over
  run(g, 60);
  assert.equal(g.state, 'gameover'); assert.equal(g.lives, 0);
  assert.equal(bus.count('gameover'), 1); assert.equal(bus.count('life'), lives);
  const sy = g.scrollY, sc = g.score; run(g, 1); assert.equal(g.scrollY, sy, 'game over freezes sim'); assert.equal(g.score, sc);
});

test('invulnerable after respawn passes through walls', () => {
  const cells = [];
  for (let cx = 0; cx < FIELD_CELLS_X; cx++) for (let cz = 0; cz < 8; cz++) cells.push({ cx, cy: 4, cz, t: 1 });
  const { g } = game({ build: mkStage({ cells }) });
  g.player.invuln = 5;
  run(g, 3);
  assert.equal(g.state, 'play'); assert.ok(g.player.alive);
});

test('fuel drains, empty fuel kills, tuna shot refuels', () => {
  const { g, bus } = game({ build: mkStage({ spawns: [{ y: 400, kind: 'tuna', x: 112, z: 0 }] }) });
  toPlay(g); g.player.z = TUNING.zMin;
  g.fuel = 50;
  run(g, 3.5, { ...IDLE, fire: true });
  assert.ok(g.fuel > 50 + TUNING.tunaFuel - 10, `fuel ${g.fuel}`);
  assert.ok(bus.log.some((e) => e.type === 'sfx' && e.p.name === 'pickup_tuna'));
  g.fuel = 0.5; run(g, 0.5);
  assert.equal(g.state, 'dying'); assert.equal(g.lastDeath, 'fuel');
  assert.ok(bus.last('fuel').low === true);
});

test('pickups: nip overdrive (invulnerable, kills solids on touch), yarn, laser', () => {
  const { g, bus } = game({ build: mkStage({ spawns: [
    { y: 200, kind: 'nip', x: 112, z: 40 }, { y: 260, kind: 'yarnpick', x: 112, z: 40 }, { y: 320, kind: 'laserpick', x: 112, z: 40 },
    { y: 420, kind: 'spud', x: 112, z: 36 }, { y: 470, kind: 'field', x: 112, z: 0, span: 6, z0: 0, z1: 8 }] }) });
  run(g, 3.2);
  assert.equal(g.bombs, TUNING.bombs + 1);
  assert.ok(g.laserT > 0 && g.nipT > 0);
  run(g, 2.5);
  assert.ok(g.player.alive, 'nip makes the cat invulnerable');
  assert.ok(!g.ents.some((e) => e.kind === 'spud' || e.kind === 'field'), 'solid hazards destroyed on touch');
  assert.ok(bus.log.some((e) => e.type === 'sfx' && e.p.name === 'pickup_nip'));
});

test('force field: span/z0/z1 box, solid when on, pulsing turns it off', () => {
  const { g } = game();
  const f = g.spawn('field', { x: 112, y: 500, z: 0, span: 4, z0: 1, z1: 3 });
  assert.equal(f.w, 64); assert.equal(f.z, 16); assert.equal(f.h, 32); assert.equal(f.on, true);
  const p = g.spawn('field', { x: 112, y: 500, z: 0, span: 4, z0: 0, z1: 40, pulse: 2 });
  assert.equal(p.h, 40);
  let offSeen = false; for (let i = 0; i < 150; i++) { g.update(DT, IDLE); if (p.on === false) offSeen = true; }
  assert.ok(offSeen);
  // player into an active field = death
  const { g: g2 } = game({ build: mkStage({ spawns: [{ y: 300, kind: 'field', x: 112, z: 0, span: 14, z0: 0, z1: 8 }] }) });
  run(g2, 4);
  assert.equal(g2.lastDeath, 'field');
});

test('thread the needle: 1-cell gap in a wall awards bonus once', () => {
  const cells = [];
  for (let cx = 0; cx < FIELD_CELLS_X; cx++) for (let cz = 0; cz < 6; cz++) if (!(cx === 7 && cz === 2)) cells.push({ cx, cy: 20, cz, t: 1 });
  const { g, bus } = game({ build: mkStage({ cells }) });
  g.player.x = 7 * CELL + 8; g.player.z = 2 * CELL + 4;
  run(g, 5);
  assert.ok(g.player.alive);
  assert.equal(g.stats.threads, 1);
  assert.ok(bus.log.some((e) => e.type === 'sfx' && e.p.name === 'thread_needle'));
  assert.ok(g.score >= SCORES.thread);
});

test('stage flow: intro -> play -> stageclear (bonus) -> next stage', () => {
  const { g, bus } = game({ build: mkStage({ length: 600 }) });
  assert.equal(g.state, 'intro'); assert.equal(bus.last('stage').idx, 0); assert.ok(bus.last('banner'));
  assert.equal(bus.last('music').name, 'fortress');
  run(g, 1); assert.ok(g.scrollY > 0, 'scroll continues during intro');
  run(g, 1.5); assert.equal(g.state, 'play');
  for (let i = 0; i < 600 && g.state !== 'stageclear'; i++) g.update(DT, IDLE);
  assert.equal(g.state, 'stageclear');
  assert.ok(g.scrollY + VIEW.PLAYER_LEAD >= 600);
  assert.ok(g.score >= SCORES.stageClear);
  run(g, FLOW.stageclear + 0.1);
  assert.equal(g.stageIdx, 1); assert.equal(g.state, 'intro'); assert.equal(g.scrollY < 20, true);
  assert.equal(bus.last('stage').idx, 1);
});

test('boss stage: scroll stops at bossY, boss death -> victory -> round+1 loops to stage 0', () => {
  const build = (idx) => idx === 3
    ? { id: 'lair', name: 'LAIR', kind: 'boss', ground: 'keep', length: 1500, bg: 'night', music: 'boss', cells: [], spawns: [], decor: [], bossY: 300 }
    : mkStage()(idx);
  const { g, bus } = game({ build, startStage: 3 });
  run(g, 8);
  assert.equal(g.scrollY, 300);
  assert.ok(g.boss && g.boss.hp === TUNING.bossHits, 'core spawns boss if the stage has none');
  assert.equal(g.bossHp01, 1);
  g.hurt(g.boss, 15, g.player);
  assert.ok(Math.abs(g.bossHp01 - 25 / 40) < 1e-9);
  g.kill(g.boss, g.player);
  assert.equal(g.bossHp01, 0);
  run(g, FLOW.bossDown + 0.1);
  assert.equal(g.state, 'victory'); assert.equal(bus.last('victory').round, 1);
  run(g, FLOW.victory + 0.1);
  assert.equal(g.round, 2); assert.equal(g.stageIdx, 0);
  assert.equal(g.speed, TUNING.baseSpeed + TUNING.speedPerRound);
  assert.equal(g.bossHp01, null);
});

test('behaviour dispatch: init/update/onHit/onDeath, formation children grouped, wave clear bonus', () => {
  const calls = [];
  const behaviors = {
    formation: { init(e, g) { for (let i = 0; i < 4; i++) g.spawn('mousejet', { x: 40 + i * 30, y: e.y, z: 40 }); e.dead = true; } },
    mousejet: { init(e) { calls.push('init'); }, update(e, dt) { e.st.n = (e.st.n || 0) + 1; }, onHit(e) { calls.push('hit'); }, onDeath() { calls.push('death'); } },
  };
  const { g, bus } = game({ behaviors, build: mkStage({ spawns: [{ y: 400, kind: 'formation', pattern: 'vee', n: 4 }] }) });
  g.update(DT, IDLE);
  const jets = g.ents.filter((e) => e.kind === 'mousejet');
  assert.equal(jets.length, 4);
  assert.ok(jets.every((j) => j.group !== undefined && j.group === jets[0].group));
  run(g, 0.5);
  assert.ok(jets[0].st.n >= 30);
  assert.equal(jets[0].y, 400, 'core does not integrate entities that have a behaviour');
  for (const j of jets) g.hurt(j, 1, g.player);
  assert.equal(calls.filter((c) => c === 'death').length, 4);
  assert.ok(bus.log.some((e) => e.type === 'popup' && /WAVE CLEAR/.test(e.p.text)));
});

test('enemy bullets kill; pause toggles and freezes', () => {
  const { g, bus } = game();
  toPlay(g);
  g.update(DT, { ...IDLE, pause: true });
  assert.equal(g.paused, true); assert.equal(bus.last('pause').on, true);
  const h = g.snapshotHash(); g.update(DT, { ...IDLE, pause: true }); run(g, 0.5); assert.equal(g.snapshotHash(), h);
  g.update(DT, { ...IDLE, pause: true }); assert.equal(g.paused, false);
  const p = g.player;
  g.spawn('cheeseball', { x: p.x, y: p.y + 30, z: p.z, vy: -200 });
  run(g, 0.4);
  assert.equal(g.state, 'dying'); assert.equal(g.lastDeath, 'cheeseball');
});

test('fallback stages exist for all stages and run a full round headless without throwing', () => {
  for (let i = 0; i < STAGES.length; i++) { const s = fallbackStage(i, 1, 1); assert.equal(s.kind, STAGES[i].kind); }
  const g = createGame({ seed: 5, bus: recBus(), behaviors: {}, bossBehavior: null, buildStage: fallbackStage, lives: 99 });
  for (let i = 0; i < 60 * 240; i++) { g.update(DT, { dx: 0, dz: 0, fire: true, bomb: false }); if (g.player.alive) g.player.invuln = 1; }
  assert.ok(g.stageIdx >= 2 || g.round > 1, `stage ${g.stageIdx}`);
});
