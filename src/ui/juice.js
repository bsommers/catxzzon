// Juice overlay (owner: polish): stage/clear/game-over banners, combo callouts, the Jesse boss-intro cinematic and
// boss-defeat card, plus three small delights: potatoes that lose their sunglasses, meow reactions over the cat and
// a hungry-cat bubble on low fuel. Pure canvas 2D, Node-safe (no DOM at import). Draws in screen space (640x360).
//   const j = createJuice({ bus, art });  j.active = true while a real game is running (attract mode stays quiet)
//   j.update(dt, game); j.draw(ctx, game, t, camY);  j.reset() on a new game.
import { drawText, measureText } from './font.js';
import { project } from '../core/iso.js';
import { VIEW } from '../core/defs.js';

const W = VIEW.W || 640, H = VIEW.H || 360;
const INK = '#1a1420';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);

/** Combo callouts by multiplier (first level that is reached fires once per chain). */
export const CALLOUTS = [[3, 'PAWSOME!', '#ffd23f'], [5, 'PURRFECT!', '#ff9a2e'], [7, 'CAT-ASTROPHIC!', '#ff4aa0'], [8, 'MEOWNIFICENT!', '#6af0ff']];
/** Reaction bubbles over the cat, keyed by sfx name. */
export const MEOWS = { pickup_tuna: ['NOM!', 'TUNA!', 'MRRP!'], pickup_nip: ['NIP TIME!', 'WHEEE!'], pickup_yarn: ['YARN!', 'MROW!'],
  pickup_laser: ['RED DOT!', 'PEW PEW!'], extra_life: ['9 LIVES!'] };
/** Every Nth spud burst drops its sunglasses (deterministic, no Math.random). */
export const SHADES_EVERY = 3;

