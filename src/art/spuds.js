// Art module spuds: 12 space-potato variants, baked-potato planet, gouda moon, twinkle stars.
import { PixBuf, ink, hash2, ramp, mix } from './pixbuf.js';

const OUT = '#1a1420';
const E = (c, emit = 0, gloss = 0.1, spark = 0) => ink(c, { emit, gloss, spark });
const POT = ramp('#c98a4b', 5, 0.42);      // potato skin, dark -> light
const PURP = ramp('#8a4fb0', 5, 0.42);
const GOLD = ramp('#ffbe2e', 5, 0.4);
const FLESH = ramp('#ffe27a', 4, 0.3);     // peeled flesh / mash
const GREEN = ramp('#6fae3a', 3, 0.4);

// Lumpy shaded ellipse. Light from upper-left picks the ramp tone.
function blob(pb, cx, cy, rx, ry, rp, { seed = 1, wob = 0.1, spots = 0.1, gloss = 0.1 } = {}) {
  const ph = hash2(seed, 3, 9) * 6.28;
  for (let y = Math.floor(cy - ry - 3); y <= cy + ry + 3; y++) for (let x = Math.floor(cx - rx - 3); x <= cx + rx + 3; x++) {
    const dx = (x - cx + 0.5) / rx, dy = (y - cy + 0.5) / ry, a = Math.atan2(dy, dx);
    const r = 1 + wob * (Math.sin(a * 3 + ph) * 0.6 + Math.sin(a * 5 + ph * 2) * 0.4);
    const d = Math.hypot(dx, dy);
    if (d > r) continue;
    let t = 0.62 - (dx + dy) * 0.32 - (1 - d) * 0.05;       // upper-left bright
    if (hash2(x, y, seed) < spots) t -= 0.25;               // eye-spots / pores
    t = Math.max(0, Math.min(0.999, t));
    pb.set(x, y, E(rp[Math.floor(t * rp.length)], 0, gloss));
  }
}
const px = (pb, x, y, c, emit = 0, gloss = 0, spark = 0) => pb.set(x, y, E(c, emit, gloss, spark));
const dot = (pb, x, y, c = OUT) => pb.set(x, y, E(c));

function eye(pb, x, y, look = 0) {
  pb.rect(x, y, 4, 4, E('#fffbe0'));
  pb.set(x, y, [0, 0, 0, 0]); pb.set(x + 3, y, [0, 0, 0, 0]); pb.set(x, y + 3, [0, 0, 0, 0]); pb.set(x + 3, y + 3, [0, 0, 0, 0]);
  pb.rect(x + 1 + look, y + 1, 2, 2, E(OUT));
  pb.set(x + 1 + look, y + 1, E('#fffbe0'));
}
function smile(pb, x, y, w = 4) { pb.hline(x, y, w, E(OUT)); pb.set(x - 1, y - 1, E(OUT)); pb.set(x + w, y - 1, E(OUT)); }
function cheeks(pb, x1, x2, y) { px(pb, x1, y, '#e8706a'); px(pb, x2, y, '#e8706a'); }

function base(rp = POT, seed = 1, rx = 13, ry = 10) {
  const pb = new PixBuf(32, 32);
  blob(pb, 16, 17, rx, ry, rp, { seed });
  return pb;
}
function finish(pb) { pb.outline(OUT, { diagonal: true }); return pb; }

