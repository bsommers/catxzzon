// CATXZZON background: gradient sky, nebula bands, twinkle stars, baked-potato planet, gouda moon,
// parallax tumbling space potatoes, french-fry comets and speed streaks.
// Owner: render-fx. Node-safe (no DOM at import time); every offscreen bake falls back to direct drawing.
const W = 640, H = 360;
const TAU = Math.PI * 2;

let _art = null;
/** Optional: hand the art registry over once (renderer may also pass it as 4th arg to drawBackground). */
export function setBackgroundArt(art) { _art = art || null; }

const fract = (v) => v - Math.floor(v);
const hash = (n) => fract(Math.sin(n * 12.9898 + 78.233) * 43758.5453);
const mod = (a, m) => ((a % m) + m) % m;

// ---------------------------------------------------------------- baking helpers
function makeCanvas(w, h) {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  } catch { /* fall through */ }
  return null;
}
/** bake(w,h,paint(ctx)) -> { draw(ctx,x,y) }.  Without canvases paints directly each call (translated). */
function bake(w, h, paint) {
  const cv = makeCanvas(w, h);
  if (cv) {
    const c = cv.getContext('2d');
    if (c) { paint(c); return { w, h, cv, draw(ctx, x, y) { ctx.drawImage(cv, x, y); } }; }
  }
  return { w, h, cv: null, draw(ctx, x, y) { ctx.save(); ctx.translate(x, y); paint(ctx); ctx.restore(); } };
}

function radial(c, x, y, r, stops) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

// ---------------------------------------------------------------- bg specs
const SPECS = {
  dusk: {
    sky: [[0, '#150c3a'], [0.4, '#4a2468'], [0.72, '#b8486a'], [1, '#f2a05c']],
    stars: 44, starDim: 0.6, nebula: [[210, 90, 130], [130, 70, 190]], nebA: 0.16,
    moon: { x: 500, y: 92, r: 30, k: 0.006 }, planet: null,
  },
  void: {
    sky: [[0, '#04020d'], [0.55, '#0c0928'], [1, '#1d0f40']],
    stars: 110, starDim: 1, nebula: [[40, 190, 190], [190, 50, 160]], nebA: 0.2,
    moon: null, planet: { x: 118, y: 96, r: 54, k: 0.01 },
  },
  night: {
    sky: [[0, '#01030a'], [0.6, '#091232'], [1, '#16224c']],
    stars: 140, starDim: 1, nebula: [[50, 110, 230], [40, 180, 170]], nebA: 0.15,
    moon: { x: 140, y: 80, r: 26, k: 0.006 }, planet: { x: 540, y: 150, r: 20, k: 0.004 },
  },
};
const specOf = (name) => SPECS[name] || SPECS.night;

// ---------------------------------------------------------------- baked pieces (lazy, cached)
const cache = { sky: {}, neb: {}, planet: {}, moon: {}, glow: null };

function sky(bg) {
  return cache.sky[bg] || (cache.sky[bg] = bake(W, H, (c) => {
    const s = specOf(bg);
    const g = c.createLinearGradient(0, 0, 0, H);
    for (const [o, col] of s.sky) g.addColorStop(o, col);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (bg === 'dusk') {   // low sun glow at the horizon
      c.fillStyle = radial(c, 430, 370, 300, [[0, 'rgba(255,200,110,0.55)'], [0.4, 'rgba(255,130,100,0.22)'], [1, 'rgba(255,100,100,0)']]);
      c.fillRect(0, 0, W, H);
    }
  }));
}

function nebula(bg) {
  return cache.neb[bg] || (cache.neb[bg] = bake(W, H, (c) => {
    const s = specOf(bg);
    // two soft diagonal bands (running along the iso forward axis, lower-left to upper-right)
    for (let b = 0; b < 2; b++) {
      const col = s.nebula[b], base = b ? 0.62 : 0.3;
      for (let i = 0; i < 9; i++) {
        const f = (i + 0.5) / 9;
        const x = -40 + f * (W + 80) + (hash(b * 31 + i) - 0.5) * 50;
        const y = H * base + (0.5 - f) * 150 + (hash(b * 17 + i * 3) - 0.5) * 36;
        const r = 70 + hash(b * 7 + i * 5) * 70;
        const a = s.nebA * (0.6 + 0.8 * hash(b * 3 + i));
        for (const wx of [-W, 0, W]) {   // wrap horizontally so the layer tiles seamlessly
          const xx = x + wx;
          c.fillStyle = radial(c, xx, y, r, [[0, `rgba(${col[0]},${col[1]},${col[2]},${a})`], [1, `rgba(${col[0]},${col[1]},${col[2]},0)`]]);
          c.save(); c.translate(xx, y); c.scale(1.7, 0.7); c.translate(-xx, -y);
          c.fillRect(xx - r, y - r, r * 2, r * 2);
          c.restore();
        }
      }
    }
  }));
}

