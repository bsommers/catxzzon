// CATXZZON particles: pooled (<=1500, struct-of-arrays), handles every `fx` event type, additive glow,
// cheese crumbs with gravity, cat engine / rainbow trails. Owner: render-fx. Node-safe.
import { VIEW } from '../core/defs.js';

export const MAX_PARTICLES = 1500;
const TAU = Math.PI * 2;

// kinds
const DOT = 0, GLOW = 1, CRUMB = 2, SPRITE = 3, RING = 4, SPLAT = 5, CONF = 6, SMOKE = 7;

// palette (index stored per particle)
const PAL = [
  '#fff6c8', '#ffe04a', '#ffb02e', '#ff7a1e', '#ff4a22', '#ffffff', '#c9a15a', '#8a5a2c', '#5a3818',
  '#b9a0e0', '#f4ead0', '#9a9aa8', '#5a5a68', '#7fe0ff', '#ff66aa', '#8cff8c',
];
const C = { cream: 0, yellow: 1, amber: 2, orange: 3, red: 4, white: 5, tan: 6, brown: 7, dark: 8, purple: 9, fluff: 10, smokeL: 11, smokeD: 12, cyan: 13, pink: 14, green: 15 };
const RAINBOW = Array.from({ length: 12 }, (_, i) => `hsl(${i * 30},100%,62%)`);
const CONF_COL = ['#ff4a6a', '#ffe04a', '#5ae0ff', '#8cff6a', '#c07aff', '#ff9a2e', '#ffffff'];
const NPAL = PAL.length, NRB = RAINBOW.length;
const colorOf = (ci) => (ci < NPAL ? PAL[ci] : ci < NPAL + NRB ? RAINBOW[ci - NPAL] : CONF_COL[ci - NPAL - NRB]);
const CI_RB = NPAL, CI_CONF = NPAL + NRB, NCI = NPAL + NRB + CONF_COL.length;

function makeCanvas(w, h) {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  } catch { /* none */ }
  return null;
}

/** Returns a soft radial dot canvas for colour index ci (cached), or null when no canvas support. */
function glowTable() {
  const tbl = new Array(NCI).fill(undefined);
  return (ci) => {
    let g = tbl[ci];
    if (g !== undefined) return g;
    const cv = makeCanvas(24, 24), c = cv && cv.getContext('2d');
    if (!c) return (tbl[ci] = null);
    const grad = c.createRadialGradient(12, 12, 0, 12, 12, 12);
    grad.addColorStop(0, '#fff'); grad.addColorStop(0.25, colorOf(ci)); grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = grad; c.fillRect(0, 0, 24, 24);
    return (tbl[ci] = cv);
  };
}

function safeGet(art, name, i) {
  if (!art) return null;
  try { const v = art.get(name, i); return v && (v.width || v.w) ? v : null; } catch { return null; }
}

/**
 * createParticles(bus, art) -> { update(dt, game?), draw(ctx, camY), clear(), count, spawn(type,x,y,z,opts), bursts }
 * Subscribes to bus 'fx' events.  `update(dt, game)`: pass the game to get the cat's engine/rainbow trail.
 */
