// CATXZZON Big Boss Jesse (owner: sim-boss). ARCHITECTURE.md §4.
// Pure deterministic sim code: randomness only from g.rng, no DOM, no Math.random, no per-tick closures/allocations.
// Export: bossBehavior = { init(e,g), update(e,dt,g), onHit(e,dmg,g,src), onDeath(e,g) } for kind 'boss'.
//
// Because sim-core's mergeBehaviors() maps a behaviour object with update() to kind 'boss' only, Jesse steers his own
// children: 'bossmissile' cans (homing on x/z; sim-core integrates their velocity) and sweeping 'field' laser walls
// (the field behaviour integrates them; Jesse bounces them off the lane edges).
//
// Fight: enter (invulnerable) -> phase 1..3 cycles of  charge -> volley -> (missiles fly) -> OPEN window -> recover/attack.
// The head only takes damage during the OPEN window (e.vuln, flashing) and only from shots at head height; a window
// closes early after a capped number of hits. Damage is clamped at phase thresholds so each phase is played; between
// phases Jesse taunts, rages and drops tuna + catnip. Lethal hit -> 3 s death sequence (chain explosions), g.kill at the
// end; victory comes from sim-core's bossDown timer (started with g.winStage(DEATH)).
//
// Render hints written on the boss entity (read-only for render): e.frame (jesse ART frame 0..7), e.vuln (bool),
// e.glow (0..1 flashing while vulnerable), e.phase (1..3), e.mode ('enter'|'fight'|'trans'|'dying'), e.act.
// Missiles: e.frame 0..3, e.bossChild = boss id. Walls: field entities with e.bossWall = 1.

import { FIELD_W, FIELD_H, CELL, TUNING, TAUNTS } from '../core/defs.js';

let aimAtShared = null;
try { aimAtShared = (await import('./enemies.js')).aimAt || null; } catch { aimAtShared = null; }

const PLAYER_HALF_H = ((TUNING.playerBox && TUNING.playerBox.h) || 8) / 2;
export const BOSS_NAME = 'BIG BOSS JESSE';

// ---------------- tuning (indexed by phase - 1) ----------------
export const BOSS = {
  homeDy: 290,              // Jesse hovers at stage.bossY + homeDy (player sits at bossY + PLAYER_LEAD)
  enterDy: 150,             // ... and walks in from homeDy + enterDy
  enter: 2.4,               // s, invulnerable entrance
  xMin: CELL + 34, xMax: FIELD_W - CELL - 34,   // side walls at cx 0 and 13; keep the 56-wide body inside
  zMin: 8, zMax: 46,
  headFrac: 0.45,           // shots must be at or above e.z + h*headFrac to hit the head
  trans: 2.6,               // s between phases (invulnerable, taunt, drops)
  death: 3.0,               // s death sequence
  move:    [38, 54, 74],    // lateral speed
  moveZ:   [22, 30, 42],
  retarget:[2.6, 2.1, 1.6], // s between movement targets
  charge:  [0.7, 0.55, 0.45],   // telegraph before a volley
  volley:  [3, 4, 6],       // missiles per volley
  gap:     [0.45, 0.38, 0.28],  // s between missiles
  openDelay: [0.5, 0.45, 0.4],  // s after the last missile before the head opens
  open:    [1.9, 1.8, 1.7], // s vulnerable window
  cap:     [4, 4, 5],       // hits per window before Jesse slams the visor shut
  recover: [1.2, 0.9, 0.7], // s pause after the window (phase 2/3: an attack plays here)
  mVy:     [62, 74, 92],    // missile forward speed toward the player
  mVx:     [40, 52, 66],    // max lateral homing speed
  mVz:     [32, 42, 56],
  mAcc:    [70, 95, 130],   // homing turn rate (velocity change units/s^2)
  mLife:   [4.2, 4.2, 4.5],
  fanN:    [0, 5, 7],       // cheeseballs per fan
  fanStep: [0, 0.2, 0.17],  // rad between fan bullets
  fanSpeed:[0, 105, 128],
  wallVy:  [0, 52, 64],     // laser wall approach speed
  wallVx:  [0, 50, 70],     // sweep speed (sweep walls)
  jets:    [0, 0, 13],      // s between mousejet summons (0 = never)
  tunaFuel: 45,             // drop a tuna when fuel is below this (and the last drop is old)
  tunaEvery: 11,            // s min between fuel drops
  perRound: 0.1,            // missile/fan speed + missile turn rate multiplier per extra round (max +30%)
  tauntGap: 7,              // s min between incidental taunts
};
export const PHASE_FRAC = [2 / 3, 1 / 3];  // hp01 thresholds for phase 2 and 3

