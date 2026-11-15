// CATXZZON simulation core (sim-core). Pure deterministic JS: no DOM, no unseeded randomness, no wall clock.
import { KINDS, TUNING, VIEW, FIELD_W, FIELD_CELLS_Z, CELL, POPUP_COLORS } from '../core/defs.js';
import { createRng } from '../core/rng.js';
import { createBus } from '../core/events.js';
import { createGrid } from './grid.js';
import { createPlayer, updatePlayer, vulnerable, playerHitsVoxels, playerTouches, updateThread } from './player.js';
import { updateFiring, tryBomb, updateHairball, updateYarn } from './shots.js';
import { scoreKill, tickCombo, addScore } from './score.js';
import { loadStage, updateFlow, advanceScroll, playerDied, bossDown, fallbackStage } from './stageflow.js';

// Behaviour modules are written by other agents; fall back to empty maps until they exist.
let BEHAVIORS = {}, BOSS = null;
try { BEHAVIORS = (await import('./enemies.js')).BEHAVIORS || {}; } catch { BEHAVIORS = {}; }
try { BOSS = (await import('./boss.js')).bossBehavior || null; } catch { BOSS = null; }

const PICKUPS = { nip: 1, yarnpick: 1, laserpick: 1 };
const NO_SCORE_STAT = { cheeseball: 1, can: 1, bossmissile: 1, boss: 1, tuna: 1, field: 1 };
const BIG_BOOM = { boss: 1, pad: 1, radar: 1, bossmissile: 1, spud: 1 };
const DEFAULT_KIND = { team: 'x', w: 0, d: 0, h: 0, hp: 1 };

function mergeBehaviors(base, boss) {
  const out = Object.assign({}, base || {});
  if (boss) {
    if (typeof boss.update === 'function' || typeof boss.init === 'function') out.boss = boss;
    else Object.assign(out, boss);
  }
  return out;
}

export { fallbackStage };

/**
 * createGame({ seed, bus, round=1, stageIdx=0, startStage, buildStage, hiscore, lives, behaviors, bossBehavior })
 * `behaviors` / `bossBehavior` override the dynamically imported ones (tests pass {} for isolation).
 */