export function createParticles(bus, art) {
  const N = MAX_PARTICLES;
  const x = new Float32Array(N), y = new Float32Array(N), z = new Float32Array(N);
  const vx = new Float32Array(N), vy = new Float32Array(N), vz = new Float32Array(N);
  const life = new Float32Array(N), max = new Float32Array(N), size = new Float32Array(N), grav = new Float32Array(N);
  const drag = new Float32Array(N), rot = new Float32Array(N), spin = new Float32Array(N);
  const kind = new Uint8Array(N), col = new Uint8Array(N), var_ = new Uint8Array(N), add = new Uint8Array(N);
  const spr = new Array(N).fill(null);   // sprite name for SPRITE kind
  const alive = new Uint8Array(N);
  let count = 0, cursor = 0, seed = 12345, trailAcc = 0, clock = 0;
  const glowOf = glowTable();

  // particles use their own LCG: purely cosmetic, never touches sim rng / Math.random
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const rr = (a, b) => a + (b - a) * rnd();

  function alloc() {
    if (count < N) {
      for (let k = 0; k < N; k++) {
        const i = (cursor + k) % N;
        if (!alive[i]) { cursor = (i + 1) % N; alive[i] = 1; count++; return i; }
      }
    }
    // pool full: recycle the oldest-ish (cursor) slot so big effects still show
    const i = cursor; cursor = (cursor + 1) % N; alive[i] = 1; return i;
  }
  function P(k, px, py, pz, pvx, pvy, pvz, l, s, c, g, o) {
    const i = alloc();
    kind[i] = k; x[i] = px; y[i] = py; z[i] = pz; vx[i] = pvx; vy[i] = pvy; vz[i] = pvz;
    life[i] = max[i] = l; size[i] = s; col[i] = c; grav[i] = g || 0;
    drag[i] = 0; rot[i] = 0; spin[i] = 0; var_[i] = 0; add[i] = 0; spr[i] = null;
    if (o) { if (o.add) add[i] = 1; if (o.drag) drag[i] = o.drag; if (o.v !== undefined) var_[i] = o.v; if (o.spr) spr[i] = o.spr; if (o.spin) spin[i] = o.spin; if (o.rot) rot[i] = o.rot; }
    return i;
  }
  const O_ADD = { add: true };

  function burst(n, px, py, pz, spd, up, l, s, ci, g, glow) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = spd * (0.35 + rnd() * 0.65), e = rr(-0.3, 1);
      P(glow ? GLOW : DOT, px, py, pz, Math.cos(a) * sp, Math.sin(a) * sp, up * e + sp * 0.25 * rnd(), l * (0.6 + rnd() * 0.7), s * (0.7 + rnd() * 0.6), typeof ci === 'function' ? ci() : ci, g, glow ? O_ADD : null);
    }
  }
  const FIRE = () => [C.cream, C.yellow, C.amber, C.orange][(rnd() * 4) | 0];
  const CHEESE = () => [C.yellow, C.amber, C.cream, C.orange][(rnd() * 4) | 0];

  function crumbs(px, py, pz, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = spd * (0.3 + rnd() * 0.7);
      P(CRUMB, px, py, pz, Math.cos(a) * sp, Math.sin(a) * sp, rr(40, 140) * (spd / 90), rr(0.7, 1.4), 1, C.yellow, 300, { v: (rnd() * 4) | 0, spin: rr(-8, 8), drag: 0.4 });
    }
  }
  function sprite(name, px, py, pz, l, scale, o) {
    const i = P(SPRITE, px, py, pz, 0, 0, 0, l, scale, C.white, 0, Object.assign({ spr: name }, o));
    return i;
  }

  const handlers = {
    boom_small(e, o) {
      sprite('boom_small', e.x, e.y, e.z, 0.42, 1);
      burst(10, e.x, e.y, e.z, 90, 70, 0.45, 1.6, FIRE, 160, true);
      burst(3, e.x, e.y, e.z, 30, 40, 0.8, 1, C.smokeD, -20);
      P(GLOW, e.x, e.y, e.z, 0, 0, 0, 0.22, 3.2, C.yellow, 0, O_ADD);
    },
    boom_big(e, o) {
      sprite('boom_big', e.x, e.y, e.z, 0.7, 1);
      P(GLOW, e.x, e.y, e.z, 0, 0, 0, 0.35, 6, C.cream, 0, O_ADD);
      burst(30, e.x, e.y, e.z, 150, 120, 0.7, 1.8, FIRE, 220, true);
      burst(14, e.x, e.y, e.z, 60, 50, 1.1, 1, C.smokeD, -25);
      crumbs(e.x, e.y, e.z, 10, 130);
      P(RING, e.x, e.y, Math.max(0, e.z - 6), 0, 0, 0, 0.5, 38, C.white, 0, O_ADD);
      for (let i = 0; i < 4; i++) P(SMOKE, e.x + rr(-8, 8), e.y + rr(-8, 8), e.z + rr(0, 8), rr(-10, 10), rr(-10, 10), rr(25, 55), rr(0.8, 1.3), rr(0.8, 1.4), C.smokeL, 0, { v: (rnd() * 4) | 0 });
    },
    crumbs(e, o) { crumbs(e.x, e.y, e.z, Math.min(60, (o && o.n) || 8), (o && o.spd) ?? 95); },
    spark(e, o) {
      sprite('spark', e.x, e.y, e.z, 0.2, 1, { add: true });
      burst(6, e.x, e.y, e.z, 110, 60, 0.28, 1.1, [C.white, C.yellow][0], 200, true);
    },
    splat(e, o) {
      const n = Math.min(40, (o && o.n) || 14), c = o && o.color !== undefined ? o.color : C.yellow;
      P(SPLAT, e.x, e.y, Math.max(0, e.z), 0, 0, 0, 1.2, rr(7, 11), c, 0);
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, sp = rr(30, 110);
        P(DOT, e.x, e.y, e.z, Math.cos(a) * sp, Math.sin(a) * sp, rr(40, 130), rr(0.5, 1), rr(1.5, 2.6), i & 1 ? C.amber : c, 320);
      }
    },
    smoke(e, o) {
      const n = Math.min(12, (o && o.n) || 3);
      for (let i = 0; i < n; i++) P(SMOKE, e.x + rr(-4, 4), e.y + rr(-4, 4), e.z, rr(-8, 8), rr(-8, 8), rr(18, 45), rr(0.7, 1.3), rr(0.7, 1.2), C.smokeL, 0, { v: (rnd() * 4) | 0 });
    },
    ring(e, o) {
      const r = (o && o.r) || 30;
      P(RING, e.x, e.y, e.z, 0, 0, 0, 0.45, r, (o && o.color) !== undefined ? o.color : C.white, 0, O_ADD);
      P(RING, e.x, e.y, e.z, 0, 0, 0, 0.6, r * 0.7, C.yellow, 0, { add: true, v: 1 });
    },
    trail(e, o) {
      const n = Math.min(8, (o && o.n) || 2), c = o && o.color !== undefined ? o.color : C.amber;
      for (let i = 0; i < n; i++) P(GLOW, e.x + rr(-1, 1), e.y + rr(-1, 1), e.z + rr(-1, 1), 0, rr(-10, 0), rr(-4, 10), rr(0.2, 0.4), rr(1, 1.7), c, 0, O_ADD);
    },
    spud_burst(e, o) {
      burst(16, e.x, e.y, e.z, 110, 100, 0.9, 2.4, () => [C.tan, C.brown, C.tan, C.fluff][(rnd() * 4) | 0], 240);
      burst(8, e.x, e.y, e.z, 60, 70, 1.1, 1.8, C.fluff, 140);
      burst(6, e.x, e.y, e.z, 80, 60, 0.4, 1.4, C.yellow, 100, true);
      P(GLOW, e.x, e.y, e.z, 0, 0, 0, 0.25, 3.4, C.cream, 0, O_ADD);
      sprite('boom_small', e.x, e.y, e.z, 0.35, 0.8);
    },
    confetti(e, o) {
      const n = Math.min(80, (o && o.n) || 46);
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, sp = rr(30, 140);
        P(CONF, e.x, e.y, e.z, Math.cos(a) * sp, Math.sin(a) * sp, rr(60, 170), rr(1.4, 2.4), rr(1.2, 2.2), CI_CONF + ((rnd() * CONF_COL.length) | 0), 90, { drag: 0.9, rot: rnd() * TAU, spin: rr(-9, 9) });
      }
    },
  };

  const fire = (type, ex, ey, ez, opts) => {
    const h = handlers[type];
    if (h) h({ x: ex || 0, y: ey || 0, z: ez || 0 }, opts || null);
  };
  const off = bus && bus.on ? bus.on('fx', (p) => { if (p) fire(p.type, p.x, p.y, p.z, p.opts); }) : null;

  // ------------------------------------------------------------ cat trails
  function catTrail(dt, game) {
    const pl = game && game.player;
    if (!pl || !pl.alive || game.state === 'dying') return;
    const nip = game.nipT > 0;
    trailAcc += dt * (nip ? 90 : 46);
    let n = trailAcc | 0; trailAcc -= n; if (n > 4) n = 4;
    for (let k = 0; k < n; k++) {
      const back = k / Math.max(1, n) * 6 * dt * 60;
      const tx = pl.x + rr(-1.5, 1.5), ty = pl.y - 11 - back + rr(-1, 1), tz = pl.z + 5 + rr(-1.5, 1.5);
      if (nip) {
        const hue = CI_RB + (((clock * 14) + k) | 0) % NRB;
        P(GLOW, tx, ty, tz, 0, -rr(20, 50), rr(-4, 4), rr(0.4, 0.7), rr(1.5, 2.4), hue, 0, O_ADD);
        P(DOT, tx, ty, tz, 0, -rr(10, 30), 0, rr(0.35, 0.6), 2, hue, 0);
      } else {
        P(GLOW, tx, ty, tz, rr(-4, 4), -rr(25, 60), rr(-6, 6), rr(0.18, 0.34), rr(1, 1.6), [C.cream, C.yellow, C.amber, C.orange][(rnd() * 4) | 0], 0, O_ADD);
      }
    }
  }

  // ------------------------------------------------------------ update
  function update(dt, game) {
    if (!(dt > 0)) return;
    if (dt > 0.05) dt = 0.05;
    clock += dt;
    if (game) catTrail(dt, game);
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      life[i] -= dt;
      if (life[i] <= 0) { alive[i] = 0; count--; spr[i] = null; continue; }
      const k = kind[i];
      if (k === RING || k === SPLAT) continue;
      if (drag[i]) { const f = Math.max(0, 1 - drag[i] * dt * 3); vx[i] *= f; vy[i] *= f; }
      vz[i] -= grav[i] * dt;
      x[i] += vx[i] * dt; y[i] += vy[i] * dt; z[i] += vz[i] * dt;
      if (k === CONF) { x[i] += Math.sin(clock * 5 + i) * 14 * dt; if (vz[i] < -30) vz[i] = -30; }
      if (z[i] < 0 && grav[i] > 0) {   // bounce once off the floor, then die softly
        z[i] = 0;
        if (vz[i] < -25 && k !== DOT) { vz[i] *= -0.35; vx[i] *= 0.6; vy[i] *= 0.6; } else { vz[i] = 0; vx[i] *= 0.8; vy[i] *= 0.8; life[i] = Math.min(life[i], 0.25); }
      }
      rot[i] += spin[i] * dt;
    }
  }

  // ------------------------------------------------------------ draw
  function draw(ctx, camY = 0) {
    if (!count) return;
    const { ox, oy, A, B, C: CZ, W, H } = VIEW;
    const fieldHalf = 112;   // FIELD_W / 2
    let pass = 0;
    ctx.save();
    for (pass = 0; pass < 2; pass++) {
      const additive = pass === 1;
      if (additive) ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < N; i++) {
        if (!alive[i]) continue;
        const k = kind[i];
        const isAdd = add[i] === 1 || k === GLOW;
        if (isAdd !== additive) continue;
        const u = x[i] - fieldHalf, v = y[i] - camY;
        const sx = ox + (u + v) * A, sy = oy + (u - v) * B - z[i] * CZ;
        if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;
        const f = life[i] / max[i];   // 1 -> 0
        const p = 1 - f;              // 0 -> 1
        switch (k) {
          case DOT: {
            ctx.globalAlpha = f < 0.3 ? f / 0.3 : 1;
            ctx.fillStyle = colorOf(col[i]);
            const s = Math.max(1, Math.round(size[i] * (0.5 + 0.5 * f)));
            ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), s, s);
            break;
          }
          case GLOW: {
            const g = glowOf(col[i]);
            const s = size[i] * 8 * (0.45 + 0.55 * f);
            ctx.globalAlpha = Math.min(1, f * 1.4) * (additive ? 0.9 : 1);
            if (g) ctx.drawImage(g, sx - s / 2, sy - s / 2, s, s);
            else { ctx.fillStyle = colorOf(col[i]); ctx.fillRect(Math.round(sx - s / 4), Math.round(sy - s / 4), Math.max(1, s / 2), Math.max(1, s / 2)); }
            break;
          }
          case CRUMB: {
            ctx.globalAlpha = f < 0.25 ? f / 0.25 : 1;
            const img = safeGet(art, 'crumb', var_[i]);
            if (img) {
              if (spin[i] && Math.abs(spin[i]) > 4.5) { ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); ctx.rotate(rot[i]); ctx.drawImage(img, -2, -2); ctx.restore(); }
              else ctx.drawImage(img, Math.round(sx - 2), Math.round(sy - 2));
            } else { ctx.fillStyle = PAL[[C.yellow, C.amber, C.cream, C.orange][var_[i] & 3]]; ctx.fillRect(Math.round(sx - 1), Math.round(sy - 1), 3, 3); }
            break;
          }
          case CONF: {
            ctx.globalAlpha = f < 0.3 ? f / 0.3 : 1;
            ctx.fillStyle = colorOf(col[i]);
            const flip = Math.abs(Math.cos(rot[i]));
            const w = Math.max(1, Math.round(size[i] * 2 * (0.3 + flip))), h = Math.max(1, Math.round(size[i]));
            ctx.fillRect(Math.round(sx - w / 2), Math.round(sy - h / 2), w, h);
            break;
          }
          case SPRITE: {
            const name = spr[i], frames = name === 'boom_big' ? 8 : name === 'boom_small' ? 6 : 4;
            const fr = Math.min(frames - 1, (p * frames) | 0);
            const img = safeGet(art, name, fr);
            const sc = size[i];
            ctx.globalAlpha = f < 0.25 ? f / 0.25 : 1;
            if (img) {
              const w = (img.width || img.w) * sc, h = (img.height || img.h) * sc;
              ctx.drawImage(img, Math.round(sx - w / 2), Math.round(sy - h / 2), w, h);
            } else {
              ctx.fillStyle = PAL[FIRE_FALLBACK(p)]; const r = (name === 'boom_big' ? 18 : 9) * (0.4 + p) * sc;
              ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
            }
            break;
          }
          case RING: {
            const r = size[i] * (0.15 + 0.85 * Math.sqrt(p));
            const wpx = r * 2.83, hpx = r * 1.415;
            ctx.globalAlpha = f * f * (var_[i] ? 0.5 : 0.95);
            const img = safeGet(art, 'ring', Math.min(3, (p * 4) | 0));
            if (img && wpx > 2) ctx.drawImage(img, Math.round(sx - wpx / 2), Math.round(sy - hpx / 2), wpx, hpx);
            else {
              ctx.strokeStyle = colorOf(col[i]); ctx.lineWidth = 2;
              ctx.beginPath(); ctx.ellipse(sx, sy, Math.max(1, wpx / 2), Math.max(1, hpx / 2), 0, 0, TAU); ctx.stroke();
            }
            break;
          }
          case SPLAT: {
            ctx.globalAlpha = f < 0.4 ? f / 0.4 * 0.85 : 0.85;
            ctx.fillStyle = colorOf(col[i]);
            const r = size[i] * (0.5 + 0.5 * Math.min(1, p * 5));
            ctx.beginPath(); ctx.ellipse(sx, sy, r * 1.4, r * 0.7, 0, 0, TAU); ctx.fill();
            break;
          }
          case SMOKE: {
            const img = safeGet(art, 'smoke', Math.min(3, (p * 4) | 0));
            ctx.globalAlpha = Math.min(0.85, f * 1.2);
            const sc = size[i] * (0.8 + p * 0.8);
            if (img) { const w = (img.width || img.w) * sc; ctx.drawImage(img, Math.round(sx - w / 2), Math.round(sy - w / 2), w, w); }
            else { ctx.fillStyle = '#8a8a98'; ctx.beginPath(); ctx.arc(sx, sy, 5 * sc, 0, TAU); ctx.fill(); }
            break;
          }
        }
      }
    }
    ctx.restore();
  }
  const FIRE_FALLBACK = (p) => (p < 0.25 ? C.cream : p < 0.5 ? C.yellow : p < 0.75 ? C.orange : C.red);

  function clear() { alive.fill(0); count = 0; for (let i = 0; i < N; i++) spr[i] = null; }
  function dispose() { if (off) off(); }

  return {
    update, draw, clear, dispose, spawn: fire,
    get count() { return count; },
    max: N,
  };
}

export default createParticles;