const MAX_KIDS = 24;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function approach(v, target, step) {
  if (v < target) return v + step > target ? target : v + step;
  return v - step < target ? target : v - step;
}
function playerAlive(g) { const p = g.player; return !!p && p.alive !== false; }
function attacking(g) { return (g.state === undefined || g.state === 'play' || g.state === 'intro') && playerAlive(g); }

/** Phase (1..3) for hp out of maxHp. */
export function phaseFor(hp, maxHp) {
  const f = hp / (maxHp || 1);
  return f > PHASE_FRAC[0] ? 1 : f > PHASE_FRAC[1] ? 2 : 3;
}
/** Lowest hp allowed while still in `phase` (damage is clamped here; reaching it starts the transition). */
export function phaseFloor(phase, maxHp) {
  return phase >= 3 ? 0 : Math.round(maxHp * PHASE_FRAC[phase - 1]);
}

// ---------------- aiming (shared helper from enemies.js, local fallback) ----------------
const AIM = { vx: 0, vy: 0, vz: 0, t: 0 };
function aimLocal(g, x, y, z, speed, out) {
  const p = g.player;
  const dx = p.x - x, dy = p.y - y, dz = p.z + PLAYER_HALF_H - z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  out.vx = dx / len * speed; out.vy = dy / len * speed; out.vz = dz / len * speed; out.t = len / speed;
  return out;
}
function aim(g, x, y, z, speed) {
  if (aimAtShared) return aimAtShared(g, x, y, z, speed, 0, AIM);
  return aimLocal(g, x, y, z, speed, AIM);
}

// ---------------- events ----------------
const BOSS_EV = { name: BOSS_NAME, phase: 1, hp01: 1 };
function emitBoss(e, g) {
  BOSS_EV.phase = e.phase; BOSS_EV.hp01 = Math.max(0, e.hp / (e.maxHp || 1));
  g.bus.emit('boss', BOSS_EV);
}
function taunt(e, g, idx, dur) {
  const s = e.st;
  const text = idx >= 0 ? TAUNTS[idx % TAUNTS.length] : TAUNTS[g.rng.int(0, TAUNTS.length - 1)];
  g.bus.emit('taunt', { text, dur: dur || 2.6 });
  g.sfx('boss_laugh', e);
  s.tauntT = BOSS.tauntGap;
}

// ---------------- children ----------------
function compact(list) {
  let j = 0;
  for (let i = 0; i < list.length; i++) { const c = list[i]; if (!c.dead) list[j++] = c; }
  list.length = j;
}

function fireMissile(e, g, k) {
  const s = e.st;
  if (s.missiles.length >= MAX_KIDS) return null;
  const side = (s.shot++ & 1) ? 1 : -1;
  const m = g.spawn('bossmissile', {
    x: e.x + side * 20, y: e.y - e.d / 2 - 4, z: e.z + 30,
    vx: side * g.rng.range(30, 55), vy: -BOSS.mVy[k] * 0.4, vz: g.rng.range(20, 45), bossChild: e.id, frame: 0,
  });
  if (m) { m.st.home = true; s.missiles.push(m); }
  g.sfx('can_launch', e);
  return m;
}

function steerMissiles(e, dt, g, k) {
  const list = e.st.missiles, p = g.player, rk = e.st.rk, vy = BOSS.mVy[k] * rk;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m.dead) continue;
    const ms = m.st;
    m.frame = ((m.t || 0) * 12 | 0) & 3;
    if (ms.home && ((m.t || 0) > BOSS.mLife[k] || m.y < p.y - 8 || !playerAlive(g))) ms.home = false;
    if (!ms.home) continue;                   // fly on straight (sim-core integrates, despawns behind the player)
    const step = BOSS.mAcc[k] * rk * dt;
    if ((m.t || 0) < 0.35) { m.vy = approach(m.vy, -vy, step); continue; }   // pop out of the throne
    m.vx = approach(m.vx, clamp((p.x - m.x) * 1.6, -BOSS.mVx[k], BOSS.mVx[k]), step);
    m.vz = approach(m.vz, clamp((p.z + PLAYER_HALF_H - (m.z + m.h / 2)) * 1.6, -BOSS.mVz[k], BOSS.mVz[k]), step);
    m.vy = approach(m.vy, -vy, step);
    if (m.z < 0) { m.z = 0; if (m.vz < 0) m.vz = 0; }
  }
}

