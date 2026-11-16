// Art module `boss` (owner: art-boss): BIG BOSS JESSE, the homing spray-cheese can missile and the HUD/intro bust.
// Jesse is a giant rat who is, unmistakably, a grey dilute tortie cat: soft blue-grey coat with cream and apricot
// patches, a dramatic dark-grey / cream split face, amber eyes, small round ears, a long tortie tail ending in a
// pink rat tip, buck teeth, a tilted cheese crown and a red sash with the rat emblem. He lounges on a cheese throne
// bolted to a stomping two-legged walker with missile pods.
// Pure & deterministic (hash2 only). Every part is drawn into its own layer, outlined in #1a1420 and composited
// back-to-front, so parts keep crisp internal outlines and stay readable at 1x.
import { PixBuf, ink, hash2, mix } from './pixbuf.js';

const OUT = '#1a1420';

// ---------- palette (dark -> light; light from upper-left, violet-shifted shadows) ----------
const P = {
  grey:   ['#3c3a5c', '#5e6688', '#8893b2', '#b6c0d8'],   // soft blue-grey (dilute black)
  dgrey:  ['#26243c', '#3a3c58', '#535a78', '#6f7896'],   // dark half of the split face
  cream:  ['#8a6a80', '#d0ac98', '#f0d8b6', '#fff4de'],   // dilute red, pale
  apri:   ['#7a3a4a', '#c46a4e', '#e8975e', '#ffc68c'],   // apricot patches
  pink:   ['#6a2850', '#b85a7a', '#ec98a8', '#ffcad2'],
  amber:  ['#6a3010', '#c07018', '#f0a830', '#ffe27a'],
  cheese: ['#c05a22', '#f2962b', '#ffd23a', '#fff1a0'],
  rind:   ['#5a1a30', '#8e2a3c', '#c0404a', '#e86a5a'],
  steel:  ['#2e2a44', '#4e4c6c', '#7c7c9c', '#b4b6cc'],
  vio:    ['#2a1a34', '#3a2040', '#5a2f55', '#7e4a74'],
  gold:   ['#7a4a1a', '#c8862a', '#ffcf33', '#fff6b0'],
  red:    ['#5a1428', '#8e1a3a', '#d8303f', '#ff6a5a'],
};
const WHITE = '#fffbe8';
const E = (c, emit = 1, gloss = 0.1, spark = 0) => ink(c, { emit, gloss, spark });
const G = (c, gloss = 0.5, spark = 0) => ink(c, { gloss, spark });
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---------- drawing helpers ----------
/** Tone index 0..3 from a light value. */
const tone = (l) => (l > 0.5 ? 3 : l > 0.08 ? 2 : l > -0.4 ? 1 : 0);

/** Ellipse filled with a lit 4-tone ramp. pal: array or (x,y)=>array. grain adds fur texture. */
function shEll(pb, cx, cy, rx, ry, pal, { grain = 0.1, seed = 1, mat = null, bias = 0 } = {}) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, d = u * u + v * v;
      if (d > 1) continue;
      let l = -(u * 0.6 + v * 0.8) * 0.75 + (1 - d) * 0.45 - 0.1 + bias;
      l += (hash2(x, y >> 1, seed) - 0.5) * grain * 2;
      const pp = typeof pal === 'function' ? pal(x, y) : pal;
      const c = pp[tone(l)];
      pb.set(x, y, mat ? ink(c, mat) : c);
    }
  return pb;
}
/** Lit rectangle (box-ish shading: top/left light, bottom/right dark). */
function shRect(pb, x, y, w, h, pal, mat = null) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const u = (i + 0.5) / w * 2 - 1, v = (j + 0.5) / h * 2 - 1;
    const l = -(u * 0.5 + v * 0.7) * 0.8 + 0.05;
    const c = pal[tone(l)];
    pb.set(x + i, y + j, mat ? ink(c, mat) : c);
  }
  return pb;
}
/** Thick tapered stroke through points (circles along the path). colFn(t, x, y) → ink. */
function stroke(pb, pts, r0, r1, colFn) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(L); total += L; }
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = segs[i - 1], n = Math.max(1, Math.ceil(L * 2));
    for (let k = 0; k <= n; k++) {
      const s = k / n, t = (acc + s * L) / total, r = r0 + (r1 - r0) * t;
      const cx = x0 + (x1 - x0) * s, cy = y0 + (y1 - y0) * s;
      for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
        for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= r * r + 0.15) pb.set(x, y, colFn(t, x, y, dx / (r || 1), dy / (r || 1)));
        }
    }
    acc += L;
  }
  return pb;
}
/** Draw `fn(layer)` into a fresh layer, outline it, composite onto pb. */
function layer(pb, fn, { outline = true, diagonal = false } = {}) {
  const L = new PixBuf(pb.w, pb.h);
  fn(L);
  if (outline) L.outline(OUT, { diagonal });
  return pb.blit(L);
}
/** Tortie patch test with organic (hashed) edges. */
function inBlob(x, y, bx, by, r, seed) {
  const d = Math.hypot(x + 0.5 - bx, (y + 0.5 - by) * 1.15);
  return d < r + (hash2(x >> 1, y >> 1, seed) - 0.5) * 2.6;
}
function coatPal(x, y, blobs) {
  for (const [bx, by, r, k] of blobs) if (inBlob(x, y, bx, by, r, 77 + bx)) return P[k];
  return P.grey;
}

