// Art module `cat` (owner: art-cat): Major Marmalade's ship, portraits, shots and pickups.
// Pure & deterministic. The 3D-ish sprites (ship, portrait) are rendered with a tiny orthographic SDF ray-marcher
// into quantised 4-tone ramps, then outlined; small items are drawn directly with PixBuf primitives.
import { PixBuf, ink, hash2, mix, shade } from './pixbuf.js';

const OUT = '#1a1420';

// ---------- palette (warm cheese/orange, violet shadows) ----------
const R = {
  fur:    ['#5e2440', '#a8401f', '#e8792a', '#ffb24a'],
  stripe: ['#3e1834', '#6e2626', '#a8441c', '#cc5e22'],
  cream:  ['#6e4a6a', '#c48f7e', '#f0cda0', '#fff3d6'],
  pink:   ['#6a2850', '#b84a6a', '#ec8a9a', '#ffc2c8'],
  scarf:  ['#3e1432', '#8e1a3a', '#de3048', '#ff7a6a'],
  brass:  ['#4a2c2a', '#8a5a24', '#d4a234', '#ffe88a'],
  lens:   ['#1c2c58', '#2a74a8', '#6af0ff', '#e6ffff'],
  strap:  ['#24162a', '#43283a', '#62403c', '#86603e'],
  iris:   ['#2e4a1a', '#5e9a22', '#a8e040', '#e8ff9a'],
};
const FLAME = ['#fff8d0', '#ffe14a', '#ff9a2e', '#ff5a2a', '#d8304a'];

// ---------- vector helpers ----------
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
function sdEll(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const k1 = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2) || 1e-6;
  return (k0 * (k0 - 1)) / k1;
}
// round cone / tapered capsule a->b with radii ra->rb; returns [dist, t along]
function sdCone(px, py, pz, a, b, ra, rb) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const qx = px - a[0], qy = py - a[1], qz = pz - a[2];
  const t = clamp((qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  return [len3(qx - bx * t, qy - by * t, qz - bz * t) - (ra + (rb - ra) * t), t];
}
const smin = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
const BAYER = [0, 0.5, 0.75, 0.25];

// ---------- generic orthographic SDF renderer ----------
// scene(x,y,z) -> { d, m (material key), part, tt } ; project: screen(px,py) -> ray origin + dir (world)
function renderSDF(w, h, { scene, ray, light, toLocal, paint, steps = 64, far = 80 }) {
  const img = new PixBuf(w, h), depth = new Float32Array(w * h).fill(Infinity);
  const L = norm(light);
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const [o, d] = ray(px + 0.5, py + 0.5);
      let t = 0, hit = null;
      for (let i = 0; i < steps && t < far; i++) {
        const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
        const s = scene(...toLocal(p));
        if (s.d < 0.02) { hit = { p, s }; break; }
        t += Math.max(0.04, s.d * 0.85);
      }
      if (!hit) continue;
      const lp = toLocal(hit.p), e = 0.08;
      const gx = scene(lp[0] + e, lp[1], lp[2]).d - scene(lp[0] - e, lp[1], lp[2]).d;
      const gy = scene(lp[0], lp[1] + e, lp[2]).d - scene(lp[0], lp[1] - e, lp[2]).d;
      const gz = scene(lp[0], lp[1], lp[2] + e).d - scene(lp[0], lp[1], lp[2] - e).d;
      const n = norm([gx, gy, gz]);                  // local-frame normal
      const lit = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
      const dither = BAYER[(px & 1) + (py & 1) * 2] * 0.12 - 0.06;
      const c = paint({ lp, n, lit: lit + dither, s: hit.s, px, py });
      if (c) { img.set(px, py, c); depth[py * w + px] = t; }
    }
  // interior contour lines on depth breaks (separates wings/ears from body)
  const lines = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dz = depth[y * w + x];
      if (!isFinite(dz)) continue;
      for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + nx, Y = y + ny;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const nd = depth[Y * w + X];
        if (isFinite(nd) && dz - nd > 2.6) { lines.push(x, y); break; }
      }
    }
  for (let i = 0; i < lines.length; i += 2) {
    const p = img.get(lines[i], lines[i + 1]);
    if (p.emit < 0.5) img.set(lines[i], lines[i + 1], mix(p, ink(OUT), 0.78));
  }
  return img;
}

