// Art module enemies: rat gunner turret, spray-cheese silo + rocket, tuna tin, cheese radar dish, mouse jet, hot spud.
// Pure & deterministic. Light from upper-left; 1px #1a1420 outline added last.
import { PixBuf, ink, ramp, hash2 } from './pixbuf.js';

const OUT = '#1a1420';
const C = {
  white: '#fffbe0', pale: '#fff1a0', yel: '#ffd93a', gold: '#ffbe2e', org: '#ff9a2e', dorg: '#d96a22', rust: '#a8441f',
  vio: '#5a2f55', dvio: '#3a2040', red: '#d83a3a', dred: '#8e2438', pink: '#f0a0aa', steel: '#aab0c8',
};
const RAT = ramp('#8c8ca0', 4, 0.4);        // dark -> light grey
const STEEL = ramp('#9aa0b8', 4, 0.4);
const CHEESE = [C.dorg, C.gold, C.yel, C.pale];
const E = (c, emit = 0.8, gloss = 0.2, spark = 0) => ink(c, { emit, gloss, spark });
const G = (c, gloss = 0.5, spark = 0) => ink(c, { gloss, spark });

function wedge(pb, x, y, s = 1) {          // tiny cheese wedge emblem, s=1 -> 4x3
  pb.rect(x, y + 1, 4 * s, 2, CHEESE[2]); pb.hline(x + 1, y, 2 * s, CHEESE[3]); pb.hline(x, y + 2, 4 * s, CHEESE[1]);
  pb.set(x + 2, y + 1, CHEESE[0]);
}

// ---------------- rat turret 24x28, 6 frames ----------------
// dir 0 down-left, 1 down-right, 2 up-left, 3 up-right
function ratTurret(f) {
  const pb = new PixBuf(24, 28);
  const dir = f < 4 ? f : 0, right = dir === 1 || dir === 3, back = dir >= 2;
  const mx = right ? 1 : -1;                       // facing sign
  // gun nest: stacked cheese blocks
  pb.rect(2, 19, 20, 8, CHEESE[1]); pb.rect(2, 19, 20, 2, CHEESE[3]); pb.rect(2, 25, 20, 2, CHEESE[0]);
  pb.rect(2, 21, 3, 4, CHEESE[2]); pb.rect(19, 21, 3, 4, CHEESE[0]);
  pb.set(8, 23, C.dorg); pb.set(9, 23, C.dorg); pb.set(15, 22, C.dorg); pb.set(15, 23, C.dorg); pb.set(14, 24, C.dorg);
  // sandbag-ish front lip
  pb.rect(1, 18, 22, 2, CHEESE[2]); pb.hline(2, 18, 20, CHEESE[3]);
  // body
  pb.ellipse(12, 15, 5, 5, RAT[1]); pb.ellipse(11, 14, 3, 3, RAT[2]);
  // red armband with cheese wedge emblem
  pb.rect(7, 14, 10, 3, C.red); pb.hline(7, 16, 10, C.dred);
  if (!back) { pb.rect(10, 14, 4, 3, C.white); wedge(pb, 10, 14); }
  // head
  const hx = 12 + (back ? 0 : mx * 1);
  pb.ellipse(hx, 8, 5, 4, RAT[2]); pb.ellipse(hx - 1, 7, 3, 2, RAT[3]);
  // ears
  pb.circle(hx - 5, 6, 2, RAT[1]); pb.circle(hx + 5, 6, 2, RAT[1]);
  if (!back) { pb.set(hx - 5, 6, C.pink); pb.set(hx + 5, 6, C.pink); }
  // spiked helmet
  pb.ellipse(hx, 5, 5, 3, STEEL[1]); pb.rect(hx - 5, 5, 11, 2, STEEL[0]); pb.hline(hx - 3, 3, 4, STEEL[3]);
  pb.rect(hx - 1, 0, 2, 3, STEEL[3]); pb.set(hx, 0, C.white);
  if (!back) {
    // face: eyes (angry), snout, whiskers
    const ex = hx + (right ? 1 : -1) * 0;
    pb.set(ex - 3, 8, C.white); pb.set(ex - 2, 8, C.dvio); pb.set(ex + 2, 8, C.white); pb.set(ex + 1, 8, C.dvio);
    pb.line(ex - 4, 7, ex - 2, 6, OUT); pb.line(ex + 3, 7, ex + 1, 6, OUT);
    pb.rect(ex - 1, 10, 3, 2, C.pink); pb.set(ex, 10, C.dred);
    pb.hline(ex - 6, 10, 3, RAT[3]); pb.hline(ex + 4, 10, 3, RAT[3]);
  }
  // machine gun: thick barrel along the iso diagonal, poking out past the nest
  const bx = 12 + mx * 4, by = back ? 14 : 16;
  const ex2 = bx + mx * 8, ey2 = back ? by - 4 : by + 4;
  pb.line(bx, by + 1, ex2, ey2 + 1, STEEL[0]); pb.line(bx, by, ex2, ey2, STEEL[1]); pb.line(bx, by - 1, ex2, ey2 - 1, STEEL[3]);
  pb.rect(ex2 - 1, ey2 - 1, 2, 3, OUT);
  pb.rect(bx - 2, by - 2, 4, 5, STEEL[0]); pb.rect(bx - 2, by - 2, 4, 1, STEEL[3]); pb.set(bx, by, C.red);
  pb.set(bx - mx * 2, by + 3, RAT[3]); pb.set(bx - mx, by + 3, RAT[3]);
  if (f === 4) {   // muzzle flash
    const fx = ex2 + mx * 2, fy = ey2;
    pb.circle(fx, fy, 2, E(C.yel, 1, 0.1, 0.4)); pb.circle(fx, fy, 1, E(C.white, 1, 0.1, 0.8));
    pb.set(fx + mx * 2, fy, E(C.org, 1)); pb.set(fx, fy - 2, E(C.org, 1)); pb.set(fx, fy + 2, E(C.org, 1));
  }
  if (f === 5) {   // hit: red flash on the body + squint eyes and stars
    pb.ellipse(12, 15, 4, 4, E(C.red, 0.6)); pb.rect(hx - 3, 8, 2, 1, C.dvio); pb.rect(hx + 1, 8, 2, 1, C.dvio);
    pb.set(3, 4, E(C.yel, 1)); pb.set(2, 5, E(C.yel, 1)); pb.set(4, 5, E(C.yel, 1)); pb.set(3, 6, E(C.yel, 1));
    pb.set(20, 3, E(C.yel, 1)); pb.set(19, 4, E(C.yel, 1)); pb.set(21, 4, E(C.yel, 1)); pb.set(20, 5, E(C.yel, 1));
  }
  return pb.outline(OUT, { diagonal: true });
}

