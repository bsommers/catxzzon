// CATXZZON music (ARCHITECTURE.md §9): data-driven chiptune sequencer. Pure WebAudio, Node-importable.
// createMusic({ctx, out, volume}) -> {play(name), stop(), setVolume(v), setUrgent(bool), tick(), ...}
import { MUSIC } from '../core/defs.js';

export const MUSIC_NAMES = MUSIC;
export const URGENT_TEMPO = 1.2;      // tempo multiplier when fuel is low
export const LOOKAHEAD = 0.3;         // seconds scheduled ahead of ctx.currentTime
export const FADE = 0.8;              // crossfade seconds

const SCALES = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10], dor: [0, 2, 3, 5, 7, 9, 10], phr: [0, 1, 3, 5, 7, 8, 10] };
const DRUMS = {
  march: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' },
  rock:  { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
  four:  { k: 'x...x...x...x...', s: '....x.......x...', h: '.x.x.x.x.x.x.x.x' },
  drive: { k: 'x..xx..xx..xx.x.', s: '....x.......x..x', h: 'xxxxxxxxxxxxxxxx' },
  soft:  { k: 'x.......x.......', s: '................', h: '..x...x...x...x.' },
  slow:  { k: 'x...............', s: '........x.......', h: '................' },
  hit:   { k: 'x...x...x.......', s: '........x.x.x.xx', h: '................' },
  none:  { k: '', s: '', h: '' },
};
const BASS = {
  march: [[0, 0, 3], [4, 7, 3], [8, 0, 3], [12, 7, 3]],
  eighth: [0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => [s, i % 2 ? 12 : 0, 2]),
  drive: Array.from({ length: 16 }, (_, s) => [s, s % 4 === 3 ? 12 : 0, 1]),
  walk: [[0, 0, 4], [4, 7, 4], [8, 0, 4], [12, 3, 4]],
  whole: [[0, 0, 16]],
  sync: [[0, 0, 3], [3, 0, 3], [6, 7, 2], [8, 0, 3], [11, 0, 3], [14, 5, 2]],
};

// Tracks. prog: 8 chords "<root semitones><M|m>" played twice (16 bars). lead: 8 bars, "step:degree:len", bars split by '|'.
// Second pass of the lead is shifted by `shift2` scale degrees in its first 4 bars for variation.
const TRACKS = {
  title: { bpm: 132, key: 60, scale: 'maj', loop: true, prog: '0M 7M 9m 5M 5M 0M 7M 7M', shift2: 2,
    lead: { wave: 'square', oct: 0, vel: 0.17, len: 1.0, notes: '0:0:3 4:2:1 6:4:2 8:7:6|0:6:2 2:4:2 4:5:2 6:4:2 8:1:3 12:2:3|0:2:3 4:4:1 6:5:2 8:9:6|0:8:2 2:6:2 4:4:2 6:2:2 8:3:3 12:1:3|0:3:3 4:5:1 6:7:2 8:5:6|0:4:2 2:2:2 4:0:2 6:2:2 8:4:6|0:1:2 2:3:2 4:5:2 6:6:2 8:8:3 12:6:3|0:6:2 2:5:2 4:4:2 6:1:2 8:4:6' },
    bass: { style: 'eighth', wave: 'triangle', vel: 0.22 }, arp: { pat: '0120120', wave: 'square', oct: 12, vel: 0.07, step: 2 },
    drums: { style: 'four', fill: true, vel: 0.9 } },
  fortress: { bpm: 108, key: 50, scale: 'min', loop: true, prog: '0m 0m 8M 7M 0m 3M 10M 7M', shift2: 2,
    lead: { wave: 'sawtooth', oct: 0, vel: 0.16, len: 0.9, filter: 1800, notes: '0:0:4 4:0:2 6:2:2 8:4:4 12:3:4|0:2:4 4:2:2 6:4:2 8:5:6|0:4:4 4:3:2 6:2:2 8:1:4 12:0:4|0:-1:6 8:1:2 10:0:2 12:-1:4|0:2:4 4:3:2 6:4:2 8:5:4 12:7:4|0:6:4 4:5:2 6:4:2 8:3:6|0:5:2 2:4:2 4:3:2 6:2:2 8:1:4 12:2:4|0:0:12' },
    bass: { style: 'march', wave: 'square', vel: 0.17 }, arp: null,
    pad: { wave: 'sawtooth', vel: 0.05, filter: 700 }, drums: { style: 'march', fill: true, vel: 0.85 } },
  space: { bpm: 96, key: 57, scale: 'dor', loop: true, prog: '0m 5M 10M 7m 0m 8M 3M 7M', shift2: 4,
    lead: { wave: 'triangle', oct: 12, vel: 0.2, len: 1.0, notes: '0:4:6 8:2:4 12:3:4|0:4:8 8:7:8|0:6:6 8:4:4 12:2:4|0:3:12|0:2:6 8:4:4 12:6:4|0:7:8 8:9:8|0:8:4 4:7:4 8:4:4 12:2:4|0:0:14' },
    bass: { style: 'whole', wave: 'sine', vel: 0.3 }, arp: { pat: '0123210301230321', wave: 'square', oct: 12, vel: 0.075, step: 1 },
    pad: { wave: 'triangle', vel: 0.1 }, drums: { style: 'soft', fill: false, vel: 0.5 } },
  fortress2: { bpm: 126, key: 52, scale: 'min', loop: true, prog: '0m 3M 7m 10M 0m 8M 10M 7M', shift2: 3,
    lead: { wave: 'sawtooth', oct: 0, vel: 0.15, len: 0.8, filter: 2200, notes: '0:7:2 2:6:2 4:4:2 6:2:2 8:4:4 12:2:4|0:4:2 2:3:2 4:2:2 6:0:2 8:2:6|0:7:2 2:8:2 4:7:2 6:4:2 8:5:4 12:4:4|0:3:2 2:2:2 4:1:2 6:2:2 8:0:6|0:9:3 3:7:3 6:5:2 8:4:4 12:5:4|0:6:3 3:4:3 6:2:2 8:3:4 12:4:4|0:5:2 2:4:2 4:5:2 6:7:2 8:6:2 10:4:2 12:3:2 14:1:2|0:0:12' },
    bass: { style: 'sync', wave: 'square', vel: 0.17 }, arp: { pat: '0.1.2.1.0.1.2.3.', wave: 'square', oct: 12, vel: 0.05, step: 1 },
    drums: { style: 'rock', fill: true, vel: 0.9 } },
  boss: { bpm: 152, key: 49, scale: 'phr', loop: true, prog: '0m 0m 1M 0m 0m 8M 7M 1M', shift2: 1,
    lead: { wave: 'sawtooth', oct: 0, vel: 0.15, len: 0.6, filter: 2600, notes: '0:0:1 2:0:1 4:0:1 6:1:2 8:0:2 10:-2:2 12:0:1 14:1:1|0:0:1 2:0:1 4:0:1 6:3:2 8:2:2 10:1:2 12:0:4|0:4:2 2:3:2 4:1:2 6:3:2 8:4:6 14:3:1 15:4:1|0:5:3 3:4:3 6:3:2 8:1:2 10:0:2 12:1:4|0:7:1 1:6:1 2:7:2 4:4:2 6:3:2 8:1:2 10:3:2 12:4:4|0:8:2 2:7:2 4:4:2 6:3:2 8:4:8|0:3:2 2:1:2 4:0:2 6:-1:2 8:0:4 12:1:4|0:0:2 2:1:2 4:0:2 6:-1:2 8:0:8' },
    bass: { style: 'drive', wave: 'sawtooth', vel: 0.15, filter: 900 }, arp: { pat: '0.2.1.3.0.2.1.3.', wave: 'square', oct: 24, vel: 0.04, step: 1 },
    drums: { style: 'drive', fill: true, vel: 1 } },
  victory: { bpm: 144, key: 62, scale: 'maj', loop: false, prog: '0M 5M 7M 0M 5M 7M 0M 0M', shift2: 0,
    lead: { wave: 'square', oct: 0, vel: 0.16, len: 1.0, notes: '0:4:2 2:4:2 4:4:2 6:4:2 8:7:4 12:6:2 14:7:2|0:9:4 4:7:2 6:9:2 8:11:8|0:9:2 2:9:2 4:9:2 6:9:2 8:7:4 12:5:2 14:7:2|0:4:12 12:2:2 14:4:2|0:7:2 2:6:2 4:7:2 6:9:2 8:11:4 12:9:4|0:11:2 2:9:2 4:11:2 6:12:2 8:14:8|0:11:2 2:9:2 4:7:2 6:4:2 8:7:4 12:4:4|0:7:2 2:4:2 4:2:2 6:0:2 8:0:8' },
    bass: { style: 'eighth', wave: 'triangle', vel: 0.28 }, arp: { pat: '0120120', wave: 'square', oct: 12, vel: 0.06, step: 2 },
    pad: { wave: 'triangle', vel: 0.04 }, drums: { style: 'four', fill: true, vel: 0.8 } },
  gameover: { bpm: 78, key: 55, scale: 'min', loop: false, prog: '0m 8M 5m 7M 0m 3M 5m 0m', shift2: 0,
    lead: { wave: 'triangle', oct: 0, vel: 0.22, len: 1.0, notes: '0:4:6 8:3:4 12:2:4|0:1:6 8:2:4 12:0:4|0:3:6 8:2:4 12:1:4|0:0:12|0:2:6 8:1:4 12:0:4|0:-1:6 8:0:4 12:1:4|0:2:6 8:1:4 12:-1:4|0:-2:14' },
    bass: { style: 'whole', wave: 'sine', vel: 0.28 }, arp: null,
    pad: { wave: 'sawtooth', vel: 0.04, filter: 500 }, drums: { style: 'slow', fill: false, vel: 0.6 } },
};
export const TRACK_NAMES = Object.keys(TRACKS);

export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

function degMidi(key, scale, d) {
  const sc = SCALES[scale], oct = Math.floor(d / 7);
  return key + sc[((d % 7) + 7) % 7] + 12 * oct;
}
function parseProg(str) { return str.trim().split(/\s+/).map((c) => ({ r: parseInt(c, 10), q: c.slice(-1) })); }
function parseLead(str) {
  return str.split('|').map((bar) => bar.trim().split(/\s+/).map((n) => { const [s, d, l] = n.split(':').map(Number); return { s, d, l }; }));
}

/** Build a track description: {name,bpm,bars,steps,loop,buckets[step] -> events[]}. Pure and deterministic. */
export function buildTrack(name) {
  const T = TRACKS[name];
  if (!T) throw new Error('unknown music track: ' + name);
  const bars = 16, steps = bars * 16;
  const buckets = Array.from({ length: steps }, () => []);
  const add = (step, ev) => { if (step >= 0 && step < steps) buckets[step].push(ev); };
  const prog = parseProg(T.prog), lead = parseLead(T.lead.notes);
  for (let b = 0; b < bars; b++) {
    const base = b * 16, ch = prog[b % prog.length], root = T.key + ch.r;
    const tones = [root, root + (ch.q === 'm' ? 3 : 4), root + 7, root + 12];
    if (T.pad) add(base, { v: 'pad', midi: tones.slice(0, 3).map((m) => m), len: 16, vel: T.pad.vel });
    if (T.bass) for (const [s, off, l] of BASS[T.bass.style]) add(base + s, { v: 'bass', midi: root - 24 + (off === 3 ? (ch.q === 'm' ? 3 : 4) : off), len: l, vel: T.bass.vel });
    if (T.arp) {
      const pat = T.arp.pat;
      for (let s = 0; s < 16; s += T.arp.step) {
        const c = pat[(s / T.arp.step) % pat.length];
        if (c === '.') continue;
        add(base + s, { v: 'arp', midi: tones[+c % 4] + T.arp.oct, len: T.arp.step, vel: T.arp.vel });
      }
    }
    const lb = lead[b % 8], shift = b >= 8 && b % 8 < 4 ? T.shift2 : 0;
    for (const n of lb) add(base + n.s, { v: 'lead', midi: degMidi(T.key, T.scale, n.d + shift) + T.lead.oct + 12, len: n.l, vel: T.lead.vel });
    const D = DRUMS[T.drums.style], dv = T.drums.vel;
    for (const [id, key] of [['k', 'k'], ['s', 's'], ['h', 'h']]) {
      const p = D[key];
      for (let s = 0; s < p.length; s++) if (p[s] === 'x') add(base + s, { v: id, vel: (id === 'h' ? 0.05 : id === 'k' ? 0.34 : 0.2) * dv });
    }
    if (T.drums.fill && b % 4 === 3) for (let s = 12; s < 16; s++) if (D.s[s] !== 'x') add(base + s, { v: 's', vel: 0.15 * dv });
  }
  return { name, bpm: T.bpm, bars, steps, loop: T.loop, buckets };
}

function noiseBuffer(ctx) {
  if (ctx.__musicNoise) return ctx.__musicNoise;
  const len = Math.floor(ctx.sampleRate * 0.5), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = (seed / 4294967296) * 2 - 1; }
  try { ctx.__musicNoise = buf; } catch { /* frozen ctx */ }
  return buf;
}