function fireFan(e, g, k) {
  const n = BOSS.fanN[k];
  if (!n) return;
  const x = e.x, y = e.y - e.d / 2 - 2, z = e.z + e.h * 0.7, sp = BOSS.fanSpeed[k] * e.st.rk;
  aim(g, x, y, z, sp);
  const bx = AIM.vx, by = AIM.vy, bz = AIM.vz;
  const life = clamp(AIM.t * 1.8 + 0.8, 2, 4.5);
  for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * BOSS.fanStep[k], c = Math.cos(a), sn = Math.sin(a);
    g.spawn('cheeseball', { x, y, z, vx: bx * c - by * sn, vy: bx * sn + by * c, vz: bz, life });
  }
  g.sfx('turret_fire', e);
}

/** Sweeping laser wall. kind 0: 4-cell block sweeping sideways; 1: low band (fly over); 2: high band (fly under). */
function fireWall(e, g, k, kind) {
  const s = e.st;
  if (s.walls.length >= MAX_KIDS) return;
  const y = e.y - e.d / 2 - 10, x0 = CELL, inner = FIELD_W - 2 * CELL;
  let f;
  if (kind === 0) {
    const dir = g.player.x < FIELD_W / 2 ? 1 : -1;  // start on the player's side, sweep across
    f = g.spawn('field', { x0: dir > 0 ? x0 : FIELD_W - CELL - 4 * CELL, span: 4, z0: 0, z1: FIELD_H, y,
      vx: dir * BOSS.wallVx[k], vy: -BOSS.wallVy[k], bossWall: 1, bossChild: e.id });
  } else {
    const low = kind === 1;
    f = g.spawn('field', { x0, span: inner / CELL, z0: low ? 0 : 66, z1: low ? 58 : FIELD_H, y,
      vx: 0, vy: -BOSS.wallVy[k], bossWall: 1, bossChild: e.id });
  }
  if (f) s.walls.push(f);
  g.sfx('field_zap', e);
}

function sweepWalls(e) {
  const list = e.st.walls, lo = CELL, hi = FIELD_W - CELL;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f.dead || !f.vx) continue;
    const hw = (f.w || 0) / 2;
    if (f.x - hw < lo && f.vx < 0) { f.x = lo + hw; f.vx = -f.vx; }
    else if (f.x + hw > hi && f.vx > 0) { f.x = hi - hw; f.vx = -f.vx; }
  }
}

function summonJets(e, g) {
  const r = g.rng, y = (g.scrollY || 0) + 500, z = r.range(30, 80);
  if (g.behaviors && g.behaviors.formation) {
    g.spawn('formation', { pattern: r.pick(JET_PATTERNS), n: 4, x: FIELD_W / 2, y, z, side: r.chance(0.5) ? 1 : -1 });
  } else {
    for (let i = 0; i < 3; i++) g.spawn('mousejet', { x: 60 + i * 52, y: y + i * 20, z, vy: -60 });
  }
  g.sfx('jet_swoosh', e);
}
const JET_PATTERNS = ['vee', 'swoop', 'zig', 'line'];

function drop(e, g, kind, dx) {
  const p = g.player;
  g.spawn(kind, { x: clamp(p.x + dx, BOSS.xMin - 20, BOSS.xMax + 20), y: p.y + 170, z: clamp(p.z, 14, 90), vy: -55 });
}

function dropFuel(e, g) {
  drop(e, g, 'tuna', 0);                         // dead ahead: a cat holding fire shoots it open
  e.st.fuelT = BOSS.tunaEvery;
}

