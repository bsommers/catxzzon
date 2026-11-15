// Stage flow (sim-core): load stage, intro -> play -> stageclear / boss -> victory -> next round; death, respawn, game over.
import { STAGES, TUNING, VIEW, SCORES, CELL, FIELD_CELLS_X, BLOCKS } from '../core/defs.js';
import { createGrid } from './grid.js';
import { resetPlayer } from './player.js';
import { addScore, bonus } from './score.js';

export const FLOW = { intro: 2.2, dying: 1.2, stageclear: 3.2, victory: 6, bossDown: 3, area: 800 };

export function roundSpeed(round) {
  return TUNING.baseSpeed + Math.min(50, TUNING.speedPerRound * Math.max(0, (round | 0) - 1));
}

/** Minimal inline stage so the sim (and its tests) run without src/levels. Deterministic. */
export function fallbackStage(stageIdx = 0, round = 1, seed = 1) {
  const def = STAGES[stageIdx] || STAGES[0];
  const st = { id: def.id, name: def.name, kind: def.kind, ground: def.ground, length: def.length, bg: def.bg, music: def.music,
    cells: [], spawns: [], decor: [] };
  if (def.kind === 'fortress') {
    for (let w = 0; w < 4; w++) {
      const cy = 40 + w * 60, gap = (3 + w * 3 + (seed % 3)) % (FIELD_CELLS_X - 2), gz = w % 3;
      for (let cx = 0; cx < FIELD_CELLS_X; cx++)
        for (let cz = 0; cz < 4; cz++)
          if (!(cx >= gap && cx < gap + 2 && cz === gz + 1)) st.cells.push({ cx, cy, cz, t: cz === 3 ? BLOCKS.crown : BLOCKS.cheddar });
    }
    st.spawns.push({ y: 300, kind: 'tuna', x: 112, z: 0 }, { y: 420, kind: 'turret', x: 60, z: 0 },
      { y: 1200, kind: 'nip', x: 112, z: 40 }, { y: 1500, kind: 'radar', x: 160, z: 0 });
  } else if (def.kind === 'space') {
    st.spawns.push({ y: 300, kind: 'mousejet', x: 80, z: 40 }, { y: 360, kind: 'mousejet', x: 140, z: 50 },
      { y: 600, kind: 'spud', x: 112, z: 30 }, { y: 900, kind: 'tuna', x: 112, z: 20 });
  } else {
    st.bossY = def.length - 500;
    st.spawns.push({ y: 400, kind: 'tuna', x: 112, z: 0 }, { y: st.bossY + 300, kind: 'boss', x: 112, z: 40 });
  }
  st.spawns.sort((a, b) => a.y - b.y);
  return st;
}

export function loadStage(g, stageIdx) {
  g.stageIdx = stageIdx;
  let st = null;
  try { st = g._buildStage ? g._buildStage(stageIdx, g.round, g.seed) : null; } catch (err) { g._buildErr = err; st = null; }
  if (!st) st = fallbackStage(stageIdx, g.round, g.seed);
  if (!st.spawns) st.spawns = [];
  if (!st.cells) st.cells = [];
  if (!st.decor) st.decor = [];
  if (!(st.length > 0)) st.length = (STAGES[stageIdx] || STAGES[0]).length;
  if (st.kind === 'boss' && !(st.bossY >= 0)) st.bossY = Math.max(0, st.length - 500);
  g.stage = st;
  g.grid = createGrid(st.cells);
  g.speed = roundSpeed(g.round);
  g.scrollY = 0;
  g.ents.length = 0;
  g._spawnIdx = 0;
  g._yarn = null;
  g.boss = null; g.bossHp01 = null;
  g._bossSpawned = st.spawns.some((s) => s.kind === 'boss');
  g._bossDownT = 0;
  g.checkpointY = 0;
  g.stats = { enemies: 0, kills: 0, threads: 0, deaths: 0 };
  g._groups.clear();
  g.fuel = TUNING.fuelMax;
  resetPlayer(g, 0);
  setState(g, 'intro', FLOW.intro);
  g.bus.emit('stage', { idx: stageIdx, name: st.name, round: g.round });
  g.bus.emit('banner', { text: st.name, sub: g.round > 1 ? `ROUND ${g.round}` : `STAGE ${stageIdx + 1}`, dur: FLOW.intro });
  g.bus.emit('music', { name: st.music || (STAGES[stageIdx] || STAGES[0]).music });
  g.bus.emit('fuel', { fuel: g.fuel, low: false });
  g.sfx('stage_start');
}

export function setState(g, s, timer = 0) { g.state = s; g.stateT = timer; }

