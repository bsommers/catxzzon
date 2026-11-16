// Entity sprites: frame choice, anchoring, hit-flash tints, shadows, cheese strands, rainbow trail.
// Owner: render-scene. Node-safe (no DOM at import time). Coordinate math goes through core/iso.js project().
import { KINDS, TUNING } from '../core/defs.js';
import { project } from '../core/iso.js';
import { hash2 } from '../art/pixbuf.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const P = { sx: 0, sy: 0 }, Q = { sx: 0, sy: 0 };

/** Sprites anchored by a pixel that sits on the projected CENTRE of the entity box (art-cat: ship (25,26), aura (27,25)). */
export const CENTER_ANCHORS = { cat_ship: { cx: 25, cy: 26 }, cat_aura: { cx: 27, cy: 25 } };

/**
 * Top-left screen position (camY = 0 space, unrounded) of a sprite of size sw x sh for a box at (x,y,z) sized w,d,h.
 * Default: the sprite's BOTTOM-CENTRE sits on the front (lowest) corner of the box footprint, i.e. the sprite rect is
 * the bounding box of the projected box. Names in CENTER_ANCHORS are centred on the box centre instead.
 */
export function spriteTopLeft(name, sw, sh, x, y, z, w, d, h, out = { x: 0, y: 0 }) {
  const a = CENTER_ANCHORS[name];
  if (a) { project(x, y, z + h / 2, 0, P); out.x = P.sx - a.cx; out.y = P.sy - a.cy; return out; }
  project(x + w / 2, y - d / 2, z, 0, P);
  out.x = P.sx - sw / 2; out.y = P.sy - sh;
  return out;
}

const BOSS_ANIM = { idle: 0, idle2: 1, taunt: 2, charge: 3, glow: 3, fire: 4, attack: 4, hurt: 5, hit: 5, enraged: 6, rage: 6, defeated: 7, dead: 7, dying: 7 };
const FACING = { dl: 0, dr: 1, ul: 2, ur: 3, '-y': 0, '+x': 1, '-x': 2, '+y': 3 };
const idn = (e) => (e.id | 0) * 0.37;

/** Sprite frame for an entity. A numeric `e.frame` written by the sim always wins. s = per-entity render state. */
export function frameOf(e, g, t, s) {
  if (Number.isFinite(e.frame)) return e.frame | 0;
  const age = Number.isFinite(e.t) ? e.t : t;
  switch (e.kind) {
    case 'hairball': return Math.floor(age * 16) & 1;
    case 'yarn': return Math.floor(age * 10) & 3;
    case 'yarnpick': case 'nip': case 'laserpick': return Math.floor(t * 7 + idn(e)) & 3;
    case 'cheeseball': return Math.floor(age * 12) & 1;
    case 'turret': {
      if (s && s.flashT > 0) return 5;
      if (s && s.muzzleT > 0) return 4;
      if (Number.isFinite(e.facing)) return e.facing & 3;
      if (typeof e.facing === 'string' && e.facing in FACING) return FACING[e.facing];
      const p = g && g.player;
      if (!p) return 0;
      const dx = p.x - e.x, dy = p.y - e.y;
      return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 2) : dy > 0 ? 3 : 0;
    }
    case 'pad': {
      if (e.launched || (e.st && (e.st.launched || e.st.fired))) return 2;
      if (e.armed) return 1;
      const p = g && g.player;
      return p && e.y - p.y < (e.trigger || 170) * 1.5 && Math.floor(t * 4) & 1 ? 1 : 0;
    }
    case 'can': case 'bossmissile': return Math.floor(age * 13) & 3;
    case 'tuna': return (t * 0.8 + idn(e)) % 1 < 0.12 ? 1 : 0;
    case 'radar': return Math.floor(t * 6 + idn(e)) & 3;
    case 'mousejet': return clamp(Math.round(Number.isFinite(e.bank) ? e.bank : (e.vx || 0) / 50), -2, 2) + 2;
    case 'spud': return Number.isFinite(e.ang) ? Math.floor((((e.ang % TAU) + TAU) % TAU) / TAU * 4) & 3 : Math.floor(age * 7 + idn(e)) & 3;
    case 'boss': {
      if (s && s.flashT > 0) return 5;
      const a = e.anim || e.pose || (e.st && (e.st.anim || e.st.pose));
      if (typeof a === 'string' && a in BOSS_ANIM) return BOSS_ANIM[a];
      const hp01 = g && g.bossHp01;
      if (hp01 != null && hp01 <= 0) return 7;
      if ((e.phase || (e.st && e.st.phase) || 0) >= 3 || (hp01 != null && hp01 < 0.33)) return 6;
      return Math.floor(t * 2.5) & 1;
    }
    default: return 0;
  }
}
/** Player ship frame: (bank+2)*2 + flame flicker. */
export function catFrame(bank, t) { return (clamp(Math.round(bank || 0), -2, 2) + 2) * 2 + (Math.floor(t * 14) & 1); }

