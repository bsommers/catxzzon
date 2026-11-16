// CATXZZON sound effects. Every SFX is a pure recipe -> list of "voices" (plain data).
// Voices are rendered by WebAudio (schedule) or by a pure-JS offline path (renderPcm) used by Node tests and tools/sfx-wav.mjs.
//
// voice: { src:'sine'|'square'|'saw'|'triangle'|'noise', t, dur, gain, att, f:number|number[] (Hz, exp-interpolated over dur),
//          fm?:{ratio,depth}, filters?:[{type:'lp'|'hp'|'bp', f:number|number[], q, g?}], parallel?:bool, pan? }
import { SFX } from '../core/defs.js';

export const SFX_NAMES = SFX;

// ---- helpers -------------------------------------------------------------------------------------------------------
export function curve(c, u) {                       // number or array of values spread evenly over u in [0,1], exponential
  if (typeof c === 'number') return c;
  const n = c.length - 1;
  if (n === 0) return c[0];
  const x = Math.min(Math.max(u, 0), 1) * n, i = Math.min(Math.floor(x), n - 1), k = x - i;
  const a = c[i], b = c[i + 1];
  return a > 0 && b > 0 ? a * Math.pow(b / a, k) : a + (b - a) * k;
}
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

function mk(list) {
  const v = (o) => { list.push({ src: 'sine', t: 0, dur: 0.1, gain: 0.3, att: 0.003, f: 440, ...o }); };
  return v;
}

// recipes get (v, r): r = pitch multiplier (~0.92..1.08 for variation), v(voiceSpec) adds a voice
const meow = (v, r, o) => {                         // formant-swept sawtooth "voice"
  const f = o.f.map((x) => x * r);
  v({ src: 'saw', t: o.t || 0, dur: o.dur, gain: o.gain ?? 0.9, att: 0.04, f, parallel: true,
    filters: [{ type: 'bp', f: o.f1, q: 5, g: 1.0 }, { type: 'bp', f: o.f2, q: 8, g: 0.8 }, { type: 'bp', f: o.f3 || [3000, 3200, 2800], q: 10, g: 0.35 }] });
  v({ src: 'noise', t: o.t || 0, dur: o.dur, gain: 0.05, att: 0.03, f: 1, filters: [{ type: 'bp', f: o.f2, q: 3 }] });
};
const arp = (v, notes, step, o = {}) => notes.forEach((n, i) =>
  v({ src: o.src || 'square', t: i * step, dur: o.dur || step * 1.6, gain: o.gain ?? 0.22, f: NOTE(n) * (o.r || 1), att: 0.004,
    filters: o.lp ? [{ type: 'lp', f: o.lp, q: 0.7 }] : undefined }));
const boomBody = (v0, r, big, t = 0, k = 0.5) => {
  const v = (o) => v0({ ...o, gain: (o.gain ?? 0.3) * k });
  v({ src: 'noise', t, dur: 0.18 * big, gain: 0.5, att: 0.001, f: 1, filters: [{ type: 'hp', f: 1800, q: 0.7 }] });             // crunch
  v({ src: 'noise', t, dur: 0.45 * big, gain: 0.8, att: 0.002, f: 1, filters: [{ type: 'lp', f: [3200, 900, 120], q: 0.9 }] }); // rumble
  v({ src: 'sine', t, dur: 0.5 * big, gain: 0.9, att: 0.002, f: [150 * r, 70 * r, 32] });                                     // thump
  for (let i = 1; i <= 3 * big; i++)                                                                                          // cheesy crackle
    v({ src: 'noise', t: t + 0.04 * i * (1 + 0.3 * (i % 2)), dur: 0.035, gain: 0.35 / i, att: 0.001, f: 1, filters: [{ type: 'bp', f: 2500 + 700 * i, q: 1.5 }] });
};