// ======================================================================================
// HEAD (shared by the walker sprite and the bust). s = scale (1 → head 38px wide).
// expr: { eyes: 'lid'|'closed'|'glow'|'angry'|'x'|'spiral'|'wide', mouth: 'smug'|'laugh'|'snarl'|'ouch'|'open'|'dizzy',
//         brows: bool, tint: 0..1 white flash, blush: bool }
// ======================================================================================
function drawHead(pb, cx, cy, s, expr) {
  const R = (v) => Math.round(v * s);
  const split = (x) => (x + 0.5 < cx ? P.dgrey : P.cream);
  const facePal = (x, y) => {
    if (x + 0.5 >= cx && inBlob(x, y, cx + R(11), cy - R(9), 6.5 * s, 31)) return P.apri;     // apricot blotch on the cream side
    if (x + 0.5 >= cx && inBlob(x, y, cx + R(17), cy + R(4), 3.5 * s, 32)) return P.apri;
    if (x + 0.5 < cx && inBlob(x, y, cx - R(16), cy + R(5), 3 * s, 33)) return P.apri;         // a fleck on the dark side
    if (x + 0.5 < cx && inBlob(x, y, cx - R(9), cy - R(12), 3.2 * s, 34)) return P.grey;
    return split(x);
  };
  // ears: small and round (rat-round, cat-placed). left dark grey, right apricot.
  layer(pb, (L) => {
    shEll(L, cx - R(14), cy - R(12), 5.5 * s, 5.5 * s, P.dgrey, { seed: 3 });
    shEll(L, cx + R(14), cy - R(12), 5.5 * s, 5.5 * s, P.apri, { seed: 4 });
    L.ellipse(cx - R(14), cy - R(12) + 0.5, 3 * s, 3 * s, P.pink[1]);
    L.ellipse(cx + R(14), cy - R(12) + 0.5, 3 * s, 3 * s, P.pink[1]);
    L.ellipse(cx - R(14) + 0.5, cy - R(11), 1.8 * s, 1.8 * s, P.pink[2]);
    L.ellipse(cx + R(14) + 0.5, cy - R(11), 1.8 * s, 1.8 * s, P.pink[2]);
  });
  // skull + fat imperious cheeks
  layer(pb, (L) => {
    shEll(L, cx, cy - 1, 19 * s, 15 * s, facePal, { seed: 5, grain: 0.12 });
    shEll(L, cx, cy + R(5), 21.5 * s, 9.5 * s, facePal, { seed: 6, grain: 0.12, bias: -0.08 });
    // cheek fluff tufts
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
      const tx = cx + sx * (R(21) + 1), ty = cy + R(2) + k * R(3);
      L.set(tx, ty, (sx < 0 ? P.dgrey : P.cream)[1]);
      L.set(tx + sx, ty + 1, (sx < 0 ? P.dgrey : P.cream)[0]);
    }
    // split blaze: thin cream/dark seam down the middle, a touch of contrast
    for (let y = cy - R(14); y < cy + R(4); y++) if (L.has(cx, y)) L.set(cx, y, P.cream[2]);
    // muzzle puffs (pale on both sides so the mouth reads), chin
    shEll(L, cx - R(4) - 0.5, cy + R(7), 5 * s, 3.8 * s, x0 => P.cream, { seed: 7, grain: 0.04, bias: 0.25 });
    shEll(L, cx + R(4) + 0.5, cy + R(7), 5 * s, 3.8 * s, P.cream, { seed: 8, grain: 0.04, bias: 0.25 });
    shEll(L, cx, cy + R(11), 4 * s, 2.5 * s, P.cream, { seed: 9, grain: 0.03 });
  });
  // left muzzle puff is greyish-cream (dilute blend)
  // ---------- eyes ----------
  const ew = Math.max(5, R(7)), eh = Math.max(4, R(6));
  for (const side of [-1, 1]) {
    const ex = cx + side * R(8) - (side < 0 ? ew : 0) + (side < 0 ? 1 : 0), ey = cy - R(2);
    drawEye(pb, ex, ey, ew, eh, side, s, expr);
  }
  // brows (angry) — heavy dark wedges slanting to the nose
  if (expr.brows) for (const side of [-1, 1]) {
    const x0 = cx + side * R(14), x1 = cx + side * R(4), y0 = cy - R(8), y1 = cy - R(4);
    for (let t = 0; t <= 1; t += 0.08) {
      const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t);
      pb.set(x, y, OUT); pb.set(x, y - 1, OUT); if (s > 1.1) pb.set(x, y + 1, OUT);
    }
  }
  // ---------- nose (pink, slightly rat-long) ----------
  const ny = cy + R(4);
  pb.hline(cx - R(2) - 1, ny - 1, R(4) + 2, OUT);
  pb.hline(cx - R(2), ny, R(4) + 1, P.pink[2]); pb.set(cx - R(2), ny, P.pink[3]);
  pb.hline(cx - R(1), ny + 1, R(2) + 1, P.pink[1]);
  pb.set(cx - R(2) - 1, ny, OUT); pb.set(cx + R(2) + 1, ny, OUT); pb.set(cx - R(1) - 1, ny + 1, OUT); pb.set(cx + R(1) + 1, ny + 1, OUT);
  pb.set(cx, ny + 2, OUT);
  // ---------- mouth ----------
  drawMouth(pb, cx, ny + 3, s, expr.mouth);
  // ---------- whiskers (no outline, drawn last) ----------
  const wc = expr.mouth === 'dizzy' ? P.cream[1] : P.cream[2];
  for (const side of [-1, 1]) for (let k = 0; k < 2; k++) {
    const x0 = cx + side * R(13), y0 = cy + R(6) + k * Math.max(2, R(3));
    const droop = expr.mouth === 'dizzy' ? 3 + k * 2 : k * 2 - 1;
    pb.line(x0, y0, x0 + side * R(11), y0 + Math.round(droop * s), wc);
  }
  // white hurt flash
  if (expr.tint) pb.map((x, y, p) => (p.a < 128 || Math.abs(x - cx) > 26 * s || Math.abs(y - cy) > 20 * s ? undefined : mix(p, WHITE, expr.tint)));
}