const tone = (rampName, lit, bias = 0) => {
  const r = R[rampName], v = lit + bias;
  return r[v < -0.05 ? 0 : v < 0.38 ? 1 : v < 0.78 ? 2 : 3];
};

// =====================================================================================
// cat_ship: local frame u = right wing, v = forward (nose), h = up. Iso: sx = u+v, sy = (u-v)/2 - h.
// =====================================================================================
const SHIP_SCALE = 0.98;
function shipScene(anim) {
  const wave = anim ? 1 : -1;
  const tailA = [0, -8.5, 3], tailB = [-1.8, -12.5, 4.2], tailC = [-1.4, -15.2, 6.6];
  const flameEnd = [-2.6 + wave * 0.4, anim ? -23.6 : -22, 5.4 + wave * 0.5];
  return (u, v, h) => {
    const au = Math.abs(u);
    let best = { d: Infinity, m: 'fur', part: 'body', tt: 0 };
    const take = (d, m, part, tt = 0) => { if (d < best.d) best = { d, m, part, tt }; };
    // fur mass (smooth union of body, haunches, head, cheeks)
    let body = sdEll(u, v, h, 0, -1, 3, 5.4, 8.6, 3.8);
    body = smin(body, sdEll(au, v, h, 4.1, -6, 2.4, 3, 3.4, 2.7), 1.6);
    const head = sdEll(u, v, h, 0, 8.6, 6.8, 6.6, 5.6, 5.3);
    let fur = smin(body, head, 2.4);
    fur = smin(fur, sdEll(au, v, h, 4.9, 9.6, 5.6, 2.6, 2.5, 2.2), 1.2);
    const isHead = head < body;
    take(fur, 'fur', isHead ? 'head' : 'body');
    // ears (round cones), pink rim on the forward face
    const [ear] = sdCone(au, v, h, [3.4, 9.6, 10.2], [4.9, 10.8, 15.6], 2.7, 0.4);
    take(ear, 'fur', 'ear');
    // front legs outstretched like wings, white socks
    const [leg, lt] = sdCone(au, v, h, [3.6, 4, 3.2], [13.2, 3, 2.6], 2.5, 2.0);
    take(leg, 'fur', 'leg', lt);
    take(sdEll(au, v, h, 14.6, 3.3, 2.6, 2.6, 2.5, 1.9), 'cream', 'paw');
    take(sdEll(au, v, h, 4.6, -9.4, 1.2, 1.8, 2, 1.3), 'cream', 'hpaw');
    // tail curling up, then the flame plume
    const [t1, tt1] = sdCone(u, v, h, tailA, tailB, 1.8, 1.6);
    take(t1, 'fur', 'tail', tt1 * 0.5);
    const [t2, tt2] = sdCone(u, v, h, tailB, tailC, 1.6, 1.5);
    take(t2, 'fur', 'tail', 0.5 + tt2 * 0.5);
    const [fl, ft] = sdCone(u, v, h, tailC, flameEnd, 2.5, 0.2);
    take(fl - 0.35 * Math.sin(ft * 9 + (anim ? 2 : 0)) * ft, 'flame', 'flame', ft);
    // scarf ring + fluttering tail on the right side
    const qr = Math.hypot(u, (h - 5.2) * 1.15) - 4.3, qv = v - 4.4;
    take(Math.hypot(qr, qv) - 1.25, 'scarf', 'scarf');
    const s1 = [3.4, 3.8, 6.2], s2 = [7, -0.6, 6.4 + wave * 0.6], s3 = [9.6 - wave * 0.4, -3.6, 5.6 - wave * 0.8];
    take(sdCone(u, v, h, s1, s2, 1.15, 0.95)[0], 'scarf', 'scarfTail');
    take(sdCone(u, v, h, s2, s3, 0.95, 0.75)[0], 'scarf', 'scarfTail');
    // aviator goggles pushed up on the forehead
    take(sdEll(au, v, h, 2.5, 11.2, 10.7, 2.0, 1.6, 1.5), 'goggle', 'goggle');
    return best;
  };
}

