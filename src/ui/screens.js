// Full-screen UI: logo, title, loading, error overlay, game over + initials, hi-score table, credits. 640x360, Canvas 2D.
import { drawText, glyphRows, measureText } from './font.js';

const W = 640, H = 360;
const hash = (a, b) => { let h = (Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; };

/** Procedural spray-cheese logo: font glyphs blown up into chunky cells, outlined, highlighted, with dripping strands. */
export function drawLogo(ctx, x, y, t = 0, text = 'CATXZZON', S = 9) {
  const gap = 2, charW = 5 * S + gap * S / 2 + 4, total = text.length * charW - 4;
  let ox = Math.round(x - total / 2);
  const cells = [];
  [...text].forEach((ch, ci) => {
    const rows = glyphRows(ch);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (rows[r][c] === '#')
      cells.push({ px: ox + ci * charW + c * S, py: y + r * S, r, c, ci, below: rows[r + 1] ? rows[r + 1][c] === '#' : false });
  });
  // outline pass
  ctx.fillStyle = '#2a1204';
  for (const k of cells) ctx.fillRect(k.px - 2, k.py - 2, S + 4, S + 4);
  // drips (outline then body)
  const drips = [];
  for (const k of cells) if (!k.below) {
    const h = hash(k.ci * 8 + k.c, k.r);
    if (h % 3 === 0) { const len = 5 + (h >>> 4) % 22, sway = Math.sin(t * 2 + k.ci + k.c) * 0.5;
      drips.push({ x: k.px + Math.floor(S / 2) - 2, y: k.py + S, len: len + Math.round(Math.max(0, Math.sin(t * 1.3 + h)) * 3 + sway) }); }
  }
  for (const d of drips) { ctx.fillStyle = '#2a1204'; ctx.fillRect(d.x - 2, d.y, 8, d.len + 2); ctx.fillRect(d.x - 3, d.y + d.len - 1, 10, 6); }
  for (const k of cells) {
    const g = k.r / 6;   // yellow top -> orange bottom
    ctx.fillStyle = g < 0.45 ? '#ffd21f' : g < 0.8 ? '#ffb01a' : '#f08a14';
    ctx.fillRect(k.px, k.py, S, S);
  }
  for (const d of drips) {
    ctx.fillStyle = '#f08a14'; ctx.fillRect(d.x, d.y - 1, 4, d.len);
    ctx.fillStyle = '#ffb01a'; ctx.fillRect(d.x - 1, d.y + d.len - 2, 6, 4);
    ctx.fillStyle = '#fff1a0'; ctx.fillRect(d.x + 1, d.y + d.len - 1, 1, 1);
  }
  // highlights: top-left edges of cells with nothing above/left, and glints
  ctx.fillStyle = '#fff4b0';
  for (const k of cells) { ctx.fillRect(k.px, k.py, S, 2); if (hash(k.px, k.py) % 5 === 0) ctx.fillRect(k.px + 2, k.py + 3, 2, 2); }
  ctx.fillStyle = '#c86a10';
  for (const k of cells) ctx.fillRect(k.px, k.py + S - 2, S, 2);
}

const blink = (t, hz = 2) => Math.floor(t * hz * 2) % 2 === 0;
function backdrop(ctx, t, top = '#140a24', bot = '#3a1a34') {
  const g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, H) : null;
  if (g) { g.addColorStop(0, top); g.addColorStop(1, bot); ctx.fillStyle = g; } else ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 60; i++) { const sx = hash(i, 1) % W, sy = (hash(i, 2) % H + Math.floor(t * (6 + i % 5 * 4))) % H; ctx.globalAlpha = 0.3 + (i % 4) * 0.2; ctx.fillRect(sx, sy, 1, 1); }
  ctx.globalAlpha = 1;
}

export function drawLoading(ctx, p = 0, t = 0, msg = 'BUILDING CHEESE...') {
  backdrop(ctx, t);
  drawText(ctx, 'CATXZZON', W / 2, 120, { align: 'center', scale: 5, color: '#ffd21f', shadow: '#5a2a08' });
  drawText(ctx, msg, W / 2, 200, { align: 'center', color: '#f4ead2' });
  const bw = 240, x = (W - bw) / 2;
  ctx.fillStyle = '#2a2030'; ctx.fillRect(x, 220, bw, 10);
  ctx.fillStyle = '#ffb21f'; ctx.fillRect(x + 1, 221, Math.round((bw - 2) * Math.min(1, Math.max(0, p))), 8);
}