function drawEye(pb, ex, ey, w, h, side, s, expr) {
  const m = expr.eyes, cxe = ex + w / 2, cye = ey + h / 2;
  if (m === 'closed') {              // smug ^ ^
    for (let i = 0; i < w; i++) { const y = ey + h / 2 - Math.round((1 - Math.abs((i + 0.5) / w * 2 - 1)) * 2.2); pb.set(ex + i, Math.round(y), OUT); pb.set(ex + i, Math.round(y) + 1, OUT); }
    return;
  }
  if (m === 'x') {
    for (let i = 0; i < Math.min(w, h + 1); i++) { pb.set(ex + i, ey + i, OUT); pb.set(ex + i + 1, ey + i, OUT); pb.set(ex + w - 1 - i, ey + i, OUT); pb.set(ex + w - 2 - i, ey + i, OUT); }
    return;
  }
  // socket + iris
  pb.ellipse(cxe, cye, w / 2 + 1, h / 2 + 1, OUT);
  const glow = m === 'glow' || m === 'angry';
  for (let y = ey; y < ey + h; y++) for (let x = ex; x < ex + w; x++) {
    const u = (x + 0.5 - cxe) / (w / 2), v = (y + 0.5 - cye) / (h / 2);
    if (u * u + v * v > 1.05) continue;
    const t = v < -0.3 ? 1 : v < 0.35 ? 2 : 3;          // lower iris brighter (light catches the bottom of a cat eye)
    let c = P.amber[t];
    if (m === 'angry') c = mix(c, P.red[2], 0.45);
    pb.set(x, y, glow ? E(c, m === 'glow' ? 1 : 0.7) : ink(c, { emit: 0.25, gloss: 0.6 }));
  }
  if (m === 'spiral') {
    pb.ellipse(cxe, cye, w / 2, h / 2, P.amber[2]);
    pb.ring(cxe, cye, w / 2 - 0.5, h / 2 - 0.5, OUT); pb.set(Math.floor(cxe), Math.floor(cye), OUT);
    pb.set(Math.floor(cxe) + 1, Math.floor(cye) - 1, OUT);
    return;
  }
  // slit pupil (narrower when glowing, round when shocked)
  const px = Math.floor(cxe) - (side > 0 ? 0 : 0);
  if (m === 'wide') pb.ellipse(cxe, cye, Math.max(1, w / 4), h / 2 - 0.5, OUT);
  else {
    const pw = glow ? 1 : Math.max(1, Math.round(1.4 * s));
    pb.rect(px - (pw > 1 ? 1 : 0), ey, pw, h, OUT);
  }
  // catchlight upper-left
  pb.set(ex + 1, ey + 1, E(WHITE, 0.6)); if (s > 1.1) pb.set(ex + 2, ey + 1, E(WHITE, 0.5));
  // eyelids
  const furTop = side < 0 ? P.dgrey : P.cream;
  if (m === 'lid' || m === 'angry' || m === 'glow') {
    // imperious half-lid: flat top lid; angry/glow: slanted toward the nose
    for (let i = -1; i <= w; i++) {
      const tIn = side < 0 ? (i + 1) / (w + 1) : 1 - (i + 1) / (w + 1);     // 1 at the inner (nose) corner
      let rows = m === 'lid' ? Math.round(h * 0.4) : Math.round(h * (0.12 + 0.5 * tIn));
      rows = clamp(rows, 0, h - 1);
      for (let j = -1; j < rows; j++) pb.set(ex + i, ey + j, furTop[1]);
      pb.set(ex + i, ey + rows, OUT);
    }
  }
}