/** Player lost a life: called by the engine when a fatal collision happens. */
export function playerDied(g, cause) {
  const p = g.player;
  if (!p.alive || (g.state !== 'play' && g.state !== 'intro')) return;
  p.alive = false;
  g.stats.deaths++;
  g.fx('boom_big', p.x, p.y, p.z + p.h / 2);
  g.fx('crumbs', p.x, p.y, p.z + p.h / 2, { n: 24 });
  g.sfx('player_die', p); g.sfx('meow_hurt', p);
  g.shake(7, 0.5);
  g.bus.emit('flash', { color: '#ff4a4a', a: 0.45, dur: 0.2 });
  g.bus.emit('hitstop', { ms: 90 });
  g.combo = 0; g.comboT = 0; g.nipT = 0; g.laserT = 0;
  g.lastDeath = cause || 'hit';
  setState(g, 'dying', FLOW.dying);
}

function respawn(g) {
  const st = g.stage;
  g.fuel = TUNING.fuelMax;
  if (st.kind === 'boss' && g.scrollY >= st.bossY - 1) {
    // Arena: keep the boss, clear enemy fire.
    for (const e of g.ents) if (e.kind === 'cheeseball' || e.kind === 'bossmissile' || e.team === 'p') e.dead = true;
  } else {
    const cp = Math.max(0, Math.floor(g.scrollY / FLOW.area) * FLOW.area);
    g.scrollY = cp;
    g.checkpointY = cp;
    g.ents.length = 0; g._yarn = null; g._groups.clear();
    if (g.boss && !g.boss.dead) { g.boss = null; g.bossHp01 = null; }
    g._bossSpawned = st.spawns.some((s) => s.kind === 'boss');
    let i = 0; while (i < st.spawns.length && st.spawns[i].y < cp + VIEW.PLAYER_LEAD + 24) i++;
    g._spawnIdx = i;
  }
  resetPlayer(g, TUNING.invulnAfterDeath);
  g.bus.emit('fuel', { fuel: g.fuel, low: false });
  setState(g, 'play');
}

function stageClear(g) {
  setState(g, 'stageclear', FLOW.stageclear);
  const fuelPts = Math.floor(g.fuel) * SCORES.fuelBonusPerUnit;
  g.sfx('stage_clear');
  g.bus.emit('banner', { text: 'STAGE CLEAR', sub: `FUEL BONUS ${fuelPts}`, dur: FLOW.stageclear });
  addScore(g, SCORES.stageClear + fuelPts);
  if (g.stats.enemies > 0 && g.stats.kills >= g.stats.enemies) {
    bonus(g, SCORES.cleanSweep, 'CLEAN SWEEP!');
    g.sfx('coin');
  }
  g.player.invuln = Math.max(g.player.invuln, FLOW.stageclear);
}

function victory(g) {
  setState(g, 'victory', FLOW.victory);
  g.player.invuln = FLOW.victory;
  g.bus.emit('victory', { round: g.round });
  g.bus.emit('music', { name: 'victory' });
  g.bus.emit('banner', { text: 'VICTORY!', sub: 'FOR JESSE', dur: FLOW.victory });
  addScore(g, SCORES.stageClear + Math.floor(g.fuel) * SCORES.fuelBonusPerUnit);
}

/** Boss was destroyed (engine calls this from kill). */
export function bossDown(g, delay = FLOW.bossDown) {
  if (g._bossDownT > 0 || g.state === 'victory') return;
  g._bossDownT = Math.max(0.001, delay);
  g.player.invuln = Math.max(g.player.invuln, delay + 0.5);
  g.bossHp01 = 0;
}

/** Advance timers / transitions. Returns true when the world should simulate this tick. */
export function updateFlow(g, dt) {
  const st = g.stage;
  if (g.stateT > 0) g.stateT -= dt;
  switch (g.state) {
    case 'intro':
      if (g.stateT <= 0) setState(g, 'play');
      break;
    case 'dying':
      if (g.stateT <= 0) {
        g.lives--;
        g.bus.emit('life', { lives: g.lives });
        if (g.lives <= 0) {
          g.lives = 0;
          setState(g, 'gameover');
          g.bus.emit('gameover', { score: g.score });
          g.bus.emit('music', { name: 'gameover' });
          g.bus.emit('banner', { text: 'GAME OVER', dur: 3 });
        } else respawn(g);
      }
      break;
    case 'stageclear':
      if (g.stateT <= 0) { loadStage(g, (g.stageIdx + 1) % STAGES.length); return false; }
      break;
    case 'victory':
      if (g.stateT <= 0) { g.round++; loadStage(g, 0); return false; }
      break;
    case 'gameover':
      return false;
  }
  if (g._bossDownT > 0 && g.state !== 'victory') {
    g._bossDownT -= dt;
    if (g._bossDownT <= 0) { g._bossDownT = 0; victory(g); }
  }
  if ((g.state === 'play' || g.state === 'intro') && st.kind !== 'boss' && g.scrollY + VIEW.PLAYER_LEAD >= st.length) stageClear(g);
  return true;
}

/** Scroll position update with the boss-arena stop. */
export function advanceScroll(g, dt) {
  if (g.state === 'dying' || g.state === 'gameover') return;
  const st = g.stage;
  let s = g.scrollY + g.speed * dt;
  if (st.kind === 'boss' && s >= st.bossY) s = st.bossY;
  g.scrollY = s;
}

export { CELL };
