// CATXZZON audio engine (ARCHITECTURE.md §9). WebAudio only; Node-importable; offline stub via createStubContext().
import { describe, schedule, duration } from './sfx.js';
import { SFX, MUSIC } from '../core/defs.js';

const clamp01 = (x) => Math.min(Math.max(+x || 0, 0), 1);
const VARY = new Set(['shot', 'shot_nip', 'boom_small', 'boom_big', 'tink', 'spud_pop', 'turret_fire', 'field_zap', 'thread_needle', 'player_hurt', 'meow_a', 'meow_b']);
const PRIORITY = new Set(['boom_boss', 'boss_die', 'player_die', 'player_hurt', 'extra_life', 'stage_clear', 'stage_start', 'warning']);
export const LIMITS = { perName: 4, total: 20, retrigger: 0.03 };

/** Recording stand-in for AudioContext: counts nodes/starts, advances time via .advance(sec). */
export function createStubContext() {
  const log = { nodes: [], starts: 0, stops: 0, connections: 0 };
  const param = (v = 0) => ({ value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
  const node = (kind, extra = {}) => {
    const n = { kind, connect(d) { log.connections++; return d; }, disconnect() {}, ...extra };
    log.nodes.push(n); return n;
  };
  const ctx = {
    stub: true, state: 'suspended', sampleRate: 44100, currentTime: 0, destination: node('destination'), log,
    advance(dt) { ctx.currentTime += dt; },
    resume() { ctx.state = 'running'; return Promise.resolve(); },
    createGain: () => node('gain', { gain: param(1) }),
    createDynamicsCompressor: () => node('compressor', { threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    createStereoPanner: () => node('panner', { pan: param(0) }),
    createBiquadFilter: () => node('filter', { type: 'lowpass', frequency: param(350), Q: param(1) }),
    createOscillator: () => node('osc', { type: 'sine', frequency: param(440), start() { log.starts++; }, stop() { log.stops++; } }),
    createBufferSource: () => node('noise', { buffer: null, loop: false, start() { log.starts++; }, stop() { log.stops++; } }),
    createBuffer: (ch, len, sr) => { const d = new Float32Array(len); return { sampleRate: sr, length: len, getChannelData: () => d }; },
  };
  return ctx;
}

export function createAudio({ bus, ctx: injected, AudioContextCtor, rng = Math.random, musicModule } = {}) {
  const Ctor = AudioContextCtor || (typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext)) || null;
  const vol = { master: 0.8, sfx: 1, music: 0.7 };
  const state = { muted: false, ctx: null, nodes: null, active: [], lastPlay: new Map(), music: null, musicName: null, musicApi: null };
  const stats = { played: 0, dropped: 0, ignored: 0, byName: {} };
  const unsubs = [];

  function build(ctx) {
    const master = ctx.createGain(), sfx = ctx.createGain(), music = ctx.createGain(), limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
    sfx.connect(master); music.connect(master); master.connect(limiter); limiter.connect(ctx.destination);
    state.ctx = ctx; state.nodes = { master, sfx, music, limiter };
    applyVolumes();
    attachMusic();
  }
  function ensure() {
    if (state.ctx) return state.ctx;
    if (injected) { build(injected); return state.ctx; }
    if (!Ctor) return null;
    try { build(new Ctor()); } catch { return null; }
    return state.ctx;
  }
  function applyVolumes() {
    const n = state.nodes; if (!n) return;
    n.master.gain.value = state.muted ? 0 : vol.master;
    n.sfx.gain.value = vol.sfx; n.music.gain.value = vol.music;
  }
  async function attachMusic() {
    try {
      const mod = musicModule || (await import('./music.js'));
      const f = mod.createMusic || mod.default;
      if (f && state.ctx && !state.musicApi) {
        state.musicApi = f({ ctx: state.ctx, out: state.nodes.music, volume: vol.music });
        if (state.musicName) state.musicApi?.play?.(state.musicName);
      }
    } catch { /* music.js not present (yet): music() just remembers the name */ }
  }

  const api = {
    get muted() { return state.muted; },
    set muted(m) { state.muted = !!m; applyVolumes(); },
    toggleMute() { api.muted = !state.muted; return state.muted; },
    get ctx() { return state.ctx; },
    get currentMusic() { return state.musicName; },
    stats, limits: LIMITS,
    resume() { const c = ensure(); return c && c.resume ? Promise.resolve(c.resume()).catch(() => {}) : Promise.resolve(); },
    setVolume(v = {}) {
      for (const k of ['master', 'sfx', 'music']) if (v[k] !== undefined) vol[k] = clamp01(v[k]);
      applyVolumes(); state.musicApi?.setVolume?.(vol.music);
    },
    getVolume: () => ({ ...vol }),
    play(name, o = {}) {
      if (!SFX.includes(name)) { stats.ignored++; return false; }
      const ctx = ensure();
      if (!ctx || ctx.state === 'closed') { stats.ignored++; return false; }
      const now = ctx.currentTime;
      state.active = state.active.filter((a) => a.end > now);
      const prio = PRIORITY.has(name), same = state.active.filter((a) => a.name === name).length;
      const last = state.lastPlay.get(name);
      if (!prio && ((last !== undefined && now - last < LIMITS.retrigger) || same >= LIMITS.perName || state.active.length >= LIMITS.total)) { stats.dropped++; return false; }
      if (prio && state.active.length >= LIMITS.total + 8) { stats.dropped++; return false; }
      const pitch = VARY.has(name) ? 0.92 + rng() * 0.16 : 1;
      const voices = describe(name, { pitch });
      const pan = typeof o.x === 'number' ? Math.max(-0.7, Math.min(0.7, (o.x - 112) / 112 * 0.7)) : 0;
      const end = schedule(ctx, state.nodes.sfx, voices, now + 0.005, { pan, gain: o.gain ?? 1 });
      state.active.push({ name, end }); state.lastPlay.set(name, now);
      stats.played++; stats.byName[name] = (stats.byName[name] || 0) + 1;
      return true;
    },
    music(name) {
      if (name != null && !MUSIC.includes(name)) return false;
      state.musicName = name ?? null;
      ensure();
      state.musicApi?.[name == null ? 'stop' : 'play']?.(name);
      return true;
    },
    dispose() { unsubs.forEach((u) => u && u()); unsubs.length = 0; },
  };
  if (bus) {
    unsubs.push(bus.on('sfx', (e) => e && api.play(e.name, e)));
    unsubs.push(bus.on('music', (e) => api.music(e ? e.name : null)));
    unsubs.push(bus.on('fuel', (e) => { if (e) state.musicApi?.setUrgent?.(!!e.low); }));   // low fuel = faster music
  }
  if (injected) ensure();
  return api;
}
export { SFX, MUSIC, duration };