function paintShip(bankRoll) {
  return ({ lp, n, lit, s }) => {
    const [u, v, h] = lp;
    if (s.m === 'flame') {
      const i = Math.min(FLAME.length - 1, Math.floor(s.tt * FLAME.length * 0.98 + (lit < 0.2 ? 0.6 : 0)));
      return ink(FLAME[i], { emit: 1 - s.tt * 0.3, spark: s.tt < 0.3 ? 0.4 : 0 });
    }
    if (s.m === 'goggle') {
      const au = Math.abs(u), r = Math.hypot(au - 2.5, (v - 11.2) * 1.2);
      if (r < 1.05 && n[2] > 0.2) return ink(tone('lens', lit, 0.15), { gloss: 1, emit: 0.15 });
      return ink(tone('brass', lit), { gloss: 0.7 });
    }
    if (s.m === 'scarf') return ink(tone('scarf', lit), { gloss: 0.1 });
    if (s.m === 'cream') return ink(tone('cream', lit, 0.1));
    // fur: stripes + strap + pink ear rim
    let ramp = 'fur';
    const au = Math.abs(u);
    if (s.part === 'body') {
      const w = v + 0.11 * u * u;
      if (Math.sin(w * 1.55) > 0.45 && n[2] > -0.2) ramp = 'stripe';
      if (au < 0.7 && v < 2 && v > -7) ramp = 'stripe';
    } else if (s.part === 'head') {
      if (v > 11 && Math.hypot(au - 4.1, h - 7.9) < 1.15) return ink(Math.hypot(au - 4.1, h - 7.9) < 0.6 ? '#2a1830' : R.iris[2], { gloss: 0.8 });
      if (v < 10 && h > 6.6 && (Math.abs(u) < 0.55 || Math.abs(au - 2.2) < 0.5)) ramp = 'stripe';
      const strap = h - 10.6 - 0.55 * (v - 11.4);
      if (Math.abs(strap) < 0.7) return ink(tone('strap', lit), { gloss: 0.2 });
    } else if (s.part === 'leg') {
      if (Math.sin(s.tt * 15) > 0.55) ramp = 'stripe';
    } else if (s.part === 'tail') {
      if (Math.sin(s.tt * 13) > 0.5) ramp = 'stripe';
      if (s.tt > 0.82) return ink(mix(tone('fur', lit, 0.4), ink(FLAME[1]), 0.5), { emit: 0.6 });
    } else if (s.part === 'ear') {
      if (n[1] > 0.35) return ink(tone('pink', lit, 0.1));
    }
    return ink(tone(ramp, lit), { gloss: 0.05 });
  };
}

function shipFrame(bank, anim) {
  const W = 48, H = 40, CX = 25, CY = 26;
  const roll = -bank * 0.2 - 0.12, pitch = 0.22;   // base: slight right roll + nose-up so the back faces the camera
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const scene = shipScene(anim);
  const D = norm([-1, 1, -1]);                    // view ray (toward -u, +v, down) in world
  return renderSDF(W, H, {
    scene,
    light: [-0.62, 0.12, 0.78],
    ray: (px, py) => {
      const X = (px - CX) / SHIP_SCALE, Y = (py - CY) / SHIP_SCALE, h0 = 22;
      const u = (X + 2 * (Y + h0)) / 2, v = (X - 2 * (Y + h0)) / 2;
      return [[u, v, h0], D];
    },
    // world -> local: undo the roll about the forward (v) axis; slight yaw into the turn
    toLocal: ([u, v, h]) => {
      const yaw = bank * 0.06, cy = Math.cos(yaw), sy = Math.sin(yaw);
      const uu = u * cy + v * sy, vv = -u * sy + v * cy;
      const lu = uu * cr + h * sr, lh = -uu * sr + h * cr;
      return [lu, vv * cp + lh * sp, -vv * sp + lh * cp];
    },
    paint: paintShip(roll),
  }).outline(OUT);
}