// ---------------------------------------------------------------- field geometry
/** Normalised geometry of a `field` entity: posts at x0/x1 (inset), strands between z0..z1. */
export function fieldGeom(e, out = {}) {
  const wide = e.span > 0 ? e.span * 16 : e.w > 16 ? e.w : 16, half = wide / 2;
  out.y = e.y; out.x0 = e.x - half + 3; out.x1 = e.x + half - 3;
  out.z0 = Number.isFinite(e.z0) ? e.z0 : e.z || 0;
  out.z1 = Number.isFinite(e.z1) ? e.z1 : out.z0 + (e.h || 16);
  if (out.z1 < out.z0 + 6) out.z1 = out.z0 + 6;
  out.n = Math.max(2, Math.round((out.z1 - out.z0) / 9) + 1);
  out.seed = (e.id | 0) * 7 + 3;
  return out;
}
/** Is the barrier live? Prefers the sim's `e.on`; falls back to a 60% duty cycle of e.pulse. */
export function fieldLevel(e, t) {
  let on = typeof e.on === 'boolean' ? e.on : undefined, warn = !!e.warn;
  if (on === undefined) {
    if (e.pulse > 0) { const ph = ((((t + (e.phase || 0)) % e.pulse) + e.pulse) % e.pulse) / e.pulse; on = ph < 0.6; warn = !on && ph > 0.88; }
    else on = true;
  }
  return on ? 1 : warn ? ((Number.isFinite(e.glow) ? e.glow > 0 : Math.floor(t * 16) & 1) ? 0.45 : 0.12) : 0;
}
/** World z of strand i of field f at lateral x, time t: wavy, sagging rope. */
export function strandZ(f, i, x, t) {
  const base = f.z0 + 3 + ((f.z1 - f.z0 - 6) * i) / (f.n - 1), u = (x - f.x0) / Math.max(1, f.x1 - f.x0);
  const pin = Math.sin(Math.PI * clamp(u, 0, 1));             // 0 at the posts
  return base + pin * (Math.sin(x * 0.11 + t * 3.3 + i * 1.9 + f.seed) * 1.9 + Math.sin(x * 0.27 - t * 4.7 + i * 0.7) * 0.9 - 2.2);
}