// ---------------- state machine ----------------
function startPhase(e, g, phase) {
  const s = e.st;
  e.phase = phase; e.mode = 'trans'; e.vuln = false; e.glow = 0;
  s.mt = BOSS.trans; s.act = 'idle'; s.actT = 0;
  taunt(e, g, phase === 2 ? 5 : 6, 2.6);          // BEHOLD MY DILUTE FURY! / THE RUG IS MINE TOO.
  emitBoss(e, g);
  g.shake(phase === 3 ? 7 : 5, 0.6);
  g.sfx('boss_hiss', e);
  g.bus.emit('flash', { color: phase === 3 ? '#ff4030' : '#ffd040', a: 0.25, dur: 0.2 });
  dropFuel(e, g);
  drop(e, g, 'nip', g.player.x < FIELD_W / 2 ? -22 : 22);
  for (let i = 0; i < s.missiles.length; i++) if (!s.missiles[i].dead) g.kill(s.missiles[i], null);
}

function startDying(e, g) {
  const s = e.st;
  e.mode = 'dying'; e.vuln = false; e.glow = 0; e.hit = false; e.hp = 0;
  s.mt = BOSS.death; s.boomT = 0; s.boomN = 0;
  g.bossHp01 = 0;
  emitBoss(e, g);
  g.bus.emit('taunt', { text: 'NOOO... MY CHEESE...', dur: 2.6 });
  g.sfx('boss_hiss', e);
  g.shake(8, 0.8);
  g.bus.emit('hitstop', { ms: 120 });
  if (typeof g.winStage === 'function') g.winStage(BOSS.death);
  for (let i = 0; i < s.missiles.length; i++) if (!s.missiles[i].dead) g.kill(s.missiles[i], null);
  for (let i = 0; i < s.walls.length; i++) s.walls[i].dead = true;
  const ents = g.ents;
  for (let i = 0; i < ents.length; i++) if (ents[i].kind === 'cheeseball') ents[i].dead = true;
}

function nextAct(e, g, k) {
  const s = e.st;
  switch (s.act) {
    case 'charge': s.act = 'volley'; s.left = BOSS.volley[k]; s.actT = 0; break;
    case 'volley': s.act = 'wait'; s.actT = BOSS.openDelay[k]; break;
    case 'wait': s.act = 'open'; s.actT = BOSS.open[k]; s.wHits = 0; e.vuln = true; g.sfx('boss_hit', e); break;
    case 'open': closeWindow(e, g, k); break;
    default: s.act = 'charge'; s.actT = BOSS.charge[k]; break;   // recover / idle
  }
}

function closeWindow(e, g, k) {
  const s = e.st;
  e.vuln = false; e.glow = 0;
  s.act = 'recover'; s.actT = BOSS.recover[k];
  if (k >= 1) {                                    // phase 2/3: an attack plays during recovery
    s.actT += 1.2;
    const n = s.cycle++;
    fireFan(e, g, k);
    if ((n & 1) === 0) fireWall(e, g, k, (n >> 1) % 3);
    if (k === 2) s.fan2 = 0.8;                     // second fan mid-recovery when enraged
  }
}

function moveBoss(e, dt, g, k) {
  const s = e.st, r = g.rng;
  if ((s.retarget -= dt) <= 0) {
    s.retarget = BOSS.retarget[k] * r.range(0.7, 1.3);
    // bias toward the player's lane so the fight stays in front of the cat
    const px = g.player ? g.player.x : FIELD_W / 2;
    s.tx = clamp(r.chance(0.5) ? px + r.range(-50, 50) : r.range(BOSS.xMin, BOSS.xMax), BOSS.xMin, BOSS.xMax);
    s.tz = r.range(BOSS.zMin, BOSS.zMax);
  }
  const slow = e.vuln ? 0.5 : 1;
  const vx = clamp((s.tx - e.x) * 1.5, -BOSS.move[k], BOSS.move[k]) * slow;
  const vz = clamp((s.tz - e.z) * 1.5, -BOSS.moveZ[k], BOSS.moveZ[k]) * slow;
  e.vx = approach(e.vx, vx, 120 * dt);
  e.vz = approach(e.vz, vz, 90 * dt);
  e.x = clamp(e.x + e.vx * dt, BOSS.xMin, BOSS.xMax);
  e.z = clamp(e.z + e.vz * dt, BOSS.zMin, BOSS.zMax);
  const ty = s.homeY + 10 * Math.sin(e.t * 0.8);
  e.vy = (ty - e.y) * 2; e.y += e.vy * dt;
}

