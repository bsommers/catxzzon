// Menu model (pure logic, Node-testable) + drawing for title / pause / options menus.
import { drawText, measureText } from './font.js';

const C = { hi: '#ffd21f', dim: '#9a8a70', text: '#f4ead2', bg: 'rgba(12,8,20,0.78)', edge: '#ffb21f' };
const pct = (v) => `${Math.round(v * 100)}%`;
const onoff = (v) => (v ? 'ON' : 'OFF');

/** Build an options menu bound to `settings` (mutated in place); onChange(settings, key) fires after every change. */
export function optionsItems(settings, onChange = () => {}) {
  const vol = (key, label) => ({ label, kind: 'slider', get: () => settings[key], step: 0.1,
    set: (v) => { settings[key] = Math.round(Math.min(1, Math.max(0, v)) * 10) / 10; onChange(settings, key); }, fmt: pct });
  const tog = (key, label) => ({ label, kind: 'toggle', get: () => settings[key], set: (v) => { settings[key] = !!v; onChange(settings, key); }, fmt: onoff });
  return [vol('master', 'MASTER'), vol('sfx', 'SFX'), vol('music', 'MUSIC'), tog('mute', 'MUTE'), tog('crt', 'CRT FILTER'),
    tog('invert', 'INVERT ALTITUDE'), tog('autofire', 'AUTOFIRE'), { label: 'BACK', kind: 'action', id: 'back' }];
}

/** items: [{label, kind:'action'|'slider'|'toggle', id?, get?, set?, step?, fmt?}] */
export function createMenu(items, { title = '', onBack = null } = {}) {
  const m = { items, title, cursor: 0, onBack,
    /** Feed menu() edges from input. Returns an item id when an action is chosen, 'back' on cancel, else null. */
    handle(ev) {
      if (!ev || !items.length) return null;
      if (ev.up) m.cursor = (m.cursor + items.length - 1) % items.length;
      if (ev.down) m.cursor = (m.cursor + 1) % items.length;
      const it = items[m.cursor];
      if (ev.left || ev.right) {
        const d = ev.right ? 1 : -1;
        if (it.kind === 'slider') it.set(it.get() + d * (it.step || 0.1));
        else if (it.kind === 'toggle') it.set(!it.get());
      }
      if (ev.select) {
        if (it.kind === 'toggle') it.set(!it.get());
        else if (it.kind === 'action') return it.id ?? it.label;
      }
      if (ev.back) return 'back';
      return null;
    } };
  return m;
}

export function drawMenu(ctx, m, cx, y, t = 0, { scale = 1, lineH = 14, width = 200 } = {}) {
  if (m.title) { drawText(ctx, m.title, cx, y, { align: 'center', color: C.hi, scale: scale + 1 }); y += lineH * 2; }
  m.items.forEach((it, i) => {
    const sel = i === m.cursor, col = sel ? C.hi : C.text, yy = y + i * lineH;
    if (sel && Math.floor(t * 4) % 2 === 0) drawText(ctx, '>', cx - width / 2 - 8, yy, { color: C.hi, scale });
    if (it.kind === 'action') { drawText(ctx, it.label, cx, yy, { align: 'center', color: col, scale }); return; }
    drawText(ctx, it.label, cx - width / 2, yy, { color: col, scale });
    let val = it.fmt ? it.fmt(it.get()) : String(it.get());
    if (it.kind === 'slider') {
      const bx = cx + 10, bw = 50, n = Math.round(it.get() * 10);
      ctx.fillStyle = '#2a2030'; ctx.fillRect(bx, yy, bw, 7);
      ctx.fillStyle = sel ? C.hi : '#d8a020'; ctx.fillRect(bx, yy, Math.round(bw * n / 10), 7);
      drawText(ctx, val, cx + width / 2, yy, { align: 'right', color: col, scale });
    } else drawText(ctx, val, cx + width / 2, yy, { align: 'right', color: it.get() ? '#8fe36a' : C.dim, scale });
  });
  return y + m.items.length * lineH;
}

/** Darkened panel behind a menu. */
export function drawPanel(ctx, x, y, w, h) {
  ctx.fillStyle = C.bg; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.edge; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
export function pauseItems() {
  return [{ label: 'RESUME', kind: 'action', id: 'resume' }, { label: 'OPTIONS', kind: 'action', id: 'options' }, { label: 'QUIT TO TITLE', kind: 'action', id: 'quit' }];
}
export function titleItems() {
  return [{ label: 'START GAME', kind: 'action', id: 'start' }, { label: 'OPTIONS', kind: 'action', id: 'options' }, { label: 'CREDITS', kind: 'action', id: 'credits' }];
}
export { C as MENU_COLORS, measureText };