function spud(i) {
  let pb;
  switch (i) {
    case 0: { // plain, calm little face
      pb = base(POT, 11);
      dot(pb, 12, 15); dot(pb, 12, 16); dot(pb, 20, 15); dot(pb, 20, 16);
      smile(pb, 14, 20, 4);
      break; }
    case 1: { // big googly eyes
      pb = base(POT, 12);
      eye(pb, 10, 12, 1); eye(pb, 18, 12, -1);
      smile(pb, 14, 21, 4); cheeks(pb, 9, 22, 19);
      break; }
    case 2: { // sunglasses
      pb = base(POT, 13);
      pb.rect(8, 13, 7, 4, E('#241830', 0, 0.8)); pb.rect(17, 13, 7, 4, E('#241830', 0, 0.8));
      pb.hline(15, 14, 2, E(OUT)); pb.hline(8, 13, 7, E('#3a2a52', 0, 0.9)); pb.hline(17, 13, 7, E('#3a2a52', 0, 0.9));
      px(pb, 9, 14, '#fffbe0', 0.3, 1, 1); px(pb, 18, 14, '#fffbe0', 0.3, 1, 1);
      pb.hline(13, 20, 6, E(OUT)); px(pb, 19, 19, OUT);
      break; }
    case 3: { // tiny crown
      pb = base(POT, 14, 13, 9);
      pb.poly([[10, 10], [10, 5], [13, 8], [16, 3], [19, 8], [22, 5], [22, 10]], E('#ffd93a', 0.3, 0.7, 0.4));
      pb.rect(10, 9, 13, 2, E('#ffa820', 0.2, 0.7));
      px(pb, 16, 6, '#e8405a', 0.4, 1, 1); px(pb, 11, 9, '#6aa0ff', 0.4, 1, 0.5); px(pb, 21, 9, '#6aa0ff', 0.4, 1, 0.5);
      dot(pb, 12, 16); dot(pb, 12, 17); dot(pb, 20, 16); dot(pb, 20, 17); smile(pb, 14, 21, 4);
      break; }
    case 4: { // sprouted: leafy sprout on top
      pb = base(POT, 15, 13, 9);
      pb.line(16, 9, 16, 4, E(GREEN[0])); pb.line(15, 9, 15, 5, E(GREEN[1]));
      pb.poly([[17, 6], [22, 2], [24, 5], [20, 8]], E(GREEN[2])); pb.poly([[14, 6], [9, 3], [8, 6], [12, 8]], E(GREEN[1]));
      px(pb, 21, 4, GREEN[2] && '#b8e070');
      dot(pb, 12, 15); dot(pb, 12, 16); dot(pb, 20, 15); dot(pb, 20, 16); smile(pb, 14, 20, 4);
      break; }
    case 5: { // purple sweet potato, sleepy
      pb = base(PURP, 16, 14, 9);
      pb.hline(10, 16, 4, E(OUT)); pb.hline(19, 16, 4, E(OUT)); px(pb, 11, 17, '#e8a0ff'); px(pb, 21, 17, '#e8a0ff');
      pb.hline(15, 21, 3, E(OUT));
      px(pb, 24, 8, '#fffbe0', 0.8, 0, 1); px(pb, 25, 7, '#fffbe0', 0.8, 0, 1); px(pb, 26, 9, '#fffbe0', 0.5, 0, 1);
      break; }
    case 6: { // tater tot: golden-brown cylinder, crunchy
      pb = new PixBuf(32, 32);
      const T = ramp('#d89a3a', 5, 0.42);
      for (let y = 5; y < 28; y++) for (let x = 6; x < 27; x++) {
        const cx = x - 16, r = y < 8 ? 8.5 + (y - 5) * 0.3 : y > 24 ? 10 - (y - 24) * 0.8 : 10;
        if (Math.abs(cx + 0.5) > r) continue;
        let t = 0.62 - (x - 16) * 0.035 - (y - 16) * 0.02 + (hash2(x, y, 6) - 0.5) * 0.35;
        t = Math.max(0, Math.min(0.999, t));
        pb.set(x, y, E(T[Math.floor(t * 5)]));
      }
      for (let k = 0; k < 12; k++) px(pb, 8 + Math.floor(hash2(k, 1, 6) * 17), 7 + Math.floor(hash2(k, 2, 6) * 19), '#7a3f1f');
      dot(pb, 11, 14); dot(pb, 11, 15); dot(pb, 11, 16); dot(pb, 21, 14); dot(pb, 21, 15); dot(pb, 21, 16); smile(pb, 14, 20, 4); cheeks(pb, 9, 23, 18);
      break; }
    case 7: { // half-peeled: skin on top-left, flesh bottom-right with a curl
      pb = base(POT, 17);
      for (let y = 8; y < 28; y++) for (let x = 3; x < 30; x++) if (pb.has(x, y) && (x - 3) + (y - 8) * 0.8 > 26) {
        const t = Math.min(0.999, Math.max(0, 0.7 - (x - 16) * 0.02 - (y - 16) * 0.02 + (hash2(x, y, 7) - 0.5) * 0.15));
        pb.set(x, y, E(FLESH[Math.floor(t * 4)]));
      }
      pb.poly([[22, 8], [28, 8], [29, 12], [25, 11]], E(POT[2])); pb.line(23, 8, 28, 9, E(POT[4]));
      dot(pb, 11, 15); dot(pb, 11, 16); dot(pb, 17, 16); dot(pb, 17, 17); smile(pb, 12, 21, 4);
      break; }
    case 8: { // french-fry comet: fry head + fiery trail
      pb = new PixBuf(32, 32);
      for (let k = 0; k < 4; k++) {
        const y = 8 + k * 4, len = 3 + k * 2 + Math.floor(hash2(k, 8, 8) * 2);
        pb.rect(9 - len, y, len, 2, E(['#ff9a2e', '#ffbe2e', '#ffd93a', '#fff1a0'][k], 0.8, 0.2));
      }
            pb.poly([[9, 8], [28, 5], [31, 10], [28, 25], [10, 23]], E(GOLD[3], 0.1, 0.3));
      pb.poly([[10, 17], [30, 15], [31, 10], [28, 25], [10, 23]], E(GOLD[1], 0, 0.2));
      pb.line(11, 10, 27, 7, E(GOLD[4], 0.3, 0.6));
      pb.hline(12, 22, 14, E(GOLD[0]));
      dot(pb, 17, 12); dot(pb, 17, 13); dot(pb, 17, 14); dot(pb, 25, 11); dot(pb, 25, 12); dot(pb, 25, 13); smile(pb, 19, 17, 5);
      break; }
    case 9: { // baked with butter pat + steam
      pb = base(POT, 19, 13, 9);
      pb.line(7, 17, 25, 17, E(POT[0]));                       // split seam
      pb.ellipse(16, 15, 9, 3, E(FLESH[2]));                   // open top
      pb.ellipse(16, 15, 8, 2, E(FLESH[3]));
      pb.rect(13, 11, 6, 4, E('#fff1a0', 0.4, 0.8, 0.6)); pb.hline(13, 14, 6, E('#ffbe2e', 0.2, 0.5));
      px(pb, 14, 12, '#fffbe0', 0.9, 1, 1);
      dot(pb, 11, 20); dot(pb, 11, 21); dot(pb, 21, 20); dot(pb, 21, 21); smile(pb, 14, 23, 4);
      for (let k = 0; k < 3; k++) { px(pb, 12 + k * 4, 6 - (k & 1), '#e8e0f0', 0.2, 0, 0); px(pb, 13 + k * 4, 4 - (k & 1), '#c8c0e0', 0.1); }
      break; }
    case 10: { // mashed blob with gravy-ish drip and a butter dot
      pb = new PixBuf(32, 32);
      blob(pb, 16, 19, 12, 8, FLESH, { seed: 20, wob: 0.18, spots: 0 });
      blob(pb, 16, 12, 8, 6, FLESH, { seed: 21, wob: 0.15, spots: 0 });
      blob(pb, 16, 8, 4, 3, FLESH, { seed: 22, wob: 0.1, spots: 0 });
      pb.rect(14, 6, 4, 3, E('#ffbe2e', 0.3, 0.8, 0.5)); px(pb, 14, 6, '#fffbe0', 0.9, 1, 1);
      pb.rect(9, 22, 3, 4, E('#8a5a2f')); pb.rect(21, 22, 2, 3, E('#8a5a2f'));
      dot(pb, 12, 17); dot(pb, 12, 18); dot(pb, 20, 17); dot(pb, 20, 18); smile(pb, 14, 21, 4);
      break; }
    default: { // 11 golden, sparkling
      pb = base(GOLD, 23, 13, 10);
      dot(pb, 12, 15, '#6a3a10'); dot(pb, 12, 16, '#6a3a10'); dot(pb, 20, 15, '#6a3a10'); dot(pb, 20, 16, '#6a3a10');
      smile(pb, 14, 20, 4);
      pb.map((x, y, c) => c); // no-op, keep API honest
      for (const [x, y] of [[8, 9], [23, 22], [21, 8]]) { px(pb, x, y, '#ffffff', 1, 1, 1); px(pb, x - 1, y, '#fffbe0', 0.8, 0, 1); px(pb, x + 1, y, '#fffbe0', 0.8, 0, 1); px(pb, x, y - 1, '#fffbe0', 0.8, 0, 1); px(pb, x, y + 1, '#fffbe0', 0.8, 0, 1); }
      pb.setMat({ emit: 0.25, gloss: 0.9, spark: 0.6 }, 0, 0, 0, 0);
      break; }
  }
  return finish(pb);
}

