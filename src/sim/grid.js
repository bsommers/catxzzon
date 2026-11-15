// Voxel grid (sim-core). Pure, Node-safe. Cells are {cx,cy,cz,t}; one cell = CELL^3 world units.
import { CELL, cellKey } from '../core/defs.js';

const EMPTY = Object.freeze([]);

/**
 * createGrid(cells) -> grid
 *   cellAt(cx,cy,cz) -> block type (0 = empty)
 *   rows(cy)         -> array of cells in row cy (shared frozen [] when none), sorted cz asc, cx asc
 *   solidAt(x,y,z)   -> true if the world point is inside a voxel
 *   boxHit(x0,x1,y0,y1,z0,z1) -> true if the world AABB overlaps any voxel (open intervals, so touching faces don't count)
 *   rowCys           -> sorted array of cy values that contain cells
 *   count, minCy, maxCy
 */
export function createGrid(cells = []) {
  const map = new Map();
  const rowMap = new Map();
  let minCy = Infinity, maxCy = -Infinity;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c || !(c.t > 0)) continue;
    if (c.cx < 0 || c.cx >= 32 || c.cz < 0 || c.cz >= 32 || c.cy < 0) continue;
    const k = cellKey(c.cx, c.cy, c.cz);
    if (!map.has(k)) {
      let r = rowMap.get(c.cy);
      if (!r) { r = []; rowMap.set(c.cy, r); }
      r.push(c);
    }
    map.set(k, c.t);
    if (c.cy < minCy) minCy = c.cy;
    if (c.cy > maxCy) maxCy = c.cy;
  }
  for (const r of rowMap.values()) r.sort((a, b) => (a.cz - b.cz) || (a.cx - b.cx));
  const rowCys = [...rowMap.keys()].sort((a, b) => a - b);

  function cellAt(cx, cy, cz) {
    if (cx < 0 || cx >= 32 || cz < 0 || cz >= 32 || cy < 0) return 0;
    return map.get(cellKey(cx, cy, cz)) || 0;
  }
  function rows(cy) { return rowMap.get(cy) || EMPTY; }
  function solidAt(x, y, z) {
    return cellAt(Math.floor(x / CELL), Math.floor(y / CELL), Math.floor(z / CELL)) > 0;
  }
  function boxHit(x0, x1, y0, y1, z0, z1) {
    if (map.size === 0) return false;
    const e = 1e-6;
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor((x1 - e) / CELL);
    const cy0 = Math.floor(y0 / CELL), cy1 = Math.floor((y1 - e) / CELL);
    const cz0 = Math.floor(z0 / CELL), cz1 = Math.floor((z1 - e) / CELL);
    for (let cy = cy0; cy <= cy1; cy++) {
      if (!rowMap.has(cy)) continue;
      for (let cz = cz0; cz <= cz1; cz++)
        for (let cx = cx0; cx <= cx1; cx++)
          if (cellAt(cx, cy, cz)) return true;
    }
    return false;
  }
  return { cells, count: map.size, minCy: map.size ? minCy : 0, maxCy: map.size ? maxCy : -1, rowCys, cellAt, rows, solidAt, boxHit };
}
