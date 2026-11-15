// Art module: castle — iso cheese cubes, ground tiles, decals. Pure & deterministic.
// Cube geometry (32x32): top diamond rows 0..15 (vertices (16,0) (0,8) (32,8) (16,16)), left face x 0..15, right face x 16..31,
// vertical edge 16px, so cubes stack at offsets (+16,+8) (+16,-8) (0,-16). Light from upper-left: top lit, left medium, right dark.
import { PixBuf, ink, ramp, shade, mix, hash2 } from './pixbuf.js';

const OUT = '#1a1420';

// ---- shared geometry (exported for the tests) ----
export function faceAt(x, y) {
  const dx = x + 0.5 - 16, dy = y + 0.5 - 8;
  if (Math.abs(dx) / 16 + Math.abs(dy) / 8 <= 1) return 'top';
  const yTop = x < 16 ? 8 + (x + 0.5) / 2 : 16 - (x + 0.5 - 16) / 2;
  const yy = y + 0.5;
  if (yy > yTop && yy <= yTop + 16) return x < 16 ? 'left' : 'right';
  return null;
}
export const topMask = (x, y) => faceAt(x, y) === 'top';
export const cubeMask = (x, y) => faceAt(x, y) !== null;

// ---- palette ----
const cheddar = ramp('#f2962b', 5, 0.5);   // dark..light
const swissR = ramp('#f3df8e', 5, 0.42);
const rindR = ramp('#8e2a3c', 5, 0.5);
const goldR = ramp('#ffcf33', 5, 0.5);
const crackR = ramp('#d9aa68', 5, 0.42);
const violet = '#2b1d45';

/** Build a cube. painter(face,u,v,x,y,ctx) → ink|null. faces: top (u,v 0..15), left/right (u 0..15, v 0..15). */
function cube(R, painter, post) {
  const p = new PixBuf(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const f = faceAt(x, y);
    if (!f) continue;
    let u, v;
    if (f === 'top') {
      const dx = x + 0.5 - 16, dy = y + 0.5 - 8;
      u = Math.max(0, Math.min(15, Math.floor(((dx / 16 + dy / 8) / 2 + 0.5) * 16)));
      v = Math.max(0, Math.min(15, Math.floor(((dx / 16 - dy / 8) / 2 + 0.5) * 16)));
    } else {
      u = f === 'left' ? x : x - 16;
      const yTop = f === 'left' ? 8 + (x + 0.5) / 2 : 16 - (x + 0.5 - 16) / 2;
      v = Math.max(0, Math.min(15, Math.floor(y + 0.5 - yTop)));
    }
    const base = f === 'top' ? R[3] : f === 'left' ? R[2] : R[1];
    p.set(x, y, painter(f, u, v, x, y, R) || base);
  }
  // face-edge ridges: lighter on the upper-left rim of the top, darker crease at the vertical corner
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!cubeMask(x, y)) continue;
    const f = faceAt(x, y);
    if (f === 'top' && (!topMask(x, y - 1) || !topMask(x - 1, y)) && x < 16) p.set(x, y, shade(p.get(x, y), 1.18));
    if ((f === 'left' && x === 15) || (f === 'right' && x === 16)) p.set(x, y, shade(p.get(x, y), 0.72));
  }
  post && post(p, R);
  // 1px outline inside the silhouette
  const edge = [];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++)
    if (cubeMask(x, y) && (!cubeMask(x - 1, y) || !cubeMask(x + 1, y) || !cubeMask(x, y - 1) || !cubeMask(x, y + 1))) edge.push([x, y]);
  for (const [x, y] of edge) p.set(x, y, OUT);
  return p;
}

// brick pattern helper: returns true on mortar
const brickMortar = (u, v, w = 8, h = 4) => v % h === h - 1 || (u + (Math.floor(v / h) % 2) * (w / 2)) % w === w - 1;

function cheddarPainter(face, u, v, x, y, R) {
  const n = hash2(x, y, 7);
  if (face === 'top') {
    if (u % 8 === 7 || v % 8 === 7) return R[2];
    return n < 0.12 ? R[4] : n > 0.9 ? R[2] : null;
  }
  const base = face === 'left' ? R[2] : R[1];
  if (brickMortar(u, v)) return face === 'left' ? R[0] : mix(R[0], violet, 0.5);
  if (v % 4 === 0) return face === 'left' ? R[3] : R[2];    // lit upper lip of each brick
  return n < 0.1 ? shade(base, 1.12) : null;
}