// =====================================================================================
// cat_portrait 64x64: front bust; x right, y up, z toward viewer. Features painted in 2D afterwards.
// =====================================================================================
function portraitScene(mood) {
  const earTip = mood === 1 ? [19.5, 18, -1] : [14.5, 27, -1];
  return (x, y, z) => {
    const ax = Math.abs(x);
    let best = { d: Infinity, m: 'fur', part: 'head', tt: 0 };
    const take = (d, m, part, tt = 0) => { if (d < best.d) best = { d, m, part, tt }; };
    let head = sdEll(x, y, z, 0, 5, 0, 16, 13.5, 12);
    head = smin(head, sdEll(ax, y, z, 9.5, -2.5, 3, 9, 7, 8), 3);
    const chest = sdEll(x, y, z, 0, -28, -4, 22, 13, 10);
    take(smin(head, chest, 1.5), 'fur', head < chest ? 'head' : 'chest');
    const [ear, et] = sdCone(ax, y, z, [9.5, 13, 0], earTip, 6.2, 1.1);
    take(ear, 'fur', 'ear', et);
    take(sdEll(ax, y, z, 3.4, -4.4, 9.4, 5, 3.8, 4), 'cream', 'muzzle');
    take(sdEll(x, y, z, 0, -8.6, 7.6, 4.2, 3, 4), 'cream', 'chin');
    // scarf around the neck + knot
    take(Math.hypot(Math.hypot(x / 1.25, z + 1) - 12.5, (y + 14.5) * 1.1) - 3.4, 'scarf', 'scarf');
    take(sdEll(x, y, z, 7, -17, 10, 4.2, 3.6, 3), 'scarf', 'knot');
    take(sdCone(x, y, z, [7, -18, 10], [11 + (mood === 2 ? 4 : 0), -29, 9], 2.4, 2.8)[0], 'scarf', 'scarfTail');
    // goggles on the forehead
    take(sdEll(ax, y, z, 6.2, 14.6, 9.6, 5, 4.2, 3), 'goggle', 'goggle');
    return best;
  };
}

function paintPortrait(mood) {
  return ({ lp, n, lit, s }) => {
    const [x, y] = lp, ax = Math.abs(x);
    if (s.m === 'goggle') {
      const r = Math.hypot(ax - 6.2, (y - 14.6) * 1.15);
      if (r < 3.3 && n[2] > 0.4) {
        if (mood === 2 && x < 0 && r < 1.4 && y > 14.9) return ink('#ffffff', { gloss: 1, spark: 1, emit: 0.5 });
        return ink(tone('lens', lit, 0.1), { gloss: 1, emit: 0.1 });
      }
      return ink(tone('brass', lit), { gloss: 0.8 });
    }
    if (s.m === 'scarf') {
      const st = Math.sin((x + y) * 0.9) > 0.75 ? 0.25 : 0;        // woven sheen
      return ink(tone('scarf', lit, st), { gloss: 0.1 });
    }
    if (s.m === 'cream') return ink(tone('cream', lit, 0.15));
    let ramp = 'fur';
    if (s.part === 'ear') {
      const inner = mood === 1 ? 0.25 : 0.35;
      if (n[2] > inner && s.tt > 0.12 && s.tt < 0.86 && Math.abs(ax - (9.5 + s.tt * ((mood === 1 ? 19.5 : 14.5) - 9.5))) < 3.6 * (1 - s.tt))
        return ink(tone('pink', lit, 0.15));
    } else if (s.part === 'head') {
      // forehead "M" stripes and cheek stripes
      if (y > 15 && y < 22 && ax < 1.1 + (y - 13) * 0.05 && ax > 0) ramp = 'stripe';
      if (y > 15 && Math.abs(ax - 3.2 + (y - 15) * 0.2) < 0.7) ramp = 'stripe';
      if (ax > 12 && Math.abs(Math.sin((y + ax * 0.4) * 0.75)) > 0.86) ramp = 'stripe';
      const strap = y - 14.6;
      if (Math.abs(strap) < 1.2 && ax > 10) return ink(tone('strap', lit), { gloss: 0.2 });
    } else if (s.part === 'chest') {
      if ((ax / 8) ** 2 + ((y + 31) / 11) ** 2 < 1) return ink(tone('cream', lit, 0.15));
      if (Math.sin(y * 0.7 + ax * 0.15) > 0.55 && ax > 9) ramp = 'stripe';
    }
    return ink(tone(ramp, lit), { gloss: 0.05 });
  };
}