function updateFight(e, dt, g) {
  const s = e.st, k = e.phase - 1;
  moveBoss(e, dt, g, k);
  if (!attacking(g)) { if (e.vuln) closeWindow(e, g, k); return; }   // hold fire while the cat respawns
  if (s.fan2 > 0 && (s.fan2 -= dt) <= 0) fireFan(e, g, k);
  if (s.act === 'volley') {
    if ((s.actT -= dt) <= 0) {
      fireMissile(e, g, k);
      g.shake(1.5, 0.12);
      s.actT = BOSS.gap[k];
      if (--s.left <= 0) nextAct(e, g, k);
    }
  } else if ((s.actT -= dt) <= 0) nextAct(e, g, k);
  if (BOSS.jets[k] > 0 && (s.jetT -= dt) <= 0) { s.jetT = BOSS.jets[k]; summonJets(e, g); }
  if (s.fuelT <= 0 && g.fuel !== undefined && g.fuel < BOSS.tunaFuel) dropFuel(e, g);
  if (s.tauntT <= 0 && s.act === 'charge' && g.rng.chance(0.35)) taunt(e, g, -1, 2.4);
}

function updateDying(e, dt, g) {
  const s = e.st, r = g.rng;
  e.vuln = false; e.glow = 0; e.hp = 0;
  e.x += Math.sin(e.t * 40) * 0.6;                 // death rattle
  e.z = Math.max(0, e.z - 9 * dt);
  if ((s.boomT -= dt) <= 0) {
    s.boomT = 0.16 + r.range(0, 0.1);
    const bx = e.x + r.range(-e.w / 2, e.w / 2), bz = e.z + r.range(4, e.h);
    g.fx((s.boomN++ % 3) ? 'boom_small' : 'boom_big', bx, e.y - e.d / 2, bz);
    g.fx('crumbs', bx, e.y - e.d / 2, bz, { n: 6 });
    g.sfx((s.boomN & 1) ? 'boom_big' : 'boom_small', e);
    g.shake(3 + 3 * (1 - s.mt / BOSS.death), 0.2);
  }
  if ((s.mt -= dt) <= 0.1 && !e.dead) {
    e.hit = true;                                  // so kill() counts it as a player kill
    g.fx('ring', e.x, e.y, e.z + e.h / 2);
    g.fx('confetti', e.x, e.y, e.z + e.h);
    g.bus.emit('flash', { color: '#ffffff', a: 0.6, dur: 0.3 });
    g.kill(e, g.player);
  }
}

function setFrame(e, g) {
  const s = e.st, t = e.t;
  e.glow = e.vuln ? (((t * 10) | 0) & 1 ? 1 : 0.35) : 0;
  if (e.mode === 'dying') { e.frame = 7; return; }
  if (e.hitT > 0 || s.flinch > 0) { e.frame = 5; return; }
  if (e.mode === 'enter' || e.mode === 'trans') { e.frame = e.phase === 3 && e.mode === 'trans' ? 6 : 2; return; }
  if (e.vuln) { e.frame = ((t * 10) | 0) & 1 ? 3 : 5; return; }
  if (s.act === 'charge') { e.frame = 3; return; }
  if (s.act === 'volley' || s.act === 'wait') { e.frame = 4; return; }
  e.frame = e.phase === 3 ? (((t * 3) | 0) & 1 ? 6 : 1) : ((t * 2) | 0) & 1;
}

