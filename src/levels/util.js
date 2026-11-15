// Shared helpers for the level generators. Pure, deterministic, no DOM.
import { CELL, FIELD_CELLS_X, FIELD_CELLS_Z, TUNING, cellKey } from '../core/defs.js';

export const NX = FIELD_CELLS_X;
export const NZ = FIELD_CELLS_Z;
export const SAFE = 0.7;   // fraction of the player's lateral/vertical speed the fairness model assumes

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function mixSeed(seed, stageIdx, round) {
  let h = (seed | 0) ^ Math.imul(stageIdx + 1, 0x9E3779B1) ^ Math.imul(round, 0x85EBCA6B);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) || 1;
}

/** forward scroll speed (units/s) for a round (mirrors TUNING; contract: +speedPerRound, capped +50). */
export function speedFor(round) {
  return TUNING.baseSpeed + Math.min(50, TUNING.speedPerRound * Math.max(0, round - 1));
}

/** How many cells the player can shift (x, z) while flying `rows` cell-rows forward. Conservative (SAFE factor). */
export function reach(rows, round) {
  const t = Math.max(0, rows) * CELL / speedFor(round);
  return {
    rx: Math.floor(TUNING.moveX * t * SAFE / CELL),
    rz: Math.floor(TUNING.moveZ * t * SAFE / CELL),
  };
}

export class Builder {
  constructor() {
    this.map = new Map();
    this.spawns = [];
    this.decor = [];
  }
  cell(cx, cy, cz, t) {
    if (cx < 0 || cx >= NX || cz < 0 || cz >= NZ || cy < 0) return;
    this.map.set(cellKey(cx, cy, cz), { cx, cy, cz, t });
  }
  has(cx, cy, cz) { return this.map.has(cellKey(cx, cy, cz)); }
  spawn(y, kind, x, z = 0, props) {
    const s = { y, kind, x, z };
    if (props) Object.assign(s, props);
    this.spawns.push(s);
    return s;
  }
  addDecor(y, x, type) { this.decor.push({ y, x, type }); }
  cells() {
    const out = Array.from(this.map.values());
    out.sort((a, b) => a.cy - b.cy || a.cz - b.cz || a.cx - b.cx);
    return out;
  }
  sortedSpawns() {
    const idx = this.spawns.map((s, i) => [s, i]);
    idx.sort((a, b) => a[0].y - b[0].y || a[1] - b[1]);
    return idx.map((p) => p[0]);
  }
  sortedDecor() {
    const idx = this.decor.map((s, i) => [s, i]);
    idx.sort((a, b) => a[0].y - b[0].y || a[1] - b[1]);
    return idx.map((p) => p[0]);
  }
}

/** Map cy -> Uint8Array(NX*NZ) of blocked cells (voxels + force fields). Index = cz*NX+cx. */
export function rowBlocks(stage) {
  const rows = new Map();
  const row = (cy) => {
    let r = rows.get(cy);
    if (!r) { r = new Uint8Array(NX * NZ); rows.set(cy, r); }
    return r;
  };
  for (const c of stage.cells) row(c.cy)[c.cz * NX + c.cx] = 1;
  for (const s of stage.spawns) {
    if (s.kind !== 'field') continue;
    const span = s.span || 1;
    const cx0 = Math.round((s.x - span * CELL / 2) / CELL);
    const z0 = s.z0 !== undefined ? s.z0 : (s.z || 0);
    const z1 = s.z1 !== undefined ? s.z1 : z0 + CELL;
    const cz0 = Math.floor(z0 / CELL);
    const cz1 = Math.ceil(z1 / CELL) - 1;
    const r = row(Math.floor(s.y / CELL));
    for (let cx = cx0; cx < cx0 + span; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        if (cx >= 0 && cx < NX && cz >= 0 && cz < NZ) r[cz * NX + cx] = 1;
      }
    }
  }
  return rows;
}