export function createGame(opts = {}) {
  const seed = (opts.seed ?? 1) >>> 0;
  const beh = mergeBehaviors(opts.behaviors ?? BEHAVIORS, opts.bossBehavior !== undefined ? opts.bossBehavior : BOSS);
  const g = {
    seed, rng: createRng(seed), bus: opts.bus || createBus(),
    t: 0, state: 'intro', stateT: 0, round: Math.max(1, opts.round | 0 || 1), stageIdx: 0, stage: null,
    scrollY: 0, speed: TUNING.baseSpeed, player: createPlayer(), ents: [], grid: createGrid([]),
    score: 0, hiscore: opts.hiscore | 0, lives: opts.lives ?? TUNING.lives, fuel: TUNING.fuelMax, bombs: TUNING.bombs,
    combo: 0, comboT: 0, nipT: 0, laserT: 0, bossHp01: null, boss: null, paused: false,
    stats: { enemies: 0, kills: 0, threads: 0, deaths: 0 }, checkpointY: 0, lastDeath: null,
    behaviors: beh,
    _buildStage: opts.buildStage || null, _spawnIdx: 0, _nextId: 1, _yarn: null, _lifeIdx: 0,
    _thread: { cy: -1, needle: false }, _groups: new Map(), _parent: null, _prevBomb: false, _prevPause: false,
    _lowFuel: false, _lowFuelT: 0, _fuelInt: TUNING.fuelMax, _bossSpawned: false, _bossDownT: 0, _fx: { type: '', x: 0, y: 0, z: 0, opts: undefined },
  };
  while (g._lifeIdx < TUNING.extraLifeAt.length && g.score >= TUNING.extraLifeAt[g._lifeIdx]) g._lifeIdx++;

  // ---------------- engine API for behaviours ----------------
  g.spawn = function spawn(kind, props) {
    const k = KINDS[kind] || DEFAULT_KIND;
    const e = { id: g._nextId++, kind, x: 0, y: 0, z: 0, w: k.w, d: k.d, h: k.h, hp: k.hp, maxHp: k.hp, team: k.team,
      t: 0, vx: 0, vy: 0, vz: 0, dead: false, hit: !!k.hit, solid: !!k.solid, score: k.score | 0, st: {} };
    if (kind === 'boss') { e.hp = e.maxHp = TUNING.bossHits; }
    if (props) for (const key in props) e[key] = props[key];
    if (props && props.hp !== undefined && props.maxHp === undefined) e.maxHp = props.hp;
    if (kind === 'field') setupField(e);
    if (g._parent && e.group === undefined) e.group = g._parent.id;
    if (e.team === 'e' && e.hit && !NO_SCORE_STAT[kind]) {
      g.stats.enemies++;
      if (e.group !== undefined) { const gr = g._groups.get(e.group); if (gr) gr.n++; else g._groups.set(e.group, { n: 1, k: 0, lost: false }); }
    }
    g.ents.push(e);
    if (kind === 'boss') { g.boss = e; g.bossHp01 = 1; g._bossSpawned = true; }
    const b = g.behaviors[kind];
    if (b && b.init) {
      const prev = g._parent; g._parent = e;
      try { b.init(e, g); } finally { g._parent = prev; }
    }
    return e;
  };

  g.hurt = function hurt(e, dmg, src) {
    if (!e || e.dead) return false;
    const b = g.behaviors[e.kind];
    if (b && b.onHit && b.onHit(e, dmg, g, src) === false) return false;
    if (e.dead) return true;
    e.hp -= dmg;
    e.hitT = 0.12;
    if (e === g.boss) g.bossHp01 = Math.max(0, e.hp / (e.maxHp || 1));
    if (e.hp <= 0) g.kill(e, src);
    else g.sfx(e.kind === 'boss' ? 'boss_hit' : 'tink', e);
    return true;
  };

  g.kill = function kill(e, src) {
    if (!e || e.dead) return;
    e.dead = true; e.hp = Math.min(e.hp, 0);
    const byPlayer = !!src && (src.team === 'p' || src === g.player);
    const cz = e.z + e.h / 2;
    const big = !!BIG_BOOM[e.kind];
    g.fx(big ? 'boom_big' : 'boom_small', e.x, e.y, cz);
    g.fx('crumbs', e.x, e.y, cz, { n: big ? 18 : 8 });
    g.sfx(e.kind === 'boss' ? 'boss_die' : e.kind === 'spud' ? 'spud_pop' : big ? 'boom_big' : 'boom_small', e);
    if (big) { g.shake(e.kind === 'boss' ? 10 : 3, e.kind === 'boss' ? 1.2 : 0.2); g.bus.emit('hitstop', { ms: e.kind === 'boss' ? 160 : 40 }); }
    if (byPlayer) {
      if (e.score > 0) scoreKill(g, e.score, e.x, e.y, cz + 10);
      if (e.team === 'e' && e.hit && !NO_SCORE_STAT[e.kind]) g.stats.kills++;
      if (e.kind === 'tuna') {
        g.fuel = Math.min(TUNING.fuelMax, g.fuel + TUNING.tunaFuel);
        g.sfx('pickup_tuna', e); g.popup('FUEL!', e.x, e.y, cz + 18, POPUP_COLORS.cool);
        emitFuel(g, true);
      }
      if (e.group !== undefined) {
        const gr = g._groups.get(e.group);
        if (gr && !gr.lost && ++gr.k >= gr.n && gr.n >= 3) {
          const pts = Math.round(gr.n * 100);
          addScore(g, pts); g.popup(`WAVE CLEAR ${pts}`, e.x, e.y, cz + 22, POPUP_COLORS.bonus); g.sfx('coin');
          g._groups.delete(e.group);
        }
      }
    }
    if (e.drop && KINDS[e.drop]) g.spawn(e.drop, { x: e.x, y: e.y, z: Math.max(e.z, 8) });
    const b = g.behaviors[e.kind];
    if (b && b.onDeath) b.onDeath(e, g);
    if (e === g.boss) bossDown(g);
  };

  g.sfx = function sfx(name, e) {
    g.bus.emit('sfx', e ? { name, x: e.x, y: e.y, z: e.z } : { name });
  };
  g.fx = function fx(type, x, y, z, opts) { g.bus.emit('fx', { type, x, y, z, opts }); };
  g.popup = function popup(text, x, y, z, color = POPUP_COLORS.score) { g.bus.emit('popup', { text, x, y, z, color }); };
  g.shake = function shake(mag, dur) { g.bus.emit('shake', { mag, dur }); };
  g.cellAt = (cx, cy, cz) => g.grid.cellAt(cx, cy, cz);
  g.solidAt = (x, y, z) => g.grid.solidAt(x, y, z);
  g.nearestEnemy = function nearestEnemy(x, y, z) {
    let best = null, bd = Infinity;
    const ents = g.ents;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || !e.hit || e.team !== 'e') continue;
      const dx = e.x - x, dy = e.y - y, dz = e.z + e.h / 2 - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };
  g.winStage = (delay = 0) => bossDown(g, delay);
  g.addScore = (pts) => addScore(g, pts);
  g.update = (dt, input) => update(g, dt, input || NO_INPUT);
  g.snapshotHash = () => snapshotHash(g);

  loadStage(g, opts.startStage ?? opts.stageIdx ?? 0);
  return g;
}