function eye(p, cx, cy, mood, side) {
  const E = '#2a1830';
  if (mood === 2) {                                // happy closed arcs ^ ^
    for (let i = -3; i <= 3; i++) {
      const yy = cy + Math.round(Math.abs(i) * 0.7) - 1;
      p.set(cx + i, yy, E); p.set(cx + i, yy + 1, E);
    }
    return;
  }
  const rx = mood === 1 ? 4 : 4, ry = mood === 1 ? 4.6 : 3.4;
  p.ellipse(cx, cy, rx + 1, ry + 1, E);
  p.ellipse(cx, cy, rx, ry, R.iris[2]);
  p.ellipse(cx - 0.5, cy + 1, rx - 0.8, ry - 1.4, R.iris[1]);
  if (mood === 1) { p.ellipse(cx + side * 0.5, cy + 0.5, 1.4, 1.6, E); }
  else { p.rect(cx - 1 + (side > 0 ? 0 : 0), cy - ry + 1, 2, ry * 2 - 1, E); }
  p.set(cx - 2, cy - 2, '#ffffff'); p.set(cx - 1, cy - 2, '#ffffff'); p.set(cx - 2, cy - 1, '#ffffff');
  p.set(cx + 2, cy + 2, R.iris[3]);
  if (mood === 0) {                                // cocky half-lid: fur over the upper eye, slanted
    for (let i = -5; i <= 5; i++) {
      const top = Math.round(cy - ry - 1 + (side * i > 0 ? 0 : 0)), lid = Math.round(cy - 1 - side * i * 0.25);
      for (let yy = top; yy < lid; yy++) if (p.get(cx + i, yy) && Math.hypot(i / (rx + 1.5), (yy - cy) / (ry + 1.5)) < 1) p.set(cx + i, yy, R.fur[2]);
      if (Math.abs(i) <= rx) p.set(cx + i, lid, E);
    }
  }
}