const cheddarBlock = () => cube(cheddar, cheddarPainter);

// holes: [u,v,w,h] per face for swiss
const HOLES = {
  top: [[3, 4, 3, 2], [10, 9, 4, 3], [11, 2, 2, 2]],
  left: [[3, 3, 4, 3], [9, 8, 4, 4], [2, 11, 2, 2]],
  right: [[2, 9, 3, 3], [8, 3, 4, 3], [12, 11, 2, 2]],
};
function swissBlock() {
  const p = cube(swissR, (face, u, v, x, y, R) => {
    for (const [hu, hv, w, h] of HOLES[face]) {
      const ex = (u + 0.5 - hu - w / 2) / (w / 2), ey = (v + 0.5 - hv - h / 2) / (h / 2);
      if (ex * ex + ey * ey <= 1.05) {
        const rim = ex + ey < -0.5;
        return rim ? mix(violet, '#8d6a3a', 0.35) : mix(violet, '#5a3a45', 0.5);
      }
      if (face !== 'top' && u >= hu && u < hu + w && v === hv + h && ex * ex + 0 < 1) return R[face === 'left' ? 4 : 3];  // lit lower lip
    }
    const n = hash2(x, y, 3);
    return n < 0.08 ? shade(face === 'top' ? R[3] : face === 'left' ? R[2] : R[1], 1.1) : null;
  });
  return p;
}

function rindBlock() {
  return cube(rindR, (face, u, v, x, y, R) => {
    if (face === 'top') return (u + v) % 7 === 0 ? R[4] : (hash2(x, y, 1) < 0.1 ? R[2] : null);
    if (v === 7 || v === 8) return v === 7 ? R[0] : face === 'left' ? R[3] : R[2];    // wax groove
    if (v === 0) return face === 'left' ? R[4] : R[3];
    if (face === 'left' && u > 3 && u < 7 && v > 1 && v < 6) return R[4];      // waxy sheen streak
    return null;
  });
}

function goldBlock() {
  const p = cube(goldR, (face, u, v, x, y, R) => {
    const d = (face === 'top' ? u + v : u + v * 1.0) % 9;
    if (face !== 'top' && d === 0) return R[face === 'left' ? 4 : 3];           // foil crinkle diagonals
    if (face !== 'top' && d === 5) return R[face === 'left' ? 1 : 0];
    if (face === 'top') return (u - v + 16) % 6 === 0 ? R[4] : null;
    return null;
  }, (b, R) => {
    b.set(7, 6, '#ffffff'); b.set(8, 7, '#fff4b0'); b.set(6, 5, '#fff4b0');       // glossy glint
    b.set(12, 5, '#ffffff'); b.set(13, 5, '#fff4b0');
  });
  p.setMat({ gloss: 0.9, spark: 0.5 });
  p.set(7, 6, ink('#ffffff', { gloss: 1, spark: 1 })); p.set(12, 5, ink('#ffffff', { gloss: 1, spark: 1 }));
  return p;
}

function crackerBlock() {
  return cube(crackR, (face, u, v, x, y, R) => {
    const n = hash2(x, y, 5);
    if (face === 'top') {
      if (u % 4 === 1 && v % 4 === 1) return R[0];
      return n < 0.1 ? R[4] : null;
    }
    if (u % 4 === 1 && v % 4 === 2) return R[0];                                // dotted holes
    if (v === 0) return face === 'left' ? R[4] : R[3];
    return n < 0.1 ? R[face === 'left' ? 3 : 2] : null;
  });
}

// ---- faces with openings (face-coordinate shapes) ----
function archShape(u, v, u0, u1, v0) {   // rect with a rounded top, in face coords
  if (u < u0 || u > u1 || v < v0) return false;
  const w = u1 - u0 + 1, c = (u0 + u1) / 2, r = w / 2;
  if (v >= v0 + Math.ceil(r)) return true;
  const dy = v0 + Math.ceil(r) - 0.5 - v;
  return Math.abs(u - c) <= Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.3;
}

