// Iso projection helpers. FROZEN: owned by the orchestrator. Pure functions, no DOM.
// World: x lateral (right edge of the field is larger x), y forward (scroll direction), z up.
// Screen: forward (+y) goes UP-RIGHT, +x goes DOWN-RIGHT, +z goes up. Camera sees the -y face, +x face and top of boxes.
import { VIEW, FIELD_W } from './defs.js';

export function project(x, y, z, camY, out = { sx: 0, sy: 0 }) {
  const u = x - FIELD_W / 2, v = y - camY;
  out.sx = VIEW.ox + (u + v) * VIEW.A;
  out.sy = VIEW.oy + (u - v) * VIEW.B - z * VIEW.C;
  return out;
}
/** Inverse on the ground/plane z: screen -> world (x,y) at altitude z. */
export function unproject(sx, sy, z, camY, out = { x: 0, y: 0 }) {
  const s = (sx - VIEW.ox) / VIEW.A, d = (sy - VIEW.oy + z * VIEW.C) / VIEW.B;   // s = u+v, d = u-v
  out.x = (s + d) / 2 + FIELD_W / 2; out.y = (s - d) / 2 + camY;
  return out;
}
/** Painter's-algorithm key: draw ascending. Nearer to camera = larger (x - y); z breaks ties (higher later). */
export function depthKey(x, y, z) { return (x - y) + z * 0.01; }
/** Sort key for cube cells (cx,cy,cz): ascending draw order. */
export function cellDepth(cx, cy, cz) { return (cx - cy) * 1000 + cz; }
export function screenToCell(sx, sy, camY) { const p = unproject(sx, sy, 0, camY); return { cx: Math.floor(p.x / 16), cy: Math.floor(p.y / 16) }; }
/** Is a projected point within the (slightly padded) screen? */
export function onScreen(sx, sy, pad = 40) { return sx > -pad && sx < VIEW.W + pad && sy > -pad && sy < VIEW.H + pad; }
