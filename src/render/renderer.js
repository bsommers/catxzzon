// CATXZZON renderer (ARCHITECTURE.md §8). Owner: render-scene.
//
//   const r = createRenderer(canvas, { bus, art });      // art = registry.buildAll() (optional: built here if omitted)
//   r.draw(game, alpha)  r.resize()  r.setCRT(on)  r.shot()
//
// Frame: background -> [world layer: ground, decor, shadows, voxels+entities+strands in painter order, then depth fog
// and a lighting gradient applied to the layer only] -> particles -> strand bloom -> popups -> low-fuel / catnip /
// flash overlays -> HUD -> optional overlay hook -> optional CRT pass.
// Optional modules (background, particles, hud) are loaded with dynamic import and every hook call is guarded, so the
// renderer works with any subset of the swarm's modules. Node-safe: no DOM access at import time.
import { VIEW, TUNING, FIELD_W } from '../core/defs.js';
import { project } from '../core/iso.js';
import { hash2 } from '../art/pixbuf.js';
import { buildAll } from '../art/registry.js';
import { createScene } from './scene.js';

const W = VIEW.W, H = VIEW.H, M = 16, WW = W + 2 * M, WH = H + 2 * M;
const FOG = { dusk: [104, 58, 112], void: [12, 8, 34], night: [20, 26, 70] };
const SKY = { dusk: ['#1d0f33', '#6a2c5c', '#e07a48'], void: ['#04030c', '#0c0a24', '#1b1140'], night: ['#060818', '#121843', '#2c2562'] };
const FOG_START = 240, FOG_END = 545, FADE_START = 410;

function defaultCanvasFactory() {
  if (typeof document !== 'undefined' && document.createElement) return (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  if (typeof OffscreenCanvas !== 'undefined') return (w, h) => new OffscreenCanvas(w, h);
  throw new Error('createRenderer: no canvas factory (pass opts.createCanvas)');
}
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ bus?: any, art?: any, hooks?: false | { drawBackground?, particles?, drawHud?, popups? }, createCanvas?: (w,h)=>any, crt?: boolean }} [opts]
 */