export function createSprites(artRef, mk) {
  let ver = -1, whites = new Map();
  const OPTS = { flash: 0, glow: 0, scale: 1, alpha: 1 };
  function white(name, frame) {
    const art = artRef.art;
    if (ver !== art.version) { ver = art.version; whites = new Map(); }
    const key = name + ':' + frame;
    let c = whites.get(key);
    if (c !== undefined) return c;
    const src = art.get(name, frame);
    if (!mk || !src || !src.getContext) { whites.set(key, null); return null; }
    c = mk(src.width, src.height);
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fffbe6'; g.fillRect(0, 0, c.width, c.height);
    whites.set(key, c);
    return c;
  }

  /** Draw one sprite at integer top-left (X,Y). o: { flash 0..1, glow 0..1, scale, alpha }. */
  function drawSprite(ctx, name, frame, X, Y, o) {
    const art = artRef.art, img = art.get(name, frame);
    const scale = o && o.scale ? o.scale : 1, alpha = o && o.alpha != null ? o.alpha : 1;
    const w = img.width || img.w, h = img.height || img.h;
    if (alpha < 1) ctx.globalAlpha = alpha;
    if (scale !== 1) {
      const dw = Math.round(w * scale), dh = Math.round(h * scale);
      ctx.drawImage(img, X + ((w - dw) >> 1), Y + (h - dh), dw, dh);
    } else ctx.drawImage(img, X, Y);
    const fl = o ? o.flash : 0, gl = o ? o.glow : 0;
    if (fl > 0) { const wimg = white(name, frame); if (wimg) { ctx.globalAlpha = alpha * Math.min(1, fl); ctx.drawImage(wimg, X, Y); } }
    if (gl > 0 && scale === 1 && art.glow) {
      const gimg = art.glow(name, frame);
      if (gimg) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * Math.min(1, gl); ctx.drawImage(gimg, X - 4, Y - 4); ctx.globalCompositeOperation = 'source-over'; }
    }
    ctx.globalAlpha = 1;
  }

  // ---- shadows -------------------------------------------------------------------------------------------------
  /** Add an entity's ground shadow ellipse to the current path (caller fills once so overlaps do not double-darken). */
  function shadowPath(ctx, x, y, z0, alt, w, d, cdx, cdy) {
    const k = 1 - 0.38 * clamp(alt / 128, 0, 1), rx = Math.max(2.5, ((w + d) / 2) * 0.62 * k);
    project(x, y, z0, 0, P);
    const sx = Math.round(P.sx + cdx), sy = Math.round(P.sy + cdy);
    ctx.moveTo(sx + rx, sy);
    ctx.ellipse(sx, sy, rx, rx * 0.5, 0, 0, TAU);
  }
  /** The player's shadow: darker, with a crisp ring so it reads on any floor (and a light blip in space). */
  function playerShadow(ctx, x, y, z0, alt, cdx, cdy, space) {
    const k = 1 - 0.3 * clamp(alt / 128, 0, 1), rx = 13 * k;
    project(x, y, z0, 0, P);
    const sx = Math.round(P.sx + cdx), sy = Math.round(P.sy + cdy);
    ctx.beginPath(); ctx.ellipse(sx, sy, rx, rx * 0.5, 0, 0, TAU);
    ctx.fillStyle = space ? 'rgba(140,230,255,0.16)' : 'rgba(16,6,34,0.50)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = space ? 'rgba(170,240,255,0.55)' : 'rgba(255,240,200,0.22)'; ctx.stroke();
  }
  /** One piece of the altitude line from z = za up to zb at (x,y): thin dotted ruler with a tick every 16 units. */
  function altSegment(ctx, x, y, za, zb, cdx, cdy) {
    project(x, y, za, 0, P); project(x, y, zb, 0, Q);
    const sx = Math.round(P.sx + cdx), y0 = Math.round(Q.sy + cdy), y1 = Math.round(P.sy + cdy);
    ctx.fillStyle = 'rgba(255,246,214,0.42)';
    for (let yy = y0; yy < y1; yy += 2) ctx.fillRect(sx, yy, 1, 1);
    if (Math.round(za) % 16 === 0 && za > 0) { ctx.fillStyle = 'rgba(255,246,214,0.6)'; ctx.fillRect(sx - 1, y1, 3, 1); }
  }

  // ---- spray-cheese strands ------------------------------------------------------------------------------------
    /** Draw the ropes of field f between xa..xb (one depth-sorted slice). lvl: 1 live, 0 off (ghost), between = warning. */
  function strandSlice(ctx, f, xa, xb, i0, i1, t, cdx, cdy, lvl) {
    const steps = Math.max(1, Math.ceil((xb - xa) / 4));
    const trace = (dy) => {
      ctx.beginPath();
      for (let i = i0; i < i1; i++) {
        for (let s = 0; s <= steps; s++) {
          const x = xa + ((xb - xa) * s) / steps;
          project(x, f.y, strandZ(f, i, x, t), 0, P);
          if (s === 0) ctx.moveTo(P.sx + cdx, P.sy + cdy + dy); else ctx.lineTo(P.sx + cdx, P.sy + cdy + dy);
        }
      }
    };
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    if (lvl <= 0) {                                   // switched off: faint ghost so the gap is still readable
      trace(0); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,200,110,0.10)'; ctx.stroke();
      return;
    }
    const a = lvl >= 1 ? 1 : lvl;
    ctx.globalCompositeOperation = 'lighter';
    trace(0); ctx.lineWidth = 9; ctx.strokeStyle = `rgba(255,132,24,${(0.17 * a).toFixed(3)})`; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    if (a < 1) ctx.globalAlpha = a;
    ctx.lineCap = 'round';
    trace(0.6); ctx.lineWidth = 4.4; ctx.strokeStyle = '#a04a0c'; ctx.stroke();
    trace(0); ctx.lineWidth = 3; ctx.strokeStyle = '#ffa41c'; ctx.stroke();
    trace(-0.7); ctx.lineWidth = 1.2; ctx.strokeStyle = '#ffe985'; ctx.stroke();
    // blobs + drips: spray cheese is lumpy and it drips
    const seg = Math.round(xa / 16);
    for (let i = i0; i < i1; i++) {
      const h = hash2(seg, i, f.seed), bx = xa + (xb - xa) * (0.2 + 0.6 * h);
      project(bx, f.y, strandZ(f, i, bx, t), 0, P);
      const sx = P.sx + cdx, sy = P.sy + cdy;
      ctx.fillStyle = '#ffb52e'; ctx.beginPath(); ctx.arc(sx, sy, 2.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff3b0'; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 2, 1, 1);
      if (h > 0.35) {
        const ph = (t * (0.7 + h * 0.5) + h * 9) % 1, fall = ph * ph * 15;
        ctx.globalAlpha = a * (1 - ph);
        ctx.fillStyle = '#ffa41c'; ctx.fillRect(Math.round(sx) - 1, Math.round(sy + 2 + fall), 2, 2 + Math.round(ph * 2));
        ctx.globalAlpha = a;
      }
    }
    ctx.globalAlpha = 1;
  }
  /** Additive bloom over a whole live field (drawn after the sorted pass). */
  function strandBloom(ctx, f, t, cdx, cdy, lvl) {
    if (lvl <= 0) return;
    ctx.lineCap = 'round'; ctx.lineWidth = 13;
    ctx.strokeStyle = `rgba(255,150,36,${(0.055 * lvl * (0.85 + 0.15 * Math.sin(t * 17 + f.seed))).toFixed(3)})`;
    ctx.beginPath();
    for (let i = 0; i < f.n; i++) {
      const z = f.z0 + 3 + ((f.z1 - f.z0 - 6) * i) / (f.n - 1);
      project(f.x0, f.y, z, 0, P); ctx.moveTo(P.sx + cdx, P.sy + cdy);
      project(f.x1, f.y, z - 2, 0, P); ctx.lineTo(P.sx + cdx, P.sy + cdy);
    }
    ctx.stroke();
  }
  /** Nozzle can of a field post at (x, f.y): sits on a pole so its nozzle reaches the top strand. */
  function post(ctx, f, x, frame, cdx, cdy, glow) {
    const art = artRef.art, sz = art.size('field_post'), zb = Math.max(0, f.z1 - (sz.h - 6));
    project(x, f.y, zb, 0, Q);
    const sx = Math.round(Q.sx + cdx), ty = Math.round(Q.sy + cdy);
    if (zb <= 0) { ctx.fillStyle = 'rgba(16,6,34,0.4)'; ctx.fillRect(sx - 5, ty + 1, 11, 3); }
    OPTS.glow = glow > 0 ? glow : 0;
    drawSprite(ctx, 'field_post', frame, sx - (sz.w >> 1), ty + 4 - sz.h, OPTS);
  }
  /** One piece (za..zb) of the steel pole under a raised post. */
  function pole(ctx, x, y, za, zb, cdx, cdy) {
    project(x, y, za, 0, P); project(x, y, zb, 0, Q);
    const sx = Math.round(P.sx + cdx), y1 = Math.round(P.sy + cdy), y0 = Math.round(Q.sy + cdy);
    if (za <= 0) { ctx.fillStyle = 'rgba(16,6,34,0.4)'; ctx.fillRect(sx - 4, y1, 9, 2); }
    ctx.fillStyle = '#2c2836'; ctx.fillRect(sx - 2, y0, 5, y1 - y0 + 1);
    ctx.fillStyle = '#b4bacd'; ctx.fillRect(sx - 1, y0, 1, y1 - y0 + 1);
    ctx.fillStyle = '#737789'; ctx.fillRect(sx, y0, 1, y1 - y0 + 1);
  }

  // ---- catnip rainbow ------------------------------------------------------------------------------------------
  const RAINBOW = ['#ff3b4e', '#ff9a2e', '#ffe14a', '#4be36a', '#3fb4ff', '#b47cff'];
  /** Ribbon through world-space history points [{x,y,z,t}], newest last. now = current time; life in seconds. */
  function rainbowTrail(ctx, hist, now, life, cdx, cdy) {
    const n = hist.length;
    if (n < 2) return;
    ctx.lineCap = 'butt'; ctx.lineWidth = 2;
    for (let b = 0; b < RAINBOW.length; b++) {
      ctx.strokeStyle = RAINBOW[b];
      const off = (b - 2.5) * 1.9;
      for (let i = 1; i < n; i++) {
        const p0 = hist[i - 1], p1 = hist[i], age = (now - p1.t) / life;
        if (age >= 1) continue;
        const w0 = Math.sin((now - p0.t) * 22 + b * 0.5) * 1.2 * age, w1 = Math.sin((now - p1.t) * 22 + b * 0.5) * 1.2 * age;
        project(p0.x, p0.y, p0.z, 0, P); project(p1.x, p1.y, p1.z, 0, Q);
        ctx.globalAlpha = 0.85 * (1 - age) * (1 - age);
        ctx.beginPath(); ctx.moveTo(P.sx + cdx, P.sy + cdy + off + w0); ctx.lineTo(Q.sx + cdx, Q.sy + cdy + off + w1); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  return { drawSprite, white, shadowPath, playerShadow, altSegment, strandSlice, strandBloom, post, pole, rainbowTrail };
}

/** Box (w,d,h) of an entity, falling back to its KINDS row. */
export function boxOf(e, out = {}) {
  const k = KINDS[e.kind];
  out.w = e.w > 0 ? e.w : k ? k.w : 12; out.d = e.d > 0 ? e.d : k ? k.d : 12; out.h = e.h > 0 ? e.h : k ? k.h : 12;
  return out;
}
export const PLAYER_BOX = TUNING.playerBox;
