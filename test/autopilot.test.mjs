import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createGame } from '../src/sim/game.js';
import { buildStage } from '../src/levels/index.js';
import { createAutopilot } from '../src/sim/autopilot.js';
import { STAGES } from '../src/core/defs.js';

const DT = 1 / 60;
const quiet = { on() {}, emit() {} };

function walled(rowsSpec) {
  // rowsSpec: [{cy, gaps:[[cx0,cx1,cz0,cz1]...]}] -> a stage of full-width walls (height 8 cells) with rectangular holes
  const cells = [];
  for (const r of rowsSpec) for (let cx = 0; cx < 14; cx++) for (let cz = 0; cz < 8; cz++) {
    if (r.gaps.some(([x0, x1, z0, z1]) => cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1)) continue;
    cells.push({ cx, cy: r.cy, cz, t: 1 });
  }
  return { ...STAGES[0], length: 1200, cells, spawns: [], decor: [] };
}
function play(stageObj, { skill = 1, maxT = 60 } = {}) {
  const g = createGame({ seed: 5, bus: quiet, buildStage: () => stageObj, stageIdx: 0, lives: 1 });
  const ap = createAutopilot(g, { skill });
  for (let i = 0; i < maxT * 60 && g.state !== 'gameover' && g.state !== 'stageclear'; i++) g.update(DT, ap.input(g, DT));
  return { g, ap };
}

test('input shape: finite dx/dz in [-1,1], boolean fire/bomb, every tick', () => {
  const g = createGame({ seed: 3, bus: quiet, buildStage, stageIdx: 1 });
  const ap = createAutopilot(g, { skill: 1 });
  let fired = 0;
  for (let i = 0; i < 1500; i++) {
    const inp = ap.input(g, DT);
    assert.ok(Number.isFinite(inp.dx) && Math.abs(inp.dx) <= 1 + 1e-9, 'dx ' + inp.dx);
    assert.ok(Number.isFinite(inp.dz) && Math.abs(inp.dz) <= 1 + 1e-9, 'dz ' + inp.dz);
    assert.equal(typeof inp.fire, 'boolean');
    assert.equal(typeof inp.bomb, 'boolean');
    if (inp.fire) fired++;
    g.update(DT, inp);
  }
  assert.ok(fired > 1000, 'bot keeps the trigger down');
});

test('shell adapter shapes: object with input/step/update/think; default export; skill getter', async () => {
  const mod = await import('../src/sim/autopilot.js');
  assert.equal(typeof mod.createAutopilot, 'function');
  assert.equal(mod.default, mod.createAutopilot);
  const g = createGame({ seed: 1, bus: quiet, buildStage, stageIdx: 1 });
  const b = mod.createAutopilot(g, { skill: 0.4 });
  for (const k of ['input', 'step', 'update', 'think']) assert.equal(typeof b[k], 'function', k);
  assert.equal(b.skill, 0.4);
  assert.ok(b.input(g, DT) && typeof b.input(g, DT).dx === 'number');
});

test('passes a staircase of full-width walls through offset gaps (planner threads rows)', () => {
  const st = walled([
    { cy: 14, gaps: [[12, 12, 6, 6]] },
    { cy: 21, gaps: [[4, 4, 1, 1]] },
    { cy: 28, gaps: [[12, 12, 5, 5]] },
    { cy: 35, gaps: [[5, 5, 0, 0]] },
  ]);
  const { g } = play(st);
  assert.equal(g.stats.deaths, 0, 'no deaths, died by ' + g.lastDeath);
  assert.ok(g.scrollY > 35 * 16 + 40, 'got past the last wall');
});

test('level audit flags geometrically impossible lateral jumps and passes fair ones', () => {
  const g = createGame({ seed: 1, bus: quiet, buildStage: () => walled([]), stageIdx: 0 });
  const ap = createAutopilot(g);
  // gaps at opposite sides, two rows (32 units) apart: ~6 units of free flight for a 100+ unit shift
  const bad = ap.auditStage(walled([{ cy: 14, gaps: [[10, 12, 4, 5]] }, { cy: 16, gaps: [[1, 3, 4, 5]] }]));
  assert.ok(bad.length >= 1 && bad[0].cy === 14, 'impossible pair flagged');
  const good = ap.auditStage(walled([{ cy: 14, gaps: [[10, 12, 4, 5]] }, { cy: 20, gaps: [[1, 3, 4, 5]] }]));
  assert.equal(good.length, 0, 'six rows of travel is fair');
  const same = ap.auditStage(walled([{ cy: 14, gaps: [[5, 6, 2, 3]] }, { cy: 16, gaps: [[5, 6, 2, 3]] }]));
  assert.equal(same.length, 0, 'aligned gaps are fair');
});

test('is deterministic for a given seed and skill', () => {
  const run = () => { const g = createGame({ seed: 9, bus: quiet, buildStage, stageIdx: 1 }); const ap = createAutopilot(g, { skill: 0.7 }); for (let i = 0; i < 1800; i++) g.update(DT, ap.input(g, DT)); return [g.score, g.player.x, g.player.z, g.stats.deaths].join('|'); };
  assert.equal(run(), run());
});

test('space stage round 3: skill=1 survives the cheeseball/jet barrage, skill=0 does worse', () => {
  const tot = (skill) => { let deaths = 0, score = 0; for (const seed of [1, 2, 3]) { const g = createGame({ seed, bus: quiet, buildStage, stageIdx: 1, startStage: 1, round: 3 }); const ap = createAutopilot(g, { skill }); for (let i = 0; i < 60 * 80 && g.stageIdx === 1 && g.state !== 'gameover'; i++) g.update(DT, ap.input(g, DT)); deaths += g.stats.deaths; score += g.score; } return { deaths, score }; };
  const hi = tot(1), lo = tot(0);
  assert.equal(hi.deaths, 0, 'perfect bot never dies in space round 3');
  assert.ok(hi.score > lo.score || lo.deaths > hi.deaths, `skill matters: hi ${JSON.stringify(hi)} lo ${JSON.stringify(lo)}`);
});

test('boss arena: bot bombs Jesse and drains his HP', () => {
  const g = createGame({ seed: 1, bus: quiet, buildStage, stageIdx: 3, startStage: 3 });
  const ap = createAutopilot(g);
  let bombs0 = g.bombs, minHp = 1;
  for (let i = 0; i < 60 * 40 && g.state !== 'gameover'; i++) { g.update(DT, ap.input(g, DT)); if (g.bossHp01 !== null) minHp = Math.min(minHp, g.bossHp01); }
  assert.ok(g.bombs < bombs0, 'bombs used on the boss');
  assert.ok(minHp < 0.75, 'boss damaged, hp01=' + minHp);
});

test('tools/botplay.mjs runs headless, prints per-seed lines and exits 0 for a clearable run', () => {
  const r = spawnSync(process.execPath, ['tools/botplay.mjs', '--stage', '1', '--seeds', '1..2'], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /seed\s+1 CLEAR/);
  assert.match(r.stdout, /summary: cleared 2\/2/);
});

test('tools/botplay.mjs exits non-zero when skill=1 fails stage 0 on >25% of seeds (unassisted)', () => {
  const r = spawnSync(process.execPath, ['tools/botplay.mjs', '--stage', '0', '--seeds', '1..3', '--lives', '1'], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /FAIL/);
});