function drawMouth(pb, cx, my, s, mode) {
  const R = (v) => Math.round(v * s);
  const tooth = (x, y, h) => { pb.rect(x, y, 2, h, G(WHITE, 0.6)); pb.set(x + 1, y + h - 1, P.cream[1]); };
  if (mode === 'smug' || mode === 'dizzy') {
    // ω mouth with the corners turned up, plus two rat buck teeth peeking out
    for (const side of [-1, 1]) for (let i = 1; i <= R(4); i++) {
      const y = my + (i < R(2) + 1 ? 1 : 0) - (i > R(3) ? 1 : 0) + (mode === 'dizzy' ? (i > R(2) ? 1 : 0) : 0);
      pb.set(cx + side * i, y, OUT);
    }
    pb.set(cx, my, OUT);
    tooth(cx - 2, my + 1, R(2) + 1); pb.vline(cx, my + 1, R(2) + 1, OUT); tooth(cx + 1, my + 1, R(2) + 1);
    pb.hline(cx - 2, my + R(2) + 2, 5, OUT);
    if (mode === 'dizzy') pb.set(cx + R(3), my + R(3), P.pink[2]);       // tongue loll
    return;
  }
  const w = mode === 'ouch' ? R(3) : mode === 'open' ? R(4) : R(6), h = mode === 'ouch' ? R(3) : mode === 'laugh' ? R(6) : R(5);
  pb.ellipse(cx + 0.5, my + h / 2, w + 1, h / 2 + 1, OUT);
  pb.ellipse(cx + 0.5, my + h / 2, w, h / 2, P.vio[1]);
  if (mode !== 'ouch') pb.ellipse(cx + 0.5, my + h - 1.5, w * 0.6, 1.6 * s, P.pink[2]);      // tongue
  if (mode === 'laugh' || mode === 'open') { tooth(cx - 2, my, R(2) + 1); tooth(cx + 1, my, R(2) + 1); pb.vline(cx, my, R(2) + 1, OUT); }
  if (mode === 'snarl') {
    tooth(cx - 2, my, R(2)); tooth(cx + 1, my, R(2)); pb.vline(cx, my, R(2), OUT);
    for (const side of [-1, 1]) { const fx = cx + side * (w - 1) - (side < 0 ? 0 : 1); pb.vline(fx, my, R(3), G(WHITE, 0.6)); pb.vline(fx + (side < 0 ? 1 : 0) - (side < 0 ? 0 : 0), my + R(2), 1, P.cream[1]); }
  }
}

// ---------- crown: chunky cheese-gold, red gem, tilted ----------
function drawCrown(pb, x, y, tilt = 1, s = 1) {
  const R = (v) => Math.round(v * s);
  layer(pb, (L) => {
    const w = R(14), h = R(5);
    for (let i = 0; i < w; i++) {
      const dy = Math.round((i / w) * 2 * tilt);
      for (let j = 0; j < h; j++) L.set(x + i, y + j - dy, G(P.gold[j < 1 ? 3 : j < h - 1 ? 2 : 1], 0.7, 0.4));
    }
    for (let k = 0; k < 3; k++) {          // three points
      const px = x + R(1) + k * R(5), dy = Math.round(((px - x) / w) * 2 * tilt);
      L.poly([[px, y - dy], [px + R(2), y - dy - R(5)], [px + R(4), y - dy]], G(P.gold[2], 0.8, 0.5));
      L.set(px + R(2), y - dy - R(5), G(P.gold[3], 0.9, 1));
    }
    const gx = x + Math.floor(w / 2) - 1, gy = y + 1 - Math.round(tilt);
    L.rect(gx, gy, 2, 2, G(P.red[2], 0.9, 0.8)); L.set(gx, gy, G(P.red[3], 1, 1));
    L.set(x + R(3), y + h - 2 - Math.round(0.4 * tilt), P.gold[0]);  // cheese holes
    L.set(x + w - R(3), y + h - 2 - Math.round(1.6 * tilt), P.gold[0]);
  });
}

// ---------- the rat emblem: black cheese wedge in a white disc on red ----------
function emblem(pb, cx, cy, r = 3) {
  pb.circle(cx, cy, r + 1, P.red[2]);
  pb.circle(cx, cy, r, WHITE);
  const k = r / 3;
  pb.poly([[cx - 2 * k, cy + 1.5 * k], [cx + 2.2 * k, cy + 1.5 * k], [cx + 2.2 * k, cy - 1.6 * k]], OUT);
}

// ======================================================================================
// JESSE 112x120: frames 0 idle, 1 idle2, 2 taunt, 3 charge/glow, 4 fire, 5 hurt, 6 enraged, 7 defeated
// ======================================================================================
const POSES = [
  { bob: 0, eyes: 'lid', mouth: 'smug', legs: 0, tail: 0, pod: 0 },
  { bob: 1, eyes: 'lid', mouth: 'smug', legs: 1, tail: 1, pod: 0 },
  { bob: 0, eyes: 'closed', mouth: 'laugh', legs: 0, tail: 2, pod: 0, paw: 'up', crownTilt: 2 },
  { bob: 0, eyes: 'glow', mouth: 'open', legs: 0, tail: 0, pod: 0.75, brows: true },
  { bob: -1, eyes: 'glow', mouth: 'snarl', legs: 2, tail: 1, pod: 1, brows: true, fire: true, paw: 'point' },
  { bob: 1, eyes: 'x', mouth: 'ouch', legs: 2, tail: 3, pod: 0, tint: 0.38, crownDy: -4, sweat: true },
  { bob: 0, eyes: 'angry', mouth: 'snarl', legs: 1, tail: 3, pod: 0.5, brows: true, steam: true, bristle: true },
  { bob: 4, eyes: 'spiral', mouth: 'dizzy', legs: 3, tail: 4, pod: 0, crownOff: true, smoke: true, slump: 3 },
];

const COAT_BLOBS = [[46, 50, 6.5, 'apri'], [68, 47, 7.5, 'cream'], [72, 64, 6, 'apri'], [42, 66, 5, 'cream'], [58, 70, 4, 'apri']];