// ---------------- can pad 24x20, 3 frames ----------------
function canPad(f) {
  const pb = new PixBuf(24, 20);
  // silo ring: cheese-crust slab, iso ellipse
  pb.ellipse(12, 13, 11, 6, CHEESE[0]); pb.ellipse(12, 12, 11, 6, CHEESE[1]); pb.ellipse(12, 11, 10, 5, CHEESE[2]);
  pb.ellipse(12, 11, 8, 4, C.vio);
  if (f === 0) {                     // closed: two hatch doors with a seam
    pb.ellipse(12, 11, 8, 4, STEEL[1]); pb.ellipse(11, 10, 5, 2, STEEL[2]);
    pb.vline(12, 7, 8, STEEL[0]); pb.set(9, 11, C.dvio); pb.set(15, 11, C.dvio);
    pb.rect(11, 11, 2, 2, C.gold);
  } else if (f === 1) {              // armed: can nozzle visible, blinking light
    pb.ellipse(12, 11, 8, 4, C.dvio);
    pb.rect(9, 2, 6, 9, G(C.steel, 0.7)); pb.rect(9, 2, 2, 9, STEEL[3]); pb.rect(13, 2, 2, 9, STEEL[0]);
    pb.rect(10, 0, 4, 3, C.red); pb.rect(11, -1, 2, 2, C.white); pb.set(12, 1, C.dred);
    pb.rect(9, 5, 6, 3, C.white); pb.rect(10, 6, 4, 1, C.org);
    pb.circle(19, 12, 1, E(C.red, 1, 0.2, 0.8)); pb.set(19, 12, E(C.white, 1));
  } else {                           // opening: doors slid apart, can rising, glow
    pb.ellipse(12, 11, 8, 4, E(C.org, 0.8));
    pb.rect(9, 0, 6, 11, G(C.steel, 0.7)); pb.rect(9, 0, 2, 11, STEEL[3]); pb.rect(13, 0, 2, 11, STEEL[0]);
    pb.rect(10, -2, 4, 3, C.red); pb.rect(9, 4, 6, 3, C.white); pb.rect(10, 5, 4, 1, C.org);
    pb.rect(1, 9, 3, 5, STEEL[1]); pb.rect(20, 9, 3, 5, STEEL[0]);   // retracted door halves
    pb.set(12, 15, E(C.yel, 1)); pb.set(11, 14, E(C.yel, 1)); pb.set(13, 14, E(C.yel, 1));
  }
  return pb.outline(OUT, { diagonal: true });
}