function portraitFrame(mood) {
  const W = 64, H = 64, CX = 32, CY = 31;
  const img = renderSDF(W, H, {
    scene: portraitScene(mood), light: [-0.55, 0.6, 0.6], steps: 80, far: 120,
    ray: (px, py) => [[px - CX, CY - py, 40], [0, 0, -1]],
    toLocal: (p) => p,
    paint: paintPortrait(mood),
  });
  const E = '#2a1830', ex = 8, ey = 27;
  // brows (fur tufts)
  for (const sd of [-1, 1]) {
    const bx = CX + sd * ex - (sd < 0 ? 1 : 0);
    for (let i = -3; i <= 3; i++) {
      let dy = mood === 1 ? -sd * i * 0.6 : mood === 0 ? (sd > 0 ? -1 + i * sd * 0.35 : i * 0.25) : -Math.abs(i) * 0.3;
      if (mood === 1) dy = (i * sd) * 0.55;
      p2(img, bx + i, ey - 6 + Math.round(dy), R.stripe[1]);
    }
    eye(img, bx, ey, mood, sd);
  }
  // nose + mouth
  img.poly([[CX - 2.5, 33], [CX + 2.5, 33], [CX, 36]], R.pink[2]);
  img.set(CX - 1, 33, R.pink[3]);
  img.vline(CX, 36, 2, E);
  if (mood === 0) {                                 // confident grin with a fang
    for (let i = 1; i <= 5; i++) { img.set(CX - i, 38 - (i > 3 ? 1 : 0), E); img.set(CX + i, 38 - (i > 2 ? 1 : 0) - (i > 4 ? 1 : 0), E); }
    img.set(CX + 2, 39, '#ffffff'); img.set(CX + 2, 40, '#fff3d6'); img.set(CX + 3, 39, '#fff3d6');
  } else if (mood === 1) {                          // worried wobble + sweat drop
    for (let i = -4; i <= 4; i++) img.set(CX + i, 39 + (Math.abs(i) % 2), E);
    const dx = 50, dy = 20;
    img.ellipse(dx, dy + 2, 2.2, 2.6, '#6af0ff'); img.poly([[dx - 1.5, dy + 1], [dx + 1.5, dy + 1], [dx, dy - 3]], '#6af0ff');
    img.set(dx - 1, dy + 1, '#e6ffff'); img.set(dx - 1, dy + 2, '#e6ffff');
    img.setMat({ gloss: 1 }, dx - 3, dy - 4, 6, 9);
  } else {                                          // big victorious open grin + blush + sparkles
    img.ellipse(CX, 39.5, 5.5, 3.5, E);
            img.ellipse(CX, 37.5, 5, 1.5, R.cream[2]); img.hline(CX - 5, 38, 11, E);
    img.ellipse(CX, 41, 3, 1.5, R.pink[2]);
    img.set(CX - 3, 39, '#ffffff'); img.set(CX + 3, 39, '#ffffff');
    for (const sd of [-1, 1]) { img.set(CX + sd * 11, 34, R.pink[2]); img.set(CX + sd * 12, 34, R.pink[2]); img.set(CX + sd * 11, 35, R.pink[1]); }
  }
  // whiskers
  for (const sd of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const y0 = 35 + k * 2, x0 = CX + sd * 7;
      img.line(x0, y0, x0 + sd * 11, y0 - 2 + k * 1.5, '#fff3d6');
    }
  img.outline(OUT);
  if (mood === 2) for (const [sx, sy] of [[7, 8], [56, 12], [54, 52]]) sparkle(img, sx, sy, 2);
  return img;
}
function p2(img, x, y, c) { img.set(x, y, c); img.set(x, y + 1, c); }
function sparkle(img, x, y, r, c = '#fff6b0') {
  const k = ink(c, { emit: 1, spark: 1 });
  for (let i = -r; i <= r; i++) { img.set(x + i, y, k); img.set(x, y + i, k); }
  img.set(x, y, ink('#ffffff', { emit: 1, spark: 1 }));
}

// =====================================================================================
// cat_head HUD icon 14x14 (frame 1 = grey / lost life)
// =====================================================================================
const HEAD_MAP = [
  '.#..........#.',
  '#O#........#O#',
  '#PO#......#OP#',
  '#PPO######OPP#',
  '#OOOOSOOSOOOO#',
  '#OOOOOSSOOOOO#',
  '#OWEOOOOOOWEO#',
  '#OEEOOOOOOEEO#',
  '#CCOOOPPOOOCC#',
  '#OCCCC##CCCCO#',
  '#OCCC#CC#CCCO#',
  '.#OCCCCCCCCO#.',
  '..##CCCCCC##..',
  '....######....',
];
function catHead(grey) {
  const p = new PixBuf(14, 14);
  HEAD_MAP.forEach((row, y) => [...row].forEach((ch, x) => {
    let c;
    const l = x + y;
    if (ch === '#') c = OUT;
    else if (ch === 'O') c = R.fur[l < 8 ? 3 : l > 17 ? 1 : 2];
    else if (ch === 'S') c = R.stripe[2];
    else if (ch === 'P') c = R.pink[2];
    else if (ch === 'C') c = R.cream[l > 18 ? 2 : 3];
    else if (ch === 'E') c = '#2a1830';
    else if (ch === 'W') c = '#ffffff';
    if (!c) return;
    let k = ink(c);
    if (grey && ch !== '#') { const g = Math.round((k.r * 0.3 + k.g * 0.5 + k.b * 0.2) * 0.7 + 20); k = ink([g, g, g + 12]); }
    p.set(x, y, k);
  }));
  return p;
}

