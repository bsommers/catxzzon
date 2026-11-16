// Scrolling iso ground: pre-rendered row strips, slab edges, cast shadows, decor decals, space holo-grid.
// Owner: render-scene. Node-safe (no DOM at import time). All geometry is derived from core/iso.js project().
import { CELL, FIELD_W, FIELD_CELLS_X, VIEW } from '../core/defs.js';
import { project } from '../core/iso.js';
import { hash2 } from '../art/pixbuf.js';
import { inDiamond } from '../art/registry.js';

const O = project(0, 0, 0, 0), PX = project(CELL, 0, 0, 0), PY = project(0, CELL, 0, 0);
/** Screen-space basis vectors of one cell step along world x / y (16,8) and (16,-8) with the default VIEW. */
export const EX = { x: PX.sx - O.sx, y: PX.sy - O.sy }, EY = { x: PY.sx - O.sx, y: PY.sy - O.sy };
export const TILE_W = EX.x + EY.x, TILE_H = EX.y - EY.y;          // 32 x 16
const PERIOD = 8;                                                  // strip pattern repeats every 8 rows
export const SLAB = 12;                                            // visible thickness of the floating floor slab (px)
const STRIP_W = (FIELD_CELLS_X - 1) * EX.x + TILE_W, STRIP_H = (FIELD_CELLS_X - 1) * EX.y + TILE_H + SLAB;
const SIDE = {
  cracker: { face: '#7d5126', dark: '#5a3819', lip: '#f0d096', rim: 'rgba(255,240,200,0.30)' },
  gouda: { face: '#8e2a3c', dark: '#5e1a2a', lip: '#f6d26a', rim: 'rgba(255,236,170,0.30)' },
  keep: { face: '#241640', dark: '#150c28', lip: '#8a63c8', rim: 'rgba(190,160,255,0.28)' },
};
export const GROUND_ROWS_BEHIND = 304, GROUND_ROWS_AHEAD = 576;