// ---------------- can rocket 16x32, 4 frames ----------------
function canRocket(f) {
  const pb = new PixBuf(16, 32);
  const flick = [0, 2, 1, 3][f];
  // exhaust: cheese jet, flickering length
  const len = 7 + flick * 2;
  for (let i = 0; i < len; i++) {
    const w = Math.max(0, 3 - Math.floor(i / 3) - ((i + f) % 2 ? 0 : 0));
    const col = i < 2 ? C.white : i < 4 ? C.pale : i < len - 3 ? C.yel : C.org;
    pb.hline(8 - w, 22 + i, w * 2, E(col, 1, 0.1, 0.3));
    if (w === 0) pb.set(8, 22 + i, E(col, 1));
  }
  pb.set(8 + (f % 2 ? 2 : -2), 24 + flick, E(C.gold, 1)); pb.set(8 + (f % 2 ? -3 : 3), 27, E(C.org, 1));
  // can body
  pb.rect(4, 9, 8, 14, G(C.steel, 0.6, 0.2)); pb.rect(4, 9, 2, 14, STEEL[3]); pb.rect(10, 9, 2, 14, STEEL[0]);
  pb.hline(4, 22, 8, STEEL[0]);
  // label SQUEEZ CHEEZ (stripe + wedge)
  pb.rect(4, 12, 8, 7, C.yel); pb.rect(4, 12, 2, 7, C.pale); pb.rect(10, 12, 2, 7, C.gold);
  pb.hline(5, 14, 6, C.red); pb.hline(5, 16, 6, C.red); pb.set(6, 15, C.dred); pb.set(8, 15, C.dred); pb.set(10, 15, C.dred);
  pb.hline(5, 18, 6, C.dred);
  // shoulder + nozzle + cap
  pb.rect(5, 7, 6, 3, STEEL[2]); pb.rect(6, 5, 4, 3, C.red); pb.rect(7, 3, 2, 3, C.white); pb.rect(7, 1, 2, 2, C.pale);
  pb.set(7, 5, C.dred);
  // fins (cheese-rind)
  pb.poly([[4, 19], [1, 24], [4, 23]], C.dred); pb.poly([[11, 19], [14, 24], [11, 23]], C.dred);
  return pb.outline(OUT, { diagonal: true });
}

// ---------------- tuna tin 20x16, 2 frames ----------------
function tunaTin(f) {
  const pb = new PixBuf(20, 16);
  pb.ellipse(10, 9, 9, 6, STEEL[0]); pb.ellipse(10, 8, 9, 6, STEEL[2]);         // rim
  pb.ellipse(10, 8, 7, 4, C.dvio);                                              // inside
  pb.ellipse(10, 8, 6, 3, '#e99a8a');                                           // fish
  // fish body details
  pb.ellipse(9, 7, 4, 2, '#f7b6a0'); pb.hline(7, 8, 6, '#c8685f');
  pb.set(14, 8, C.white); pb.set(14, 7, C.white);
  pb.poly([[4, 8], [2, 6], [2, 10]], '#c8685f');
  // blue label band on front rim
  pb.rect(2, 11, 16, 3, '#3a64c8'); pb.hline(3, 11, 14, '#6e96ee'); pb.hline(3, 13, 14, '#27408e');
  pb.set(9, 12, C.white); pb.set(10, 12, C.white); pb.set(11, 12, C.white);
  // pull tab
  pb.circle(17, 4, 1, STEEL[3]); pb.set(16, 5, STEEL[1]);
  if (f === 1) {                                                                // flashing highlight
    pb.ellipse(10, 8, 7, 4, E('#ffffff', 0.7, 0.9, 0.9)); pb.ellipse(10, 8, 6, 3, '#f7b6a0');
    pb.set(6, 5, E(C.white, 1, 0.9, 1)); pb.set(5, 6, E(C.white, 1, 0.9, 1)); pb.set(14, 10, E(C.white, 1, 0.9, 1));
    pb.hline(4, 4, 3, E(C.white, 1, 1, 1));
  }
  return pb.outline(OUT, { diagonal: true });
}