function planetBake(r) {   // baked-potato planet: skin sphere, split with fluffy interior, butter pat
  const key = r | 0;
  return cache.planet[key] || (cache.planet[key] = bake(r * 3, r * 3, (c) => {
    const cx = r * 1.5, cy = r * 1.5;
    c.fillStyle = radial(c, cx, cy, r * 1.5, [[0, 'rgba(255,190,120,0.18)'], [0.5, 'rgba(255,170,100,0.05)'], [1, 'rgba(255,170,100,0)']]);
    c.fillRect(0, 0, cx * 2, cy * 2);
    // skin
    c.fillStyle = radial(c, cx - r * 0.35, cy - r * 0.4, r * 1.5, [[0, '#d9a05a'], [0.45, '#a8672f'], [1, '#4a2410']]);
    c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
    // skin speckles
    for (let i = 0; i < 26; i++) {
      const a = hash(i * 2.3) * TAU, d = Math.sqrt(hash(i * 5.1)) * r * 0.95;
      c.fillStyle = hash(i) > 0.5 ? 'rgba(60,28,10,0.35)' : 'rgba(240,200,140,0.2)';
      c.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 2, 1);
    }
    // split slit
    c.save(); c.translate(cx - r * 0.05, cy - r * 0.18); c.rotate(-0.35);
    c.fillStyle = '#3b1c0c'; c.beginPath(); c.ellipse(0, 0, r * 0.7, r * 0.2, 0, 0, TAU); c.fill();
    c.fillStyle = radial(c, 0, -2, r * 0.6, [[0, '#fffbe8'], [0.7, '#f1e2b0'], [1, '#d3b878']]);
    c.beginPath(); c.ellipse(0, -1, r * 0.62, r * 0.14, 0, 0, TAU); c.fill();
    // butter pat
    c.fillStyle = '#ffe36a'; c.fillRect(-r * 0.12, -r * 0.14, r * 0.22, r * 0.11);
    c.fillStyle = '#fff5b0'; c.fillRect(-r * 0.12, -r * 0.14, r * 0.22, 2);
    c.restore();
    // terminator shade (light from upper-left)
    c.fillStyle = radial(c, cx - r * 0.5, cy - r * 0.55, r * 2.1, [[0.45, 'rgba(10,5,30,0)'], [1, 'rgba(8,4,24,0.72)']]);
    c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
  }));
}

function moonBake(r) {   // gouda moon with holes
  const key = r | 0;
  return cache.moon[key] || (cache.moon[key] = bake(r * 3, r * 3, (c) => {
    const cx = r * 1.5, cy = r * 1.5;
    c.fillStyle = radial(c, cx, cy, r * 1.5, [[0, 'rgba(255,230,140,0.16)'], [1, 'rgba(255,230,140,0)']]);
    c.fillRect(0, 0, cx * 2, cy * 2);
    c.fillStyle = radial(c, cx - r * 0.35, cy - r * 0.4, r * 1.6, [[0, '#ffe589'], [0.5, '#e8b940'], [1, '#8d5c1c']]);
    c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
    c.save(); c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.clip();
    for (let i = 0; i < 7; i++) {
      const a = hash(i * 4.7 + 1) * TAU, d = Math.sqrt(hash(i * 2.9 + 3)) * r * 0.78, hr = r * (0.1 + hash(i + 9) * 0.14);
      const hx = cx + Math.cos(a) * d, hy = cy + Math.sin(a) * d;
      c.fillStyle = '#7a4a14'; c.beginPath(); c.arc(hx, hy, hr, 0, TAU); c.fill();
      c.fillStyle = '#c9902f'; c.beginPath(); c.arc(hx + hr * 0.25, hy + hr * 0.3, hr * 0.7, 0, TAU); c.fill();
    }
    c.fillStyle = radial(c, cx - r * 0.5, cy - r * 0.55, r * 2.1, [[0.4, 'rgba(10,5,30,0)'], [1, 'rgba(8,4,24,0.7)']]);
    c.fillRect(0, 0, cx * 2, cy * 2);
    c.restore();
  }));
}

// ---------------------------------------------------------------- stars
const NSTAR = 150;
const STARS = Array.from({ length: NSTAR }, (_, i) => ({
  x: hash(i * 1.7 + 0.3) * W, y: hash(i * 3.1 + 7.7) * H,
  ph: hash(i * 5.3) * TAU, sp: 1 + hash(i * 9.1) * 3,
  z: hash(i * 2.2),       // depth: drives parallax + brightness
  big: i % 19 === 0,
}));
const STAR_COL = ['#ffffff', '#cfe0ff', '#ffe9c0', '#ffd0e8'];

