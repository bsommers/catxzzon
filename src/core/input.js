// Unified input: keyboard, Gamepad API, touch. Node-safe (no DOM at import time). `poll()` -> sim input; `menu()` -> edge events.
const KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  fire: ['Space', 'KeyZ'], bomb: ['KeyX', 'ShiftLeft', 'ShiftRight'], pause: ['KeyP', 'Escape'],
  select: ['Enter', 'NumpadEnter'], mute: ['KeyM'], crt: ['KeyC'],
};
const CODE2ACTION = new Map();
for (const [a, codes] of Object.entries(KEYS)) for (const c of codes) CODE2ACTION.set(c, a);
const PREVENT = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);
const DEAD = 0.28;

export function createInput({ target = (typeof window !== 'undefined' ? window : null), canvas = null, getPads = null } = {}) {
  const held = new Set();                 // actions currently held by keyboard
  const pressed = new Set();              // action edges since last consume (keyboard + gamepad + touch)
  const touch = { stick: null, id: null, fire: new Set(), bomb: new Set(), ox: 0, oy: 0, cx: 0, cy: 0, dx: 0, dz: 0, used: false };
  const padPrev = { fire: false, bomb: false, pause: false, select: false, up: false, down: false, left: false, right: false };
  const o = { invert: false, autofire: false, anyEdge: false, usingTouch: false, lastDevice: 'keyboard' };
  let bombQ = false, pauseQ = false, unsubs = [];

  function press(a) { pressed.add(a); o.anyEdge = true; }
  function keydown(code, repeat = false) {
    const a = CODE2ACTION.get(code); if (!a) return false;
    if (!repeat && !held.has(a)) press(a);
    else if (repeat && (a === 'up' || a === 'down' || a === 'left' || a === 'right')) press(a);   // menu key repeat
    held.add(a); o.lastDevice = 'keyboard'; return true;
  }
  function keyup(code) { const a = CODE2ACTION.get(code); if (!a) return false; held.delete(a); return true; }

  function pads() {
    try { const l = getPads ? getPads() : (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []); return Array.from(l || []).filter(Boolean); } catch { return []; }
  }
  function padState() {
    const s = { dx: 0, dz: 0, fire: false, bomb: false, pause: false, select: false };
    for (const p of pads()) {
      const ax = p.axes || [], b = p.buttons || [];
      const btn = (i) => !!(b[i] && (b[i].pressed || b[i].value > 0.5));
      let dx = Math.abs(ax[0] || 0) > DEAD ? ax[0] : 0, dz = Math.abs(ax[1] || 0) > DEAD ? -ax[1] : 0;   // stick up = climb
      if (btn(14)) dx = -1; if (btn(15)) dx = 1; if (btn(12)) dz = 1; if (btn(13)) dz = -1;
      s.dx = Math.abs(dx) > Math.abs(s.dx) ? dx : s.dx; s.dz = Math.abs(dz) > Math.abs(s.dz) ? dz : s.dz;
      s.fire = s.fire || btn(0) || btn(7) || btn(5); s.bomb = s.bomb || btn(1) || btn(2) || btn(6) || btn(4);
      s.pause = s.pause || btn(9) || btn(8); s.select = s.select || btn(0);
    }
    return s;
  }
  function pollPadEdges(ps) {
    const now = { fire: ps.fire, bomb: ps.bomb, pause: ps.pause, select: ps.select, up: ps.dz > 0.6, down: ps.dz < -0.6, left: ps.dx < -0.6, right: ps.dx > 0.6 };
    for (const k of Object.keys(now)) { if (now[k] && !padPrev[k]) { press(k); o.lastDevice = 'pad'; } padPrev[k] = now[k]; }
  }

  // touch: left half = floating stick, right half: lower = fire, upper = bomb
  function rect() { return canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 }; }
  function tstart(e) {
    const r = rect(); o.usingTouch = true; o.lastDevice = 'touch'; touch.used = true;
    for (const t of e.changedTouches) {
      const nx = (t.clientX - r.left) / (r.width || 1), ny = (t.clientY - r.top) / (r.height || 1);
      if (nx < 0.5) { if (touch.id === null) { touch.id = t.identifier; touch.ox = t.clientX; touch.oy = t.clientY; touch.dx = touch.dz = 0; } }
      else if (ny > 0.45) touch.fire.add(t.identifier); else { touch.bomb.add(t.identifier); bombQ = true; }
      press('select');
    }
  }
  function tmove(e) {
    for (const t of e.changedTouches) if (t.identifier === touch.id) {
      const r = rect(), range = Math.max(24, (r.width || 300) * 0.07);
      const clampd = (v) => Math.max(-1, Math.min(1, v / range));
      const dx = clampd(t.clientX - touch.ox), dz = clampd(-(t.clientY - touch.oy));
      touch.dx = Math.abs(dx) < 0.2 ? 0 : dx; touch.dz = Math.abs(dz) < 0.2 ? 0 : dz;
    }
  }
  function tend(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.id) { touch.id = null; touch.dx = touch.dz = 0; }
      touch.fire.delete(t.identifier); touch.bomb.delete(t.identifier);
    }
  }

  function bindDom() {
    if (!target || !target.addEventListener) return;
    const kd = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (keydown(e.code, e.repeat) && PREVENT.has(e.code)) e.preventDefault();
    };
    const ku = (e) => { keyup(e.code); };
    const blur = () => { held.clear(); touch.fire.clear(); touch.bomb.clear(); };
    target.addEventListener('keydown', kd); target.addEventListener('keyup', ku); target.addEventListener('blur', blur);
    unsubs.push(() => { target.removeEventListener('keydown', kd); target.removeEventListener('keyup', ku); target.removeEventListener('blur', blur); });
    const tgt = canvas || target;
    const opt = { passive: false };
    const wrap = (fn) => (e) => { e.preventDefault(); fn(e); };
    const ts = wrap(tstart), tm = wrap(tmove), te = wrap(tend);
    tgt.addEventListener('touchstart', ts, opt); tgt.addEventListener('touchmove', tm, opt);
    tgt.addEventListener('touchend', te, opt); tgt.addEventListener('touchcancel', te, opt);
    unsubs.push(() => { tgt.removeEventListener('touchstart', ts); tgt.removeEventListener('touchmove', tm); tgt.removeEventListener('touchend', te); tgt.removeEventListener('touchcancel', te); });
  }
  bindDom();

  const api = {
    options: o,
    keydown, keyup,
    setInvert(v) { o.invert = !!v; }, setAutofire(v) { o.autofire = !!v; },
    /** Sim input for this frame. Edges (bomb, pause) are true for exactly one poll. */
    poll() {
      const ps = padState(); pollPadEdges(ps);
      let dx = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
      let dz = (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
      if (!dx) dx = ps.dx || touch.dx; if (!dz) dz = ps.dz || touch.dz;
      dx = Math.max(-1, Math.min(1, dx)); dz = Math.max(-1, Math.min(1, dz));
      if (o.invert) dz = -dz;
      const fireHeld = held.has('fire') || ps.fire || touch.fire.size > 0;
      const bomb = bombQ || pressed.has('bomb'); const pause = pauseQ || pressed.has('pause');
      pressed.delete('bomb'); pressed.delete('pause'); bombQ = pauseQ = false;
      return { dx, dz, fire: o.autofire ? true : fireHeld, bomb, pause };
    },
    /** Menu navigation edges since last call: { up, down, left, right, select, back, mute, crt, fire, any }. Consumes them. */
    menu() {
      const has = (a) => pressed.has(a);
      const r = { up: has('up'), down: has('down'), left: has('left'), right: has('right'),
        select: has('select') || has('fire'), back: has('pause'), mute: has('mute'), crt: has('crt'), fire: has('fire') || has('select'), any: o.anyEdge };
      pressed.clear(); o.anyEdge = false; return r;
    },
    /** Non-consuming: is the fire action currently held (keyboard/pad/touch). */
    fireHeld() { return held.has('fire') || touch.fire.size > 0 || padState().fire; },
    flush() { pressed.clear(); o.anyEdge = false; bombQ = pauseQ = false; },
    touchActive() { return touch.used; },
    /** Draw on-screen touch hints (only after a touch has been seen). */
    drawTouch(ctx, W = 640, H = 360) {
      if (!touch.used) return;
      ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(70, H - 70, 36, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(W - 60, H - 60, 32, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(W - 60, H - 150, 22, 0, Math.PI * 2); ctx.fill();
      if (touch.id !== null) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(70 + touch.dx * 28, H - 70 - touch.dz * 28, 14, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    },
    dispose() { unsubs.forEach((f) => f()); unsubs = []; },
  };
  return api;
}
export { KEYS };