// ---------------- radar dish 28x32, 4 frames ----------------
function radarDish(f) {
  const pb = new PixBuf(28, 32);
  // base: cheese-block plinth
  pb.rect(6, 25, 16, 6, CHEESE[1]); pb.rect(6, 25, 16, 2, CHEESE[3]); pb.rect(6, 29, 16, 2, CHEESE[0]);
  pb.set(10, 28, C.dorg); pb.set(17, 27, C.dorg); pb.set(18, 28, C.dorg);
  pb.rect(12, 20, 4, 6, STEEL[1]); pb.rect(12, 20, 1, 6, STEEL[3]);
  // dish = cheese wheel seen as a rotating ellipse: width follows cos of rotation
  const ang = (f / 4) * Math.PI;
  const rx = Math.max(3, Math.round(Math.abs(Math.cos(ang)) * 11)), tilt = f === 1 || f === 3 ? 0 : 0;
  const shift = Math.round(Math.sin(ang) * 3);
  const cx = 14 + shift, cy = 13;
  pb.ellipse(cx, cy, rx + 1, 9, CHEESE[0]);
  pb.ellipse(cx - 1, cy - 1, rx, 8, CHEESE[2]);
  pb.ellipse(cx - 1, cy, Math.max(1, rx - 2), 6, CHEESE[1]);
  pb.ellipse(cx - 2, cy - 1, Math.max(1, rx - 3), 4, CHEESE[3]);
  for (let i = 0; i < 4; i++) {                                                  // cheese holes
    const hx = cx - 1 + Math.round((hash2(i, f % 2, 4) - 0.5) * rx * 1.2), hy = cy - 4 + Math.round(hash2(i, 9, 4) * 9);
    pb.set(hx, hy, C.dorg);
  }
  // wedge cut-out look + rind edge on right
  pb.vline(cx + rx - 1, cy - 4, 8, C.rust);
  // whisker antenna: boom from dish centre, two whiskers with tip bulb
  const ax = cx + Math.round(Math.cos(ang) * 3), tipx = cx + (f < 2 ? 5 : -5) + shift;
  pb.line(cx, cy, tipx, 2, STEEL[3]); pb.line(cx, cy, tipx + (f < 2 ? 3 : -3), 4, STEEL[2]);
  pb.circle(tipx, 2, 1, E(C.red, 1, 0.3, 0.7));
  pb.line(cx, cy, cx, 0, STEEL[2]); pb.set(cx, 0, E(C.red, 1, 0.3, 0.7));
  return pb.outline(OUT, { diagonal: true });
}

// ---------------- mouse jet 28x24, 5 frames: bank -2..2 ----------------
function mouseJet(f) {
  const pb = new PixBuf(28, 24), bank = f - 2;
  const ox = bank * 1, sk = bank;                  // lean offset
  // engine glow below
  pb.rect(12 + ox, 19, 4, 3, E(C.org, 1)); pb.rect(13 + ox, 19, 2, 4, E(C.yel, 1)); pb.set(13 + ox, 22, E(C.white, 1));
  // wings: wedge-shaped, near wing bigger when banked
  const lw = 12 - Math.max(0, bank) * 2 + Math.max(0, -bank) * 2;     // left span
  const rw = 12 + Math.max(0, bank) * 2 - Math.max(0, -bank) * 2;
  const ly = 14 + sk, ry = 14 - sk;
  pb.poly([[14 + ox, 8], [14 - lw + ox, ly], [14 - lw + 3 + ox, ly + 3], [14 + ox, 18]], C.org);
  pb.poly([[14 + ox, 8], [14 + rw + ox, ry], [14 + rw - 3 + ox, ry + 3], [14 + ox, 18]], C.rust);
  pb.poly([[14 + ox, 8], [14 - lw + 2 + ox, ly - 1], [14 - lw + 6 + ox, ly + 1], [14 + ox, 13]], C.gold);
  pb.rect(14 - lw + ox, ly, 2, 2, C.red); pb.rect(14 + rw - 2 + ox, ry, 2, 2, C.dred);
  // fuselage = cheese wedge: lit top-left
  pb.poly([[14 + ox, 4], [9 + ox, 19], [19 + ox, 19]], CHEESE[3]);
  pb.poly([[14 + ox, 4], [9 + ox, 19], [12 + ox, 19]], C.white);
  pb.set(14 + ox, 14, C.dorg); pb.set(15 + ox, 12, C.dorg); pb.set(12 + ox, 16, C.dorg);
  // tail fins
  pb.rect(8 + ox, 16, 3, 3, C.red); pb.rect(17 + ox, 16, 3, 3, C.dred);
  // cockpit bubble + tiny mouse
  pb.ellipse(14 + ox, 10, 4, 4, G('#7fd0ff', 0.9, 0.5));
  pb.circle(14 + ox, 11, 2, RAT[2]); pb.circle(11 + ox, 8, 2, RAT[1]); pb.circle(17 + ox, 8, 2, RAT[1]);
  pb.set(11 + ox, 8, C.pink); pb.set(17 + ox, 8, C.pink); pb.set(12 + ox, 9, E(C.white, 1, 1, 1));
  pb.rect(12 + ox, 12, 5, 1, C.red); // tiny scarf/goggle band
    return pb.outline(OUT, { diagonal: true });
}