/** Title: logo, subtitle, PRESS FIRE, hi-score line. Caller draws the menu and any attract demo behind it. */
export function drawTitle(ctx, t, { hi = 0, showBackdrop = true, pressFire = true } = {}) {
  if (showBackdrop) backdrop(ctx, t);
  else { ctx.fillStyle = 'rgba(8,4,16,0.45)'; ctx.fillRect(0, 0, W, H); }
  drawLogo(ctx, W / 2, 46, t);
  drawText(ctx, 'THE CHEESE CASTLE RAID', W / 2, 150, { align: 'center', scale: 1, color: '#f4ead2' });
  if (pressFire && blink(t, 1.2)) drawText(ctx, 'PRESS FIRE', W / 2, 172, { align: 'center', scale: 2, color: '#ffffff' });
  drawText(ctx, `HI ${String(hi).padStart(7, '0')}`, W / 2, H - 30, { align: 'center', color: '#ffd21f' });
  drawText(ctx, 'ARROWS/WASD MOVE  SPACE FIRE  X BOMB  P PAUSE', W / 2, H - 16, { align: 'center', color: '#8a7a98' });
}

export function drawHiTable(ctx, list, t = 0, { highlight = -1, y = 70, title = 'HI-SCORES' } = {}) {
  drawText(ctx, title, W / 2, y - 24, { align: 'center', scale: 2, color: '#ffd21f' });
  list.forEach((e, i) => {
    const col = i === highlight ? (blink(t, 3) ? '#ffffff' : '#ff5a3c') : i < 3 ? '#ffd21f' : '#f4ead2', yy = y + i * 16;
    drawText(ctx, `${String(i + 1).padStart(2, ' ')}.`, W / 2 - 100, yy, { color: col });
    drawText(ctx, e.name, W / 2 - 60, yy, { color: col });
    drawText(ctx, String(e.score).padStart(8, '0'), W / 2 + 100, yy, { align: 'right', color: col });
  });
}

/** Initials-entry model: 3 letters, up/down cycles, left/right moves, select advances/confirms. */
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function createInitials(start = 'AAA') {
  const m = { chars: [...start.toUpperCase().padEnd(3, 'A').slice(0, 3)], pos: 0, done: false,
    handle(ev) {
      if (m.done || !ev) return m;
      const i = LETTERS.indexOf(m.chars[m.pos]);
      if (ev.up) m.chars[m.pos] = LETTERS[(i + 1) % LETTERS.length];
      if (ev.down) m.chars[m.pos] = LETTERS[(i + LETTERS.length - 1) % LETTERS.length];
      if (ev.left && m.pos > 0) m.pos--;
      if (ev.right && m.pos < 2) m.pos++;
      if (ev.back && m.pos > 0) m.pos--;
      if (ev.select) { if (m.pos < 2) m.pos++; else m.done = true; }
      return m;
    },
    get name() { return m.chars.join(''); } };
  return m;
}

export function drawGameOver(ctx, t, { score = 0, rank = -1, initials = null, hiList = [], age = 0 } = {}) {
  backdrop(ctx, t, '#1a0814', '#40101a');
  drawText(ctx, 'GAME OVER', W / 2, 36, { align: 'center', scale: 5, color: '#ff4a3a', shadow: '#300' });
  drawText(ctx, `SCORE ${String(score).padStart(7, '0')}`, W / 2, 88, { align: 'center', scale: 2, color: '#fff' });
  if (initials && rank >= 0) {
    drawText(ctx, `NEW HI-SCORE  RANK ${rank + 1}`, W / 2, 120, { align: 'center', color: '#ffd21f' });
    for (let i = 0; i < 3; i++) {
      const x = W / 2 - 36 + i * 28, sel = i === initials.pos && !initials.done;
      drawText(ctx, initials.chars[i], x, 144, { scale: 3, color: sel ? '#ffd21f' : '#fff' });
      if (sel && blink(t, 3)) { ctx.fillStyle = '#ffd21f'; ctx.fillRect(x, 168, 15, 3); }
    }
    drawText(ctx, 'UP/DOWN LETTER  FIRE NEXT', W / 2, 188, { align: 'center', color: '#9a8a70' });
  } else drawHiTable(ctx, hiList, t, { y: 130 });
  if (!initials && age > 1 && blink(t, 1.2)) drawText(ctx, 'PRESS FIRE', W / 2, H - 28, { align: 'center', color: '#fff' });
}