function windowBlock() {
  const p = cube(cheddar, (face, u, v, x, y, R) => {
    if (face === 'left' && archShape(u, v, 4, 11, 3)) {
      if (u === 4 || v === 3 || u === 11) return R[0];
      const glow = u >= 7 && u <= 8 && v >= 9 && v <= 12;
      if (glow) return v === 9 ? '#ffffff' : v === 10 ? '#fff0a0' : '#ffd23a';
      return mix(violet, '#4a2f66', (v - 3) / 14);
    }
    if (face === 'left' && ((u >= 3 && u <= 12 && v === 15) || (u >= 3 && u <= 12 && v === 14))) return null;
    return cheddarPainter(face, u, v, x, y, R);
  });
  // candle flame: emissive
  for (const [x, y] of [[7, 0], [8, 0]]) void x, y;
  return p;
}

function mouseholeBlock() {
  return cube(cheddar, (face, u, v, x, y, R) => {
    if (face === 'left' && archShape(u, v, 4, 11, 5)) {
      if (u === 4 || v === 5 || u === 11) return R[0];
      return v > 13 ? mix(violet, '#7a5a30', 0.5) : mix('#120b1c', violet, (v - 5) / 14);
    }
    if (face === 'left' && v <= 3 && v >= 1 && u >= 4 && u <= 11) {              // whisker-tuft sign
      if (v === 1 || v === 3) return mix(R[4], '#fff3c0', 0.5);
      return u === 7 || u === 8 ? '#fff3c0' : R[3];
    }
    return cheddarPainter(face, u, v, x, y, R);
  });
}

function crownBlock() {
  const cr = ramp('#f7b34a', 5, 0.5);
  const p = cube(cr, (face, u, v, x, y, R) => {
    if (face === 'top') {
      const dx = x + 0.5 - 16, dy = y + 0.5 - 8;
      if (Math.abs(dx) / 16 + Math.abs(dy) / 8 < 0.56) return mix(R[0], violet, 0.5 + 0.1 * (dy > 0 ? 1 : 0));   // sunken courtyard
      return u % 8 === 7 || v % 8 === 7 ? R[2] : null;
    }
    return cheddarPainter(face, u, v, x, y, cr);
  }, (b, R) => {
    const merlon = (cx, cy) => {      // mini cube, top diamond 9x5
      b.poly([[cx, cy - 3], [cx + 5, cy], [cx, cy + 3], [cx - 5, cy]], R[4]);
      b.poly([[cx - 5, cy], [cx, cy + 3], [cx, cy + 7], [cx - 5, cy + 4]], R[2]);
      b.poly([[cx, cy + 3], [cx + 5, cy], [cx + 5, cy + 4], [cx, cy + 7]], R[1]);
      b.line(cx - 5, cy, cx, cy - 3, OUT); b.line(cx, cy - 3, cx + 5, cy, OUT);
      b.line(cx - 5, cy, cx - 5, cy + 4, OUT); b.line(cx + 5, cy, cx + 5, cy + 4, OUT);
      b.line(cx - 5, cy + 4, cx, cy + 7, OUT); b.line(cx, cy + 7, cx + 5, cy + 4, OUT);
      b.set(cx - 1, cy, R[4]); b.set(cx, cy - 1, '#fff0b0');                      // wedge-bite notch
      b.set(cx + 1, cy + 1, R[0]);
    };
    merlon(16, 5); merlon(7, 8); merlon(25, 8); merlon(16, 11);
  });
  return p;
}

function flagBlock() {
  const p = cube(cheddar, cheddarPainter, (b, R) => {
    // pole from the top-face centre
    for (let y = 0; y <= 9; y++) { b.set(15, y, '#d9d2e0'); b.set(16, y, '#8f84a8'); }
    b.set(15, 0, '#ffffff');
    // pennant (red) with white disc + black cheese wedge
    const red = ramp('#e0303c', 4, 0.45);
    for (let x = 17; x <= 29; x++) {
      const tail = x >= 27 ? x - 26 : 0;                                          // swallow-tail notch
      for (let y = 0; y <= 7; y++) {
        const edge = y === 0 || y === 7 || x === 29 - (tail && y > 2 && y < 5 ? 1 : 0) || x === 17;
        if (tail && y >= 3 && y <= 4 && x >= 29 - 1) continue;
        b.set(x, y, edge ? OUT : y <= 2 ? red[3] : y >= 5 ? red[1] : red[2]);
      }
    }
    b.circle(22, 4, 2, '#ffffff'); b.set(20, 4, '#ffffff'); b.set(24, 4, '#ffffff');
    b.poly([[20.5, 5.5], [23.5, 3.5], [23.5, 5.5]], OUT);                        // black cheese wedge
    b.set(22, 3, '#ffffff');
  });
  return p;
}