export const RECIPES = {
  shot: (v, r) => {                                  // hairball: thwip with a wet gurgle
    v({ src: 'square', dur: 0.09, gain: 0.22, f: [1100 * r, 260 * r], filters: [{ type: 'lp', f: 3000, q: 0.7 }] });
    v({ src: 'noise', dur: 0.05, gain: 0.25, f: 1, filters: [{ type: 'bp', f: 1800 * r, q: 2 }] });
    v({ src: 'sine', dur: 0.12, gain: 0.3, f: [220 * r, 140 * r], fm: { ratio: 3.1, depth: 120 } });
  },
  shot_nip: (v, r) => {
    v({ src: 'square', dur: 0.14, gain: 0.2, f: [500 * r, 1600 * r] });
    v({ src: 'sine', dur: 0.2, gain: 0.25, f: [1500 * r, 2400 * r], fm: { ratio: 2, depth: 500 } });
    v({ src: 'noise', dur: 0.06, gain: 0.15, f: 1, filters: [{ type: 'hp', f: 4000, q: 0.7 }] });
  },
  boom_small: (v, r) => boomBody(v, r, 0.6),
  boom_big: (v, r) => boomBody(v, r, 1.2),
  boom_boss: (v, r) => { boomBody(v, r * 0.8, 2, 0, 0.45); boomBody(v, r * 0.7, 1.4, 0.22, 0.4); boomBody(v, r * 0.6, 1.0, 0.45, 0.35); },
  tink: (v, r) => {
    v({ src: 'sine', dur: 0.14, gain: 0.3, f: 2400 * r });
    v({ src: 'sine', dur: 0.1, gain: 0.2, f: 3700 * r });
    v({ src: 'noise', dur: 0.015, gain: 0.2, att: 0.001, f: 1, filters: [{ type: 'hp', f: 5000, q: 0.7 }] });
  },
  pickup_tuna: (v, r) => arp(v, [72, 76, 79], 0.06, { src: 'triangle', gain: 0.4, r }),
  pickup_nip: (v, r) => { arp(v, [79, 84, 88, 91, 96], 0.045, { src: 'sine', gain: 0.3, r }); v({ src: 'noise', t: 0, dur: 0.3, gain: 0.07, f: 1, filters: [{ type: 'hp', f: 6000, q: 0.7 }] }); },
  pickup_yarn: (v, r) => { v({ src: 'triangle', dur: 0.3, gain: 0.4, f: [400 * r, 900 * r, 500 * r, 1000 * r], fm: { ratio: 1, depth: 40 } }); },
  pickup_laser: (v, r) => { v({ src: 'saw', dur: 0.25, gain: 0.22, f: [300 * r, 2000 * r], filters: [{ type: 'lp', f: 5000, q: 1 }] }); arp(v, [84, 91], 0.07, { src: 'square', gain: 0.12, r }); },
  bomb: (v, r) => {
    v({ src: 'sine', dur: 0.5, gain: 0.5, f: [500 * r, 40], fm: { ratio: 0.5, depth: 60 } });
    boomBody(v, r, 1.4, 0.18);
  },
  can_launch: (v, r) => {
    v({ src: 'sine', dur: 0.1, gain: 0.7, f: [220 * r, 70], att: 0.001 });
    v({ src: 'noise', dur: 0.4, gain: 0.35, f: 1, att: 0.05, filters: [{ type: 'bp', f: [600, 3000, 1500], q: 1.5 }] });
  },
  can_hiss: (v, r) => {                                // sustained aerosol hiss with a metal rattle
    v({ src: 'noise', dur: 0.7, gain: 0.3, f: 1, att: 0.04, filters: [{ type: 'hp', f: 4500 * r, q: 0.8 }, { type: 'bp', f: 7000, q: 0.6 }] });
    v({ src: 'noise', dur: 0.7, gain: 0.12, f: 1, att: 0.1, filters: [{ type: 'bp', f: 2500, q: 2 }] });
  },
  field_zap: (v, r) => {
    v({ src: 'saw', dur: 0.22, gain: 0.25, f: [1800 * r, 150 * r], fm: { ratio: 7.3, depth: 600 }, filters: [{ type: 'lp', f: 4500, q: 1 }] });
    v({ src: 'noise', dur: 0.15, gain: 0.3, f: 1, att: 0.001, filters: [{ type: 'hp', f: 3000, q: 0.9 }] });
  },
  turret_fire: (v, r) => {
    v({ src: 'square', dur: 0.16, gain: 0.25, f: [380 * r, 70 * r], filters: [{ type: 'lp', f: 1800, q: 1 }] });
    v({ src: 'noise', dur: 0.1, gain: 0.4, f: 1, att: 0.001, filters: [{ type: 'lp', f: [3500, 500], q: 0.9 }] });
  },
  jet_swoosh: (v, r) => {
    v({ src: 'noise', dur: 0.6, gain: 0.5, f: 1, att: 0.2, filters: [{ type: 'bp', f: [300, 2600 * r, 500], q: 1.2 }] });
    v({ src: 'saw', dur: 0.6, gain: 0.05, f: [90, 140, 80], att: 0.2, filters: [{ type: 'lp', f: 600, q: 1 }] });
  },
  player_hurt: (v, r) => {
    v({ src: 'saw', dur: 0.3, gain: 0.3, f: [520 * r, 90 * r], fm: { ratio: 1.5, depth: 80 }, filters: [{ type: 'lp', f: 2500, q: 1 }] });
    v({ src: 'noise', dur: 0.2, gain: 0.4, f: 1, att: 0.001, filters: [{ type: 'lp', f: [4000, 400], q: 0.9 }] });
  },
  player_die: (v, r) => {
    v({ src: 'square', dur: 1.0, gain: 0.25, f: [700 * r, 500 * r, 330 * r, 55], filters: [{ type: 'lp', f: [3500, 500], q: 1 }] });
    v({ src: 'saw', dur: 0.9, gain: 0.15, f: [703 * r, 507 * r, 335 * r, 58] });
    boomBody(v, r, 1.2, 0.15);
  },
  meow_a: (v, r) => meow(v, r, { dur: 0.5, f: [420, 700, 760, 480, 360], f1: [700, 1000, 850, 650], f2: [1500, 2400, 2100, 1400], gain: 2.2 }),
  meow_b: (v, r) => meow(v, r, { dur: 0.3, f: [550, 900, 640], f1: [600, 950, 700], f2: [1700, 2600, 1700], gain: 0.8 }),
  meow_hurt: (v, r) => {
    meow(v, r, { dur: 0.4, f: [800, 1400, 1250, 650], f1: [900, 1100, 800], f2: [2200, 2800, 2000], gain: 0.9 });
    v({ src: 'noise', t: 0.02, dur: 0.15, gain: 0.12, f: 1, filters: [{ type: 'bp', f: 3000, q: 2 }] });
  },
  extra_life: (v, r) => arp(v, [72, 76, 79, 84, 88, 91, 96], 0.07, { src: 'square', gain: 0.18, dur: 0.14, r, lp: 5000 }),
  low_fuel: (v, r) => { [0, 0.16, 0.5, 0.66].forEach((t) => v({ src: 'square', t, dur: 0.11, gain: 0.2, f: (t < 0.4 ? 440 : 392) * r, filters: [{ type: 'lp', f: 2000, q: 0.7 }] })); },
  stage_start: (v, r) => { arp(v, [60, 64, 67, 72], 0.1, { src: 'saw', gain: 0.15, dur: 0.25, r, lp: 3000 }); arp(v, [48, 48, 55, 60], 0.1, { src: 'square', gain: 0.12, dur: 0.25, r, lp: 1500 }); },
  stage_clear: (v, r) => { arp(v, [67, 72, 76, 79, 84, 79, 84], 0.09, { src: 'square', gain: 0.17, dur: 0.2, r, lp: 4000 }); arp(v, [55, 60, 64, 67], 0.18, { src: 'triangle', gain: 0.3, dur: 0.4, r }); },
  boss_laugh: (v, r) => {
    for (let i = 0; i < 5; i++) meow(v, r * 0.5, { t: i * 0.17, dur: 0.12, f: [230 - i * 12, 200 - i * 12], f1: [600, 700], f2: [1100, 1000], gain: 0.9, f3: [2400, 2400] });
  },
  boss_hiss: (v, r) => {
    v({ src: 'noise', dur: 0.9, gain: 0.4, f: 1, att: 0.15, filters: [{ type: 'bp', f: [3500, 5500, 3000], q: 0.8 }] });
    meow(v, r * 0.6, { dur: 0.8, f: [200, 260, 170], f1: [500, 700, 500], f2: [1100, 1600, 1100], gain: 0.4 });
  },
  boss_hit: (v, r) => {
    v({ src: 'sine', dur: 0.2, gain: 0.8, f: [180 * r, 60], att: 0.001 });
    v({ src: 'noise', dur: 0.12, gain: 0.5, f: 1, att: 0.001, filters: [{ type: 'bp', f: 1800, q: 1.2 }] });
    v({ src: 'sine', t: 0.01, dur: 0.15, gain: 0.2, f: 1600 * r });
  },
  boss_die: (v, r) => {
    boomBody(v, r * 0.7, 2, 0, 0.45); boomBody(v, r * 0.6, 1.5, 0.3, 0.4); boomBody(v, r * 0.5, 1.2, 0.6, 0.35); boomBody(v, r * 0.5, 1.8, 0.95, 0.4);
    v({ src: 'saw', dur: 1.8, gain: 0.2, f: [500, 380, 250, 60], fm: { ratio: 1.01, depth: 25 }, filters: [{ type: 'lp', f: [3000, 400], q: 1 }] });
  },
  spud_pop: (v, r) => {                                // squeaky pop
    v({ src: 'sine', dur: 0.09, gain: 0.5, f: [500 * r, 2200 * r, 1400 * r] });
    v({ src: 'sine', t: 0.05, dur: 0.06, gain: 0.25, f: [2800 * r, 1800 * r] });
    v({ src: 'noise', t: 0.07, dur: 0.05, gain: 0.35, att: 0.001, f: 1, filters: [{ type: 'bp', f: 1200, q: 1 }] });
    v({ src: 'sine', t: 0.07, dur: 0.08, gain: 0.5, f: [200, 90] });
  },
  ui_move: (v, r) => v({ src: 'square', dur: 0.05, gain: 0.15, f: 660 * r, filters: [{ type: 'lp', f: 2500, q: 0.7 }] }),
  ui_select: (v, r) => arp(v, [76, 83], 0.07, { src: 'square', gain: 0.18, dur: 0.12, r, lp: 4000 }),
  ui_back: (v, r) => arp(v, [74, 67], 0.07, { src: 'square', gain: 0.17, dur: 0.12, r, lp: 3000 }),
  coin: (v, r) => { v({ src: 'square', dur: 0.06, gain: 0.2, f: 988 * r }); v({ src: 'square', t: 0.06, dur: 0.3, gain: 0.2, f: 1319 * r }); },
  combo_up: (v, r) => arp(v, [72, 76, 79, 84], 0.05, { src: 'triangle', gain: 0.4, dur: 0.1, r }),
  warning: (v, r) => { for (let i = 0; i < 4; i++) v({ src: 'saw', t: i * 0.22, dur: 0.18, gain: 0.2, f: (i % 2 ? 450 : 620) * r, filters: [{ type: 'lp', f: 1800, q: 1 }] }); },
  thread_needle: (v, r) => {                           // thin electric strand zap
    v({ src: 'sine', dur: 0.18, gain: 0.3, f: [3400 * r, 1100 * r], fm: { ratio: 5.2, depth: 900 } });
    v({ src: 'noise', dur: 0.08, gain: 0.2, att: 0.001, f: 1, filters: [{ type: 'hp', f: 6000, q: 0.7 }] });
  },
};