export const bossBehavior = {
  init(e, g) {
    const s = e.st, st = g.stage || {};
    const baseY = st.bossY >= 0 ? st.bossY : (e.y || 0) - BOSS.homeDy;
    s.homeY = baseY + BOSS.homeDy;
    if (!(e.maxHp > 0)) e.maxHp = TUNING.bossHits;
    e.hp = e.maxHp = TUNING.bossHits;
    e.x = clamp(e.x || FIELD_W / 2, BOSS.xMin, BOSS.xMax);
    e.y = s.homeY + BOSS.enterDy;
    e.z = clamp(e.z || 30, BOSS.zMin, BOSS.zMax);
    e.vx = e.vy = e.vz = 0;
    e.phase = 1; e.mode = 'enter'; e.vuln = false; e.glow = 0; e.frame = 2;
    s.mt = BOSS.enter; s.act = 'idle'; s.actT = 0; s.left = 0; s.wHits = 0; s.cycle = 0; s.shot = 0;
    s.tx = e.x; s.tz = e.z; s.retarget = 0; s.jetT = 4; s.fuelT = 0; s.tauntT = 0; s.fan2 = 0; s.flinch = 0;
    s.tinkT = 0; s.boomT = 0; s.boomN = 0; s.lastAlive = true;
    s.missiles = []; s.walls = [];
    s.rk = 1 + BOSS.perRound * Math.min(3, Math.max(0, ((g.round | 0) || 1) - 1));   // later rounds: faster fire
    emitBoss(e, g);
    taunt(e, g, 0, 3);                              // YOU DARE ENTER MY CASTLE?
    g.shake(4, 0.5);
  },

  update(e, dt, g) {
    const s = e.st;
    if (s.tauntT > 0) s.tauntT -= dt;
    if (s.fuelT > 0) s.fuelT -= dt;
    if (s.tinkT > 0) s.tinkT -= dt;
    if (s.flinch > 0) s.flinch -= dt;
    const k = e.phase - 1;
    compact(s.missiles); compact(s.walls);
    steerMissiles(e, dt, g, k);
    sweepWalls(e);
    // player just died: gloat
    const alive = playerAlive(g);
    if (s.lastAlive && !alive && e.mode !== 'dying') taunt(e, g, 7, 2.4);   // YOU CALL THAT A MEOW?
    s.lastAlive = alive;

    switch (e.mode) {
      case 'enter': {
        const u = clamp(1 - s.mt / BOSS.enter, 0, 1);
        e.y = s.homeY + BOSS.enterDy * (1 - u) * (1 - u);
        if (((e.t * 2.5) | 0) !== ((e.t * 2.5 - dt * 2.5) | 0)) g.shake(2.5, 0.15);   // walker stomps
        if ((s.mt -= dt) <= 0) { e.mode = 'fight'; s.act = 'idle'; s.actT = 0.4; s.retarget = 0; emitBoss(e, g); }
        break;
      }
      case 'trans':
        moveBoss(e, dt, g, k);
        if ((s.mt -= dt) <= 0) { e.mode = 'fight'; s.act = 'idle'; s.actT = 0.6; s.jetT = 3; }
        break;
      case 'fight': updateFight(e, dt, g); break;
      case 'dying': updateDying(e, dt, g); break;
    }
    e.act = s.act;
    setFrame(e, g);
  },

  /** Takes over damage entirely (always returns false so sim-core's default hurt is skipped). */
  onHit(e, dmg, g, src) {
    const s = e.st;
    if (e.mode === 'dying' || e.dead) return false;
    const bomb = !!src && src.kind === 'yarn';
    let ok = e.mode === 'fight' && (bomb || e.vuln);
    if (ok && !bomb && src && src.z !== undefined && src.z + (src.h || 0) / 2 < e.z + e.h * BOSS.headFrac) ok = false;   // hit the throne
    if (!ok) {
      if (s.tinkT <= 0) {
        s.tinkT = 0.12; g.sfx('tink', e);
        if (src) g.fx('spark', src.x, src.y, src.z + (src.h || 0) / 2);
      }
      return false;
    }
    const floor = phaseFloor(e.phase, e.maxHp);
    const nh = Math.max(floor, e.hp - (dmg > 0 ? dmg : 1));
    if (nh === e.hp) return false;
    e.hp = nh; e.hitT = 0.12; s.flinch = 0.15;
    g.bossHp01 = Math.max(0, e.hp / (e.maxHp || 1));
    g.sfx('boss_hit', e);
    g.bus.emit('hitstop', { ms: 25 });
    if (e.hp <= 0) { startDying(e, g); return false; }
    emitBoss(e, g);
    if (e.hp <= floor) { startPhase(e, g, e.phase + 1); return false; }
    if (!bomb && ++s.wHits >= BOSS.cap[e.phase - 1]) {   // slam the visor shut
      closeWindow(e, g, e.phase - 1);
      g.shake(3, 0.2);
      if (s.tauntT <= 0) taunt(e, g, -1, 2);
    }
    return false;
  },

  onDeath(e, g) {
    const s = e.st;
    if (s.missiles) for (let i = 0; i < s.missiles.length; i++) s.missiles[i].dead = true;
    if (s.walls) for (let i = 0; i < s.walls.length; i++) s.walls[i].dead = true;
    g.shake(10, 1.2);
  },
};

export default bossBehavior;
