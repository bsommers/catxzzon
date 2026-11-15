// Art module fx: cheese-splat explosions, crumbs, sparks, smoke, shockwave ring, field post, spray-cheese strand, cheeseball.
import { PixBuf, ink, hash2, mix } from './pixbuf.js';

const OUT = '#1a1420';
const C = {
  white: '#fffbe0', pale: '#fff1a0', yel: '#ffd93a', gold: '#ffbe2e', org: '#ff9a2e', dorg: '#d96a22', rust: '#a8441f', vio: '#5a2f55', dvio: '#3a2040',
};
const E = (c, emit = 0.8, gloss = 0.2, spark = 0) => ink(c, { emit, gloss, spark });
const cheeseRamp = [C.pale, C.pale, C.yel, C.yel, C.gold, C.org, C.dorg];

// A lumpy splat blob: radius varies by angle. t=0 centre .. 1 edge picks the colour.
function splat(pb, cx, cy, r, seed, { lobes = 9, jag = 0.35, holes = true, ramp = cheeseRamp, emit = 0.7 } = {}) {
  const ph = hash2(seed, 1, 7) * 6.28;
  for (let y = Math.floor(cy - r * 1.5); y <= cy + r * 1.5; y++) for (let x = Math.floor(cx - r * 1.5); x <= cx + r * 1.5; x++) {
    const dx = x - cx + 0.5, dy = y - cy + 0.5, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
    const rr = r * (1 + jag * (Math.sin(a * lobes + ph) * 0.6 + Math.sin(a * (lobes + 3) + ph * 2) * 0.4));
    if (d > rr) continue;
    let t = d / rr;
    t = Math.min(1, Math.max(0, t + (dx + dy) / (r * 8)));   // light from upper-left: lower-right is darker
    const hole = holes && r > 6 && hash2(Math.floor(x / 3), Math.floor(y / 3), seed) > 0.84 && t > 0.25 && t < 0.85;
    const col = ramp[Math.min(ramp.length - 1, Math.floor(t * (ramp.length - 0.01)))];
    pb.set(x, y, E(hole ? C.dorg : col, emit * (1 - t * 0.6), 0.25, t < 0.3 ? 0.4 : 0));
  }
}
// Flung glob with a tail toward the centre.
function glob(pb, x, y, r, col = C.gold) {
  pb.circle(x, y, r, E(col, 0.6, 0.3));
  if (r >= 1) pb.set(x - 1, y - 1, E(C.pale, 0.9, 0.5, 0.5));
}

function boom(size, frames, seedBase) {
  const out = [], h = size / 2;
  for (let f = 0; f < frames; f++) {
    const pb = new PixBuf(size, size), t = f / (frames - 1);
    const grow = Math.sin(Math.min(1, t * 1.25) * Math.PI / 2);            // fast pop, then settle
    const R = size * (0.1 + 0.22 * grow) * (t > 0.7 ? 1 - (t - 0.7) * 0.5 : 1);
    const ramp = t < 0.35 ? cheeseRamp : cheeseRamp.slice(1).concat([C.rust]);
    if (t < 0.9) splat(pb, h, h, R, seedBase + f, { ramp, jag: 0.22 + 0.1 * t, emit: 0.9 - t * 0.6 });
    // flying globs, spread outward
    const n = size > 40 ? 11 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + hash2(i, seedBase, 3) * 0.6, dist = R * 1.1 + grow * size * (0.05 + 0.1 * hash2(i, seedBase, 5));
      const gr = Math.max(0, Math.round((size > 40 ? 3 : 2) * (1 - t * 0.7) * (0.6 + hash2(i, 2, seedBase))));
      if (t < 0.15) continue;
      if (gr > 0 || t < 0.9) glob(pb, Math.round(h + Math.cos(a) * dist), Math.round(h + Math.sin(a) * dist * 0.85 + t * size * 0.08), gr, i % 2 ? C.gold : C.org);
    }
    // cheese drips hanging from the splat
    if (t > 0.3 && t < 0.95) for (let i = 0; i < (size > 40 ? 5 : 3); i++) {
      const dx = Math.round(h + (i - (size > 40 ? 2 : 1)) * R * 0.4), y0 = Math.round(h + R * 0.55), len = Math.round((1 + 2 * hash2(i, 4, seedBase)) * (size / 32) * (0.5 + t));
      for (let k = 0; k < len; k++) pb.set(dx, y0 + k, E(k === len - 1 ? C.pale : C.gold, 0.5, 0.5));
    }
    // crumb ring on the big one's late frames
    if (size > 40 && t > 0.4) for (let i = 0; i < 14; i++) {
      const a = (i / 14) * 6.283 + hash2(i, 9, seedBase), d = size * (0.28 + 0.2 * t);
      pb.rect(Math.round(h + Math.cos(a) * d), Math.round(h + Math.sin(a) * d * 0.9), 2, 2, E(i % 3 ? C.yel : C.pale, 0.5));
    }
    pb.outline(OUT, { diagonal: true });
    out.push(pb);
  }
  return out;
}