function jesse(f) {
  const pb = new PixBuf(112, 120);
  const p = POSES[f], b = p.bob, sl = p.slump || 0;
  const CX = 56;

  // ---------- tail (behind everything): long tortie tail sweeping out left, curling up, pink rat tip ----------
  const tailSets = [
    [[30, 92], [16, 100], [7, 96], [5, 84], [10, 74], [8, 66]],
    [[30, 92], [16, 101], [6, 98], [4, 86], [7, 76], [3, 69]],
    [[30, 92], [15, 99], [6, 92], [7, 79], [14, 72], [16, 64]],
    [[30, 92], [17, 98], [8, 90], [6, 78], [4, 70], [6, 62]],
    [[30, 94], [17, 104], [7, 108], [3, 112], [8, 116], [14, 115]],
  ];
  layer(pb, (L) => stroke(L, tailSets[p.tail], 4.2, 1.2, (t, x, y, nx, ny) => {
    if (t > 0.86) return P.pink[ny < -0.2 || nx < -0.4 ? 3 : 2];       // naked rat tip
    const band = Math.floor(t * 9) % 3, pal = band === 1 ? P.apri : band === 2 && t > 0.3 ? P.cream : P.grey;
    const l = -(nx * 0.6 + ny * 0.8) * 0.8 + 0.1 + (hash2(x, y, 9) - 0.5) * 0.2;
    return pal[tone(l)];
  }));

  // ---------- walker legs ----------
  const legPose = [
    { lk: [34, 104], lf: [28, 114], rk: [78, 104], rf: [84, 114] },
    { lk: [33, 105], lf: [28, 115], rk: [79, 103], rf: [84, 113] },
    { lk: [35, 105], lf: [27, 115], rk: [77, 105], rf: [85, 115] },
    { lk: [31, 108], lf: [22, 115], rk: [80, 104], rf: [86, 114] },
  ][p.legs];
  for (const side of ['l', 'r']) {
    const hip = side === 'l' ? [42, 94 + b] : [70, 94 + b], knee = legPose[side + 'k'], foot = legPose[side + 'f'];
    layer(pb, (L) => {
      stroke(L, [hip, knee], 4.5, 3.5, (t, x, y, nx, ny) => G(P.steel[tone(-(nx * 0.6 + ny * 0.8) * 0.9 + 0.1)], 0.6));
      stroke(L, [knee, [foot[0], foot[1] - 2]], 3.2, 2.6, (t, x, y, nx, ny) => G(P.steel[tone(-(nx * 0.6 + ny * 0.8) * 0.9)], 0.6));
      // knee joint: cheese-yellow cap
      shEll(L, knee[0], knee[1], 3.6, 3.6, P.cheese, { grain: 0, mat: { gloss: 0.3 } });
      L.set(knee[0] - 1, knee[1] - 1, G(P.cheese[3], 0.5, 0.6));
    });
    // foot: a fat cheese-wedge sole with rind toes
    layer(pb, (L) => {
      const fx = foot[0], fy = foot[1];
      L.poly([[fx - 8, fy + 4], [fx + 8, fy + 4], [fx + 6, fy - 2], [fx - 5, fy - 3]], P.cheese[2]);
      L.hline(fx - 5, fy - 2, 10, P.cheese[3]);
      L.rect(fx - 8, fy + 3, 17, 2, P.rind[1]);
      L.set(fx - 3, fy, P.cheese[0]); L.set(fx + 3, fy + 1, P.cheese[0]); L.set(fx + 1, fy - 1, P.cheese[1]);
      for (let k = 0; k < 3; k++) L.set(fx - 6 + k * 6, fy + 3, P.rind[2]);
    });
  }

  // ---------- walker hull (under the seat) ----------
  layer(pb, (L) => {
    L.poly([[26, 84 + b], [86, 84 + b], [80, 100 + b], [32, 100 + b]], P.steel[1]);
    shRect(L, 28, 85 + b, 56, 6, P.steel, { gloss: 0.6 });
    L.hline(30, 85 + b, 52, P.steel[3]);
    L.hline(32, 96 + b, 48, P.vio[1]);
    for (let k = 0; k < 6; k++) L.set(33 + k * 9, 88 + b, G(P.steel[3], 0.8, 0.6));      // rivets
    // grille vents (hot glow while charging)
    for (let k = 0; k < 5; k++) L.rect(40 + k * 7, 92 + b, 4, 3, p.pod ? E(mix(P.cheese[1], P.cheese[3], p.pod), p.pod) : P.vio[0]);
  });

  // ---------- missile pods (sides of the throne) ----------
  for (const side of [-1, 1]) {
    const px = side < 0 ? 4 : 94, py = 54 + b;
    layer(pb, (L) => {
      shRect(L, px, py, 14, 22, P.steel, { gloss: 0.6 });
      L.rect(px + (side < 0 ? 10 : 0), py + 6, 4, 10, P.steel[0]);       // bracket to throne
      L.hline(px, py, 14, P.steel[3]);
      for (let k = 0; k < 2; k++) {                                      // two can tips per pod
        const tx = px + 2 + k * 6, ty = py + 3;
        L.rect(tx, ty, 4, 7, P.vio[0]);
        const glow = p.pod;
        L.rect(tx, ty + 1, 4, 3, glow ? E(mix(P.red[2], P.cheese[3], glow), glow) : P.red[2]);
        L.set(tx + 1, ty + 1, glow ? E(WHITE, glow) : P.red[3]);
        L.rect(tx, ty + 4, 4, 3, P.cheese[2]); L.set(tx, ty + 4, P.cheese[3]);
      }
      // hazard stripes
      for (let k = 0; k < 14; k += 4) { L.rect(px + k, py + 17, 2, 3, P.cheese[2]); L.rect(px + k + 2, py + 17, 2, 3, P.vio[1]); }
    });
    if (p.fire) {   // muzzle blast puffing out of the pod tops
      layer(pb, (L) => {
        const fx = px + 7, fy = py - 6;
        L.circle(fx, fy, 6, E(P.cheese[1], 1, 0, 0.3));
        L.circle(fx - 1, fy - 1, 4, E(P.cheese[2], 1, 0, 0.5));
        L.circle(fx - 1, fy - 1, 2, E(WHITE, 1, 0, 1));
      }, { outline: false });
    }
  }

  // ---------- cheese throne back (tall wedge arch with holes) ----------
  const tb = b + Math.round(sl * 0.3);
  layer(pb, (L) => {
    L.poly([[20, 82 + tb], [20, 26 + tb], [30, 12 + tb], [56, 6 + tb], [82, 12 + tb], [92, 26 + tb], [92, 82 + tb]], P.cheese[2]);
    L.map((x, y, c) => {
      if (c.a < 128) return undefined;
      const l = -((x - 56) / 36 * 0.6 + (y - 44 - tb) / 40 * 0.5);
      return ink(P.cheese[tone(l + 0.15)], { gloss: 0.3 });
    });
    // rind trim along the arch
    L.line(20, 26 + tb, 30, 12 + tb, P.rind[2]); L.line(30, 12 + tb, 56, 6 + tb, P.rind[2]);
    L.line(56, 6 + tb, 82, 12 + tb, P.rind[1]); L.line(82, 12 + tb, 92, 26 + tb, P.rind[1]);
    L.line(21, 26 + tb, 31, 12 + tb, P.rind[3]); L.line(31, 13 + tb, 56, 7 + tb, P.rind[3]);
    // holes (dark pits with a lit lower lip)
    for (const [hx, hy, r] of [[28, 30, 3], [86, 34, 2.5], [25, 50, 2], [88, 54, 3], [30, 70, 2.5], [84, 74, 2], [40, 16, 2], [74, 14, 2.5]]) {
      L.ellipse(hx, hy + tb, r, r, P.cheese[0]);
      L.ellipse(hx - 0.5, hy - 0.5 + tb, r - 0.8, r - 0.8, P.vio[2]);
      L.set(hx, hy + tb + Math.ceil(r) - 1, P.cheese[3]);
    }
    // a little cheese pennant finial on top
    L.vline(56, 1 + tb, 6, P.steel[2]);
    L.poly([[57, 1 + tb], [63, 3 + tb], [57, 5 + tb]], P.red[2]);
  });

  // ---------- body: tortie coat torso, cream bib, red sash with emblem ----------
  const by = 40 + b + sl;
  layer(pb, (L) => {
    shEll(L, CX, by + 18, 24, 19, (x, y) => coatPal(x, y - b - sl, COAT_BLOBS), { seed: 11, grain: 0.14 });
    shEll(L, CX + 1, by + 10, 9, 9, P.cream, { seed: 12, grain: 0.08, bias: 0.15 });      // bib
    if (p.bristle) for (let k = 0; k < 9; k++) {          // fur on end
      const a = Math.PI * (1.05 + k * 0.11), x = Math.round(CX + Math.cos(a) * 25), y = Math.round(by + 18 + Math.sin(a) * 20);
      L.set(x, y, P.grey[2]); L.set(Math.round(x + Math.cos(a) * 1.5), Math.round(y + Math.sin(a) * 1.5), P.grey[1]);
    }
  });
  layer(pb, (L) => {          // sash, upper-left shoulder → lower-right hip
    stroke(L, [[CX - 20, by + 6], [CX + 18, by + 32]], 3.2, 3.2, (t, x, y, nx, ny) => P.red[tone(-(nx * 0.6 + ny * 0.8) * 0.9 + 0.1)]);
    emblem(L, CX - 6, by + 15, 3);
    L.set(CX - 8, by + 13, P.red[3]);
  });

  // ---------- arms & paws on cheese armrests ----------
  layer(pb, (L) => {   // armrests
    for (const ax of [16, 78]) {
      shRect(L, ax, 64 + b, 18, 10, P.cheese, { gloss: 0.3 });
      L.rect(ax, 72 + b, 18, 2, P.rind[1]); L.hline(ax, 64 + b, 18, P.cheese[3]);
      L.set(ax + 5, 67 + b, P.cheese[0]); L.set(ax + 12, 68 + b, P.cheese[0]);
    }
    // seat front with rind
    shRect(L, 22, 74 + b, 68, 11, P.cheese, { gloss: 0.3 });
    L.rect(22, 83 + b, 68, 2, P.rind[1]); L.hline(22, 74 + b, 68, P.cheese[3]);
    for (const [hx, hy] of [[34, 78], [62, 80], [78, 77]]) { L.ellipse(hx, hy + b, 1.8, 1.4, P.cheese[0]); L.set(hx, hy + b + 1, P.cheese[3]); }
    emblem(L, 50, 79 + b, 3);
  });
  layer(pb, (L) => {   // hind paws/feet dangling over the seat
    shEll(L, 44, 84 + b + Math.min(sl, 1), 6, 3.5, P.cream, { seed: 21, grain: 0.06 });
    shEll(L, 68, 84 + b + Math.min(sl, 1), 6, 3.5, P.grey, { seed: 22, grain: 0.06 });
    for (const fx of [42, 45, 66, 69]) L.vline(fx, 85 + b + Math.min(sl, 1), 2, OUT);
    for (const fx of [43, 67]) L.set(fx, 83 + b + Math.min(sl, 1), P.pink[2]);
  });
  const paw = (L, x, y, pal) => {
    shEll(L, x, y, 5, 4, pal, { seed: x, grain: 0.05, bias: 0.1 });
    L.set(x - 2, y + 2, OUT); L.set(x, y + 3, OUT); L.set(x + 2, y + 2, OUT);
  };
  layer(pb, (L) => {   // left arm (dark grey) — rests, or raised for the taunt
    if (p.paw === 'up') {
      stroke(L, [[CX - 18, by + 12], [CX - 27, by + 2], [CX - 28, by - 8]], 5, 4, (t, x, y, nx, ny) => P.grey[tone(-(nx * 0.6 + ny * 0.8) * 0.8 + 0.1)]);
      paw(L, CX - 28, by - 11, P.cream);
      L.set(CX - 30, by - 13, P.pink[2]); L.set(CX - 26, by - 13, P.pink[2]);
    } else {
      stroke(L, [[CX - 18, by + 12], [CX - 25, by + 20], [CX - 28, 65 + b]], 5, 4.2, (t, x, y, nx, ny) => P.grey[tone(-(nx * 0.6 + ny * 0.8) * 0.8 + 0.1)]);
      paw(L, CX - 29, 66 + b, P.cream);
    }
  });
  layer(pb, (L) => {   // right arm (apricot) — rests, or points imperiously at the player
    if (p.paw === 'point') {
      stroke(L, [[CX + 18, by + 12], [CX + 26, by + 22], [CX + 22, by + 32]], 5, 4, (t, x, y, nx, ny) => P.apri[tone(-(nx * 0.6 + ny * 0.8) * 0.8 + 0.1)]);
      paw(L, CX + 20, by + 34, P.apri);
      L.rect(CX + 14, by + 35, 3, 2, P.apri[2]);     // pointing digit
    } else {
      stroke(L, [[CX + 18, by + 12], [CX + 25, by + 20], [CX + 28, 65 + b]], 5, 4.2, (t, x, y, nx, ny) => P.apri[tone(-(nx * 0.6 + ny * 0.8) * 0.8 + 0.1)]);
      paw(L, CX + 29, 66 + b, P.apri);
    }
  });

  // ---------- head ----------
  const HS = 1.14, hx = CX + (sl ? -3 : 0), hy = 29 + b + sl * 2;
  const crownY = hy - 21 + (p.crownDy || 0);
  drawHead(pb, hx, hy, HS, { eyes: p.eyes, mouth: p.mouth, brows: p.brows, tint: 0 });
  if (!p.crownOff) drawCrown(pb, hx - 1, crownY, p.crownTilt || 1, 1.3);
  else drawCrown(pb, 70, 72 + b, -2, 0.85);      // crown has rolled off onto the seat
  if (p.tint) pb.map((x, y, c) => (c.a < 128 || (c.r === 0x1a && c.g === 0x14 && c.b === 0x20) ? undefined : mix(c, ink(WHITE, { emit: 0.4 }), p.tint * (y < 90 ? 1 : 0.6))));

  // ---------- extras ----------
  if (p.sweat) for (const [x, y] of [[80, 16], [84, 22], [30, 14]]) { pb.set(x, y, P.lens || '#9ae0ff'); pb.set(x, y + 1, '#5ab0e8'); pb.set(x, y - 1, '#e6ffff'); }
  if (p.steam) layer(pb, (L) => {
    for (const side of [-1, 1]) for (const [ox, oy, r] of [[24, -14, 3.5], [27, -19, 3], [24, -24, 2.5], [21, -18, 2.5]]) {
      const sx = hx + side * ox, sy = hy + oy;
      L.circle(sx, sy, r, '#d6d0e4'); L.circle(sx - 0.7, sy - 0.7, r - 1.2, '#f6f2ff');
    }
  });
  if (p.fire) layer(pb, (L) => {   // little "!" anger vein
    const vx = hx + 14, vy = hy - 12;
    L.set(vx, vy, P.red[2]); L.set(vx + 2, vy, P.red[2]); L.set(vx + 1, vy + 1, P.red[2]); L.set(vx, vy + 2, P.red[2]); L.set(vx + 2, vy + 2, P.red[2]);
  }, { outline: false });
  if (p.smoke) layer(pb, (L) => {
    for (const [sx, sy, r] of [[86, 92, 3], [90, 87, 2.2], [93, 83, 1.5], [26, 92, 2.5], [23, 88, 1.6]]) {
      L.circle(sx, sy, r, '#7a7490'); L.circle(sx - 0.5, sy - 0.5, Math.max(0.6, r - 1.2), '#aaa4bc');
    }
    // dizzy stars over the head
    for (const [sx, sy] of [[hx - 14, hy - 20], [hx + 2, hy - 23], [hx + 16, hy - 19]]) {
      L.set(sx, sy, E(P.gold[3], 1, 0, 1)); L.set(sx - 1, sy, E(P.gold[2], 1)); L.set(sx + 1, sy, E(P.gold[2], 1));
      L.set(sx, sy - 1, E(P.gold[2], 1)); L.set(sx, sy + 1, E(P.gold[2], 1));
    }
  });
  return pb;
}