function planetBaked() {
  const pb = new PixBuf(128, 128), cx = 62, cy = 70;
  // lumpy potato skin planet, wider than tall
  blob(pb, cx, cy, 56, 44, POT, { seed: 31, wob: 0.07, spots: 0.0, gloss: 0.05 });
  // skin texture + eyes (dark pits) + crispy bits
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) if (pb.has(x, y)) {
    const h = hash2(x, y, 33);
    if (h < 0.025) px(pb, x, y, POT[1]); else if (h > 0.985) px(pb, x, y, POT[4]);
  }
  for (const [ex, ey] of [[20, 80], [88, 92], [100, 62], [35, 100], [70, 106], [28, 58]]) {
    pb.ellipse(ex, ey, 4, 2, E(POT[0])); pb.hline(ex - 2, ey + 3, 5, E(POT[2]));
  }
  // slit with fluffy white flesh on top
  pb.ellipse(cx, 36, 40, 11, E('#5a3a24'));
  pb.ellipse(cx, 36, 38, 9, E(FLESH[1]));
  pb.ellipse(cx - 1, 34, 36, 8, E(FLESH[2]));
  pb.ellipse(cx - 3, 32, 30, 5, E(FLESH[3]));
  for (let k = 0; k < 40; k++) px(pb, 28 + Math.floor(hash2(k, 4, 34) * 70), 28 + Math.floor(hash2(k, 5, 34) * 12), hash2(k, 6, 34) > 0.5 ? '#fff6c8' : FLESH[1]);
  // butter pat
  pb.rect(50, 24, 26, 14, E('#ffd93a', 0.3, 0.8, 0.3));
  pb.rect(50, 24, 26, 4, E('#fff1a0', 0.5, 0.9, 0.5));
  pb.rect(50, 34, 26, 4, E('#ffa820', 0.2, 0.6));
  pb.rect(72, 26, 4, 12, E('#ffa820', 0.2, 0.6));
  pb.frame(50, 24, 26, 14, E('#d96a22'));
  px(pb, 53, 26, '#ffffff', 1, 1, 1); px(pb, 54, 26, '#ffffff', 1, 1, 1);
  // melty butter drips down the front
  for (let k = 0; k < 4; k++) { const x = 54 + k * 6, len = 4 + Math.floor(hash2(k, 8, 35) * 8); pb.rect(x, 38, 3, len, E('#ffd93a', 0.3, 0.7)); pb.rect(x, 38 + len, 3, 1, E('#ffbe2e', 0.3, 0.7)); }
  // steam wisps
  for (let s = 0; s < 3; s++) for (let k = 0; k < 14; k++) {
    const x = 44 + s * 20 + Math.round(Math.sin(k * 0.7 + s) * 3), y = 18 - k;
    if (y < 0) break;
    pb.set(x, y, E(k < 8 ? '#f0e8ff' : '#c8c0e0', 0.15)); pb.set(x + 1, y, E(k < 8 ? '#f0e8ff' : '#c8c0e0', 0.15));
  }
  // smiling face on the planet belly
  pb.rect(38, 74, 6, 8, E(OUT)); pb.rect(76, 74, 6, 8, E(OUT)); px(pb, 39, 75, '#fffbe0'); px(pb, 77, 75, '#fffbe0');
  pb.hline(52, 88, 14, E(OUT)); pb.hline(50, 86, 2, E(OUT)); pb.hline(66, 86, 2, E(OUT));
  pb.ellipse(32, 86, 4, 2, E('#e8706a')); pb.ellipse(86, 86, 4, 2, E('#e8706a'));
  return pb.outline(OUT, { diagonal: true });
}