export function createRenderer(canvas, opts = {}) {
  const bus = opts.bus || null, mk = opts.createCanvas || defaultCanvasFactory();
  const artRef = { art: null };
  if (opts.art && typeof opts.art.then === 'function') {              // tolerate a Promise<registry>
    artRef.art = buildAll({ modules: [] });
    opts.art.then((a) => { if (a && typeof a.get === 'function') artRef.art = a; }, () => {});
  } else artRef.art = opts.art && typeof opts.art.get === 'function' ? opts.art : buildAll();

  let ctx = canvas.getContext('2d');
  const sceneC = mk(W, H), sctx = sceneC.getContext('2d');
  const worldC = mk(WW, WH), wctx = worldC.getContext('2d');
  const scene = createScene(artRef, mk);
  const Hk = { drawBackground: null, particles: null, drawHud: null, popups: null, overlay: null };
  const errs = {};
  const fx = { shake: 0, shakeDur: 1, shakeT: 0, flashC: '#ffffff', flashA: 0, flashDur: 1, flashT: 0, hitstop: 0 };
  const view = { alpha: 0, dt: 0, now: 0, camY: 0, cdx: 0, cdy: 0 };
  const stats = { ms: 0, fps: 60, frames: 0, scene: scene.stats };
  let crt = !!opts.crt, clock = 0, uiClock = 0, lastNow = -1, haveFrame = false, swayX = 0, swayY = 0, lastGameT = NaN;
  let post = null, fogKey = '', fogGrad = null, fadeGrad = null, lightGrad = null, bgKey = '', bgGrad = null;

  // ---- hooks ---------------------------------------------------------------------------------------------------
  function setHooks(h) { for (const k of Object.keys(h || {})) Hk[k] = h[k]; }
  if (opts.hooks) setHooks(opts.hooks);
  const given = opts.hooks || {};
  const ready = opts.hooks === false ? Promise.resolve() : (async () => {
    const imp = async (path) => { try { return await import(path); } catch { return null; } };
    if (!('drawBackground' in given)) { const m = await imp('./background.js'); if (m && typeof m.drawBackground === 'function' && !Hk.drawBackground) Hk.drawBackground = m.drawBackground; }
    if (!('particles' in given) && bus) {
      const m = await imp('./particles.js');
      if (m && typeof m.createParticles === 'function' && !Hk.particles) try { Hk.particles = m.createParticles(bus, artRef.art); } catch (e) { console.warn('[render] particles failed', e); }
    }
    if (!('drawHud' in given) || !('popups' in given)) {
      const m = await imp('../ui/hud.js');
      if (m && typeof m.drawHud === 'function' && !('drawHud' in given) && !Hk.drawHud) Hk.drawHud = m.drawHud;
      if (m && typeof m.createPopups === 'function' && !('popups' in given) && bus && !Hk.popups) try { Hk.popups = m.createPopups(bus); } catch (e) { console.warn('[render] popups failed', e); }
    }
  })();
  function call(name, c, fn) {
    c.save();
    try { fn(); errs[name] = 0; } catch (e) {
      errs[name] = (errs[name] || 0) + 1;
      if (errs[name] === 1) console.warn(`[render] hook "${name}" threw`, e);
      if (errs[name] > 60) { Hk[name] = null; console.warn(`[render] hook "${name}" disabled after repeated errors`); }
    }
    c.restore();
  }

  // ---- bus: screen effects -------------------------------------------------------------------------------------
  const secs = (v, def) => { v = Number.isFinite(v) ? v : def; return v > 10 ? v / 1000 : v; };
  if (bus && typeof bus.on === 'function') {
    bus.on('shake', (p) => {
      const mag = Math.min(12, (p && p.mag) || 3), cur = fx.shakeT > 0 ? fx.shake * (fx.shakeT / fx.shakeDur) : 0;
      if (mag >= cur) { fx.shake = mag; fx.shakeDur = Math.max(0.05, secs(p && p.dur, 0.2)); fx.shakeT = fx.shakeDur; }
    });
    bus.on('flash', (p) => { fx.flashC = (p && p.color) || '#ffffff'; fx.flashA = Math.min(0.9, (p && p.a) ?? 0.5); fx.flashDur = Math.max(0.03, secs(p && p.dur, 0.15)); fx.flashT = fx.flashDur; });
    bus.on('hitstop', (p) => { fx.hitstop = Math.max(fx.hitstop, Math.min(180, (p && p.ms) || 40) / 1000); });
    bus.on('stage', () => scene.reset());
  }

  // ---- lazily built post-processing resources ------------------------------------------------------------------
  function buildPost() {
    const radial = (inner, outer, r0, r1) => {
      const c = mk(W, H), g = c.getContext('2d'), gr = g.createRadialGradient(W / 2, H / 2, r0, W / 2, H / 2, r1);
      gr.addColorStop(0, inner); gr.addColorStop(1, outer);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      return c;
    };
    const scan = radial('rgba(0,0,0,0)', 'rgba(0,0,0,0.42)', H * 0.56, W * 0.68), sg = scan.getContext('2d');
    sg.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 1; y < H; y += 2) sg.fillRect(0, y, W, 1);
    sg.fillStyle = 'rgba(255,255,255,0.022)';
    for (let y = 0; y < H; y += 2) sg.fillRect(0, y, W, 1);
    post = {
      scan,
      red: radial('rgba(255,30,40,0)', 'rgba(255,24,36,0.95)', H * 0.42, W * 0.6),
      edge: radial('rgba(255,255,255,0)', 'rgba(255,255,255,1)', H * 0.5, W * 0.62),
      tint: mk(W, H), bloom: mk(W / 4, H / 4),
    };
  }
  /** Screen-space gradients along the scroll axis (iso-lines of constant forward distance v). */
  function fogFor(bg) {
    if (fogKey === bg && fogGrad) return;
    fogKey = bg;
    const c = FOG[bg] || FOG.night;
    const o = project(FIELD_W / 2, 0, 0, 0), pu = project(FIELD_W / 2 + 1, 0, 0, 0), pv = project(FIELD_W / 2, 1, 0, 0);
    const ux = pu.sx - o.sx, uy = pu.sy - o.sy, vx = pv.sx - o.sx, vy = pv.sy - o.sy, ul = Math.hypot(ux, uy);
    let nx = uy / ul, ny = -ux / ul, dpv = vx * nx + vy * ny;            // unit normal to the u axis, px per unit of v
    if (dpv < 0) { nx = -nx; ny = -ny; dpv = -dpv; }
    const line = (v0, v1) => wctx.createLinearGradient(M + o.sx + vx * v0, M + o.sy + vy * v0, M + o.sx + vx * v0 + nx * dpv * (v1 - v0), M + o.sy + vy * v0 + ny * dpv * (v1 - v0));
    fogGrad = line(FOG_START, FOG_END);
    fogGrad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0)`); fogGrad.addColorStop(0.55, `rgba(${c[0]},${c[1]},${c[2]},0.26)`); fogGrad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0.62)`);
    fadeGrad = line(FADE_START, FOG_END);
    fadeGrad.addColorStop(0, 'rgba(0,0,0,0)'); fadeGrad.addColorStop(1, 'rgba(0,0,0,1)');
    lightGrad = wctx.createLinearGradient(M, M, M + W * 0.8, M + H);
    lightGrad.addColorStop(0, 'rgba(255,228,180,0.13)'); lightGrad.addColorStop(0.45, 'rgba(255,228,180,0)'); lightGrad.addColorStop(0.55, 'rgba(16,6,48,0)'); lightGrad.addColorStop(1, 'rgba(16,6,48,0.30)');
  }
  function fallbackBackground(c, game, t) {
    const bg = (game && game.stage && game.stage.bg) || 'night';
    if (bgKey !== bg) { bgKey = bg; const s = SKY[bg] || SKY.night; bgGrad = c.createLinearGradient(0, 0, W * 0.25, H); bgGrad.addColorStop(0, s[0]); bgGrad.addColorStop(0.6, s[1]); bgGrad.addColorStop(1, s[2]); }
    c.fillStyle = bgGrad; c.fillRect(0, 0, W, H);
    const drift = game ? (game.scrollY || 0) * 0.04 : t * 3;
    for (let i = 0; i < 70; i++) {
      const x = (hash2(i, 1, 5) * (W + 40) - drift * (0.4 + hash2(i, 3, 5)) + 4000 * W) % (W + 40) - 20, y = hash2(i, 2, 5) * H * 0.9;
      c.fillStyle = `rgba(255,244,220,${(0.25 + 0.5 * Math.abs(Math.sin(t * (0.6 + hash2(i, 4, 5)) + i))).toFixed(2)})`;
      c.fillRect(Math.round(x), Math.round(y), hash2(i, 6, 5) > 0.85 ? 2 : 1, 1);
    }
  }

  // ---- frame ---------------------------------------------------------------------------------------------------
  function renderScene(game, alpha, dt, primary) {
    sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'source-over'; sctx.imageSmoothingEnabled = false;
    if (Hk.drawBackground) call('drawBackground', sctx, () => Hk.drawBackground(sctx, game, clock, artRef.art));
    if (!Hk.drawBackground || errs.drawBackground) fallbackBackground(sctx, game, clock);
    if (!game || !game.stage) return;
    const p = game.player;
    // camera feel: the view leans a little toward where the cat is, eased
    const tx = p && Number.isFinite(p.x) ? -(p.x - FIELD_W / 2) * 0.05 : 0, ty = p && Number.isFinite(p.z) ? tx * 0.5 + (p.z - 56) * 0.03 : 0;
    const kf = 1 - Math.pow(0.004, dt);
    swayX += (tx - swayX) * kf; swayY += (ty - swayY) * kf;
    const sx = Math.round(swayX), sy = Math.round(swayY);
    let shx = 0, shy = 0;
    if (fx.shakeT > 0) {
      const m = fx.shake * (fx.shakeT / fx.shakeDur);
      shx = Math.round(Math.sin(clock * 91.7 + 1.3) * m); shy = Math.round(Math.cos(clock * 77.3) * m * 0.8);
    }
    // world layer
    wctx.setTransform(1, 0, 0, 1, 0, 0); wctx.globalAlpha = 1; wctx.globalCompositeOperation = 'source-over'; wctx.imageSmoothingEnabled = false;
    wctx.clearRect(0, 0, WW, WH);
    wctx.save(); wctx.translate(M + sx, M + sy);
    view.alpha = alpha; view.dt = dt; view.now = clock;
    try { scene.draw(wctx, game, view); } catch (e) { errs.scene = (errs.scene || 0) + 1; if (errs.scene === 1) console.error('[render] scene failed', e); }
    wctx.restore();
    wctx.globalAlpha = 1;
    fogFor(game.stage.bg || 'night');
    wctx.globalCompositeOperation = 'source-atop';
    wctx.fillStyle = lightGrad; wctx.fillRect(0, 0, WW, WH);
    wctx.fillStyle = fogGrad; wctx.fillRect(0, 0, WW, WH);
    wctx.globalCompositeOperation = 'destination-out';
    wctx.fillStyle = fadeGrad; wctx.fillRect(0, 0, WW, WH);
    wctx.globalCompositeOperation = 'source-over';
    sctx.drawImage(worldC, -M + shx, -M + shy);
    // world-space overlays
    const gt = game.t || 0, sdt = Number.isFinite(lastGameT) ? Math.max(0, Math.min(0.1, gt - lastGameT)) : 0;
    lastGameT = gt;
    sctx.save(); sctx.translate(sx + shx, sy + shy);
    if (Hk.particles) call('particles', sctx, () => { Hk.particles.update(sdt, game); Hk.particles.draw(sctx, view.camY); });
    sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'lighter';
    scene.drawGlow(sctx);
    sctx.globalCompositeOperation = 'source-over';
    if (Hk.popups && primary) call('popups', sctx, () => { Hk.popups.update(sdt); Hk.popups.draw(sctx, view.camY); });
    sctx.restore();
    // catnip overdrive: rainbow glow creeping in from the screen edges
    if (game.nipT > 0) {
      if (!post) buildPost();
      const g = post.tint.getContext('2d'), k = Math.min(1, game.nipT / 0.6);
      g.globalCompositeOperation = 'copy'; g.fillStyle = `hsl(${Math.floor((clock * 240) % 360)},100%,58%)`; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(post.edge, 0, 0);
      sctx.globalCompositeOperation = 'lighter'; sctx.globalAlpha = 0.34 * k * (0.8 + 0.2 * Math.sin(clock * 11));
      sctx.drawImage(post.tint, 0, 0);
      sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'source-over';
    }
  }

  function applyCRT() {
    if (!post) buildPost();
    const b = post.bloom.getContext('2d');
    b.imageSmoothingEnabled = true; b.globalCompositeOperation = 'copy'; b.drawImage(canvas, 0, 0, W / 4, H / 4);
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.24;
    ctx.drawImage(post.bloom, 0, 0, W, H);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(post.scan, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.028)';
    ctx.fillRect(0, Math.round(((uiClock * 34) % (H + 90)) - 45), W, 30);
  }

  function draw(game, alpha = 0, timeMs) {
    const t0 = nowMs(), now = (Number.isFinite(timeMs) ? timeMs : t0) / 1000;
    let dt = lastNow < 0 ? 1 / 60 : now - lastNow;
    lastNow = now;
    if (!(dt > 0)) dt = 0; else if (dt > 0.1) dt = 0.1;
    if (canvas.width !== W || canvas.height !== H) resize();
    const primary = !game || !bus || !game.bus || game.bus === bus;
    if (!primary) { fx.shakeT = 0; fx.flashT = 0; fx.hitstop = 0; }       // attract-mode games never rattle the menu
    uiClock += dt;
    const frozen = fx.hitstop > 0 && haveFrame;
    if (frozen) fx.hitstop -= dt;
    else { fx.hitstop = 0; clock += dt; renderScene(game, alpha, dt, primary); haveFrame = true; }
    if (fx.shakeT > 0) fx.shakeT = Math.max(0, fx.shakeT - dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sceneC, 0, 0);
    if (primary && game && game.state === 'play' && Number.isFinite(game.fuel) && game.fuel < TUNING.fuelLow) {
      if (!post) buildPost();
      ctx.globalAlpha = (0.2 + 0.16 * Math.sin(uiClock * 7.5)) * (1 - (game.fuel / TUNING.fuelLow) * 0.45);
      ctx.drawImage(post.red, 0, 0);
      ctx.globalAlpha = 1;
    }
    if (fx.flashT > 0) {
      ctx.globalAlpha = fx.flashA * (fx.flashT / fx.flashDur); ctx.fillStyle = fx.flashC; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      fx.flashT = Math.max(0, fx.flashT - dt);
    }
    const hud = api.hud === 'auto' ? primary : !!api.hud;
    if (game && Hk.drawHud && hud) call('drawHud', ctx, () => Hk.drawHud(ctx, game, uiClock));
    if (Hk.overlay) call('overlay', ctx, () => Hk.overlay(ctx, game, uiClock));
    if (crt && !api.deferCRT) applyCRT();
    const ms = nowMs() - t0;
    stats.ms += (ms - stats.ms) * 0.1; stats.frames++;
    if (dt > 0) stats.fps += (1 / dt - stats.fps) * 0.05;
  }

  function resize() {
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (canvas.style) canvas.style.imageRendering = 'pixelated';
  }
  resize();

  const api = {
    draw, resize, applyCRT,
    setCRT(on) { crt = !!on; },
    /** PNG data URL of the current frame (null when the canvas cannot export). */
    shot() { try { return typeof canvas.toDataURL === 'function' ? canvas.toDataURL('image/png') : null; } catch { return null; } },
    setHooks,
    /** fn(ctx, game, t) drawn after the HUD and before the CRT pass (menus / screens that should sit under the scanlines). */
    setOverlay(fn) { Hk.overlay = typeof fn === 'function' ? fn : null; },
    hud: opts.hud === undefined ? 'auto' : opts.hud,   // 'auto' = only for games on this renderer's bus (not attract mode)
    deferCRT: false,                                   // true: caller runs applyCRT() itself after its own overlays
    ready, stats, fx, scene, hooks: Hk,
    get crt() { return crt; },
    get art() { return artRef.art; },
    get drawsPopups() { return !!Hk.popups; },
    get hitstop() { return Math.max(0, fx.hitstop); },
    get camY() { return view.camY; },
  };
  return api;
}
export default createRenderer;