// ======================================================================================
// JESSE MISSILE 24x24, 4 frames: fat spray-cheese can diving nose-first at the player, cheese-flame exhaust
// trailing upward, furious eyes glaring down and a frown on the label. Axis-aligned so it stays crisp at 1x.
// ======================================================================================
function missile(f) {
  const pb = new PixBuf(24, 24);
  const flame = [5, 7, 6, 8][f], wob = [0, 1, 0, -1][f];
  layer(pb, (L) => {   // exhaust: cheese jet licking up out of the can base
    for (let y = 0; y < 8; y++) {
      const t = (7 - y) / flame;                         // 0 at the can base -> 1 at the tip
      if (t > 1) continue;
      const w = 4.4 * (1 - t) + 0.7, sh = Math.round(wob * t);
      for (let x = 0; x < 24; x++) {
        const d = Math.abs(x + 0.5 - 12 - sh);
        if (d > w + (hash2(x, y, f + 3) - 0.5) * 0.8) continue;
        const c = d < w * 0.4 && t < 0.6 ? WHITE : t < 0.35 ? P.cheese[3] : t < 0.7 ? P.cheese[2] : P.cheese[1];
        L.set(x, y, E(c, 1, 0, t < 0.4 ? 0.6 : 0.2));
      }
    }
    L.set(f & 1 ? 7 : 16, f & 2 ? 1 : 3, E(P.cheese[2])); L.set(f & 1 ? 17 : 6, 4, E(P.cheese[3]));
  }, { outline: false });
  layer(pb, (L) => {
    // rind-red fins at the base
    L.poly([[7, 6], [3, 11], [7, 10]], P.rind[2]); L.poly([[17, 6], [21, 11], [17, 10]], P.rind[1]);
    // can body with cylinder shading (light from the left)
    const col = (x, pal) => pal[x < 8 ? 3 : x < 12 ? 2 : x < 15 ? 1 : 0];
    for (let x = 6; x < 18; x++) {
      L.vline(x, 6, 2, G(col(x, P.steel), 0.7, 0.2));
      L.vline(x, 8, 8, col(x, P.cheese));                // label
      L.set(x, 16, col(x, P.red));                        // stripe
      L.vline(x, 17, 1, G(col(x, P.steel), 0.7, 0.2));
    }
    for (let x = 7; x < 17; x++) L.set(x, 18, G(col(x, P.steel), 0.7));      // shoulder
    for (let x = 9; x < 15; x++) L.vline(x, 19, 2, col(x + 1, P.red));       // cap
    L.rect(11, 21, 2, 2, WHITE); L.set(12, 22, P.cream[1]);                   // nozzle
    L.set(6, 6, G(WHITE, 0.8, 0.8));                                          // rim glint
  }, { diagonal: true });
  // furious face: eyes glare down at the player, brows slam toward the middle, frown
  for (const ex of [8, 13]) {
    pb.rect(ex, 10, 3, 3, WHITE); pb.set(ex, 10, P.cream[2]);
    pb.rect(ex + (ex < 12 ? 1 : 0), 11, 2, 2, OUT);
  }
  pb.line(7, 8, 10, 9, OUT); pb.line(7, 9, 10, 10, OUT);
  pb.line(16, 8, 13, 9, OUT); pb.line(16, 9, 13, 10, OUT);
  pb.set(10, 15, OUT); pb.hline(11, 14, 2, OUT); pb.set(13, 15, OUT);
  return pb;
}

