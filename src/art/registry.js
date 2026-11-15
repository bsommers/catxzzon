// Art registry (owner: render-scene). Builds every art module once and hands out canvases.
//
//   const art = buildAll();            // returns IMMEDIATELY with coloured placeholder art for every ART row
//   await art.ready;                   // optional: resolves (to the registry) once all present modules are built
//   art.get('cat_ship', 3)             // HTMLCanvasElement | OffscreenCanvas (browser) or PixBuf (Node)
//
// Tolerates missing / throwing / half-written art modules: their rows simply keep the placeholder.
// Canvas identity is STABLE: when a module finishes building, its pixels are painted INTO the canvas that
// get() already returned, so anything that cached a canvas early upgrades in place. `art.version` bumps on every
// change so derived caches (tinted copies, pre-rendered strips) can invalidate.
// Node-safe: no DOM access at import time; without a DOM get() returns PixBufs.
import { ART, ART_MODULES } from '../core/defs.js';
import { PixBuf, hash2, shade } from './pixbuf.js';

const OUTLINE = '#1a1420';
export const GLOW_PAD = 4;      // glow canvases are padded by this many px on every side

function canvasFactory() {
  if (typeof document !== 'undefined' && document.createElement) {
    return (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  }
  if (typeof OffscreenCanvas !== 'undefined') return (w, h) => new OffscreenCanvas(w, h);
  return null;
}

// ---------------------------------------------------------------- placeholders
const PAL = {
  cat_ship: '#f08a24', cat_head: '#f08a24', cat_portrait: '#f08a24', hairball: '#9be564', yarn: '#e23c4a', nip: '#5fd35f',
  laser_dot: '#ff3b3b', cat_aura: '#ff8ad8', boom_small: '#ffb02e', boom_big: '#ff8a1e', crumb: '#ffd24a', spark: '#fff6a0',
  smoke: '#9a94a8', ring: '#ffe9a0', field_post: '#c8ccd8', strand: '#ffb81e', cheeseball: '#ffd83a', rat_turret: '#8a8f9c',
  can_pad: '#b5483c', can_rocket: '#e8e0d0', tuna_tin: '#3d7fe0', radar_dish: '#f2c64a', mouse_jet: '#b9b2a6',
  hot_spud: '#c8763a', jesse: '#8fa0b8', jesse_missile: '#d9d2c2', jesse_bust: '#8fa0b8', spud_bg: '#a9793f',
  planet_baked: '#b8814a', planet_gouda: '#e8b23a', star: '#ffffff', blk_cheddar: '#f2962b', blk_swiss: '#f3df8e',
  blk_crown: '#f6a83a', blk_window: '#e88a2b', blk_mousehole: '#e08a2b', blk_rind: '#8e2a3c', blk_flag: '#f2962b',
  blk_gold: '#ffcf33', blk_cracker: '#d9aa68', gnd_cracker: '#cfa262', gnd_gouda: '#e0b040', gnd_keep: '#3b2b5e',
  decor_crater: '#5a4326', decor_hole: '#2a1c22', decor_rune: '#ffd24a',
};
const ROUND = new Set(['hairball', 'yarn', 'nip', 'laser_dot', 'cat_aura', 'boom_small', 'boom_big', 'crumb', 'spark', 'smoke',
  'cheeseball', 'hot_spud', 'jesse_missile', 'spud_bg', 'planet_baked', 'planet_gouda', 'star', 'cat_head']);

/** 2:1 iso diamond test for a w x h tile (same geometry as art/castle.js topMask for 32x16). */
export function inDiamond(x, y, w = 32, h = 16) {
  return Math.abs(x + 0.5 - w / 2) / (w / 2) + Math.abs(y + 0.5 - h / 2) / (h / 2) <= 1;
}
/** Face of a 32x32 iso cube sprite at pixel (x,y): 'top' | 'left' (-y face) | 'right' (+x face) | null. */
export function cubeFace(x, y) {
  if (inDiamond(x, y, 32, 16)) return 'top';
  const yTop = x < 16 ? 8 + (x + 0.5) / 2 : 16 - (x + 0.5 - 16) / 2, yy = y + 0.5;
  if (yy > yTop && yy <= yTop + 16) return x < 16 ? 'left' : 'right';
  return null;
}

function phCube(base, name) {
  const p = new PixBuf(32, 32), F = { top: 1.2, left: 0.98, right: 0.7 };
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const f = cubeFace(x, y); if (!f) continue;
    const edge = cubeFace(x - 1, y) !== f || cubeFace(x + 1, y) !== f || cubeFace(x, y + 1) !== f || cubeFace(x, y - 1) !== f;
    p.set(x, y, shade(base, F[f] * (edge ? 0.86 : 1) * (0.97 + 0.06 * hash2(x >> 1, y >> 1, 7))));
  }
  if (name === 'blk_window') { p.rect(6, 15, 4, 7, '#221626'); p.set(7, 19, { __ink: true, r: 255, g: 220, b: 120, a: 255, emit: 0.9, gloss: 0, spark: 0 }); }
  if (name === 'blk_mousehole') { p.rect(5, 19, 6, 8, '#1a1016'); p.rect(6, 17, 4, 2, '#1a1016'); }
  if (name === 'blk_crown') for (let i = 0; i < 4; i++) p.rect(3 + i * 8, 6 + (i < 2 ? i * 3 : (3 - i) * 3), 3, 2, shade(base, 1.45));
  if (name === 'blk_flag') { p.vline(16, 0, 9, '#3a3140'); p.rect(17, 0, 6, 4, '#d8263c'); }
  return p;
}
function phDiamond(base, w, h, f, alpha = 255) {
  const p = new PixBuf(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inDiamond(x, y, w, h)) continue;
    const c = shade(base, 0.94 + 0.12 * hash2(x >> 1, y, f * 31 + 5));
    c.a = alpha; p.set(x, y, c);
  }
  return p;
}
function phRound(base, w, h, f, n) {
  const p = new PixBuf(w, h), g = 0.62 + 0.38 * ((f + 1) / n);
  const rx = (w / 2 - 1) * g, ry = (h / 2 - 1) * g;
  p.ellipse(w / 2, h / 2, rx, ry, shade(base, 0.78));
  p.ellipse(w / 2 - rx * 0.12, h / 2 - ry * 0.14, rx * 0.74, ry * 0.74, base);
  p.ellipse(w / 2 - rx * 0.32, h / 2 - ry * 0.36, rx * 0.3, ry * 0.3, shade(base, 1.5));
  return p.outline(OUTLINE);
}
function phBox(base, w, h, f) {
  // iso box that fills the sprite rect: top diamond (w wide, w/2 tall) over two side faces.
  const p = new PixBuf(w, h), hw = (w - 2) / 2, th = Math.min(hw, (h - 2) * 0.6), cx = w / 2, top = 1, bot = h - 1;
  const midL = top + th / 2, body = bot - th - top;
  const k = 1 + 0.07 * (f % 2);
  p.poly([[cx - hw, midL], [cx, top + th], [cx, bot], [cx - hw, midL + body]], shade(base, 0.96 * k));
  p.poly([[cx, top + th], [cx + hw, midL], [cx + hw, midL + body], [cx, bot]], shade(base, 0.68 * k));
  p.poly([[cx, top], [cx + hw, midL], [cx, top + th], [cx - hw, midL]], shade(base, 1.22 * k));
  return p.outline(OUTLINE);
}
function placeholder(row) {
  const base = PAL[row.name] || '#ff40c0', out = [];
  for (let f = 0; f < row.frames; f++) {
    let p;
    if (row.name.startsWith('blk_')) p = phCube(base, row.name);
    else if (row.name.startsWith('gnd_')) p = phDiamond(base, row.w, row.h, f);
    else if (row.name.startsWith('decor_')) { p = phDiamond(base, row.w, row.h, f, 120); }
    else if (row.name === 'ring') { p = new PixBuf(row.w, row.h); const g = 0.4 + 0.6 * (f + 1) / row.frames; p.ring(row.w / 2, row.h / 2, (row.w / 2 - 1) * g, (row.h / 2 - 1) * g, base, 2); }
    else if (row.name === 'strand') { p = new PixBuf(row.w, row.h).fill('#000000'); for (let x = 0; x < row.w; x++) p.rect(x, 6 + Math.round(2 * Math.sin((x / row.w + f / row.frames) * 6.283)), 1, 4, base); }
    else if (ROUND.has(row.name)) p = phRound(base, row.w, row.h, f, row.frames);
    else p = phBox(base, row.w, row.h, f);
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- registry
function bboxOf(frames) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const p of frames) for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (p.rgba[(y * p.w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? { x0: 0, y0: 0, x1: frames[0].w - 1, y1: frames[0].h - 1 } : { x0, y0, x1, y1 };
}
function clipDiamond(p) {
  const q = p.clone();
  for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) {
    if (!inDiamond(x, y, q.w, q.h)) { const i = (y * q.w + x) * 4; q.rgba[i] = q.rgba[i + 1] = q.rgba[i + 2] = q.rgba[i + 3] = 0; }
  }
  return q;
}
const isPix = (p) => p && p.rgba && p.w > 0 && p.h > 0 && p.rgba.length === p.w * p.h * 4;

/**
 * @param {{ modules?: string[], importer?: (m:string)=>Promise<any>, onProgress?: (done:number,total:number,module:string)=>void,
 *           forcePix?: boolean }} [opts]
 */
export function buildAll(opts = {}) {
  const modules = opts.modules || ART_MODULES;
  const importer = opts.importer || ((m) => import(`./${m}.js`));
  const mk = opts.forcePix ? null : canvasFactory();
  const entries = new Map();
  const warned = new Set();
  const reg = {
    version: 1, done: false, progress: 0, missing: [], errors: [], loaded: [], canvasMode: !!mk,
    get, size, frames, has, pix, glow, bbox, names: () => [...entries.keys()], ready: null,
  };

  function paint(e, i) {
    const p = e.pix[i];
    if (!mk) { e.out[i] = p; return; }
    let c = e.out[i];
    if (!c) c = e.out[i] = mk(p.w, p.h);
    else if (c.width !== p.w || c.height !== p.h) { c.width = p.w; c.height = p.h; }
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, p.w, p.h);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(p.rgba), p.w, p.h), 0, 0);
  }
  function install(name, frames, real) {
    if (name.startsWith('gnd_')) frames = frames.map(clipDiamond);   // tiles ship with filled corners: clip to the diamond
    let e = entries.get(name);
    if (!e) { e = { name, pix: [], out: [], glow: [], real: false, bbox: null }; entries.set(name, e); }
    if (!mk) e.out.length = 0;
    e.pix = frames; e.real = real; e.glow = []; e.bbox = bboxOf(frames);
    e.out.length = Math.min(e.out.length, frames.length);
    for (let i = 0; i < frames.length; i++) paint(e, i);
    reg.version++;
  }
  function entry(name) {
    let e = entries.get(name);
    if (!e) {
      if (!warned.has(name)) { warned.add(name); console.warn(`[art] unknown sprite "${name}" (placeholder)`); }
      install(name, placeholder({ name, w: 16, h: 16, frames: 1 }), false);
      e = entries.get(name);
    }
    return e;
  }
  function get(name, frame = 0) { const e = entry(name), n = e.out.length; return e.out[((frame | 0) % n + n) % n]; }
  function pix(name, frame = 0) { const e = entry(name), n = e.pix.length; return e.pix[((frame | 0) % n + n) % n]; }
  function size(name) { const p = entry(name).pix[0]; return { w: p.w, h: p.h }; }
  function frames(name) { return entry(name).pix.length; }
  /** true when real (non-placeholder) art is installed for `name`. */
  function has(name) { const e = entries.get(name); return !!(e && e.real); }
  /** Union opaque bounding box over all frames: { x0, y0, x1, y1 } (inclusive pixel coords). */
  function bbox(name) { return entry(name).bbox; }
  /** Soft additive halo of the sprite's emissive pixels (mat.R), padded by GLOW_PAD; null if none / no canvas. */
  function glow(name, frame = 0) {
    const e = entry(name), n = e.pix.length, i = ((frame | 0) % n + n) % n;
    if (e.glow[i] !== undefined) return e.glow[i];
    if (!mk) return (e.glow[i] = null);
    const p = e.pix[i], d = new Uint8ClampedArray(p.rgba.length);
    let count = 0;
    for (let k = 0; k < d.length; k += 4) {
      const em = p.mat[k];
      if (em < 50 || p.rgba[k + 3] < 40) continue;
      d[k] = p.rgba[k]; d[k + 1] = p.rgba[k + 1]; d[k + 2] = p.rgba[k + 2]; d[k + 3] = em; count++;
    }
    if (!count) return (e.glow[i] = null);
    const m = mk(p.w, p.h); m.getContext('2d').putImageData(new ImageData(d, p.w, p.h), 0, 0);
    const g = mk(p.w + GLOW_PAD * 2, p.h + GLOW_PAD * 2), c = g.getContext('2d');
    c.globalCompositeOperation = 'lighter';
    const K = [[0, 0, 0.5], [-1, 0, 0.26], [1, 0, 0.26], [0, -1, 0.26], [0, 1, 0.26], [-1, -1, 0.18], [1, -1, 0.18], [-1, 1, 0.18], [1, 1, 0.18],
      [-2, 0, 0.12], [2, 0, 0.12], [0, -2, 0.12], [0, 2, 0.12], [-3, 0, 0.06], [3, 0, 0.06], [0, -3, 0.06], [0, 3, 0.06], [-2, -2, 0.07], [2, -2, 0.07], [-2, 2, 0.07], [2, 2, 0.07]];
    for (const [dx, dy, a] of K) { c.globalAlpha = a; c.drawImage(m, GLOW_PAD + dx, GLOW_PAD + dy); }
    return (e.glow[i] = g);
  }

  // 1) placeholders for the whole manifest, synchronously.
  for (const row of ART) install(row.name, placeholder(row), false);

  // 2) real art, module by module, yielding between modules so a loading screen can paint.
  const tick = () => new Promise((r) => (typeof setTimeout === 'function' ? setTimeout(r, 0) : r()));
  reg.ready = (async () => {
    let n = 0;
    for (const m of modules) {
      try {
        const mod = await importer(m);
        if (typeof mod.build !== 'function') throw new Error('no build() export');
        const built = mod.build() || {};
        for (const row of ART) {
          if (row.module !== m) continue;
          const v = built[row.name];
          const fr = (Array.isArray(v) ? v : [v]).filter(isPix);
          if (!fr.length) { reg.errors.push(`${m}: missing sprite ${row.name}`); continue; }
          if (fr[0].w !== row.w || fr[0].h !== row.h || fr.length !== row.frames) {
            reg.errors.push(`${m}: ${row.name} is ${fr[0].w}x${fr[0].h} f${fr.length}, manifest says ${row.w}x${row.h} f${row.frames}`);
          }
          install(row.name, fr, true);
        }
        reg.loaded.push(m);
      } catch (err) {
        const msg = String((err && err.message) || err);
        if (/Cannot find module|Failed to fetch|error loading dynamically imported|404|Importing a module script failed/i.test(msg)) reg.missing.push(m);
        else reg.errors.push(`${m}: ${msg}`);
      }
      reg.progress = ++n / modules.length;
      if (opts.onProgress) try { opts.onProgress(n, modules.length, m); } catch { /* ignore */ }
      await tick();
    }
    reg.done = true;
    return reg;
  })();
  return reg;
}