function crumb() {
  const cols = [C.pale, C.yel, C.gold, C.org];
  return cols.map((c, i) => {
    const pb = new PixBuf(4, 4);
    pb.rect(0, 0, 4, 4, ink(OUT)).rect(1, 1, 2, 2, E(c, 0.3, 0.2));
    pb.set(0, 0, [0, 0, 0, 0]).set(3, 3, [0, 0, 0, 0]);
    if (i % 2) pb.set(3, 0, [0, 0, 0, 0]); else pb.set(0, 3, [0, 0, 0, 0]);
    pb.set(1, 1, E(mixc(c), 0.6, 0.4, 0.5));
    return pb;
  });
}
const mixc = (c) => mix(ink(c), ink('#ffffff'), 0.6);

function spark() {
  return [3.4, 2.8, 1.9, 1].map((r, f) => {
    const pb = new PixBuf(8, 8), s = ink(C.white, { emit: 1, spark: 1 });
    const L = Math.round(r + 0.5);
    for (let i = -L; i <= L; i++) { pb.set(3 + i, 3, E(i === 0 ? C.white : C.yel, 1, 0, 1)); pb.set(4 + i, 4, E(i === 0 ? C.white : C.pale, 1, 0, 1)); }
    for (let i = -L; i <= L; i++) { pb.set(3, 3 + i, E(C.yel, 1, 0, 1)); pb.set(4, 4 + i, E(C.pale, 1, 0, 1)); }
    pb.rect(3, 3, 2, 2, s);
    if (f < 2) { pb.set(1, 1, E(C.gold, 1)); pb.set(6, 6, E(C.gold, 1)); pb.set(6, 1, E(C.gold, 1)); pb.set(1, 6, E(C.gold, 1)); }
    return pb;
  });
}

function smoke() {
  return [0, 1, 2, 3].map((f) => {
    const pb = new PixBuf(16, 16), r = 3 + f * 1.4, a = 255 - f * 35;
    const ramp = ['#c9a8c0', '#9a7d9a', '#6f567a', '#4d3a5c'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 8 + f * 0.8; // drifts up
      const rr = r * (1 + 0.25 * Math.sin(Math.atan2(dy, dx) * 5 + f) + (hash2(x, y, f) - 0.5) * 0.15);
      const d = Math.hypot(dx, dy);
      if (d > rr) continue;
      const t = Math.min(1, Math.max(0, d / rr + (dx + dy) * 0.04));
      const c = ramp[Math.min(3, Math.floor(t * 4))];
      pb.set(x, y, ink(c, { a }));
    }
    if (f < 3) pb.outline(OUT);
    else pb.outline('#1a142088');
    return pb;
  });
}

function ring() {
  return [0, 1, 2, 3].map((f) => {
    const pb = new PixBuf(48, 24), rx = 8 + f * 5.2, ry = rx / 2, th = 4.2 - f * 0.8;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) {
      const e = Math.hypot((x - 23.5) / rx, (y - 11.5) / ry), w = th / rx;
      const dd = Math.abs(e - 1);
      if (dd > w) continue;
      const a = Math.round(255 * (1 - f * 0.12));
      const lit = (x + y * 2) < 40 ? 1 : 0;
      const core = dd < w * 0.35;
      pb.set(x, y, ink(core ? C.white : lit ? C.yel : C.org, { a, emit: core ? 1 : 0.8, spark: core ? 0.5 : 0 }));
    }
    return pb;
  });
}

function fieldPost() {
  return [0, 1].map((f) => {
    const pb = new PixBuf(16, 40), g = f === 1;
    // glow frame around the can (frame 1 brighter)
    const glow = ink(g ? C.pale : C.gold, { a: g ? 120 : 50, emit: 1 });
    pb.ellipse(8, 22, 8, 17, glow);
    // can body: silver-violet metal with cheese label band
    const body = ['#3a2a4a', '#6a5a82', '#9d8cb8', '#d4c8e6'];
    for (let y = 14; y < 37; y++) for (let x = 3; x < 13; x++) {
      const t = (x - 3) / 9;
      const c = body[t < 0.2 ? 3 : t < 0.5 ? 2 : t < 0.8 ? 1 : 0];
      pb.set(x, y, ink(c, { gloss: 0.7 }));
    }
    // label band
    for (let y = 20; y < 31; y++) for (let x = 3; x < 13; x++) {
      const t = (x - 3) / 9;
      pb.set(x, y, E(t < 0.25 ? C.pale : t < 0.6 ? C.yel : t < 0.85 ? C.gold : C.org, g ? 0.8 : 0.4, 0.3));
    }
    pb.set(6, 25, E(C.rust, 0.4)).set(9, 24, E(C.rust, 0.4)).set(8, 27, E(C.rust, 0.4)); // cheese holes logo
    // shoulder + cap + nozzle pointing up
    pb.rect(4, 11, 8, 3, ink(body[2], { gloss: 0.7 })).rect(5, 9, 6, 2, ink(body[1], { gloss: 0.6 }));
    pb.rect(5, 9, 2, 5, ink(body[3], { gloss: 0.8 }));
    pb.rect(6, 5, 4, 5, ink(C.org, { emit: 0.3, gloss: 0.5 })).rect(6, 5, 1, 5, ink(C.pale, { emit: 0.4 }));
    pb.rect(7, 2, 2, 4, ink(C.rust)).set(7, 2, E(C.pale, 1, 0, 1));
    // glowing cheese bead at the tip
    pb.circle(8, 2, g ? 2 : 1, E(g ? C.white : C.yel, 1, 0.3, 1));
    // base rim
    pb.rect(3, 36, 10, 2, ink(body[0], { gloss: 0.5 }));
    pb.outline(OUT);
    return pb;
  });
}