function planetGouda() {
  const pb = new PixBuf(96, 96), cx = 47, cy = 47, R = 44;
  const CH = ramp('#ffb42e', 5, 0.4);
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
    const dx = (x - cx + 0.5) / R, dy = (y - cy + 0.5) / R, d = Math.hypot(dx, dy);
    if (d > 1) continue;
    let t = 0.55 - (dx + dy) * 0.38 - (d * d) * 0.08 + (hash2(x >> 1, y >> 1, 41) - 0.5) * 0.08;
    t = Math.max(0, Math.min(0.999, t));
    let c = CH[Math.floor(t * 5)];
    // red wax rind equator band (tilted)
    const band = dy - dx * 0.25;
    if (Math.abs(band + 0.05) < 0.11) { const rr = ramp('#c8283a', 4, 0.4); c = rr[Math.floor(t * 4)]; }
    pb.set(x, y, E(c, 0, 0.15));
  }
  // craters
  for (const [x, y, r] of [[28, 28, 9], [62, 24, 6], [66, 66, 11], [24, 66, 7], [48, 78, 5], [46, 12, 4], [80, 46, 5]]) {
    pb.ellipse(x, y, r, r - 1, E(CH[0]));
    pb.ellipse(x + 1, y + 1, r - 2, r - 3, E(CH[1]));
    pb.ellipse(x + 1, y + 1, r - 3, r - 4, E(CH[2]));
    pb.hline(x - r + 1, y - r + 1, Math.max(2, r - 1), E(CH[4])); // lit upper-left lip
  }
  // little cheese holes (dark pits) elsewhere
  for (const [x, y] of [[40, 44], [14, 46], [56, 52], [72, 36], [34, 88], [60, 86]]) { pb.circle(x, y, 2, E(CH[0])); pb.set(x - 1, y - 1, E(CH[4])); }
  // gloss highlight
  for (let k = 0; k < 6; k++) px(pb, 20 + k, 14 - Math.abs(k - 2), '#fff6c8', 0.2, 1, 1);
  return pb.outline(OUT, { diagonal: true });
}

