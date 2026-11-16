// HUD: score/hi, lives, bombs, fuel, altimeter, combo, round flags, boss bar + Jesse + taunts, timers, popups.
// Pure canvas 2D via fillRect + src/ui/font.js. Node-safe (no DOM at import). Contract: ARCHITECTURE.md section 10.
import { drawText, measureText } from './font.js';
import { project } from '../core/iso.js';
import { VIEW, TUNING, FIELD_H, CELL, TAUNTS, STAGES } from '../core/defs.js';

const C = {
  ink: '#1a1420', cheese: '#ffd23f', cheeseHi: '#fff1a0', cheeseMid: '#f2a516', cheeseLo: '#a85d10',
  panel: '#2a1d2e', panelHi: '#4a3550', red: '#ff4a4a', redLo: '#a01d2a', cyan: '#6af0ff', white: '#fff6dc',
  orange: '#ff9a2e', grey: '#8f9ab0', greyLo: '#566078', apricot: '#f6c58a',
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const R = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

/** Chunky bevelled bar. frac 0..1 fills from left (or bottom if vertical). */
function bar(ctx, x, y, w, h, frac, hi, mid, lo, vertical = false) {
  R(ctx, C.ink, x - 2, y - 2, w + 4, h + 4);
  R(ctx, C.panelHi, x - 1, y - 1, w + 2, h + 2);
  R(ctx, C.panel, x, y, w, h);
  frac = clamp(frac, 0, 1);
  if (frac <= 0) return;
  if (vertical) {
    const fh = Math.max(1, Math.round(h * frac)), fy = y + h - fh;
    R(ctx, mid, x, fy, w, fh); R(ctx, hi, x, fy, Math.max(1, w >> 2), fh); R(ctx, lo, x + w - Math.max(1, w >> 2), fy, Math.max(1, w >> 2), fh);
  } else {
    const fw = Math.max(1, Math.round(w * frac));
    R(ctx, mid, x, y, fw, h); R(ctx, hi, x, y, fw, Math.max(1, h >> 2)); R(ctx, lo, x, y + h - Math.max(1, h >> 2), fw, Math.max(1, h >> 2));
  }
}

function catHead(ctx, x, y, lost) {
  const f = lost ? C.greyLo : C.orange, d = lost ? '#3a4054' : C.cheeseLo;
  R(ctx, C.ink, x, y, 13, 11);
  R(ctx, f, x + 1, y + 2, 11, 8);
  R(ctx, f, x + 1, y, 3, 3); R(ctx, f, x + 9, y, 3, 3);                       // ears
  R(ctx, d, x + 4, y + 2, 1, 3); R(ctx, d, x + 8, y + 2, 1, 3);               // stripes
  R(ctx, lost ? C.grey : '#2a8a2a', x + 3, y + 5, 2, 2); R(ctx, lost ? C.grey : '#2a8a2a', x + 8, y + 5, 2, 2);
  R(ctx, lost ? C.grey : '#ff8aa0', x + 6, y + 8, 1, 1);
}
function yarn(ctx, x, y, on) {
  const a = on ? '#ff5a8a' : C.greyLo, b = on ? '#ffa0c0' : C.grey;
  R(ctx, C.ink, x + 2, y, 8, 12); R(ctx, C.ink, x, y + 2, 12, 8);
  R(ctx, a, x + 1, y + 2, 10, 8); R(ctx, a, x + 2, y + 1, 8, 10);
  R(ctx, b, x + 3, y + 3, 2, 2); R(ctx, b, x + 5, y + 5, 4, 1); R(ctx, b, x + 4, y + 7, 4, 1);
}
function flag(ctx, x, y, big) {
  R(ctx, C.ink, x, y, 2, big ? 14 : 10);
  R(ctx, C.white, x, y + 1, 1, big ? 12 : 8);
  R(ctx, C.ink, x + 2, y, big ? 11 : 8, big ? 8 : 6);
  R(ctx, big ? C.cheese : C.red, x + 2, y + 1, big ? 9 : 6, big ? 6 : 4);
  if (big) R(ctx, C.redLo, x + 5, y + 3, 3, 2);
}
/** Round flags: one small flag per round, big gold flag per 5 rounds. Returns width used. */
function roundFlags(ctx, rightX, y, round) {
  const n5 = Math.floor(round / 5), n1 = round % 5 || (n5 ? 0 : round);
  let x = rightX;
  const items = [];
  for (let i = 0; i < Math.min(n5, 4); i++) items.push(true);
  for (let i = 0; i < Math.min(n1, 4); i++) items.push(false);
  for (let i = items.length - 1; i >= 0; i--) { x -= items[i] ? 13 : 10; flag(ctx, x, y, items[i]); }
  return rightX - x;
}

// Art registry (optional): when set, the boss bar shows the real jesse_bust sprite instead of the vector fallback.
let ART = null;
/** setHudArt(registry) -> registry with get(name, frame) (src/art/registry.js). Pass null to use the vector fallback. */
export function setHudArt(art) { ART = art && typeof art.get === 'function' ? art : null; }
function bustImg(frame) {
  if (!ART) return null;
  try { const c = ART.get('jesse_bust', frame); return c && c.width ? c : null; } catch { return null; }
}
/** 44x44 portrait from jesse_bust (crop of the 64x64 face, 1:1 so the pixels stay crisp). Returns false when no art. */
function jesseBust(ctx, x, y, hurt, enraged) {
  const img = bustImg(enraged || hurt ? 1 : 0);
  if (!img || typeof ctx.drawImage !== 'function') return false;
  R(ctx, C.panelHi, x - 1, y - 1, 46, 46); R(ctx, '#1e1830', x, y, 44, 44);
  const j = hurt ? 1 : 0;
  ctx.drawImage(img, 10, 2, 44, 44, x + j, y, 44, 44);
  if (hurt) { ctx.globalAlpha = 0.45; R(ctx, '#ffffff', x, y, 44, 44); ctx.globalAlpha = 1; }
  return true;
}

function jesse(ctx, x, y, hurt) {   // 28x30 bust: blue-grey dilute tortie, cream + apricot patches, amber eyes, imperious
  R(ctx, C.ink, x, y + 2, 28, 28);
  R(ctx, '#8a96b4', x + 2, y + 6, 24, 22);
  R(ctx, C.ink, x + 1, y, 7, 9); R(ctx, C.ink, x + 20, y, 7, 9);
  R(ctx, '#8a96b4', x + 2, y + 1, 5, 7); R(ctx, '#8a96b4', x + 21, y + 1, 5, 7);
  R(ctx, C.apricot, x + 3, y + 3, 3, 4);                                      // ear patch
  R(ctx, C.apricot, x + 14, y + 7, 9, 6);                                     // apricot patch
  R(ctx, '#f4e6c8', x + 9, y + 18, 10, 9);                                    // cream muzzle patch
  R(ctx, '#b5bfd6', x + 4, y + 8, 6, 3);
  const ey = hurt ? C.red : '#ffb81c';
  R(ctx, C.ink, x + 5, y + 12, 7, 5); R(ctx, C.ink, x + 16, y + 12, 7, 5);
  R(ctx, ey, x + 6, y + 13, 5, 3); R(ctx, ey, x + 17, y + 13, 5, 3);
  R(ctx, C.ink, x + 8, y + 13, 1, 3); R(ctx, C.ink, x + 19, y + 13, 1, 3);   // slit pupils
  R(ctx, C.ink, x + 4, y + 10, 8, 1); R(ctx, C.ink, x + 16, y + 10, 8, 1);   // imperious brows
  R(ctx, '#ff8aa0', x + 13, y + 19, 2, 2);
  R(ctx, C.ink, x + 12, y + 22, 4, 1);
  if (hurt) R(ctx, C.ink, x + 10, y + 23, 8, 2);
  R(ctx, C.cheese, x + 6, y + 27, 16, 3); R(ctx, C.cheeseMid, x + 6, y + 29, 16, 1);   // cheese collar
}

// ---- per-bus tracked state (taunts, boss name, combo pop) ----
const states = new WeakMap();
function stateFor(bus) {
  let s = states.get(bus);
  if (s) return s;
  s = { taunt: null, tauntT: 0, tauntDur: 0, nextTaunt: 6, tIdx: 0, bossName: 'BIG BOSS JESSE', hurtT: 0, comboPop: 0, lastBoss01: 1, lastT: -1 };
  states.set(bus, s);
  bus.on?.('taunt', p => { if (p?.text) { s.taunt = String(p.text); s.tauntDur = p.dur ?? 3; s.tauntT = 0; } });
  bus.on?.('boss', p => { if (p?.name) s.bossName = String(p.name).toUpperCase(); });
  bus.on?.('combo', () => { s.comboPop = 0.25; });
  return s;
}
const NOBUS = { taunt: null, tauntT: 0, tauntDur: 0, nextTaunt: 6, tIdx: 0, bossName: 'BIG BOSS JESSE', hurtT: 0, comboPop: 0, lastBoss01: 1, lastT: -1 };

function bubble(ctx, text, x, y, flash) {   // speech bubble anchored with tail at bottom-left (x,y = tail tip)
  const w = measureText(text, 1) + 12, h = 17;
  const bx = clamp(x, 4, VIEW.W - w - 4), by = y - h - 5;
  R(ctx, C.ink, bx - 1, by - 1, w + 2, h + 2);
  R(ctx, C.white, bx, by, w, h);
  R(ctx, '#d8c9a4', bx, by + h - 2, w, 2);
  R(ctx, C.ink, x, by + h, 5, 2); R(ctx, C.white, x + 1, by + h, 3, 1); R(ctx, C.ink, x + 1, by + h + 2, 2, 2);
  drawText(ctx, text, bx + 6, by + 5, { color: flash ? C.redLo : C.ink, shadow: null });
}

function altimeter(ctx, game, t) {
  const gx = 12, gy = 84, gw = 12, gh = 200;           // gauge column
  const z = clamp(game.player?.z ?? 0, 0, FIELD_H), f = z / FIELD_H;
  const kind = game.stage?.kind;
  R(ctx, C.ink, gx - 3, gy - 14, gw + 22, gh + 28);
  R(ctx, C.panel, gx - 2, gy - 13, gw + 20, gh + 26);
  drawText(ctx, 'ALT', gx - 1, gy - 10, { color: C.cheeseHi, shadow: null });
  bar(ctx, gx, gy, gw, gh, 0, C.cheeseHi, C.cheese, C.cheeseMid, true);
  // tick marks: one per cell in fortress/boss (walls are cell-aligned), every two cells in space
  const step = kind === 'space' ? 2 : 1;
  for (let c = 0; c <= FIELD_H / CELL; c += step) {
    const ty = gy + gh - Math.round((c * CELL / FIELD_H) * gh);
    const major = c % 2 === 0;
    R(ctx, C.cheeseHi, gx + gw + 1, clamp(ty, gy, gy + gh - 1), major ? 5 : 3, 1);
    if (major && c < FIELD_H / CELL) drawText(ctx, String(c), gx + gw + 7, ty - 3, { color: C.grey, shadow: null });
  }
  // fill up to current altitude
  const fh = Math.round(gh * f);
  if (fh > 0) { R(ctx, C.cheeseMid, gx, gy + gh - fh, gw, fh); R(ctx, C.cheeseHi, gx, gy + gh - fh, 3, fh); R(ctx, C.cheeseLo, gx + gw - 3, gy + gh - fh, 3, fh); }
  // shadow marker: a dark chip on the ground line
  R(ctx, C.ink, gx - 2, gy + gh - 2, gw + 4, 4); R(ctx, C.greyLo, gx - 1, gy + gh - 1, gw + 2, 2);
  // ship marker: chevron pointing at the gauge
  const my = Math.round(gy + gh - gh * f);
  const blink = game.player && game.player.invuln > 0 && Math.floor(t * 12) % 2 === 0;
  const mc = game.nipT > 0 ? ['#ff4a4a', '#ffd23f', '#4aff7a', '#6af0ff', '#c46aff'][Math.floor(t * 14) % 5] : C.orange;
  if (!blink) {
    for (let i = 0; i < 5; i++) { R(ctx, C.ink, gx - 9 + i, my - 5 + i, 4, 1); R(ctx, C.ink, gx - 9 + i, my + 5 - i, 4, 1); }
    for (let i = 0; i < 4; i++) { R(ctx, mc, gx - 8 + i, my - 4 + i, 3, 1); R(ctx, mc, gx - 8 + i, my + 4 - i, 3, 1); }
    R(ctx, mc, gx - 4, my, 4, 1);
  }
  // numeric readout
  drawText(ctx, String(Math.round(z)).padStart(3, '0'), gx - 1, gy + gh + 6, { color: C.cheese, shadow: null });
}

function fuelGauge(ctx, game, t) {
  const x = 240, y = 336, w = 160, h = 10;
  const fuel = game.fuel ?? 0, f = clamp(fuel / TUNING.fuelMax, 0, 1);
  const low = fuel <= TUNING.fuelLow;
  const flash = low && Math.floor(t * 4) % 2 === 0;
  if (flash) R(ctx, C.red, x - 4, y - 4, w + 8, h + 8);
  bar(ctx, x, y, w, h, f, flash ? '#ffb0b0' : C.cheeseHi, flash ? C.red : low ? C.orange : C.cheese, flash ? C.redLo : C.cheeseMid);
  for (let i = 1; i < 10; i++) R(ctx, C.ink, x + Math.round(w * i / 10), y, 1, i === 5 ? h : 3);
  drawText(ctx, 'FUEL', x - 34, y + 2, { color: low ? C.red : C.cheeseHi });
  if (low && flash) drawText(ctx, 'LOW FUEL', x + w / 2, y - 12, { color: C.red, align: 'center' });
  drawText(ctx, 'E', x + 1, y + 11, { color: C.grey, shadow: null });
  drawText(ctx, 'F', x + w - 5, y + 11, { color: C.grey, shadow: null });
}

function timers(ctx, game, t) {
  let y = 318;
  const items = [];
  if (game.nipT > 0) items.push(['CATNIP', game.nipT / TUNING.nipTime, 'rainbow']);
  if (game.laserT > 0) items.push(['LASER', game.laserT / TUNING.laserTime, C.red]);
  for (const [label, frac, col] of items) {
    const x = 520, w = 90;
    const rb = ['#ff4a4a', '#ff9a2e', '#ffd23f', '#4aff7a', '#6af0ff', '#c46aff'];
    const mid = col === 'rainbow' ? rb[Math.floor(t * 10) % rb.length] : col;
    const urgent = frac < 0.25 && Math.floor(t * 8) % 2 === 0;
    bar(ctx, x, y, w, 8, frac, urgent ? C.white : '#ffffff', mid, C.ink);
    drawText(ctx, label, x - 44, y, { color: col === 'rainbow' ? mid : C.cyan });
    y -= 16;
  }
}

function bossBar(ctx, game, t, st) {
  if (game.bossHp01 == null) return;
  const hp = clamp(game.bossHp01, 0, 1);
  const x = 150, y = 50, w = 340, h = 10;
  if (hp < st.lastBoss01 - 1e-6) st.hurtT = 0.25;
  st.lastBoss01 = hp;
  const hurt = st.hurtT > 0;
  if (bustImg(0)) {
    R(ctx, C.ink, x - 52, y - 16, w + 58, 50);
    jesseBust(ctx, x - 50, y - 14, hurt, hp < 0.34);
  } else {
    R(ctx, C.ink, x - 40, y - 12, w + 46, h + 28);
    jesse(ctx, x - 36, y - 8, hurt);
  }
  bar(ctx, x + 2, y, w, h, hp, hurt ? C.white : '#ff9a9a', hp < 0.3 && Math.floor(t * 6) % 2 === 0 ? C.white : C.red, C.redLo);
  for (let i = 1; i < 8; i++) R(ctx, C.ink, x + 2 + Math.round(w * i / 8), y, 1, 3);
  drawText(ctx, st.bossName, x + 2, y + 15, { color: C.cheeseHi });
  drawText(ctx, Math.ceil(hp * 100) + '%', x + 2 + w, y + 15, { color: C.grey, align: 'right' });
  // taunt bubble
  if (st.taunt && st.tauntT < st.tauntDur) {
    const a = st.tauntT, vis = Math.min(1, a / 0.1, (st.tauntDur - a) / 0.15);
    if (vis > 0.5) bubble(ctx, st.taunt, x - 28, y + 56, hurt);
  }
}

function lifeRow(ctx, game, x, y) {
  const lives = Math.max(0, game.lives | 0), maxShown = Math.max(3, Math.min(lives, 7));
  for (let i = 0; i < maxShown; i++) catHead(ctx, x + i * 15, y, i >= lives);
  if (lives > 7) drawText(ctx, '+' + (lives - 7), x + maxShown * 15 + 2, y + 2, { color: C.cheeseHi });
}
function bombRow(ctx, game, x, y) {
  const b = Math.max(0, game.bombs | 0), shown = Math.min(b, 6);
  for (let i = 0; i < Math.max(2, shown); i++) yarn(ctx, x + i * 14, y, i < b);
  if (b > 6) drawText(ctx, '+' + (b - 6), x + 6 * 14 + 2, y + 2, { color: C.cheeseHi });
}

function comboMeter(ctx, game, t, st) {
  if (!(game.combo >= 2)) return;
  const mult = Math.min(game.combo, TUNING.comboCap ?? 8);
  const x = 8, y = 40;
  const pulse = st.comboPop > 0 ? 3 : 2;
  const col = ['#ffd23f', '#ffb020', '#ff9a2e', '#ff6a3a', '#ff4a4a', '#ff4aa0', '#c46aff', '#6af0ff'][clamp(mult - 1, 0, 7)];
  drawText(ctx, 'X' + mult, x, y, { scale: pulse, color: col });
  drawText(ctx, 'COMBO', x + Math.max(34, measureText('X' + mult, pulse) + 4), y + 3, { color: C.cheeseHi });
  const f = clamp((game.comboT ?? 0) / 1.5, 0, 1);
  bar(ctx, x, y + 20, 70, 4, f, C.white, col, C.cheeseLo);
}

/** Draw the whole HUD. ctx: 640x360 2D context. game: sim state (read-only). t: wall time in seconds. */
export function drawHud(ctx, game, t = 0) {
  if (!ctx || !game) return;
  const st = game.bus ? stateFor(game.bus) : NOBUS;
  const dt = st.lastT >= 0 ? clamp(t - st.lastT, 0, 0.1) : 0;
  st.lastT = t;
  st.hurtT = Math.max(0, st.hurtT - dt); st.comboPop = Math.max(0, st.comboPop - dt);
  if (st.taunt) { st.tauntT += dt; if (st.tauntT >= st.tauntDur) st.taunt = null; }
  // fallback taunts when the boss fight is on but the sim sent none
  if (game.bossHp01 != null && game.bossHp01 > 0 && !st.taunt) {
    st.nextTaunt -= dt;
    if (st.nextTaunt <= 0) { st.taunt = TAUNTS[st.tIdx++ % TAUNTS.length]; st.tauntT = 0; st.tauntDur = 3; st.nextTaunt = 7; }
  }
  ctx.save?.();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = false;

  // score / hi
  drawText(ctx, '1UP', 8, 6, { color: C.cheeseHi });
  drawText(ctx, String(Math.max(0, game.score | 0)).padStart(7, '0'), 8, 15, { scale: 2, color: C.white });
  const hi = Math.max(game.hiscore | 0, game.score | 0);
  drawText(ctx, 'HI', 320, 6, { color: C.red, align: 'center' });
  drawText(ctx, String(hi).padStart(7, '0'), 320, 15, { scale: 2, color: C.cheese, align: 'center' });
  // lives + bombs
  lifeRow(ctx, game, 8, 322);
  bombRow(ctx, game, 8, 338);
  comboMeter(ctx, game, t, st);
  // round + stage
  const rw = roundFlags(ctx, 632, 8, Math.max(1, game.round | 0));
  const sname = STAGES[game.stageIdx]?.name ?? game.stage?.name;
  if (sname) drawText(ctx, sname, 632, 6 + 16, { color: '#c8d0e0', align: 'right', shadow: C.ink });
  drawText(ctx, 'RD ' + (game.round | 0), 632 - rw - 6, 10, { color: C.cheeseHi, align: 'right' });

  altimeter(ctx, game, t);
  fuelGauge(ctx, game, t);
  timers(ctx, game, t);
  bossBar(ctx, game, t, st);
  ctx.restore?.();
}

// ---- floating popups ----
const MAX_POPUPS = 24, LIFE = 1.1;
/** createPopups(bus) -> { update(dt), draw(ctx, camY), count } subscribes to 'popup' events. */
export function createPopups(bus) {
  const list = [];
  const self = {
    get count() { return list.length; },
    spawn(p) {
      if (!p || p.text == null) return;
      if (list.length >= MAX_POPUPS) list.shift();
      list.push({ text: String(p.text), x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0, color: p.color || '#ffe14a', age: 0 });
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) { list[i].age += dt; if (list[i].age >= LIFE) list.splice(i, 1); }
    },
    draw(ctx, camY = 0) {
      for (const p of list) {
        const k = p.age / LIFE, pt = project(p.x, p.y, p.z, camY);
        const rise = Math.round(k * 22), pop = k < 0.12 ? 2 : 1;
        if (k > 0.7 && Math.floor(p.age * 30) % 2 === 0) continue;   // blink out
        const sx = clamp(Math.round(pt.sx), 20, VIEW.W - 20);
        drawText(ctx, p.text, sx, Math.round(pt.sy) - rise, { color: p.color, align: 'center', scale: pop, shadow: C.ink });
      }
    },
  };
  bus?.on?.('popup', p => self.spawn(p));
  if (bus) stateFor(bus);   // subscribe taunt/boss/combo early so no event is missed
  return self;
}