export function createGround(artRef, mk) {
  let ver = -1, family = null, strips = [], darkTile = null;
  let decorStage = null, decorBands = new Map();
  const p = { sx: 0, sy: 0 };

  function buildDark() {
    darkTile = mk(TILE_W, TILE_H);
    const g = darkTile.getContext('2d'), im = g.createImageData(TILE_W, TILE_H), d = im.data;
    for (let y = 0; y < TILE_H; y++) for (let x = 0; x < TILE_W; x++) {
      if (!inDiamond(x, y, TILE_W, TILE_H)) continue;
      const i = (y * TILE_W + x) * 4; d[i] = 18; d[i + 1] = 8; d[i + 2] = 38; d[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }
  function buildStrips(fam) {
    const art = artRef.art, name = 'gnd_' + fam, nv = Math.max(1, art.frames(name)), col = SIDE[fam] || SIDE.cracker;
    if (!darkTile) buildDark();
    strips = [];
    for (let r = 0; r < PERIOD; r++) {
      const c = mk(STRIP_W, STRIP_H), g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      for (let cx = 0; cx < FIELD_CELLS_X; cx++) {
        const h = hash2(cx, r, 911), v = h < 0.46 ? 0 : 1 + Math.floor(((h - 0.46) / 0.54) * (nv - 1) * 0.999);
        const x = cx * EX.x, y = cx * EX.y;
        g.drawImage(art.get(name, v % nv), x, y);
        if (((cx >> 1) + (r >> 1)) & 1) { g.globalAlpha = 0.085; g.drawImage(darkTile, x, y); g.globalAlpha = 1; }   // soft 2x2 checker
      }
      // +x face of the floor slab (below the right-hand edge of the row)
      const ax = FIELD_CELLS_X * EX.x, ay = FIELD_CELLS_X * EX.y - EY.y, bx = ax + EY.x, by = ay + EY.y;   // edge a -> b
      g.fillStyle = col.face;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx, by + SLAB); g.lineTo(ax, ay + SLAB); g.closePath(); g.fill();
      g.fillStyle = col.dark;
      g.beginPath(); g.moveTo(ax, ay + SLAB * 0.55); g.lineTo(bx, by + SLAB * 0.55); g.lineTo(bx, by + SLAB); g.lineTo(ax, ay + SLAB); g.closePath(); g.fill();
      g.fillStyle = col.lip;
      for (let i = 0; i < EY.x; i++) g.fillRect(ax + i, Math.round(ay + (i * EY.y) / EY.x), 1, 1);                 // lit top lip
      g.fillStyle = col.dark;
      if (r % 2 === 0) g.fillRect(ax, ay + 2, 1, SLAB - 2);                                                    // panel seam
      g.fillStyle = col.rim;                                                                                    // light rim on the x = 0 edge
      for (let i = 0; i < EY.x; i++) g.fillRect(i, Math.round(-EY.y - 1 + (i * EY.y) / EY.x), 1, 1);
      strips.push(c);
    }
  }
  function ensure(fam) {
    if (ver === artRef.art.version && family === fam) return;
    ver = artRef.art.version; family = fam; buildStrips(fam);
  }
  function indexDecor(stage) {
    decorStage = stage; decorBands = new Map();
    for (const d of stage.decor || []) {
      if (!d || !Number.isFinite(d.y)) continue;
      const b = Math.floor(d.y / 128);
      let l = decorBands.get(b); if (!l) decorBands.set(b, (l = []));
      l.push(d);
    }
  }
  /** First / last ground row of a stage (the fortress floats in space: the floor has a near and a far edge). */
  function extent(stage) {
    const first = -2, last = stage.kind === 'boss' ? 1e9 : Math.ceil(((stage.length || 0) + 96) / CELL);
    return { first, last };
  }

  /** Draw floor + shadows + decor. (cdx,cdy) = integer camera offset; vox = voxel index (may be null). */
  function draw(ctx, stage, camY, cdx, cdy, t, vox) {
    if (!stage) return 0;
    const fam = stage.ground;
    if (!fam || fam === 'none') { drawSpaceGrid(ctx, camY, t); return 0; }
    ensure(SIDE[fam] ? fam : 'cracker');
    const ext = extent(stage);
    const cyA = Math.max(ext.first, Math.floor((camY - GROUND_ROWS_BEHIND) / CELL)), cyB = Math.min(ext.last, Math.floor((camY + GROUND_ROWS_AHEAD) / CELL));
    let n = 0;
    for (let cy = cyB; cy >= cyA; cy--) {
      project(0, cy * CELL, 0, 0, p);
      const X = Math.round(p.sx) + cdx, Y = Math.round(p.sy + EY.y) + cdy;
      if (X > VIEW.W + 24 || X + STRIP_W < -24 || Y > VIEW.H + 24 || Y + STRIP_H < -24) continue;
      ctx.drawImage(strips[((cy % PERIOD) + PERIOD) % PERIOD], X, Y);
      n++;
    }
    // -y face of the slab at the first row (the near edge of the fortress)
    if (cyA === ext.first) {
      const col = SIDE[family], y0 = ext.first * CELL;
      const a = project(0, y0, 0, 0), ax = Math.round(a.sx) + cdx, ay = Math.round(a.sy) + cdy;
      const bx = ax + FIELD_CELLS_X * EX.x, by = ay + FIELD_CELLS_X * EX.y;
      ctx.fillStyle = col.face;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, by + SLAB); ctx.lineTo(ax, ay + SLAB); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col.lip;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, by + 1.5); ctx.lineTo(ax, ay + 1.5); ctx.closePath(); ctx.fill();
    }
    // cast shadows of the castle (toward +x)
    if (vox && vox.shadowRows.size) {
      for (let cy = cyB; cy >= cyA; cy--) {
        const row = vox.shadowRows.get(cy);
        if (!row) continue;
        for (let cx = 0; cx < FIELD_CELLS_X; cx++) {
          if (!(row[cx] > 0)) continue;
          project(cx * CELL, cy * CELL, 0, 0, p);
          ctx.globalAlpha = row[cx];
          ctx.drawImage(darkTile, Math.round(p.sx) + cdx, Math.round(p.sy + EY.y) + cdy);
        }
      }
      ctx.globalAlpha = 1;
    }
    drawDecor(ctx, stage, camY, cdx, cdy, t);
    return n;
  }

  function drawDecor(ctx, stage, camY, cdx, cdy, t) {
    if (!stage.decor || !stage.decor.length) return;
    if (decorStage !== stage) indexDecor(stage);
    const art = artRef.art, b0 = Math.floor((camY - GROUND_ROWS_BEHIND) / 128), b1 = Math.floor((camY + GROUND_ROWS_AHEAD) / 128);
    for (let b = b0; b <= b1; b++) {
      const l = decorBands.get(b);
      if (!l) continue;
      for (let i = 0; i < l.length; i++) {
        const d = l[i], x = d.x ?? FIELD_W / 2;
        if (d.type === 'seam') {
          const a = project(0, d.y, 0, 0), ax = Math.round(a.sx) + cdx, ay = Math.round(a.sy) + cdy;
          const bx = ax + FIELD_CELLS_X * EX.x, by = ay + FIELD_CELLS_X * EX.y;
          ctx.strokeStyle = 'rgba(30,14,40,0.30)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(ax, ay + 0.5); ctx.lineTo(bx, by + 0.5); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,240,210,0.16)';
          ctx.beginPath(); ctx.moveTo(ax, ay + 1.5); ctx.lineTo(bx, by + 1.5); ctx.stroke();
          continue;
        }
        const name = 'decor_' + (d.type === 'hole' ? 'hole' : d.type === 'rune' ? 'rune' : 'crater');
        const nf = art.frames(name), hv = Math.floor(hash2(Math.round(x), Math.round(d.y), 77) * 997);
        const f = d.type === 'rune' ? Math.floor(t * 2.2 + hv) % nf : hv % nf;
        const img = art.get(name, f), w = img.width || img.w, h = img.height || img.h;
        project(x, d.y, 0, 0, p);
        const X = Math.round(p.sx - w / 2) + cdx, Y = Math.round(p.sy - h / 2) + cdy;
        if (X > VIEW.W + 8 || X + w < -8 || Y > VIEW.H + 8 || Y + h < -8) continue;
        ctx.drawImage(img, X, Y);
        if (d.type === 'rune' && art.glow) {
          const g = art.glow(name, f);
          if (g) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4 + hv); ctx.drawImage(g, X - 4, Y - 4); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        }
      }
    }
  }

  /** Space stage: no floor, just a faint holographic lane grid at z = 0 so altitude stays readable. */
  function drawSpaceGrid(ctx, camY, t) {
    const y0 = camY - GROUND_ROWS_BEHIND, y1 = camY + GROUND_ROWS_AHEAD, a = { sx: 0, sy: 0 }, b = { sx: 0, sy: 0 };
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const x = (FIELD_W * i) / 4, edge = i === 0 || i === 4;
      project(x, y0, 0, camY, a); project(x, y1, 0, camY, b);
      ctx.strokeStyle = edge ? 'rgba(130,220,255,0.26)' : 'rgba(130,200,255,0.09)';
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy + 0.5); ctx.lineTo(b.sx, b.sy + 0.5); ctx.stroke();
    }
    const step = 64, pulse = 0.07 + 0.03 * Math.sin(t * 2);
    ctx.strokeStyle = `rgba(170,150,255,${pulse.toFixed(3)})`;
    ctx.beginPath();
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      project(0, y, 0, camY, a); project(FIELD_W, y, 0, camY, b);
      ctx.moveTo(a.sx, a.sy + 0.5); ctx.lineTo(b.sx, b.sy + 0.5);
    }
    ctx.stroke();
  }
  return { draw, extent, get strips() { return strips; } };
}