function stars() {
  const out = [];
  for (let s = 0; s < 3; s++) {
    const pb = new PixBuf(8, 8), W = '#fffbe0', Y = '#ffe27a';
    const e = (c, k = 1) => E(c, k, 0, 1);
    if (s === 0) { pb.set(3, 3, e('#ffffff')); pb.set(4, 4, e('#ffffff')); pb.set(4, 3, e(Y, 0.7)); pb.set(3, 4, e(Y, 0.7)); }
    else if (s === 1) {
      pb.rect(3, 3, 2, 2, e('#ffffff'));
      for (const [x, y] of [[3, 2], [4, 2], [3, 5], [4, 5], [2, 3], [2, 4], [5, 3], [5, 4]]) pb.set(x, y, e(Y, 0.7));
    } else {
      pb.rect(3, 3, 2, 2, e('#ffffff'));
      pb.vline(3, 0, 8, e(W, 0.6)); pb.vline(4, 0, 8, e(W, 0.6)); pb.hline(0, 3, 8, e(W, 0.6)); pb.hline(0, 4, 8, e(W, 0.6));
      pb.rect(3, 3, 2, 2, e('#ffffff'));
      for (const [x, y] of [[2, 2], [5, 2], [2, 5], [5, 5]]) pb.set(x, y, e(Y, 0.5));
      for (const [x, y] of [[0, 3], [0, 4], [7, 3], [7, 4], [3, 0], [4, 0], [3, 7], [4, 7]]) pb.set(x, y, e('#ffbe2e', 0.4));
    }
    out.push(pb);
  }
  return out;
}

export function build() {
  const spud_bg = [];
  for (let i = 0; i < 12; i++) spud_bg.push(spud(i));
  return { spud_bg, planet_baked: planetBaked(), planet_gouda: planetGouda(), star: stars() };
}
