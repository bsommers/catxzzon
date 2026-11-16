import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage } from '../src/levels/index.js';
import { STAGES } from '../src/core/defs.js';
import { checkReachability, validateStage } from '../tools/validate-level.mjs';

test('deterministic per (stage, round, seed)', () => {
  for (let si = 0; si < STAGES.length; si++) {
    assert.equal(JSON.stringify(buildStage(si, 2, 7)), JSON.stringify(buildStage(si, 2, 7)));
  }
});

test('seeds and rounds differ', () => {
  assert.notEqual(JSON.stringify(buildStage(0, 1, 1)), JSON.stringify(buildStage(0, 1, 2)));
  assert.notEqual(JSON.stringify(buildStage(0, 1, 1)), JSON.stringify(buildStage(0, 3, 1)));
});

test('stage shape matches defs', () => {
  for (let si = 0; si < STAGES.length; si++) {
    const s = buildStage(si, 1, 3);
    for (const k of ['id', 'name', 'kind', 'ground', 'length', 'bg', 'music']) assert.equal(s[k], STAGES[si][k]);
    assert.ok(Array.isArray(s.cells) && Array.isArray(s.spawns) && Array.isArray(s.decor));
  }
  assert.ok(buildStage(3, 1, 1).bossY > 0);
  assert.equal(buildStage(1, 1, 1).cells.length, 0);
});

test('all stages validate over many seeds and rounds 1-4', () => {
  for (let si = 0; si < STAGES.length; si++) {
    for (let round = 1; round <= 4; round++) {
      for (let seed = 1; seed <= 12; seed++) {
        const { errs } = validateStage(buildStage(si, round, seed), si, round);
        assert.deepEqual(errs, [], `stage ${si} round ${round} seed ${seed}`);
      }
    }
  }
});

test('cell budget and supplies', () => {
  const s = buildStage(2, 4, 5);
  assert.ok(s.cells.length <= 6000);
  assert.ok(s.spawns.some((x) => x.kind === 'tuna'));
  assert.ok(s.spawns.some((x) => x.kind === 'field'));
  assert.ok(s.spawns.some((x) => x.kind === 'pad'));
});

test('validator detects an unreachable (sealed) wall', () => {
  const s = buildStage(0, 1, 1);
  const cy = 200;
  const cells = s.cells.filter((c) => c.cy !== cy);
  for (let cx = 0; cx < 14; cx++) for (let cz = 0; cz < 8; cz++) cells.push({ cx, cy, cz, t: 1 });
  const r = checkReachability({ ...s, cells }, 1);
  assert.equal(r.ok, false);
  assert.equal(r.failRow, cy);
});

test('validator detects a gap too far from the previous one', () => {
  const mk = (cy, gx) => { const c = []; for (let cx = 0; cx < 14; cx++) for (let cz = 0; cz < 8; cz++) if (cx !== gx) c.push({ cx, cy, cz, t: 1 }); return c; };
  const st = { cells: [...mk(40, 0), ...mk(41, 13)], spawns: [] };
  assert.equal(checkReachability(st, 4).ok, false);
  const st2 = { cells: [...mk(40, 0), ...mk(60, 13)], spawns: [] };
  assert.equal(checkReachability(st2, 1).ok, true);
});

test('uses no Math.random', async () => {
  const fs = await import('node:fs');
  for (const f of ['index', 'fortress', 'space', 'boss', 'util']) {
    assert.ok(!/Math\.random/.test(fs.readFileSync(new URL(`../src/levels/${f}.js`, import.meta.url), 'utf8')));
  }
});

test('physical reach model: adjacent rows allow no lateral shift, body depth is subtracted', async () => {
  const { reach, freeTime } = await import('../src/levels/util.js');
  assert.equal(reach(1, 1).rx, 0);
  assert.equal(reach(2, 1).rx, 0);          // ~6 units of free flight at 84 u/s
  assert.ok(freeTime(2, 1) < 0.08);
  assert.ok(reach(8, 1).rx > reach(8, 4).rx - 1);
});

test('body-accurate audit (autopilot.auditStage) passes generated fortresses with required slack', async () => {
  const { auditLevel } = await import('../tools/validate-level.mjs');
  for (const [si, round] of [[0, 1], [2, 4]]) for (let seed = 1; seed <= 4; seed++) {
    assert.deepEqual(auditLevel(buildStage(si, round, seed), round), []);
  }
});