function drawStars(ctx, bgSpec, t, d) {
  const n = Math.min(NSTAR, bgSpec.stars);
  for (let ci = 0; ci < STAR_COL.length; ci++) {
    ctx.fillStyle = STAR_COL[ci];
    for (let i = ci; i < n; i += STAR_COL.length) {
      const s = STARS[i];
      if (s.big) continue;
      const k = 0.01 + s.z * 0.04;
      const x = mod(s.x - d * k, W), y = mod(s.y + d * k * 0.5, H);
      const tw = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
      ctx.globalAlpha = (0.25 + 0.75 * tw) * (0.4 + 0.6 * s.z) * bgSpec.starDim;
      ctx.fillRect(x | 0, y | 0, s.z > 0.75 ? 2 : 1, 1 + (s.z > 0.9 ? 1 : 0));
    }
  }
  // few larger twinkle stars (sprite when available)
  for (let i = 0; i < n; i += 19) {
    const s = STARS[i], k = 0.02;
    const x = mod(s.x - d * k, W), y = mod(s.y + d * k * 0.5, H);
    const tw = 0.5 + 0.5 * Math.sin(t * s.sp * 0.7 + s.ph);
    ctx.globalAlpha = (0.35 + 0.65 * tw) * bgSpec.starDim;
    const img = _art ? safeGet(_art, 'star', (tw * 2.99) | 0) : null;
    if (img) ctx.drawImage(img, (x - 4) | 0, (y - 4) | 0);
    else { ctx.fillStyle = '#fff'; ctx.fillRect(x | 0, (y - 1) | 0, 1, 3); ctx.fillRect((x - 1) | 0, y | 0, 3, 1); }
  }
  ctx.globalAlpha = 1;
}

function safeGet(art, name, i) {
  try { const v = art.get(name, i); return v && (v.width || v.w) ? v : null; } catch { return null; }
}

// ---------------------------------------------------------------- potatoes
const LAYERS = [   // far -> near
  { n: 12, scale: 0.4, k: 0.05, alpha: 0.42, spin: 0.25 },
  { n: 9, scale: 0.62, k: 0.1, alpha: 0.6, spin: 0.4 },
  { n: 6, scale: 0.95, k: 0.19, alpha: 0.82, spin: 0.55 },
  { n: 4, scale: 1.5, k: 0.34, alpha: 1, spin: 0.7 },
];
const SPUD_FRAMES = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11];   // 8 (fry comet) reserved for comets
const POTATOES = LAYERS.map((L, li) => Array.from({ length: Math.ceil(L.n * 1.7) }, (_, i) => ({
  x: hash(li * 100 + i * 1.31) * (W + 120), y: hash(li * 100 + i * 2.17 + 5) * (H + 120),
  f: SPUD_FRAMES[(hash(li * 100 + i * 3.7 + 2) * SPUD_FRAMES.length) | 0],
  a0: hash(li * 100 + i * 4.1) * TAU, w: (hash(li * 100 + i * 6.3) - 0.5) * 2,
  sz: 0.8 + hash(li * 100 + i * 8.9) * 0.45,
})));