function strand() {
  return [0, 1, 2, 3].map((f) => {
    const pb = new PixBuf(16, 16);
    pb.fill(ink('#000000'));
    const ph = f / 4, yc = (x) => 6 + 2.2 * Math.sin(2 * Math.PI * (x / 16 + ph)), th = 3.2;
    for (let x = 0; x < 16; x++) {
      const c = yc(x), slope = 2.2 * 2 * Math.PI / 16 * Math.cos(2 * Math.PI * (x / 16 + ph));
      for (let y = 0; y < 16; y++) {
        const d = (y - c) / th;                 // -1 top .. 1 bottom
        if (Math.abs(d) > 1) continue;
        const bumpy = 0.12 * Math.sin(2 * Math.PI * (x / 4 + ph * 2));
        const sh = d + bumpy + slope * 0.1;     // shading coordinate
        const edge = Math.abs(d) > 0.82;
        let col;
        if (edge) col = C.rust;
        else if (sh < -0.55) col = C.white;
        else if (sh < -0.2) col = C.pale;
        else if (sh < 0.25) col = C.yel;
        else if (sh < 0.6) col = C.gold;
        else col = C.org;
        pb.set(x, y, ink(col, { emit: 0.8, gloss: sh < -0.2 ? 1 : 0.4, spark: sh < -0.55 ? 0.8 : 0 }));
      }
    }
    // glossy specular dashes, slide with the animation
    for (const bx of [2, 10]) {
      const x = (bx + f * 4) % 16, y = Math.round(yc(x) - 1.6);
      pb.set(x, y, ink('#ffffff', { emit: 1, gloss: 1, spark: 1 })); pb.set((x + 1) % 16, y, ink('#ffffff', { emit: 1, gloss: 1, spark: 1 }));
    }
    // drips (wrap-safe, columns fixed in x so the tile stays seamless; length pulses)
    for (const dx of [4, 12]) {
      const len = 2 + ((f + (dx > 8 ? 2 : 0)) % 4);
      const top = Math.ceil(yc(dx) + th - 0.5);
      for (let k = 0; k < len; k++) pb.set(dx, top + k, ink(k < len - 1 ? C.gold : C.org, { emit: 0.7, gloss: 0.6 }));
      pb.set(dx, top + len, ink(C.yel, { emit: 0.9, gloss: 1, spark: 0.6 }));
      pb.set(dx - 1, top, ink(C.gold, { emit: 0.7 })); pb.set(dx + 1, top, ink(C.org, { emit: 0.7 }));
    }
    return pb;
  });
}

function cheeseball() {
  return [0, 1].map((f) => {
    const pb = new PixBuf(10, 10);
    pb.circle(4.5, 4.5, 4, E(C.gold, 0.7, 0.5));
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
      const d = Math.hypot(x - 4.5, y - 4.5);
      if (d > 4.2) continue;
      const t = d / 4.2 + ((x + y) - 9) * 0.04;
      pb.set(x, y, E(t < 0.35 ? C.pale : t < 0.65 ? C.yel : t < 0.9 ? C.gold : C.org, 0.8, 0.6));
    }
    pb.set(5 + f, 5 - f, E(C.rust, 0.5)).set(3, 6 - f, E(C.dorg, 0.5)); // cheese holes, rotate
    pb.rect(2, 2, 2, 1, E('#ffffff', 1, 1, 1)).set(2, 3, E('#ffffff', 1, 1, 1));
    // little trailing nub toward bottom-left alternates
    pb.set(f ? 0 : 1, f ? 9 : 8, E(C.org, 0.6));
    pb.outline(OUT);
    return pb;
  });
}

export function build() {
  return {
    boom_small: boom(32, 6, 11),
    boom_big: boom(64, 8, 23),
    crumb: crumb(),
    spark: spark(),
    smoke: smoke(),
    ring: ring(),
    field_post: fieldPost(),
    strand: strand(),
    cheeseball: cheeseball(),
  };
}