// ---- describe: name -> voices ----------------------------------------------------------------------------------------
export function describe(name, { pitch = 1 } = {}) {
  const fn = RECIPES[name];
  if (!fn) return [];
  const list = [];
  fn(mk(list), pitch);
  return list;
}
export function duration(voices) {
  let d = 0;
  for (const o of voices) d = Math.max(d, o.t + o.dur);
  return d;
}

// ---- WebAudio backend ------------------------------------------------------------------------------------------------
let noiseBuf = null;
function getNoise(ctx) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = ctx.sampleRate | 0, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < len; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }
  return (noiseBuf = b);
}
function ramp(param, c, t0, dur) {                  // exponential curve through array points
  const arr = typeof c === 'number' ? [c, c] : c, n = arr.length - 1;
  param.setValueAtTime(arr[0], t0);
  for (let i = 1; i <= n; i++) param.exponentialRampToValueAtTime(Math.max(arr[i], 1e-3), t0 + dur * (i / n));
}
/** Schedule voices into `dest` at ctx time t0. Returns the end time. */
export function schedule(ctx, dest, voices, t0, { pan = 0, gain = 1 } = {}) {
  let end = t0;
  const out = ctx.createGain();
  out.gain.value = gain;
  let tail = out;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; out.connect(p); tail = p; }
  tail.connect(dest);
  for (const o of voices) {
    const t = t0 + o.t, e = t + o.dur + 0.01;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain, t + Math.min(o.att, o.dur / 2));
    g.gain.exponentialRampToValueAtTime(0.0008, t + o.dur);
    g.gain.linearRampToValueAtTime(0, e);
    let src;
    if (o.src === 'noise') {
      src = ctx.createBufferSource(); src.buffer = getNoise(ctx); src.loop = true;
    } else {
      src = ctx.createOscillator(); src.type = o.src;
      ramp(src.frequency, o.f, t, o.dur);
      if (o.fm) {
        const m = ctx.createOscillator(), mg = ctx.createGain();
        ramp(m.frequency, typeof o.f === 'number' ? o.f * o.fm.ratio : o.f.map((x) => x * o.fm.ratio), t, o.dur);
        mg.gain.value = o.fm.depth; m.connect(mg); mg.connect(src.frequency); m.start(t); m.stop(e);
      }
    }
    const nodes = (o.filters || []).map((fs) => {
      const f = ctx.createBiquadFilter();
      f.type = fs.type === 'bp' ? 'bandpass' : fs.type === 'lp' ? 'lowpass' : 'highpass';
      f.Q.value = fs.q ?? 0.7; ramp(f.frequency, fs.f, t, o.dur);
      return { f, g: fs.g ?? 1 };
    });
    if (!nodes.length) src.connect(g);
    else if (o.parallel) for (const n of nodes) { const w = ctx.createGain(); w.gain.value = n.g; src.connect(n.f); n.f.connect(w); w.connect(g); }
    else { let prev = src; for (const n of nodes) { prev.connect(n.f); prev = n.f; } prev.connect(g); }
    g.connect(out);
    src.start(t, o.src === 'noise' ? (t * 0.37) % 0.8 : 0); src.stop(e);
    end = Math.max(end, e);
  }
  return end;
}