// ======================================================================================
// JESSE BUST 64x64: frame 0 imperious, frame 1 enraged. Shoulders + sash + crown + framing.
// ======================================================================================
function bust(f) {
  const pb = new PixBuf(64, 64);
  const rage = f === 1, s = 1.32, cx = 32, cy = 31;
  // shoulders / coat
  layer(pb, (L) => {
    shEll(L, 32, 64, 29, 14, (x, y) => coatPal(x, y, [[18, 58, 6, 'apri'], [44, 56, 7, 'cream'], [34, 62, 3, 'apri']]), { seed: 41, grain: 0.14 });
    shEll(L, 33, 56, 8, 6, P.cream, { seed: 42, grain: 0.08, bias: 0.2 });
    if (rage) for (let k = 0; k < 7; k++) { const x = 6 + k * 3; L.set(x, 52 + (k & 1), P.grey[2]); L.set(64 - x, 52 + (k & 1), P.grey[2]); }
  });
  layer(pb, (L) => {
    stroke(L, [[8, 54], [52, 64]], 3.4, 3.4, (t, x, y, nx, ny) => P.red[tone(-(nx * 0.6 + ny * 0.8) * 0.9 + 0.1)]);
    emblem(L, 22, 58, 3);
  });
  drawHead(pb, cx, cy, s, rage ? { eyes: 'angry', mouth: 'snarl', brows: true } : { eyes: 'lid', mouth: 'smug' });
  drawCrown(pb, cx + 1, cy - 25, rage ? -1 : 1.5, 1.15);
  if (rage) {
    layer(pb, (L) => {   // steam puffs + anger vein
      for (const [sx, sy, r] of [[5, 9, 3], [3, 4, 2], [58, 9, 3], [60, 4, 2]]) L.circle(sx, sy, r, '#e8e4f0');
    });
    const vx = 46, vy = 13;
    for (const [x, y] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]]) pb.set(vx + x, vy + y, E(P.red[2], 0.6));
  }
  return pb;
}

export function build() {
  const seq = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
  return {
    jesse: seq(8, jesse),
    jesse_missile: seq(4, missile),
    jesse_bust: seq(2, bust),
  };
}