// ---- ground tiles (32x16, fully opaque, periodic on the iso lattice) ----
// Pixels outside the diamond hold the colour of the lattice-equivalent pixel inside it, so painting a neighbour first or last is
// identical; the rim of the diamond is variant-independent so ANY variant tiles against ANY variant.
function canon(x, y) {
  for (const [sx, sy] of [[0, 0], [16, 8], [16, -8], [-16, 8], [-16, -8]]) {
    const cx = x + sx, cy = y + sy;
    if (cx >= 0 && cx < 32 && cy >= 0 && cy < 16 && Math.abs(cx + 0.5 - 16) / 16 + Math.abs(cy + 0.5 - 8) / 8 <= 1) return [cx, cy];
  }
  return [x, y];
}
function groundTile(variant, colorFn) {
  const p = new PixBuf(32, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    const [cx, cy] = canon(x, y);
    const dx = cx + 0.5 - 16, dy = cy + 0.5 - 8;
    const a = (dx / 16 + dy / 8) / 2, b = (dx / 16 - dy / 8) / 2;
    const m = Math.max(Math.abs(a), Math.abs(b)) * 2;           // 0 centre .. 1 edge
    p.set(x, y, colorFn({ x: cx, y: cy, a, b, core: m < 0.72, m, variant }));
  }
  return p;
}
const four = (fn) => [0, 1, 2, 3].map((v) => groundTile(v, (c) => fn(c)));

function crackerTiles() {
  const R = crackR;
  return four((c) => {
    const n = hash2(c.x, c.y, 11);
    let col = n < 0.12 ? R[3] : n > 0.93 ? R[1] : R[2];
    if (c.m > 0.9) col = shade(col, 0.96);
    if (!c.core) return col;
    const q = hash2(c.x, c.y, 100 + c.variant);
    if (c.variant === 0 && c.x % 5 === 2 && c.y % 4 === 1) return R[1];            // docked pin holes
    if (c.variant === 1 && Math.abs(c.x - 16 - (c.y - 8) * 1.5) < 0.9 && c.y > 3 && c.y < 13) return R[0];   // crack
    if (c.variant === 2 && q < 0.07) return R[4];                              // crumbs
    if (c.variant === 3 && ((c.x - 10) % 6 === 0 || (c.x - 13) % 7 === 0) && c.y % 3 === 0) return R[0];
    return col;
  });
}

function goudaTiles() {
  const Y = ramp('#f1c23c', 5, 0.4), Rd = ramp('#b8322f', 4, 0.4);
  return four((c) => {
    const n = hash2(c.x, c.y, 21);
    let col = n < 0.1 ? Y[3] : n > 0.9 ? Y[1] : Y[2];
    if (hash2(c.x >> 1, c.y, 22) < 0.07) col = Rd[2];                            // red wax flecks
    if (!c.core) return col;
    const crater = (ox, oy, rx, ry) => {
      const d = ((c.x + 0.5 - ox) / rx) ** 2 + ((c.y + 0.5 - oy) / ry) ** 2;
      if (d < 0.55) return Y[0];
      if (d < 1) return (c.x + 0.5 - ox) / rx + (c.y + 0.5 - oy) / ry < 0 ? Y[0] : Y[4];       // shadow upper-left rim, lit lower-right lip
      return null;
    };
    const v = c.variant;
    const s = v === 0 ? crater(13, 7, 5, 2.4) : v === 1 ? crater(19, 9, 4, 2) : v === 2 ? (crater(11, 8, 3, 1.6) || crater(21, 6, 3.4, 1.7)) : null;
    if (s) return s;
    if (v === 3 && hash2(c.x, c.y, 200) < 0.1) return Rd[1];
    return col;
  });
}

function keepTiles() {
  const D1 = ramp('#5a3f8a', 4, 0.3), D2 = ramp('#241838', 4, 0.3), G = ramp('#e6b23a', 4, 0.4);
  return four((c) => {
    const q = (c.a < 0) !== (c.b < 0);
    const set = q ? D1 : D2;
    let col = hash2(c.x, c.y, 31) < 0.12 ? set[2] : set[1];
    if (c.m > 0.97) col = D2[0];                                                  // dark grout on tile border
    else if (Math.abs(c.a) < 0.02 || Math.abs(c.b) < 0.02) col = mix(col, G[1], 0.4);   // gold seam between quadrants
    if (!c.core) return col;
    const dx = c.x + 0.5 - 16, dy = c.y + 0.5 - 8, v = c.variant;
    if (v === 1 && Math.abs(dx) / 5 + Math.abs(dy) / 2.5 < 1) return Math.abs(dx) / 5 + Math.abs(dy) / 2.5 < 0.5 ? G[3] : G[1];   // gold inlay
    if (v === 2 && ((c.x === 11 && c.y === 5) || (c.x === 22 && c.y === 10) || (c.x === 20 && c.y === 4))) return G[2];
    if (v === 3 && Math.abs(dx - dy * 2 + 2) < 0.8 && c.y > 3 && c.y < 12) return D2[0];
    return col;
  });
}