// ---- pure-JS offline backend -----------------------------------------------------------------------------------------
function biquad(type, fc, q, sr) {
  const w = 2 * Math.PI * Math.min(Math.max(fc, 20), sr * 0.45) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Math.max(q, 0.1));
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al;
  return [b0 / a0, b1 / a0, b2 / a0, -2 * c / a0, (1 - al) / a0];
}
function renderVoice(o, sr, out, seed) {
  const start = Math.round(o.t * sr), n = Math.min(Math.round(o.dur * sr), out.length - start);
  if (n <= 0) return;
  const tau = Math.PI * 2, decayK = Math.log(0.0008 / Math.max(o.gain, 1e-4));
  const G = o.gain;
  let ph = 0, mph = 0, s = (seed * 2654435761) >>> 0 || 1;
  const fl = (o.filters || []).map((f) => ({ f, c: [0, 0, 0, 0, 0], x1: 0, x2: 0, y1: 0, y2: 0 }));
  const att = Math.min(o.att, o.dur / 2), fade = Math.min(0.01 * sr, n);
  for (let i = 0; i < n; i++) {
    const u = i / Math.max(n - 1, 1), tt = i / sr;
    let x;
    if (o.src === 'noise') { s = (s * 1664525 + 1013904223) >>> 0; x = s / 2147483648 - 1; }
    else {
      const f = curve(o.f, u);
      let inst = f;
      if (o.fm) { mph += tau * f * o.fm.ratio / sr; inst = f + o.fm.depth * Math.sin(mph); }
      ph += inst / sr; ph -= Math.floor(ph);
      x = o.src === 'sine' ? Math.sin(tau * ph) : o.src === 'square' ? (ph < 0.5 ? 1 : -1)
        : o.src === 'saw' ? 2 * ph - 1 : 4 * Math.abs(ph - 0.5) - 1;
    }
    if (fl.length) {
      const run = (st, v) => {
        if ((i & 15) === 0) st.c = biquad(st.f.type, curve(st.f.f, u), st.f.q ?? 0.7, sr);
        const c = st.c, y = c[0] * v + c[1] * st.x1 + c[2] * st.x2 - c[3] * st.y1 - c[4] * st.y2;
        st.x2 = st.x1; st.x1 = v; st.y2 = st.y1; st.y1 = y; return y;
      };
      if (o.parallel) { let sum = 0; for (const st of fl) sum += run(st, x) * (st.f.g ?? 1); x = sum; }
      else for (const st of fl) x = run(st, x);
    }
    let env = G * (tt < att ? tt / att : Math.exp(decayK * (tt - att) / Math.max(o.dur - att, 1e-4)));
    if (i > n - fade) env *= (n - i) / fade;
    out[start + i] += x * env;
  }
}
/** Render voices to a Float32Array (mono). */
export function renderPcm(voices, sr = 44100, { tail = 0.02, seed = 1 } = {}) {
  const out = new Float32Array(Math.ceil((duration(voices) + tail) * sr));
  voices.forEach((o, i) => renderVoice(o, sr, out, seed + i * 7919));
  return out;
}
export function renderSfx(name, sr = 44100, opts = {}) { return renderPcm(describe(name, opts), sr, opts); }
export function stats(pcm) {
  let peak = 0, sum = 0;
  for (const x of pcm) { const a = Math.abs(x); if (a > peak) peak = a; sum += x * x; }
  return { peak, rms: Math.sqrt(sum / Math.max(pcm.length, 1)), len: pcm.length };
}