export function createJuice({ bus = null, art = null } = {}) {
  const J = {
    active: false,
    banner: null,            // { text, sub, dur, age }
    callout: null,           // { text, color, age }
    lastMult: 0,
    intro: null,             // { age } boss intro cinematic
    defeat: null,            // { age }
    bossSeen: false, bossDead: false,
    shades: [],              // { x,y,z, vx, vy, age, spin }
    bubble: null,            // { text, age, dur }
    spudN: 0, meowN: 0, lowFuel: false,
    stats: { banners: 0, callouts: 0, shades: 0, meows: 0, intros: 0 },
  };
  const img = (name, f = 0) => { try { const c = art && art.get && art.get(name, f); return c && c.width ? c : null; } catch { return null; } };
  const say = (text, dur = 0.9) => { J.bubble = { text, age: 0, dur }; J.stats.meows++; };
  const meow = (name) => { if (bus && J.meowN++ % 2 === 0) try { bus.emit('sfx', { name }); } catch { /* ignore */ } };

  if (bus && bus.on) {
    bus.on('banner', (p) => {
      if (!J.active || !p || !p.text) return;
      if (/^VICTORY/.test(p.text)) return;                           // main draws the full victory dedication
      J.banner = { text: String(p.text), sub: p.sub ? String(p.sub) : '', dur: clamp(+p.dur || 2.2, 1.2, 4), age: 0 }; J.stats.banners++;
    });
    bus.on('combo', (p) => {
      if (!J.active || !p) return;
      const m = +p.mult || 0;
      if (m < J.lastMult) J.lastMult = 0;
      for (let i = CALLOUTS.length - 1; i >= 0; i--) {
        const [lvl, text, color] = CALLOUTS[i];
        if (m >= lvl && J.lastMult < lvl) { J.callout = { text, color, age: 0 }; J.stats.callouts++; if (lvl >= 5) meow('meow_a'); break; }
      }
      J.lastMult = Math.max(J.lastMult, m);
    });
    bus.on('score', (p) => { if (p && (p.combo | 0) <= 1) J.lastMult = 0; });
    bus.on('fx', (p) => {
      if (!J.active || !p || p.type !== 'spud_burst') return;
      if (++J.spudN % SHADES_EVERY !== 0 || J.shades.length > 6) return;
      const k = J.spudN * 0.618;
      J.shades.push({ x: p.x, y: p.y, z: (p.z || 0) + 6, vx: ((k % 1) - 0.5) * 50, vy: -70, age: 0, spin: (k % 1) > 0.5 ? 9 : -9 });
      J.stats.shades++;
      if (J.spudN % (SHADES_EVERY * 2) === 0) J.coolText = { age: 0, x: p.x, y: p.y, z: p.z || 0 };
    });
    bus.on('sfx', (p) => {
      if (!J.active || !p || !MEOWS[p.name]) return;
      const opts = MEOWS[p.name];
      say(opts[J.meowN % opts.length]); meow('meow_b');
    });
    bus.on('fuel', (p) => {
      if (!J.active || !p) return;
      if (p.low && !J.lowFuel) say('TUMMY EMPTY!', 1.6);
      J.lowFuel = !!p.low;
    });
    bus.on('stage', () => { J.bossSeen = false; J.bossDead = false; J.intro = null; J.defeat = null; J.shades.length = 0; });
  }

  function reset() {
    J.banner = J.callout = J.intro = J.defeat = J.bubble = J.coolText = null;
    J.lastMult = 0; J.bossSeen = J.bossDead = false; J.shades.length = 0; J.lowFuel = false;
  }

  function update(dt, game) {
    if (J.banner && (J.banner.age += dt) > J.banner.dur) J.banner = null;
    if (J.callout && (J.callout.age += dt) > 1.1) J.callout = null;
    if (J.bubble && (J.bubble.age += dt) > J.bubble.dur) J.bubble = null;
    if (J.coolText && (J.coolText.age += dt) > 1.2) J.coolText = null;
    if (J.intro && (J.intro.age += dt) > 3.2) J.intro = null;
    if (J.defeat && (J.defeat.age += dt) > 3.4) J.defeat = null;
    for (let i = J.shades.length - 1; i >= 0; i--) {
      const s = J.shades[i]; s.age += dt; s.vy += 160 * dt;
      if (s.age > 1.4) J.shades.splice(i, 1);
    }
    if (!J.active || !game) return;
    const b = game.bossHp01;
    if (b != null && !J.bossSeen) {
      J.bossSeen = true; J.intro = { age: 0 }; J.stats.intros++;
      try { bus && bus.emit('sfx', { name: 'boss_hiss' }); } catch { /* ignore */ }
    }
    if (J.bossSeen && !J.bossDead && b != null && b <= 0) { J.bossDead = true; J.defeat = { age: 0 }; J.intro = null; }
  }

  // ---- drawing --------------------------------------------------------------------------------------------------
  function drawBanner(ctx) {
    const b = J.banner; if (!b) return;
    const kin = ease(b.age / 0.35), kout = clamp((b.dur - b.age) / 0.3, 0, 1), a = Math.min(kin, kout);
    const y = 112, bh = b.sub ? 56 : 40;
    ctx.globalAlpha = 0.62 * a; ctx.fillStyle = '#0a0414'; ctx.fillRect(0, y - 10, W, bh);
    ctx.globalAlpha = a;
    const stripe = Math.round(W * kin);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(W - stripe, y - 12, stripe, 2); ctx.fillRect(0, y - 10 + bh, stripe, 2);
    const off = Math.round((1 - kin) * 220);
    drawText(ctx, b.text, W / 2 + off, y, { align: 'center', scale: 3, color: '#ffd23f', shadow: '#5a2a08' });
    if (b.sub && b.age > 0.25) drawText(ctx, b.sub, W / 2 - off, y + 30, { align: 'center', scale: 1, color: '#fff6dc' });
    ctx.globalAlpha = 1;
  }

  function drawCallout(ctx, t) {
    const c = J.callout; if (!c) return;
    const k = c.age / 1.1, scale = c.age < 0.08 ? 4 : 3;
    if (k > 0.75 && Math.floor(c.age * 24) % 2) return;
    const y = 78 - Math.round(ease(k) * 10), wob = Math.round(Math.sin(t * 30) * (c.age < 0.3 ? 2 : 0));
    drawText(ctx, c.text, W / 2 + wob, y, { align: 'center', scale, color: c.color, shadow: INK });
  }

  function drawShades(ctx, camY) {
    const P = { sx: 0, sy: 0 };
    for (const s of J.shades) {
      project(s.x, s.y, s.z, camY, P);
      const sx = P.sx + s.vx * s.age, sy = P.sy + s.vy * s.age;
      const ang = s.spin * s.age, fade = s.age > 1 ? 1 - (s.age - 1) / 0.4 : 1;
      ctx.save(); ctx.globalAlpha = clamp(fade, 0, 1);
      ctx.translate(Math.round(sx), Math.round(sy)); ctx.rotate(Math.round(ang * 4) / 4); ctx.scale(2, 2);
      // pixel sunglasses: two lenses + bridge + glint
      ctx.fillStyle = INK; ctx.fillRect(-8, -3, 16, 2); ctx.fillRect(-8, -2, 7, 5); ctx.fillRect(1, -2, 7, 5);
      ctx.fillStyle = '#2b2440'; ctx.fillRect(-7, -1, 5, 3); ctx.fillRect(2, -1, 5, 3);
      ctx.fillStyle = '#9ff2ff'; ctx.fillRect(-6, -1, 2, 1); ctx.fillRect(3, -1, 2, 1);
      ctx.restore();
    }
    if (J.coolText) {
      const c = J.coolText; project(c.x, c.y, c.z, camY, P);
      if (!(c.age > 0.9 && Math.floor(c.age * 30) % 2)) drawText(ctx, 'DEAL WITH IT', clamp(Math.round(P.sx), 50, W - 50), Math.round(P.sy) - 18 - Math.round(c.age * 16), { align: 'center', color: '#6af0ff', shadow: INK });
    }
  }

  function drawBubble(ctx, game, camY) {
    const b = J.bubble; const p = game && game.player; if (!b || !p || p.alive === false) return;
    const P = project(p.x, p.y, p.z + 22, camY);
    const tw = measureText(b.text, 1), w = tw + 10, h = 13;
    const pop = b.age < 0.08 ? 2 : 0;
    const x = clamp(Math.round(P.sx) + 8, 4, W - w - 4), y = clamp(Math.round(P.sy) - h - 6 - pop, 4, H - h - 4);
    ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#fff6dc'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = INK; ctx.fillRect(x + 2, y + h + 1, 3, 2); ctx.fillRect(x, y + h + 3, 2, 2);
    ctx.fillStyle = '#fff6dc'; ctx.fillRect(x + 2, y + h, 3, 1);
    drawText(ctx, b.text, x + 5, y + 3, { color: '#c0401a', shadow: null });
  }

  function letterbox(ctx, k) {
    const bh = Math.round(30 * k);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
  }

  function drawIntro(ctx, t) {
    const it = J.intro; if (!it) return;
    const a = it.age, kin = ease(a / 0.4), kout = clamp((3.2 - a) / 0.4, 0, 1), k = Math.min(kin, kout);
    letterbox(ctx, k);
    // hazard stripes behind the card
    const y0 = 214;
    ctx.globalAlpha = 0.85 * k; ctx.fillStyle = '#1a0a10'; ctx.fillRect(0, y0, W, 44);
    ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, 4); ctx.rect(0, y0 + 40, W, 4); ctx.clip();
    const sh = (t * 60) % 16;
    for (let x = -16; x < W + 16; x += 16) { ctx.fillStyle = '#ffd23f'; ctx.fillRect(Math.round(x + sh), y0, 8, 44); }
    ctx.restore(); ctx.globalAlpha = k;
    const bust = img('jesse_bust', a > 1.6 && a < 2.2 ? 1 : 0);
    const bx = Math.round(W - 150 + (1 - kin) * 220), by = 92;
    if (bust) {
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = INK; ctx.fillRect(bx - 3, by - 3, 134, 134);
      ctx.fillStyle = '#2a1d3e'; ctx.fillRect(bx, by, 128, 128);
      ctx.drawImage(bust, bx, by, 128, 128);
    }
    const tx = Math.round(40 - (1 - kin) * 260);
    if (Math.floor(a * 6) % 2 === 0 || a > 1) drawText(ctx, 'WARNING', tx, y0 - 44, { scale: 2, color: '#ff4a4a', shadow: INK });
    drawText(ctx, 'BIG BOSS JESSE', tx, y0 + 12, { scale: 3, color: '#a9b8d8', shadow: INK });
    if (a > 0.7) drawText(ctx, 'IMPERIAL RULER OF SCHLOSS GORGONZOLA', tx, y0 - 20, { color: '#fff6dc', shadow: INK });
    ctx.globalAlpha = 1;
  }

  function drawDefeat(ctx, t) {
    const d = J.defeat; if (!d) return;
    const a = d.age, k = Math.min(ease(a / 0.5), clamp((3.4 - a) / 0.4, 0, 1));
    letterbox(ctx, k);
    const bust = img('jesse_bust', 1);
    if (bust) {   // the bust tumbles away into space, spinning
      ctx.save(); ctx.globalAlpha = clamp(1 - a / 3, 0, 1);
      ctx.translate(W / 2 + a * 110, 228 - a * 70 + a * a * 12); ctx.rotate(a * 4);
      const s = Math.max(16, Math.round(64 - a * 14));
      ctx.imageSmoothingEnabled = false; ctx.drawImage(bust, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 0.6 * k; ctx.fillStyle = '#0a0414'; ctx.fillRect(0, 116, W, 60);
    ctx.globalAlpha = k;
    drawText(ctx, 'JESSE DEFEATED!', W / 2, 128, { align: 'center', scale: 3, color: Math.floor(t * 8) % 2 ? '#ffd23f' : '#ffffff', shadow: INK });
    if (a > 0.8) drawText(ctx, '...FOR NOW, SHE SAYS. SHE ALWAYS SAYS THAT.', W / 2, 160, { align: 'center', color: '#a9b8d8', shadow: INK });
    ctx.globalAlpha = 1;
  }

  /** Draw everything that is live. camY = renderer camera (renderer.camY ?? game.scrollY). */
  function draw(ctx, game, t = 0, camY = game ? game.scrollY : 0) {
    if (!ctx) return;
    ctx.save();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    try {
      drawShades(ctx, camY);
      drawBubble(ctx, game, camY);
      drawCallout(ctx, t);
      drawBanner(ctx);
      drawIntro(ctx, t);
      drawDefeat(ctx, t);
    } finally { ctx.restore(); }
  }

  return { get active() { return J.active; }, set active(v) { J.active = !!v; }, update, draw, reset, state: J, stats: J.stats };
}