// ---- decals (transparent outside) ----
function craterDecal(i) {
  const p = new PixBuf(32, 16), W = [28, 22, 15][i], H = [12, 10, 7][i], cx = 16, cy = 8;
  const Y = ramp('#e8b53a', 5, 0.45);
  p.ellipse(cx, cy, W / 2, H / 2, Y[3]);
  p.ellipse(cx + 0.5, cy + 1, W / 2 - 3, H / 2 - 1.5, Y[0]);
  p.ellipse(cx + 1, cy + 1.5, W / 2 - 5, H / 2 - 2.5, '#120b1c');
  // lit lower-right lip, rim highlight upper-left
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    const d = ((x + 0.5 - cx) / (W / 2)) ** 2 + ((y + 0.5 - cy) / (H / 2)) ** 2;
    if (d > 0.7 && d <= 1 && p.has(x, y) && (x - cx) / W + (y - cy) / H > 0.18) p.set(x, y, Y[4]);
  }
  p.outline(OUT);
  // soften: remove outline corner stubs outside lattice not needed
  return p;
}
function holeDecal(i) {
  const p = new PixBuf(24, 12);
  p.ellipse(12, 6, 10.5, 5, '#6b3a2c');
  p.ellipse(12, 6.5, 9, 4, '#120b1c');
  p.ellipse(12, 5.5, 7, 2.6, '#06030a');
  p.hline(5, 3, 3, '#a8643a'); p.hline(15, 9, 4, '#e8a85a');                      // lit rim
  if (i === 1) { p.set(10, 6, '#ffffff'); p.set(14, 6, '#ffffff'); p.set(10, 5, '#ffe14a'); p.set(14, 5, '#ffe14a'); p.hline(6, 7, 2, '#8d7aa8'); p.hline(16, 7, 2, '#8d7aa8'); }
  p.outline(OUT);
  return p;
}
function runeDecal(i) {
  const p = new PixBuf(32, 16), G = ramp('#ffd23a', 5, 0.45), glow = i === 1 ? 1 : 0.7;
  p.poly([[16, 1], [30, 8], [16, 15], [2, 8]], '#2a1d44');
  p.poly([[16, 2], [27, 8], [16, 14], [5, 8]], '#3b2a5c');
  const wedge = [[11, 10], [21, 7], [21, 10]];                                      // cheese-wedge sigil
  p.poly(wedge, G[i === 1 ? 4 : 3]);
  p.set(18, 8, '#2a1d44'); p.set(15, 9, '#2a1d44'); p.set(13, 10, '#2a1d44');
  p.line(11, 11, 21, 11, G[2]);
  p.line(16, 4, 16, 6, G[3]); p.set(16, 3, G[4]);
  for (const [x, y] of [[6, 8], [26, 8], [11, 5], [21, 11]]) p.set(x, y, G[i === 1 ? 4 : 2]);
  p.outline(OUT);
  p.setMat({ emit: glow, spark: 0.4 }, 4, 3, 24, 10);
  return p;
}

export function build() {
  const out = {
    blk_cheddar: cheddarBlock(),
    blk_swiss: swissBlock(),
    blk_crown: crownBlock(),
    blk_window: windowBlock(),
    blk_mousehole: mouseholeBlock(),
    blk_rind: rindBlock(),
    blk_flag: flagBlock(),
    blk_gold: goldBlock(),
    blk_cracker: crackerBlock(),
    gnd_cracker: crackerTiles(),
    gnd_gouda: goudaTiles(),
    gnd_keep: keepTiles(),
    decor_crater: [0, 1, 2].map(craterDecal),
    decor_hole: [0, 1].map(holeDecal),
    decor_rune: [0, 1].map(runeDecal),
  };
  // window candle glows
  out.blk_window.setMat({ emit: 0.9 }, 7, 9, 2, 4);
  return out;
}
