// CATXZZON entry: loading -> title(attract) -> play -> pause/options -> gameover(initials) -> title. Every module is optional.
import { drawText } from './ui/font.js';
import { createBus } from './core/events.js';
import { createInput } from './core/input.js';
import { loadSettings, saveSettings, loadHi, saveHi, hiRank, insertHi, topScore } from './core/settings.js';
import { createMenu, optionsItems, pauseItems, titleItems, drawMenu, drawPanel } from './ui/menus.js';
import * as S from './ui/screens.js';

const W = 640, H = 360, STEP = 1 / 60;
const q = new URLSearchParams(location.search);
const num = (k, d) => { const v = Number(q.get(k)); return q.has(k) && isFinite(v) ? v : d; };
const canvas = document.getElementById('game');
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const bus = createBus();
const settings = loadSettings();
let hiList = loadHi();
const input = createInput({ canvas });
const M = { mode: 'loading', t: 0, modeT: 0, loadP: 0, err: null };   // M.mode is the screen state machine
let game = null, attract = null, mods = {}, renderer = null, audio = null, popups = null, hud = null;
let menu = null, optReturn = 'title', initials = null, rank = -1, gameOverScore = 0, creditsT = 0, botOn = q.get('bot') === '1';
let acc = 0, last = 0, fps = 60, frames = 0, fpsT = 0;

async function tryImport(path) { try { return await import(path); } catch (e) { console.warn('[catxzzon] optional module missing:', path, e && e.message); return null; } }
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function setMode(m) { M.mode = m; M.modeT = 0; input.flush(); }
function applySettings() {
  input.setInvert(settings.invert); input.setAutofire(settings.autofire);
  try { audio?.setVolume?.({ master: settings.master, sfx: settings.sfx, music: settings.music }); if (audio) audio.muted = settings.mute; } catch (e) { console.warn(e); }
  try { renderer?.setCRT?.(settings.crt); } catch (e) { console.warn(e); }
  saveSettings(settings);
}
const music = (name) => bus.emit('music', { name });

// ---- autopilot adapter: accepts several plausible shapes of src/sim/autopilot.js, else a scripted weave ----
let bot = null;
function makeBot(g) {
  const ap = mods.autopilot;
  try {
    if (ap) {
      const f = ap.createAutopilot || ap.createBot || ap.default;
      if (typeof f === 'function') { const b = f(g); if (b && typeof b === 'object') return (gg, dt) => (b.input || b.step || b.update || b.think).call(b, gg, dt); if (typeof b === 'function') return b; }
      if (typeof ap.autopilot === 'function') return (gg, dt) => ap.autopilot(gg, dt);
      if (typeof ap.think === 'function') return (gg, dt) => ap.think(gg, dt);
    }
  } catch (e) { console.warn('[catxzzon] autopilot unusable, using weave', e); }
  return (gg) => ({ dx: Math.sin(gg.t * 0.9) * 0.9, dz: Math.sin(gg.t * 0.5 + 1) * 0.6, fire: true, bomb: false });
}
function botInput(g, dt) {
  if (!bot) bot = makeBot(g);
  let r; try { r = bot(g, dt); } catch { bot = (gg) => ({ dx: Math.sin(gg.t), dz: 0, fire: true, bomb: false }); r = bot(g, dt); }
  r = r || {}; return { dx: +r.dx || 0, dz: +r.dz || 0, fire: !!r.fire, bomb: !!r.bomb, pause: false };
}

// ---- game lifecycle ----
function quietBus() { return { on: bus.on.bind(bus), emit: (t, p) => { if (t !== 'sfx' && t !== 'music') bus.emit(t, p); } }; }
function newGame(o = {}) {
  const create = mods.game?.createGame; if (!create) return null;
  return create({ seed: o.seed ?? num('seed', (Date.now() & 0xffff) || 1), bus: o.bus || bus, round: o.round ?? num('round', 1),
    stageIdx: o.stage ?? num('stage', 0), startStage: o.stage ?? num('stage', 0), buildStage: mods.levels?.buildStage, hiscore: topScore(hiList) });
}
function startAttract() {
  bot = null; attract = newGame({ bus: quietBus(), seed: 7 + (Date.now() % 50), stage: 0, round: 1 });
}
function toTitle() {
  game = null; bot = null; startAttract(); menu = createMenu(titleItems()); setMode('title'); music('title');
}
function startGame() {
  attract = null; bot = null; game = newGame(); hud?.reset?.(); setMode('play'); window.__catxzzon.game = game;
  if (!game) fail(new Error('simulation module (src/sim/game.js) failed to load'));
}
function openOptions(ret) {
  optReturn = ret; menu = createMenu(optionsItems(settings, applySettings)); setMode('options');
}
function fail(err) { console.error(err); M.err = err; setMode('error'); }