// =====================================================================================
// small items
// =====================================================================================
function hairball(f) {
  const p = new PixBuf(10, 12), cx = 5, cy = 4.5;
  // glow trail below
  for (let y = 8; y < 12; y++) {
    const a = Math.round(200 - (y - 8) * 45), wdt = y < 10 ? 1 : 0;
    for (let x = cx - wdt - 1; x <= cx + wdt; x++) p.set(x, y, ink(FLAME[y < 10 ? 1 : 2], { emit: 1, a }));
  }
  const rot = f * Math.PI / 4;
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 10; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      const fuzz = 3.3 + 0.8 * hash2(Math.round((ang + rot) * 2.5), 7, f);
      if (r > fuzz) continue;
      const lit = (-dx - dy) / 4 + 0.2;
      const swirl = Math.sin(ang * 2 + rot * 2 + r * 1.4) > 0.5;
      let c = swirl ? R.stripe[lit > 0.3 ? 3 : 2] : R.fur[lit > 0.6 ? 3 : lit > -0.1 ? 2 : 1];
      if (r < 1.2) c = '#fff3a0';
      p.set(x, y, ink(c, { emit: r < 2 ? 0.9 : 0.5 }));
    }
  return p.outline(OUT);
}

function yarn(f) {
  const p = new PixBuf(14, 14), cx = 6.5, cy = 7, rr = 5.2, rot = (f * Math.PI) / 2 / 2;
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < 14; x++) {
      const dx = (x + 0.5 - cx) / rr, dy = (y + 0.5 - cy) / rr, q = dx * dx + dy * dy;
      if (q > 1) continue;
      const nz = Math.sqrt(1 - q), lit = -dx * 0.55 - dy * 0.55 + nz * 0.6;
      // wound strands: bands across the sphere, rotating with the roll
      const ux = dx * Math.cos(rot) - dy * Math.sin(rot), uy = dx * Math.sin(rot) + dy * Math.cos(rot);
      const band = Math.sin(ux * 7 + nz * 2) > 0.35 ? 1 : Math.sin((uy + ux * 0.4) * 6.5) > 0.6 ? 2 : 0;
      const base = ['#4a1430', '#8e1a3a', '#de3048', '#ff7a6a'];
      let i = lit < -0.1 ? 0 : lit < 0.35 ? 1 : lit < 0.75 ? 2 : 3;
      if (band === 1) i = Math.max(0, i - 1);
      if (band === 2) i = Math.min(3, i + 1);
      p.set(x, y, ink(base[i], { gloss: 0.15 }));
    }
  // loose thread end
  const ends = [[11, 11], [12, 12], [13, 12]];
  const wob = f % 2;
  p.set(11, 11, '#de3048'); p.set(12, 12 - wob, '#de3048'); p.set(13, 12, '#8e1a3a');
  void ends;
  return p.outline(OUT);
}

function nip(f) {
  const p = new PixBuf(16, 16);
  const pulse = [0, 0.5, 1, 0.5][f];
  const G = ['#1e4a2a', '#3e8a2a', '#7ccc3a', '#c8f06a'];
  const leaf = (cx, cy, ang, L, Wd) => {
    const q = new PixBuf(16, 16);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const a = dx * ca + dy * sa, b = -dx * sa + dy * ca;
        if (a < 0 || a > L) continue;
        const half = Wd * Math.sin((a / L) * Math.PI) * (1 + 0.12 * Math.sin(a * 2.2));   // serrated edge
        if (Math.abs(b) > half) continue;
        const lit = (b < 0 ? 0.5 : 0.05) + (1 - a / L) * 0.3 - (dx + dy) * 0.03;
        let c = G[lit > 0.62 ? 3 : lit > 0.32 ? 2 : lit > 0.05 ? 1 : 0];
        if (Math.abs(b) < 0.5 && a > 0.5) c = G[3];                                       // midrib
        q.set(x, y, ink(c, { emit: 0.15 + pulse * 0.25 }));
      }
    p.blit(q.outline(OUT));
  };
  leaf(7.5, 13, -Math.PI * 0.82, 7, 2.6);
  leaf(8, 13, -Math.PI * 0.18, 7, 2.6);
  leaf(7.8, 14, -Math.PI / 2 - 0.08, 11.5, 3.4);
  p.line(7, 13, 7, 15, G[1]);
  p.outline(OUT);
  const sp = [[2, 3], [13, 2], [14, 10], [1, 10]];
  for (let i = 0; i < 4; i++) {
    const [x, y] = sp[(i + f) % 4];
    if (i === 0) sparkle(p, x, y, 1 + (f % 2), '#fff6b0'); else if (i < 3) p.set(x, y, ink('#fff6b0', { emit: 1, spark: 1 }));
  }
  return p;
}

