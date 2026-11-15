// Player ship (Major Marmalade): movement, bank, clamps, collisions, thread-the-needle (sim-core).
import { CELL, FIELD_W, TUNING, VIEW, SCORES, POPUP_COLORS } from '../core/defs.js';
import { bonus } from './score.js';

const PB = TUNING.playerBox;
const SHRINK = 1;            // forgiving hitbox vs voxels (units per side)

export function createPlayer() {
  return {
    id: 0, kind: 'cat', team: 'p', x: FIELD_W / 2, y: VIEW.PLAYER_LEAD, z: 40, vx: 0, vz: 0,
    w: PB.w, d: PB.d, h: PB.h, bank: 0, invuln: 0, alive: true, fireCd: 0, anim: 0,
  };
}

export function resetPlayer(g, invuln) {
  const p = g.player;
  p.x = FIELD_W / 2; p.z = 40; p.vx = 0; p.vz = 0; p.bank = 0;
  p.y = g.scrollY + VIEW.PLAYER_LEAD;
  p.invuln = invuln; p.alive = true; p.fireCd = 0;
  g._thread.cy = -1;
}

export function updatePlayer(g, dt, input) {
  const p = g.player;
  p.y = g.scrollY + VIEW.PLAYER_LEAD;
  if (!p.alive) { p.vx = 0; p.vz = 0; return; }
  let dx = +input.dx || 0, dz = +input.dz || 0;
  if (dx > 1) dx = 1; else if (dx < -1) dx = -1;
  if (dz > 1) dz = 1; else if (dz < -1) dz = -1;
  const ox = p.x, oz = p.z;
  p.x += dx * TUNING.moveX * dt;
  p.z += dz * TUNING.moveZ * dt;
  if (p.x < TUNING.xMin) p.x = TUNING.xMin; else if (p.x > TUNING.xMax) p.x = TUNING.xMax;
  if (p.z < TUNING.zMin) p.z = TUNING.zMin; else if (p.z > TUNING.zMax) p.z = TUNING.zMax;
  p.vx = dt > 0 ? (p.x - ox) / dt : 0;
  p.vz = dt > 0 ? (p.z - oz) / dt : 0;
  const k = Math.min(1, dt * 10);
  p.bank += (dx * 2 - p.bank) * k;
  if (Math.abs(p.bank) < 1e-4) p.bank = 0;
  p.anim += dt;
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
}

/** Can the player currently be hurt? */
export function vulnerable(g) { return g.player.alive && g.player.invuln <= 0 && g.nipT <= 0; }

export function playerHitsVoxels(g) {
  const p = g.player;
  return g.grid.boxHit(p.x - PB.w / 2 + SHRINK, p.x + PB.w / 2 - SHRINK, p.y - PB.d / 2 + SHRINK, p.y + PB.d / 2 - SHRINK,
    p.z + SHRINK, p.z + PB.h - SHRINK);
}

/** 3D AABB overlap between the player box and entity e. */
export function playerTouches(p, e) {
  return Math.abs(p.x - e.x) * 2 < PB.w + e.w && Math.abs(p.y - e.y) * 2 < PB.d + e.d &&
    p.z < e.z + e.h && e.z < p.z + PB.h;
}

/**
 * Thread the needle: while the player's nose is inside a wall row, measure the vertical empty run in the player's
 * column; if it is <= 1 cell tall and capped by a voxel above, it's a needle. Award when the row is left alive.
 */
export function updateThread(g) {
  const p = g.player, th = g._thread;
  const cy = Math.floor(p.y / CELL);
  if (th.cy >= 0 && cy !== th.cy) {
    if (th.needle && p.alive) {
      bonus(g, SCORES.thread, 'THREAD THE NEEDLE!');
      g.sfx('thread_needle', p);
      g.stats.threads++;
    }
    th.cy = -1; th.needle = false;
  }
  if (!p.alive || g.grid.rows(cy).length === 0) return;
  if (th.cy !== cy) { th.cy = cy; th.needle = false; }
  const cx = Math.floor(p.x / CELL), czc = Math.floor((p.z + PB.h / 2) / CELL);
  if (g.grid.cellAt(cx, cy, czc)) return;               // inside a voxel: no needle (and will die anyway)
  let top = czc; while (top < 16 && !g.grid.cellAt(cx, cy, top + 1)) top++;
  if (top >= 15) return;                                // open sky above
  let bot = czc; while (bot > 0 && !g.grid.cellAt(cx, cy, bot - 1)) bot--;
  if (top - bot + 1 <= 1) th.needle = true;
}

export { POPUP_COLORS };