function handleMode(dt) {
  const ev = input.menu();
  if (ev.mute) { settings.mute = !settings.mute; applySettings(); }
  if (ev.crt) { settings.crt = !settings.crt; applySettings(); }
  switch (M.mode) {
    case 'title': {
      const r = menu.handle(ev);
      if (r === 'start') startGame(); else if (r === 'options') openOptions('title'); else if (r === 'credits') { creditsT = 0; setMode('credits'); music('victory'); }
      break;
    }
    case 'credits': if (ev.back || (ev.select && M.modeT > 0.5)) toTitle(); break;
    case 'options': { const r = menu.handle(ev); if (r === 'back') { if (optReturn === 'pause') { menu = createMenu(pauseItems()); setMode('pause'); } else toTitle(); } break; }
    case 'pause': {
      const r = menu.handle(ev);
      if (r === 'resume' || r === 'back') { setMode('play'); bus.emit('pause', { on: false }); }
      else if (r === 'options') openOptions('pause');
      else if (r === 'quit') { bus.emit('pause', { on: false }); toTitle(); }
      break;
    }
    case 'gameover': {
      if (initials) { initials.handle(ev); if (initials.done) { hiList = insertHi(hiList, initials.name, gameOverScore); saveHi(hiList); initials = null; M.modeT = 0; } }
      else if (ev.select && M.modeT > 1) toTitle();
      break;
    }
    case 'error': if (ev.select || ev.fire) location.reload(); break;
  }
}

function simStep(inp) {
  game.update(STEP, inp);
  popups?.update?.(STEP);
  if (game.state === 'gameover' && !M.over) { M.over = true; M.overT = 0; }
  M.overT = (M.overT || 0) + (M.over ? STEP : 0);
  if (M.over && M.overT > 1.6) {
    M.over = false; gameOverScore = game.score | 0; rank = hiRank(hiList, gameOverScore);
    initials = rank >= 0 ? S.createInitials('AAA') : null; setMode('gameover'); bus.emit('gameover', { score: gameOverScore });
  }
}

let audioReady = false;
function firstGesture() { if (audioReady) return; audioReady = true; try { audio?.resume?.(); } catch { /* ignore */ } }