const NO_INPUT = Object.freeze({ dx: 0, dz: 0, fire: false, bomb: false, pause: false });

function setupField(e) {
  if (e.span > 0) e.w = e.span * CELL;
  if (e.x0 !== undefined) e.x = e.x0 + e.w / 2;
  if (e.z0 !== undefined && e.z1 !== undefined) {
    const cells = e.z1 <= FIELD_CELLS_Z;   // small values = cell units
    const z0 = cells ? e.z0 * CELL : e.z0, z1 = cells ? e.z1 * CELL : e.z1;
    e.z = z0; e.h = Math.max(4, z1 - z0);
  }
  if (e.on === undefined) e.on = true;
}

function defaultFieldUpdate(e) {
  if (e.pulse > 0) { const ph = ((e.t + (e.phase || 0)) % e.pulse) / e.pulse; e.on = ph < 0.6; }
}

function emitFuel(g, force) {
  const fi = Math.ceil(g.fuel);
  const low = g.fuel <= TUNING.fuelLow;
  if (force || fi !== g._fuelInt || low !== g._lowFuel) {
    g._fuelInt = fi;
    if (low && !g._lowFuel) { g.sfx('low_fuel'); g._lowFuelT = 3; }
    g._lowFuel = low;
    g.bus.emit('fuel', { fuel: g.fuel, low });
  }
}

function activateSpawns(g) {
  const sp = g.stage.spawns, lim = g.scrollY + VIEW.SPAWN_AHEAD;
  while (g._spawnIdx < sp.length && sp[g._spawnIdx].y < lim) {
    const s = sp[g._spawnIdx++];
    if (s.y < g.scrollY - VIEW.DESPAWN_BEHIND) continue;
    g.spawn(s.kind, s);
  }
  const st = g.stage;
  if (st.kind === 'boss' && !g._bossSpawned && g.scrollY >= st.bossY - 1) {
    g.spawn('boss', { x: FIELD_W / 2, y: st.bossY + 300, z: 30 });
  }
}

function collectPickup(g, e) {
  e.dead = true;
  const p = g.player, cz = e.z + e.h / 2;
  if (e.kind === 'nip') {
    g.nipT = TUNING.nipTime; g.sfx('pickup_nip', e); g.popup('CATNIP!', e.x, e.y, cz + 12, POPUP_COLORS.cool);
    g.bus.emit('flash', { color: '#ff7ae0', a: 0.3, dur: 0.15 });
  } else if (e.kind === 'yarnpick') {
    g.bombs++; g.sfx('pickup_yarn', e); g.popup('+1 YARN', e.x, e.y, cz + 12, POPUP_COLORS.cool);
  } else if (e.kind === 'laserpick') {
    g.laserT = TUNING.laserTime; g.sfx('pickup_laser', e); g.popup('LASER POINTER!', e.x, e.y, cz + 12, POPUP_COLORS.cool);
  }
  g.fx('confetti', p.x, p.y, p.z + p.h / 2);
  addScore(g, 100);
}

function playerVsEnts(g) {
  const p = g.player;
  if (!p.alive) return;
  const ents = g.ents, nip = g.nipT > 0, vul = vulnerable(g);
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (e.dead || e.team === 'p' || e.team === 'x') continue;
    if (!playerTouches(p, e)) continue;
    if (PICKUPS[e.kind]) { collectPickup(g, e); continue; }
    if (e.team !== 'e') continue;
    const harmful = e.kind === 'cheeseball' || (e.solid && e.on !== false) || e.hit;
    if (!harmful) continue;
    if (nip) {
      if (e.kind === 'boss') continue;
      if (e.kind === 'cheeseball') { e.dead = true; continue; }
      g.kill(e, p);
      continue;
    }
    if (!vul) continue;
    if (e.kind === 'cheeseball') e.dead = true;
    else if (e.hit && e.kind !== 'boss') g.kill(e, null);
    playerDied(g, e.kind);
    return;
  }
}

