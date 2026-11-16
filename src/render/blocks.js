// Voxel castle index + shaded block sprites (owner: render-scene). Node-safe: no DOM at import time.
import { CELL, BLOCKS, BLOCK_NAMES, FIELD_CELLS_X, cellKey } from '../core/defs.js';
import { project, depthKey } from '../core/iso.js';

/** Painter key shared by cells, entities and strands: true iso depth along the view ray (x - y + z). Draw ascending. */
export const isoDepth = (x, y, z) => depthKey(x, y, 0) + z;

// Blocks whose sprite does not fill the whole cube silhouette (notched top / pole): never used as occluders.
const NON_OCCLUDING = new Set([BLOCKS.crown, BLOCKS.flag]);
/** Brightness per cell height (ambient-occlusion feel: the base course is darkest). */
export const LIGHT_LEVELS = [0.78, 0.88, 0.95, 1];
export const lightLevel = (cz) => (cz >= 3 ? 3 : cz < 0 ? 0 : cz);

/**
 * Index a stage's voxels for rendering.
 * rows: Map<cy, Cell[]> of VISIBLE cells only. Cell = { cx, cy, cz, t, bx, by, d, k, lvl }
 *   (bx,by) = top-left of the 32x32 cube sprite on screen at camY = 0; d = cx-cy+cz; k = isoDepth of the base centre.
 */
export function buildVoxelIndex(cells = []) {
  const map = new Map();
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c || !(c.t > 0) || c.cx < 0 || c.cx >= 32 || c.cz < 0 || c.cz >= 32 || c.cy < 0) continue;
    map.set(cellKey(c.cx, c.cy, c.cz), c.t);
  }
  const inb = (cx, cy, cz) => cx >= 0 && cx < 32 && cz >= 0 && cz < 32 && cy >= 0;
  const typeAt = (cx, cy, cz) => (inb(cx, cy, cz) ? map.get(cellKey(cx, cy, cz)) || 0 : 0);
  const has = (cx, cy, cz) => typeAt(cx, cy, cz) !== 0;
  const full = (cx, cy, cz) => { const t = typeAt(cx, cy, cz); return t !== 0 && !NON_OCCLUDING.has(t); };

  const rows = new Map(), heights = new Map();
  let visible = 0, hidden = 0, minCy = Infinity, maxCy = -Infinity;
  const p = { sx: 0, sy: 0 };
  for (const [key, t] of map) {
    const cx = key & 31, cz = (key >> 5) & 31, cy = Math.floor(key / 1024);
    const hk = cy * 32 + cx;
    if ((heights.get(hk) || 0) < cz + 1) heights.set(hk, cz + 1);
    if (cy < minCy) minCy = cy;
    if (cy > maxCy) maxCy = cy;
    // hidden when all three camera-facing faces are covered, or when the cube one step toward the camera covers it.
    if ((full(cx, cy - 1, cz) && full(cx + 1, cy, cz) && full(cx, cy, cz + 1)) || full(cx + 1, cy - 1, cz + 1)) { hidden++; continue; }
    visible++;
    const x = cx * CELL, y = cy * CELL, z = cz * CELL;
    const bx = Math.round(project(x, y, z, 0, p).sx), by = Math.round(project(x, y + CELL, z + CELL, 0, p).sy);
    const cell = { cx, cy, cz, t, bx, by, d: cx - cy + cz, k: isoDepth(x + CELL / 2, y + CELL / 2, z), lvl: lightLevel(cz) };
    let r = rows.get(cy);
    if (!r) rows.set(cy, (r = []));
    r.push(cell);
  }
  for (const r of rows.values()) r.sort((a, b) => a.d - b.d);

  // Ground shadows cast toward +x (light from the upper-left): Map<cy, Float32Array(FIELD_CELLS_X)> of alpha.
  const shadowRows = new Map();
  for (const [hk, h] of heights) {
    const cy = Math.floor(hk / 32), cx = hk & 31, len = Math.min(4, Math.ceil(h * 0.75));
    for (let d = 1; d <= len; d++) {
      const tx = cx + d;
      if (tx >= FIELD_CELLS_X || has(tx, cy, 0)) break;
      let row = shadowRows.get(cy);
      if (!row) shadowRows.set(cy, (row = new Float32Array(FIELD_CELLS_X)));
      const a = 0.34 * (1 - ((d - 1) / len) * 0.75);
      if (a > row[tx]) row[tx] = a;
    }
  }

  /** Top z (world units) of the highest voxel under the point whose top is <= z (+2 tolerance); 0 = ground. */
  function topUnder(x, y, z) {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (!heights.has(cy * 32 + cx)) return 0;
    for (let cz = Math.min(31, Math.floor((z + 2) / CELL) - 1); cz >= 0; cz--) if (has(cx, cy, cz)) return (cz + 1) * CELL;
    return 0;
  }

  let cacheA = NaN, cacheB = NaN, cacheList = [];
  /** Visible cells of rows cy0..cy1 in painter order (ascending depth). Cached while the row range is unchanged. */
  function visibleCells(cy0, cy1) {
    if (cy0 === cacheA && cy1 === cacheB) return cacheList;
    const list = [];
    for (let cy = cy1; cy >= cy0; cy--) { const r = rows.get(cy); if (r) for (let i = 0; i < r.length; i++) list.push(r[i]); }
    list.sort((a, b) => a.d - b.d);
    cacheA = cy0; cacheB = cy1; cacheList = list;
    return list;
  }
  return { rows, heights, shadowRows, has, typeAt, topUnder, visibleCells, count: map.size, visible, hidden, minCy, maxCy };
}

/** Per block type x light level pre-shaded cube canvases (rebuilt when art.version changes). */
export function createBlockSprites(artRef, mk) {
  let ver = -1, table = [], glows = [];
  function rebuild() {
    const art = artRef.art;
    ver = art.version; table = []; glows = [];
    for (const [tStr, name] of Object.entries(BLOCK_NAMES)) {
      const t = +tStr, src = art.get('blk_' + name, 0), lv = [];
      for (let l = 0; l < LIGHT_LEVELS.length; l++) {
        const f = LIGHT_LEVELS[l];
        if (!mk || f >= 1 || !src || !src.getContext) { lv.push(src); continue; }
        const c = mk(src.width, src.height), g = c.getContext('2d');
        g.drawImage(src, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = `rgba(22,8,44,${(1 - f).toFixed(3)})`;      // cool shadow tint, not flat black
        g.fillRect(0, 0, c.width, c.height);
        lv.push(c);
      }
      table[t] = lv;
      glows[t] = art.glow ? art.glow('blk_' + name, 0) : null;
    }
  }
  return {
    get(t, lvl) { if (ver !== artRef.art.version) rebuild(); const lv = table[t] || table[BLOCKS.cheddar]; return lv[lvl]; },
    glow(t) { if (ver !== artRef.art.version) rebuild(); return glows[t] || null; },
  };
}