function laserDot(f) {
  const p = new PixBuf(16, 16);
  const pulse = [0, 1, 2, 1][f];
  // pen (silver body, dark tip, red button) lying diagonally upper-left
  p.line(1, 2, 7, 8, '#c8c4d8'); p.line(2, 2, 8, 8, '#8a86a0'); p.line(1, 3, 6, 8, '#e8e6f4');
  p.set(2, 3, '#ff4a4a'); p.set(8, 9, '#4a4458'); p.set(7, 9, '#4a4458');
  p.outline(OUT);
  // beam
  for (let i = 0; i < 3; i++) p.set(9 + i, 10 + i, ink('#ff4a4a', { emit: 1, a: 120 }));
  // dot + glow ring
  const cx = 11.5, cy = 11.5;
  p.ellipse(cx, cy, 2.8 + pulse * 0.6, 2.8 + pulse * 0.6, ink('#ff4a4a', { emit: 1, a: 90 }));
  p.ellipse(cx, cy, 2.1, 2.1, ink('#ff2a3a', { emit: 1 }));
  p.ellipse(cx - 0.3, cy - 0.3, 1.1, 1.1, ink('#ffd0c8', { emit: 1, spark: 0.6 }));
  if (pulse === 2) for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) p.set(cx + dx, cy + dy, ink('#ff8a8a', { emit: 1, spark: 1 }));
  return p;
}

function aura(f) {
  const W = 56, H = 48, p = new PixBuf(W, H), cx = 27, cy = 25;
  const hues = ['#ff4a6a', '#ff9a2e', '#ffe14a', '#7ce04a', '#4ad8ff', '#a86aff'];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / 26, dy = (y + 0.5 - cy) / 21, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      const edge = 0.92 + 0.06 * Math.sin(ang * 7 + f * 1.57);
      if (r > edge || r < 0.45) continue;
      const band = Math.floor((r * 9 - f * 0.5 + ang * 0.0) % 6 + 6) % 6;
      const fade = 1 - Math.abs(r - 0.72) / 0.3;
      const a = Math.round(clamp(fade, 0, 1) * 170 + 20);
      p.set(x, y, ink(hues[(band + f) % 6], { emit: 1, a }));
    }
  for (let i = 0; i < 6; i++) {
    const ang = i * 1.047 + f * 0.4, sx = Math.round(cx + Math.cos(ang) * 24), sy = Math.round(cy + Math.sin(ang) * 19);
    if ((i + f) % 2 === 0) sparkle(p, sx, sy, 1, '#ffffff'); else p.set(sx, sy, ink('#fff6b0', { emit: 1, spark: 1 }));
  }
  return p;
}

// =====================================================================================
export function build() {
  const ship = [];
  for (let bank = -2; bank <= 2; bank++) for (let anim = 0; anim < 2; anim++) ship.push(shipFrame(bank, anim));
  return {
    cat_ship: ship,
    cat_head: [catHead(false), catHead(true)],
    cat_portrait: [0, 1, 2].map(portraitFrame),
    hairball: [0, 1].map(hairball),
    yarn: [0, 1, 2, 3].map(yarn),
    nip: [0, 1, 2, 3].map(nip),
    laser_dot: [0, 1, 2, 3].map(laserDot),
    cat_aura: [0, 1, 2, 3].map(aura),
  };
}
export { shade };
