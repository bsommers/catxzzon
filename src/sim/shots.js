// Player weapons (sim-core): auto-fire hairballs (3D AABB hits, laser-pointer homing) and the yarn bomb.
import { TUNING, KINDS } from '../core/defs.js';

const HB = KINDS.hairball, YN = KINDS.yarn;
export const BOMB = { range: 220, radius: 90, bossDmg: 10, vy: 230, vz: 70, grav: 260, dmg: 99 };
const HOMING_TURN = 7;        // 1/s steering responsiveness
const HOMING_SPEED = 260;     // max lateral/vertical speed while homing

export function updateFiring(g, dt, input) {
  const p = g.player;
  if (p.fireCd > 0) p.fireCd -= dt;
  if (!p.alive || !input.fire) return;
  if (p.fireCd > 0) return;
  const nip = g.nipT > 0;
  p.fireCd += 1 / (nip ? TUNING.nipFireRate : TUNING.fireRate);
  if (p.fireCd < 0) p.fireCd = 0;
  const s = g.spawn('hairball', {
    x: p.x, y: p.y + p.d / 2 + HB.d / 2, z: p.z + (p.h - HB.h) / 2, vx: 0, vy: TUNING.shotSpeed, vz: 0,
    homing: g.laserT > 0, nip,
  });
  s.y0 = s.y;
  g.sfx(nip ? 'shot_nip' : 'shot', s);
}

export function tryBomb(g) {
  const p = g.player;
  if (!p.alive || g.bombs <= 0 || g._yarn) return false;
  g.bombs--;
  const y = g.spawn('yarn', { x: p.x, y: p.y + 10, z: p.z, vx: p.vx * 0.2, vy: g.speed + BOMB.vy, vz: BOMB.vz });
  y.y0 = y.y;
  g._yarn = y;
  g.sfx('bomb', y);
  return true;
}

function boxOverlap(a, e) {
  return Math.abs(a.x - e.x) * 2 < a.w + e.w && Math.abs(a.y - e.y) * 2 < a.d + e.d && a.z < e.z + e.h && e.z < a.z + a.h;
}

/** Entities a shot can collide with: hit-able ones (damage) or solid ones (absorb with a tink). */
function blocksShot(e) { return !e.dead && e.team !== 'p' && (e.hit || (e.solid && e.on !== false)); }

export function updateHairball(e, dt, g) {
  if (e.homing) {
    const tgt = g.nearestEnemy(e.x, e.y + 40, e.z);
    if (tgt && tgt.y > e.y) {
      const ty = tgt.y - e.y, tx = tgt.x - e.x, tz = (tgt.z + tgt.h / 2) - (e.z + e.h / 2);
      const tt = ty / Math.max(60, e.vy);
      const wantVx = Math.max(-HOMING_SPEED, Math.min(HOMING_SPEED, tx / Math.max(0.05, tt)));
      const wantVz = Math.max(-HOMING_SPEED, Math.min(HOMING_SPEED, tz / Math.max(0.05, tt)));
      const k = Math.min(1, HOMING_TURN * dt);
      e.vx += (wantVx - e.vx) * k; e.vz += (wantVz - e.vz) * k;
    }
  }
  e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
  if (e.y - e.y0 > TUNING.shotRange || e.z < -4 || e.z > 160) { e.dead = true; return; }
  if (g.grid.boxHit(e.x - e.w / 2, e.x + e.w / 2, e.y - e.d / 2, e.y + e.d / 2, e.z, e.z + e.h)) {
    e.dead = true; g.fx('spark', e.x, e.y, e.z + e.h / 2); g.sfx('tink', e); return;
  }
  const ents = g.ents;
  for (let i = 0; i < ents.length; i++) {
    const o = ents[i];
    if (!blocksShot(o) || !boxOverlap(e, o)) continue;
    e.dead = true;
    if (o.hit) g.hurt(o, 1, e);
    else { g.fx('spark', e.x, e.y, e.z + e.h / 2); g.sfx('field_zap', e); }
    return;
  }
}

export function updateYarn(e, dt, g) {
  e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt; e.vz -= BOMB.grav * dt;
  let burst = e.y - e.y0 >= BOMB.range || e.z <= 0 ||
    g.grid.boxHit(e.x - e.w / 2, e.x + e.w / 2, e.y - e.d / 2, e.y + e.d / 2, e.z, e.z + e.h);
  if (!burst) {
    const ents = g.ents;
    for (let i = 0; i < ents.length; i++) {
      const o = ents[i];
      if (!o.dead && o.team === 'e' && (o.hit || o.solid) && boxOverlap(e, o)) { burst = true; break; }
    }
  }
  if (burst) burstYarn(e, g);
}

export function burstYarn(e, g) {
  if (e.dead) return;
  e.dead = true;
  if (g._yarn === e) g._yarn = null;
  const cz = e.z + e.h / 2, r2 = BOMB.radius * BOMB.radius;
  g.bus.emit('bomb', { x: e.x, y: e.y, z: cz });
  g.fx('ring', e.x, e.y, cz, { r: BOMB.radius });
  g.fx('boom_big', e.x, e.y, cz);
  g.shake(5, 0.35);
  g.bus.emit('flash', { color: '#ffffff', a: 0.35, dur: 0.12 });
  const ents = g.ents;
  for (let i = 0; i < ents.length; i++) {
    const o = ents[i];
    if (o.dead || o.team !== 'e') continue;
    const dx = o.x - e.x, dy = o.y - e.y, dz = (o.z + o.h / 2) - cz;
    if (dx * dx + dy * dy + dz * dz > r2) continue;
    if (o.kind === 'boss') g.hurt(o, BOMB.bossDmg, e);
    else if (o.hit) g.hurt(o, BOMB.dmg, e);
    else if (o.kind === 'cheeseball') o.dead = true;      // bullets are erased
  }
}