export const CREDITS = [
  ['CATXZZON', 3, '#ffd21f'], ['', 1], ['A KASEKRIEG TALE', 1, '#f4ead2'], ['', 1],
  ['MAJOR MARMALADE', 2, '#ff9a2a'], ['THE BIG ORANGE TABBY', 1, '#f4ead2'], ['', 1],
  ['BIG BOSS JESSE', 2, '#a9b8d8'], ['A RAT WHO LOOKS SUSPICIOUSLY', 1, '#f4ead2'], ['LIKE A CERTAIN GREY TORTIE', 1, '#f4ead2'], ['', 1],
  ['ALL ART DRAWN BY CODE', 1, '#f4ead2'], ['ALL SOUND SYNTHESIZED', 1, '#f4ead2'], ['ZERO ASSETS  ZERO DEPENDENCIES', 1, '#f4ead2'], ['', 2],
  ['FOR JESSE', 4, '#ffd21f'], ['', 1], ['BLUE-GREY FUR  CREAM AND APRICOT', 1, '#a9b8d8'], ['AMBER EYES  IMPERIOUS TO THE END', 1, '#a9b8d8'],
  ['', 1], ['THE BEST CAT', 2, '#fff'], ['', 3], ['THANKS FOR PLAYING', 1, '#f4ead2'],
];
export function creditsLength() { return CREDITS.reduce((a, [, s]) => a + 10 * (s || 1) + 6, 0); }
/** Scrolling credits; t = seconds since start. Returns true when the roll has finished. */
export function drawCredits(ctx, t, { backdropOn = true } = {}) {
  if (backdropOn) backdrop(ctx, t, '#0a0614', '#241030'); else { ctx.fillStyle = 'rgba(8,4,16,0.8)'; ctx.fillRect(0, 0, W, H); }
  let y = H - t * 34;
  for (const [txt, s = 1, col = '#fff'] of CREDITS) {
    if (txt && y > -40 && y < H + 10) drawText(ctx, txt, W / 2, Math.round(y), { align: 'center', scale: s, color: col, shadow: '#000' });
    y += 10 * s + 6;
  }
  return y < -20;
}
/** Short dedication shown during the victory splash (non-blocking overlay). */
export function drawVictory(ctx, t, round = 1) {
  ctx.fillStyle = 'rgba(10,4,20,0.55)'; ctx.fillRect(0, 100, W, 130);
  drawText(ctx, 'SCHLOSS GORGONZOLA FALLS!', W / 2, 114, { align: 'center', scale: 2, color: '#ffd21f' });
  drawText(ctx, `ROUND ${round} COMPLETE`, W / 2, 142, { align: 'center', color: '#fff' });
  drawText(ctx, 'FOR JESSE', W / 2, 168, { align: 'center', scale: 4, color: blink(t, 2) ? '#ffd21f' : '#fff1a0' });
  drawText(ctx, 'BEST CAT. BIGGEST BOSS.', W / 2, 204, { align: 'center', color: '#a9b8d8' });
}

export function drawError(ctx, err, t = 0) {
  ctx.fillStyle = 'rgba(40,0,0,0.92)'; ctx.fillRect(0, 0, W, H);
  drawText(ctx, 'OOPS! THE CHEESE SPILLED', W / 2, 30, { align: 'center', scale: 2, color: '#ff6a4a' });
  const msg = String(err && (err.stack || err.message) || err).replace(/https?:\/\/[^\s)]*\//g, '').slice(0, 900);
  const lines = []; for (const raw of msg.split('\n')) { for (let i = 0; i < raw.length; i += 100) lines.push(raw.slice(i, i + 100)); }
  lines.slice(0, 24).forEach((l, i) => drawText(ctx, l.toUpperCase(), 16, 64 + i * 10, { color: '#f4ead2', shadow: null }));
  if (blink(t, 1)) drawText(ctx, 'PRESS FIRE TO RELOAD', W / 2, H - 20, { align: 'center', color: '#fff' });
}

export function drawBanner(ctx, text, sub, a = 1) {
  ctx.globalAlpha = Math.max(0, Math.min(1, a));
  drawText(ctx, text, W / 2, 120, { align: 'center', scale: 3, color: '#ffd21f' });
  if (sub) drawText(ctx, sub, W / 2, 152, { align: 'center', color: '#fff' });
  ctx.globalAlpha = 1;
}
export function drawPauseDim(ctx) { ctx.fillStyle = 'rgba(6,2,14,0.6)'; ctx.fillRect(0, 0, W, H); }
export { measureText };