// ---------------- hot spud 24x24, 4 frames ----------------
function hotSpud(f) {
  const pb = new PixBuf(24, 24);
  const a = (f / 4) * Math.PI * 2;
  const POT = ['#6b3a22', '#a8683a', '#d08c4a', '#ecb067'];
  // lumpy potato body, slightly wobbling radius to look tumbling
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const dx = x + 0.5 - 12, dy = y + 0.5 - 12, th = Math.atan2(dy, dx), d = Math.hypot(dx / 1.15, dy);
    const rr = 8.4 + 1.2 * Math.sin(th * 2 + a) + 0.8 * Math.sin(th * 3 - a * 2);
    if (d > rr) continue;
    const t = Math.min(1, Math.max(0, d / rr + (dx + dy) / 40));
    pb.set(x, y, POT[3 - Math.min(3, Math.floor(t * 4))]);
  }
  // glowing ember cracks (rotate with tumble)
  const cracks = [[-5, -2, 1, 3], [1, -6, 4, 4], [-1, 2, 5, -2], [-6, 4, 3, 2]];
  for (const [x0, y0, dx, dy] of cracks) {
    const c = Math.cos(a * 0.5), s = Math.sin(a * 0.5), rot = (px, py) => [12 + Math.round(px * c - py * s * 0.4), 12 + Math.round(px * s * 0.4 + py * c)];
    const p0 = rot(x0, y0), p1 = rot(x0 + dx, y0 + dy), p2 = rot(x0 + dx * 2, y0 + dy * 1.4);
    if (pb.has(p0[0], p0[1])) { pb.line(p0[0], p0[1], p1[0], p1[1], E(C.org, 1, 0, 0.3)); if (pb.has(p2[0], p2[1])) pb.line(p1[0], p1[1], p2[0], p2[1], E(C.yel, 1, 0, 0.4)); }
  }
  // angry face, sticks to the front (shifts a bit per frame)
  const fx = 12 + Math.round(Math.sin(a) * 1.5);
  pb.rect(fx - 4, 10, 3, 3, E(C.white, 0.9)); pb.rect(fx + 2, 10, 3, 3, E(C.white, 0.9));
  pb.set(fx - 2, 12, C.dvio); pb.set(fx + 2, 12, C.dvio); pb.set(fx - 3, 11, C.dvio); pb.set(fx + 3, 11, C.dvio);
  pb.line(fx - 5, 8, fx - 1, 10, OUT); pb.line(fx + 6, 8, fx + 2, 10, OUT);
  pb.hline(fx - 3, 16, 7, OUT); pb.set(fx - 3, 15, OUT); pb.set(fx + 3, 15, OUT); pb.hline(fx - 2, 15, 5, E(C.red, 0.8));
  // eyes (potato sprouts)
  pb.set(7, 7, POT[0]); pb.set(17, 17, POT[0]);
  // heat shimmer / sparks
  const sp = [[4, 3], [19, 4], [20, 18], [3, 19]];
  const [sx, sy] = sp[f]; pb.set(sx, sy, E(C.yel, 1)); pb.set(sx + (f % 2 ? 1 : -1), sy - 1, E(C.org, 1));
  pb.set(sp[(f + 2) % 4][0], sp[(f + 2) % 4][1], E(C.org, 1));
  return pb.outline(OUT, { diagonal: true });
}

export function build() {
  const seq = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
  return {
    rat_turret: seq(6, ratTurret),
    can_pad: seq(3, canPad),
    can_rocket: seq(4, canRocket),
    tuna_tin: seq(2, tunaTin),
    radar_dish: seq(4, radarDish),
    mouse_jet: seq(5, mouseJet),
    hot_spud: seq(4, hotSpud),
  };
}