function despawnAndCompact(g) {
  const ents = g.ents, lo = g.scrollY - VIEW.DESPAWN_BEHIND, hi = g.scrollY + VIEW.SPAWN_AHEAD + 240;
  let j = 0;
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    let gone = e.dead || e.y < lo || (e.team !== 'x' && e.y > hi) || e.x < -96 || e.x > FIELD_W + 96 || e.z < -64 || e.z > 320;
    if (gone && !e.dead && e === g.boss) gone = false;
    if (gone) {
      if (!e.dead && e.group !== undefined) { const gr = g._groups.get(e.group); if (gr) gr.lost = true; }
      if (e === g._yarn) g._yarn = null;
      continue;
    }
    ents[j++] = e;
  }
  ents.length = j;
}

function update(g, dt, input) {
  if (!(dt > 0)) return;
  if (dt > 1 / 30) dt = 1 / 30;
  const pause = !!input.pause, bomb = !!input.bomb;
  const pauseEdge = pause && !g._prevPause, bombEdge = bomb && !g._prevBomb;
  g._prevPause = pause; g._prevBomb = bomb;
  if (pauseEdge && g.state !== 'gameover') { g.paused = !g.paused; g.bus.emit('pause', { on: g.paused }); }
  if (g.paused) return;
  g.t += dt;
  if (!updateFlow(g, dt)) return;
  const playing = g.state === 'play' || g.state === 'intro';
  const live = playing || g.state === 'stageclear' || g.state === 'victory';

  advanceScroll(g, dt);
  activateSpawns(g);
  updatePlayer(g, dt, live ? input : NO_INPUT);
  if (live) {
    updateFiring(g, dt, input);
    if (bombEdge) tryBomb(g);
  }

  // entities
  const ents = g.ents, beh = g.behaviors, n = ents.length;
  for (let i = 0; i < n; i++) {
    const e = ents[i];
    if (e.dead) continue;
    e.t += dt;
    if (e.hitT > 0) e.hitT -= dt;
    if (e.kind === 'hairball') { updateHairball(e, dt, g); continue; }
    if (e.kind === 'yarn') { updateYarn(e, dt, g); continue; }
    const b = beh[e.kind];
    if (b && b.update) b.update(e, dt, g);
    else {
      e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
      if (e.kind === 'field') defaultFieldUpdate(e);
    }
  }

  // collisions
  if (playing) {
    playerVsEnts(g);
    if (g.player.alive && vulnerable(g) && playerHitsVoxels(g)) playerDied(g, 'wall');
    updateThread(g);
  }
  despawnAndCompact(g);

  // timers
  tickCombo(g, dt);
  if (g.nipT > 0) g.nipT = Math.max(0, g.nipT - dt);
  if (g.laserT > 0) g.laserT = Math.max(0, g.laserT - dt);
  if (g.boss) g.bossHp01 = g.boss.dead ? 0 : Math.max(0, g.boss.hp / (g.boss.maxHp || 1));
  if (playing && g.player.alive) {
    g.fuel -= TUNING.fuelDrain * dt;
    if (g._lowFuel) { g._lowFuelT -= dt; if (g._lowFuelT <= 0) { g._lowFuelT = 3; g.sfx('low_fuel'); } }
    if (g.fuel <= 0) { g.fuel = 0; emitFuel(g, true); playerDied(g, 'fuel'); }
    else emitFuel(g, false);
  }
}

// FNV-1a over quantized state; stable across runs for identical seed + inputs.
function snapshotHash(g) {
  let h = 0x811c9dc5 >>> 0;
  const mix = (v) => {
    let x = Math.round(v * 1000) | 0;
    for (let k = 0; k < 4; k++) { h ^= x & 0xff; h = Math.imul(h, 0x01000193) >>> 0; x >>>= 8; }
  };
  const mixS = (s) => { for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; } };
  const p = g.player;
  mix(g.t); mix(g.scrollY); mix(g.round); mix(g.stageIdx); mixS(g.state);
  mix(p.x); mix(p.y); mix(p.z); mix(p.bank); mix(p.invuln); mix(p.alive ? 1 : 0);
  mix(g.score); mix(g.lives); mix(g.fuel); mix(g.bombs); mix(g.combo); mix(g.nipT); mix(g.laserT);
  mix(g.ents.length);
  for (const e of g.ents) { mixS(e.kind); mix(e.id); mix(e.x); mix(e.y); mix(e.z); mix(e.hp); }
  return h.toString(16).padStart(8, '0');
}