function drawPotatoes(ctx, t, d, space) {
  const mult = space ? 1.7 : 1, kmul = space ? 1.8 : 1, M = 60;
  const art = _art;
  for (let li = 0; li < LAYERS.length; li++) {
    const L = LAYERS[li], list = POTATOES[li], n = Math.round(L.n * mult);
    const dd = d * L.k * kmul;
    ctx.globalAlpha = L.alpha;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const x = mod(p.x - dd, W + 2 * M) - M, y = mod(p.y + dd * 0.5, H + 2 * M) - M;
      const sz = 32 * L.scale * p.sz, h = sz / 2;
      const ang = p.a0 + t * L.spin * p.w * (space ? 1.6 : 1);
      const img = art ? safeGet(art, 'spud_bg', p.f) : null;
      ctx.save();
      ctx.translate(x | 0, y | 0); ctx.rotate(ang);
      if (img) ctx.drawImage(img, -h, -h, sz, sz);
      else {
        ctx.fillStyle = li < 2 ? '#6b4a2a' : '#a8743a';
        ctx.beginPath(); ctx.ellipse(0, 0, h * 0.85, h * 0.6, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,160,0.35)';
        ctx.beginPath(); ctx.ellipse(-h * 0.25, -h * 0.2, h * 0.35, h * 0.2, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- comets (french fries)
function drawComets(ctx, t, space) {
  const period = space ? 3.2 : 6.5, dur = 1.6;
  const slot = Math.floor(t / period), prog = (t - slot * period) / dur;
  if (prog >= 1 || hash(slot * 3.3 + 1) < (space ? 0.15 : 0.35)) return;
  const dirx = hash(slot + 11) > 0.35 ? -1 : 1;
  const sx0 = dirx < 0 ? W * (0.45 + 0.55 * hash(slot + 2)) : W * 0.5 * hash(slot + 2);
  const sy0 = -20 + hash(slot + 5) * H * 0.35;
  const vx = dirx * 360, vy = 190 + hash(slot + 8) * 60;
  const x = sx0 + vx * prog * dur, y = sy0 + vy * prog * dur;
  const len = 70, nx = -vx / Math.hypot(vx, vy), ny = -vy / Math.hypot(vx, vy);
  const fade = Math.sin(Math.min(1, prog) * Math.PI);
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(x, y, x + nx * len, y + ny * len);
  g.addColorStop(0, `rgba(255,220,120,${0.85 * fade})`);
  g.addColorStop(0.4, `rgba(255,140,60,${0.4 * fade})`);
  g.addColorStop(1, 'rgba(255,90,40,0)');
  ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + nx * len, y + ny * len); ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = `rgba(255,255,230,${0.9 * fade})`;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + nx * len * 0.45, y + ny * len * 0.45); ctx.stroke();
  ctx.globalCompositeOperation = prev;
  ctx.save(); ctx.globalAlpha = Math.min(1, fade * 2);
  ctx.translate(x | 0, y | 0); ctx.rotate(Math.atan2(vy, vx) + t * 4);
  const img = _art ? safeGet(_art, 'spud_bg', 8) : null;
  if (img) ctx.drawImage(img, -16, -16);
  else { ctx.fillStyle = '#ffd24a'; ctx.fillRect(-7, -2, 14, 4); ctx.fillStyle = '#fff2a0'; ctx.fillRect(-7, -2, 14, 1); }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- speed streaks
const NSTREAK = 30;
const STREAKS = Array.from({ length: NSTREAK }, (_, i) => ({
  x: hash(i * 1.9 + 4) * (W + 200), y: hash(i * 2.9 + 1) * (H + 100), l: 0.5 + hash(i * 7.7) * 0.8, s: 0.6 + hash(i * 3.3) * 0.9,
}));

function drawStreaks(ctx, t, speed, space) {
  const f = Math.max(0, Math.min(1.6, (speed || 0) / 100));
  if (f < 0.05) return;
  const a = (space ? 0.28 : 0.14) * Math.min(1, f);
  const n = space ? NSTREAK : (NSTREAK * 0.6) | 0;
  ctx.strokeStyle = space ? `rgba(200,220,255,${a})` : `rgba(255,230,200,${a})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const s = STREAKS[i];
    const adv = t * (speed || 0) * 1.4 * s.s;
    // forward is up-right: streaks travel down-left along (-2,+1)/sqrt5
    const x = mod(s.x - adv * 0.894, W + 200) - 100, y = mod(s.y + adv * 0.447, H + 100) - 50;
    const len = (6 + f * 26) * s.l;
    ctx.moveTo(x | 0, y | 0); ctx.lineTo((x + len * 0.894) | 0, (y - len * 0.447) | 0);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------- main
/**
 * drawBackground(ctx, game, t[, art])
 *  game: reads stage.bg/kind, scrollY, speed.  t: seconds (render clock).
 */
export function drawBackground(ctx, game, t = 0, art) {
  if (art) _art = art;
  const stage = (game && game.stage) || {};
  const bg = stage.bg || 'night';
  const space = stage.kind === 'space';
  const spec = specOf(bg);
  const scroll = (game && game.scrollY) || 0;
  const d = scroll + t * 6;   // gentle drift even when the scroll is parked (boss arena)

  sky(bg).draw(ctx, 0, 0);

  // nebula bands (additive, drifting)
  {
    const nb = nebula(bg), off = mod(-d * 0.03 - t * 1.5, W);
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    nb.draw(ctx, off - W, 0); nb.draw(ctx, off, 0);
    ctx.globalCompositeOperation = prev;
  }

  drawStars(ctx, spec, t, d);

  if (spec.planet) {
    const p = spec.planet, b = planetBake(p.r);
    const x = mod(p.x - d * p.k, W + 200) - 60, y = p.y + d * p.k * 0.5 * 0 + Math.sin(t * 0.1) * 2;
    b.draw(ctx, (x - p.r * 1.5) | 0, (y - p.r * 1.5) | 0);
  }
  if (spec.moon) {
    const m = spec.moon, b = moonBake(m.r);
    const x = mod(m.x - d * m.k, W + 160) - 40, y = m.y + Math.sin(t * 0.13) * 2;
    b.draw(ctx, (x - m.r * 1.5) | 0, (y - m.r * 1.5) | 0);
  }

  drawComets(ctx, t, space);
  drawPotatoes(ctx, t, d, space);
  drawStreaks(ctx, t, game && game.speed, space);
}

export default drawBackground;