function frame(now) {
  requestAnimationFrame(frame);
  try {
    const dt = Math.min(0.25, Math.max(0, (now - (last || now)) / 1000)); last = now;
    M.t += dt; M.modeT += dt; frames++; fpsT += dt; if (fpsT >= 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
    if (M.mode === 'loading') { S.drawLoading(ctx, M.loadP, M.t); return; }
    if (M.mode === 'play') {
      const pad = input.poll();
      if (pad.pause) { menu = createMenu(pauseItems()); setMode('pause'); bus.emit('pause', { on: true }); }
      else if (game) {
        acc = Math.min(acc + dt, 0.1);
        let first = true;
        while (acc >= STEP) { const base = botOn ? botInput(game, STEP) : pad; simStep({ ...base, bomb: first ? base.bomb : false, pause: false }); first = false; acc -= STEP; }
      }
    } else if (M.mode === 'pause' || M.mode === 'options' && optReturn === 'pause') { input.poll(); handleMode(dt); }
    else {
      input.poll(); handleMode(dt);
      if (attract && (M.mode === 'title' || M.mode === 'options' || M.mode === 'credits')) {
        acc = Math.min(acc + dt, 0.1);
        while (acc >= STEP) { attract.update(STEP, botInput(attract, STEP)); popups?.update?.(STEP); acc -= STEP; }
        if (attract.state === 'gameover' || attract.t > 45) startAttract();
      }
    }
    draw(acc / STEP);
  } catch (e) { if (M.mode !== 'error') fail(e); try { draw(0); } catch { /* ignore */ } }
}

function drawWorld(g, alpha) {
  if (renderer) { renderer.draw(g, alpha); if (popups && !renderer.drawsPopups) popups.draw(ctx, g.scrollY); return; }
  // fallback: no renderer -> flat backdrop + hud
  ctx.fillStyle = '#140a24'; ctx.fillRect(0, 0, W, H);
  if (g) { drawText(ctx, `NO RENDERER  Y ${Math.round(g.scrollY)}  ENTS ${g.ents.length}`, 8, H - 12, { color: '#9a8a70' }); popups?.draw?.(ctx, g.scrollY); if (g === game) hud?.drawHud?.(ctx, g, M.t); }
}
function draw(alpha) {
  const g = M.mode === 'play' || M.mode === 'pause' || (M.mode === 'options' && optReturn === 'pause') || M.mode === 'gameover' ? game : attract;
  const t = M.t;
  switch (M.mode) {
    case 'title': case 'credits': case 'options':
      if (g) drawWorld(g, alpha); else { ctx.fillStyle = '#140a24'; ctx.fillRect(0, 0, W, H); }
      if (M.mode === 'credits') { if (S.drawCredits(ctx, M.modeT, { backdropOn: false }) && M.modeT > 4) toTitle(); break; }
      if (M.mode === 'options') { S.drawPauseDim(ctx); drawPanel(ctx, W / 2 - 130, 70, 260, 210); drawMenu(ctx, menu, W / 2, 84, t, { width: 220 }); break; }
      { const cyc = M.modeT % 22;
        if (cyc > 16) { S.drawPauseDim(ctx); S.drawHiTable(ctx, hiList, t, { y: 80 }); }
        else { S.drawTitle(ctx, t, { hi: topScore(hiList), showBackdrop: !g, pressFire: false }); drawText(ctx, 'PRESS FIRE', W / 2, 172, { align: 'center', scale: 2, color: Math.floor(t * 2.4) % 2 ? '#fff' : '#ffd21f' }); drawMenu(ctx, menu, W / 2, 208, t, { width: 120 }); } }
      break;
    case 'play': if (game) { drawWorld(game, alpha); if (game.state === 'victory') S.drawVictory(ctx, t, game.round); } input.drawTouch(ctx, W, H); break;
    case 'pause': drawWorld(game, 0); S.drawPauseDim(ctx); drawPanel(ctx, W / 2 - 110, 110, 220, 120); drawText(ctx, 'PAUSED', W / 2, 122, { align: 'center', scale: 2, color: '#ffd21f' }); drawMenu(ctx, menu, W / 2, 156, t, { width: 150 }); break;
    case 'gameover': S.drawGameOver(ctx, t, { score: gameOverScore, rank, initials, hiList, age: M.modeT }); break;
    case 'error': S.drawError(ctx, M.err, t); break;
  }
  if (q.get('debug') === '1') drawText(ctx, `FPS ${fps.toFixed(0)} ENTS ${(game || attract)?.ents?.length ?? 0} ${M.mode}`, 4, 4, { color: '#0f0' });
}

async function boot() {
  window.__catxzzon = { M, settings, bus, input, get game() { return game; }, set game(v) { game = v; } };
  window.addEventListener('error', (e) => fail(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => fail(e.reason));
  for (const ev of ['keydown', 'pointerdown', 'touchstart']) window.addEventListener(ev, firstGesture, { once: false, passive: true });
  requestAnimationFrame(frame);
  const steps = [
    ['game', './sim/game.js'], ['levels', './levels/index.js'], ['autopilot', './sim/autopilot.js'], ['hud', './ui/hud.js'],
    ['audio', './audio/audio.js'], ['registry', './art/registry.js'], ['renderer', './render/renderer.js'],
  ];
  for (let i = 0; i < steps.length; i++) { mods[steps[i][0]] = await tryImport(steps[i][1]); M.loadP = (i + 1) / (steps.length + 1); await nextFrame(); }
  hud = mods.hud;
  try { popups = hud?.createPopups?.(bus) || null; } catch (e) { console.warn(e); }
  try { audio = mods.audio?.createAudio?.({ bus }) || null; } catch (e) { console.warn('[catxzzon] audio failed', e); }
  try {
    const art = mods.registry?.buildAll?.();
    renderer = mods.renderer?.createRenderer?.(canvas, { bus, art }) || null;
  } catch (e) { console.warn('[catxzzon] renderer failed', e); renderer = null; }
  applySettings(); M.loadP = 1; await nextFrame();
  if (q.get('autostart') === '1' || q.has('stage')) startGame(); else toTitle();
}
boot().catch(fail);