export function createMusic({ ctx, out, volume = 0.7, timer = true, applyVolume = false } = {}) {
  if (!ctx) throw new Error('createMusic needs ctx');
  const dest = out || ctx.destination;
  const trim = ctx.createGain();
  trim.gain.value = applyVolume ? volume : 1;
  let master = trim;
  if (ctx.createDynamicsCompressor) {      // light guard against stacked-voice clipping
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -10; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.15;
    trim.connect(lim); lim.connect(dest);
  } else trim.connect(dest);

  const cache = new Map();
  const active = [];                       // {track, bus, step, next, current, fadeEnd}
  let currentName = null, urgent = false, vol = volume, interval = null;
  const stats = { notes: 0, drums: 0, played: [] };

  function voice(ev, t, dur, bus, T) {
    const v = ev.v;
    if (v === 'k') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(ev.vel * 1.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.2); stats.drums++; return;
    }
    if (v === 's' || v === 'h') {
      const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = noiseBuffer(ctx); n.loop = true;
      f.type = v === 'h' ? 'highpass' : 'bandpass'; f.frequency.value = v === 'h' ? 7000 : 1800;
      const L = v === 'h' ? 0.04 : 0.14;
      g.gain.setValueAtTime(ev.vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + L);
      n.connect(f); f.connect(g); g.connect(bus); n.start(t); n.stop(t + L + 0.02); stats.drums++; return;
    }
    const cfg = v === 'lead' ? T.lead : v === 'bass' ? T.bass : v === 'arp' ? T.arp : T.pad;
    const mids = Array.isArray(ev.midi) ? ev.midi : [ev.midi];
    const hold = v === 'pad' ? dur * 0.97 : dur * (v === 'lead' ? T.lead.len : 0.85);
    const g = ctx.createGain();
    const att = v === 'pad' ? 0.15 : 0.01;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(ev.vel, t + att);
    g.gain.setValueAtTime(ev.vel * (v === 'pad' ? 1 : 0.75), t + Math.max(att, hold * 0.5));
    g.gain.linearRampToValueAtTime(0.0001, t + hold + 0.04);
    let tail = g;
    if (cfg.filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cfg.filter; g.connect(f); tail = f; }
    tail.connect(bus);
    for (const m of mids) {
      const o = ctx.createOscillator();
      o.type = cfg.wave; o.frequency.value = midiHz(m);
      o.connect(g); o.start(t); o.stop(t + hold + 0.06); stats.notes++;
    }
  }

  function stepSec(track) { return 60 / track.bpm / 4 / (urgent ? URGENT_TEMPO : 1); }

  function scheduleRun(a, horizon) {
    const tr = a.track;
    while (!a.ended && a.next < horizon) {
      const ss = stepSec(tr);
      const evs = tr.buckets[a.step];
      for (const ev of evs) voice(ev, a.next, (ev.len || 1) * ss, a.bus, TRACKS[tr.name]);
      stats.played.push(a.step);
      a.step++; a.next += ss;
      if (a.step >= tr.steps) { if (tr.loop) { a.step = 0; a.loops = (a.loops || 0) + 1; } else a.ended = true; }
    }
  }

  function tick() {
    const now = ctx.currentTime;
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i];
      if (a.fadeEnd !== undefined && now >= a.fadeEnd) { a.ended = true; try { a.bus.disconnect(); } catch { /* ok */ } active.splice(i, 1); continue; }
      if (a.fadeEnd !== undefined && a.next >= a.fadeEnd) continue;   // nothing more to schedule once faded
      scheduleRun(a, now + LOOKAHEAD);
    }
  }

  function fadeOut(a, now) {
    if (a.fadeEnd !== undefined) return;
    a.fadeEnd = now + FADE;
    a.bus.gain.cancelScheduledValues?.(now);
    a.bus.gain.setValueAtTime(a.bus.gain.value, now);
    a.bus.gain.linearRampToValueAtTime(0, a.fadeEnd);
  }

  function startTimer() {
    if (!timer || interval || typeof setInterval !== 'function') return;
    interval = setInterval(tick, 60);
    interval.unref?.();
  }

  const api = {
    play(name) {
      if (!MUSIC.includes(name) || !TRACKS[name]) return false;
      const cur = active.find((a) => a.current);
      if (cur && cur.track.name === name && !cur.ended) return true;
      const now = ctx.currentTime;
      for (const a of active) { a.current = false; fadeOut(a, now); }
      if (!cache.has(name)) cache.set(name, buildTrack(name));
      const bus = ctx.createGain();
      bus.gain.setValueAtTime(active.length ? 0.0001 : 1, now);
      if (active.length) bus.gain.linearRampToValueAtTime(1, now + FADE / 2);
      bus.connect(master);
      active.push({ track: cache.get(name), bus, step: 0, next: now + 0.05, current: true, ended: false });
      currentName = name;
      tick(); startTimer();
      return true;
    },
    stop() {
      const now = ctx.currentTime;
      for (const a of active) { a.current = false; fadeOut(a, now); }
      currentName = null;
      if (interval && !active.length) { clearInterval(interval); interval = null; }
    },
    setVolume(v) { vol = Math.min(Math.max(+v || 0, 0), 1); if (applyVolume) trim.gain.value = vol; },
    setUrgent(b) { urgent = !!b; },
    tick,
    dispose() { if (interval) clearInterval(interval); interval = null; },
    get current() { return currentName; },
    get urgent() { return urgent; },
    get volume() { return vol; },
    get activeCount() { return active.length; },
    stats,
  };
  return api;
}

export default createMusic;
