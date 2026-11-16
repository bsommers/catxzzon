// CATXZZON enemy behaviours (owner: sim-enemies). ARCHITECTURE.md §4.
// Pure deterministic sim code: randomness only from g.rng, no DOM, no Math.random.
// Each behaviour: { init(e,g), update(e,dt,g), onHit?(e,dmg,g,src), onDeath?(e,g) }.
// NOTE: sim-core does NOT integrate e.vx/vy/vz for kinds that have an update(), so every update here moves its entity.
//
// Render hints written on entities (read-only for render): e.frame (sprite frame index per defs.ART row),
// e.ang (radians, spin/tumble), e.bank (-2..2, mousejet), e.tele (0..1 turret telegraph), e.armed (pad),
// e.on / e.warn / e.glow (field), e.heat (spud 0..1), e.small (spud child).

import { FIELD_W, FIELD_H, TUNING } from '../core/defs.js';

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const PLAYER_HALF_H = ((TUNING.playerBox && TUNING.playerBox.h) || 8) / 2;

// ---------------- difficulty: tables indexed by round (1, 2, 3, 4+) ----------------
export const DIFF = {
  turret: {
    cool:   [2.9, 2.1, 1.45, 1.15],   // s between bursts
    burst:  [1, 2, 3, 3],             // shots per burst
    gap:    [0.2, 0.17, 0.14, 0.12],  // s between shots in a burst
    tele:   [0.55, 0.4, 0.3, 0.26],   // telegraph before a burst
    speed:  [100, 122, 145, 160],     // cheeseball speed (world units/s)
    lead:   [0, 0.6, 1, 1],           // fraction of the player's lateral/vertical velocity it leads
    spread: [0.12, 0.06, 0.02, 0.02], // random aim error (fraction of speed)
    range:  [280, 320, 350, 360],     // only fires when player is 24..range units in front of it
  },
  pad: {
    arm:    [0.75, 0.5, 0.35, 0.3],   // armed blink before launch
    cans:   [1, 1, 2, 2],             // cans per pad
    reload: [1.2, 1.0, 0.45, 0.4], // gap before the next can of a salvo
  },
  can: {
    boost:  [0.55, 0.45, 0.35, 0.3],  // straight climb before homing
    climb:  [70, 80, 90, 95],         // boost climb speed
    vx:     [28, 45, 66, 76],         // max lateral homing speed
    vz:     [40, 58, 80, 90],         // max vertical homing speed
    acc:    [40, 70, 115, 135],       // turn rate: velocity change units/s^2
    vy:     [0, 10, 24, 30],          // forward drift toward the player
    life:   [3.2, 3.6, 4.2, 4.5],     // homing time before giving up
  },
  field: { on: [0.5, 0.55, 0.6, 0.6] },        // duty cycle of pulsing fields (sim-core default is 0.6)
  jet: {
    t1:     [2.6, 2.2, 1.8, 1.6],     // fly-in time
    t2:     [3.0, 3.4, 4.0, 4.2],     // weave time before peeling off
    hold:   [270, 245, 210, 200],     // how far ahead of the scroll line they hold
    fire:   [4.6, 3.5, 3.2, 3.0],     // mean s between shots per jet
    chance: [0.55, 0.68, 0.72, 0.75],
    speed:  [95, 115, 138, 150],
    lead:   [0, 0.45, 0.65, 0.75],
    spread: [0.1, 0.06, 0.03, 0.02],
  },
  spud: { speed: [0.75, 1, 1.25, 1.4] },
};

/** Difficulty index: round 1 -> 0, 2 -> 1, 3 -> 2, 4+ -> 3. */
export function diffIdx(g) {
  const r = (g && g.round) | 0;
  return r <= 1 ? 0 : r >= 4 ? 3 : r - 1;
}

// ---------------- helpers (module-level, no per-frame closures) ----------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function approach(v, target, step) {
  if (v < target) return v + step > target ? target : v + step;
  return v - step < target ? target : v - step;
}
function solid(g, x, y, z) { return typeof g.solidAt === 'function' && !!g.solidAt(x, y, z); }
function playerAlive(g) { const p = g.player; return !!p && p.alive !== false; }
function move(e, dt) { e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt; }
function wrapAng(a) { a %= TAU; return a < 0 ? a + TAU : a; }
function frame4(a) { return (wrapAng(a) / HALF_PI | 0) & 3; }

const AIM = { vx: 0, vy: 0, vz: 0, t: 0 };   // reused scratch result
/**
 * Velocity for a shot of `speed` from (x,y,z) toward the player's centre. Always compensates the forward scroll
 * (that is the world moving, not the player dodging); leads lateral/vertical motion by `lead` (0..1).
 */
export function aimAt(g, x, y, z, speed, lead, out = AIM) {
  const p = g.player;
  const dx = p.x - x, dy = p.y - y, dz = p.z + PLAYER_HALF_H - z;
  const ux = (p.vx || 0) * lead, uy = g.speed || 0, uz = (p.vz || 0) * lead;
  const a = ux * ux + uy * uy + uz * uz - speed * speed;
  const b = 2 * (dx * ux + dy * uy + dz * uz);
  const c = dx * dx + dy * dy + dz * dz;
  let t = 0;
  if (Math.abs(a) < 1e-6) t = b < 0 ? -c / b : 0;
  else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
      t = t1 > 0 && t2 > 0 ? Math.min(t1, t2) : Math.max(t1, t2, 0);
    }
  }
  const tx = dx + ux * t, ty = dy + uy * t, tz = dz + uz * t;
  const len = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
  out.vx = tx / len * speed; out.vy = ty / len * speed; out.vz = tz / len * speed; out.t = t;
  return out;
}

/** Spawn an aimed cheeseball. */
function fireCheese(g, x, y, z, speed, lead, spread) {
  aimAt(g, x, y, z, speed, lead, AIM);
  const r = g.rng;
  const vx = AIM.vx + speed * spread * r.range(-1, 1);
  const vz = AIM.vz + speed * spread * r.range(-1, 1);
  const life = clamp(AIM.t * 1.6 + 0.8, 1.5, 4);
  return g.spawn('cheeseball', { x, y, z: z - 3, vx, vy: AIM.vy, vz, life });
}

// ---------------- cheeseball (enemy bullet; also used by the boss) ----------------
const cheeseball = {
  init(e) { if (!(e.life > 0)) e.life = 3.5; e.frame = 0; },
  update(e, dt, g) {
    move(e, dt);
    e.frame = (e.t * 10 | 0) & 1;
    if (e.t > e.life || e.z < 0) { e.dead = true; return; }
    if (solid(g, e.x, e.y, e.z + e.h / 2)) { e.dead = true; g.fx('splat', e.x, e.y, e.z + e.h / 2); }
  },
};

// ---------------- turret: stationary rat gunner, telegraphed aimed bursts ----------------
// Aim frames: 0 down-left (-y), 1 down-right (+x), 2 up-left (-x), 3 up-right (+y); 4 muzzle flash; 5 hit.
function aimFrame(dx, dy) {
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? 3 : 0;
  return dx >= 0 ? 1 : 2;
}
const turret = {
  init(e, g) {
    const T = DIFF.turret, k = diffIdx(g), s = e.st;
    s.mode = 0; s.cd = g.rng.range(0.35, 1) * T.cool[k]; s.tt = 0; s.bt = 0; s.shots = 0; s.flash = 0; s.fired = 0;
    e.tele = 0; e.frame = 0;
  },
  update(e, dt, g) {
    const T = DIFF.turret, k = diffIdx(g), s = e.st, p = g.player;
    if (s.flash > 0) s.flash -= dt;
    const ahead = e.y - p.y;
    const inRange = playerAlive(g) && ahead > 24 && ahead < T.range[k];
    if (s.mode === 0) {
      if (s.cd > 0) s.cd -= dt;
      if (s.cd <= 0 && inRange) { s.mode = 1; s.tt = T.tele[k]; }
    } else if (s.mode === 1) {
      s.tt -= dt;
      e.tele = clamp(1 - s.tt / T.tele[k], 0, 1);
      if (!inRange) { s.mode = 0; s.cd = 0.3; e.tele = 0; }
      else if (s.tt <= 0) { s.mode = 2; s.shots = T.burst[k]; s.bt = 0; e.tele = 1; }
    } else {
      s.bt -= dt;
      if (s.bt <= 0) {
        fireCheese(g, e.x, e.y - e.d / 2, e.z + e.h * 0.75, T.speed[k], T.lead[k], T.spread[k]);
        g.sfx('turret_fire', e);
        s.fired++; s.flash = 0.08; s.bt = T.gap[k];
        if (--s.shots <= 0) { s.mode = 0; s.cd = T.cool[k]; e.tele = 0; }
      }
    }
    const blink = s.mode === 1 && ((s.tt * 12) | 0) & 1;
    e.frame = e.hitT > 0 ? 5 : s.flash > 0 || blink ? 4 : aimFrame(p.x - e.x, p.y - e.y);
  },
};

// ---------------- pad: silo arms when the player is within `trigger` and launches spray-cheese cans ----------------
// Frames: 0 closed, 1 armed (blink), 2 opening/spent.
const pad = {
  init(e) {
    const s = e.st;
    s.state = 0; s.tt = 0; s.launched = 0;
    if (!(e.trigger > 0)) e.trigger = 170;
    e.armed = false; e.frame = 0;
  },
  update(e, dt, g) {
    const P = DIFF.pad, k = diffIdx(g), s = e.st, p = g.player;
    const ahead = e.y - p.y;
    const inTrig = playerAlive(g) && ahead > 0 && ahead <= e.trigger;
    if (s.state === 0) {                       // closed, waiting
      e.frame = 0;
      if (inTrig) { s.state = 1; s.tt = P.arm[k]; e.armed = true; g.sfx('warning', e); }
    } else if (s.state === 1) {                // armed, blinking
      s.tt -= dt;
      e.frame = ((s.tt * 10) | 0) & 1 ? 1 : 0;
      if (s.tt <= 0) {
        g.spawn('can', { x: e.x, y: e.y, z: e.z + 2, vz: DIFF.can.climb[k] * 0.6 });
        g.sfx('can_launch', e);
        g.fx('smoke', e.x, e.y, e.z + e.h);
        s.launched++; e.armed = false; e.frame = 2;
        if (s.launched < P.cans[k]) { s.state = 3; s.tt = P.reload[k]; } else s.state = 2;
      }
    } else if (s.state === 3) {                // reloading
      s.tt -= dt;
      e.frame = s.tt > P.reload[k] * 0.5 ? 2 : 0;
      if (s.tt <= 0) {
        if (playerAlive(g) && ahead > 24) { s.state = 1; s.tt = 0; } else s.state = 2;   // fire next can of the salvo
      }
    } else e.frame = 2;                         // spent
  },
};

// ---------------- can: spray-cheese rocket, climbs then homes on x/z with limited turn rate ----------------
const can = {
  init(e, g) {
    const s = e.st;
    s.done = false; s.hiss = 0.3; s.boost = DIFF.can.boost[diffIdx(g)];
    if (!(e.vz > 0)) e.vz = 40;
    e.frame = 0;
  },
  update(e, dt, g) {
    const C = DIFF.can, k = diffIdx(g), s = e.st, p = g.player;
    if (!s.done && (e.t > C.life[k] + s.boost || e.y < p.y - 6 || !playerAlive(g))) s.done = true;
    if (s.done) {                              // give up: climb away (engine despawns at z>320)
      e.vz = approach(e.vz, 130, 180 * dt);
      e.vx = approach(e.vx, 0, 40 * dt);
    } else if (e.t < s.boost) {                // boost straight up
      e.vz = approach(e.vz, C.climb[k], 260 * dt);
    } else {                                   // home: steer velocity toward the player's x / altitude, turn-rate limited
      const step = C.acc[k] * dt;
      const tvx = clamp((p.x - e.x) * 2, -C.vx[k], C.vx[k]);
      const tvz = clamp((p.z + PLAYER_HALF_H - (e.z + e.h / 2)) * 2, -C.vz[k], C.vz[k]);
      e.vx = approach(e.vx, tvx, step);
      e.vz = approach(e.vz, tvz, step);
      e.vy = approach(e.vy, -C.vy[k], step);
    }
    move(e, dt);
    if (e.z < 0) { e.z = 0; if (e.vz < 0) e.vz = 0; }
    e.frame = (e.t * 12 | 0) & 3;
    if ((s.hiss -= dt) <= 0) { s.hiss = 0.55; g.sfx('can_hiss', e); }
    if (e.t > 0.3 && solid(g, e.x, e.y, e.z + e.h / 2)) g.kill(e, null);
  },
};

// ---------------- field: spray-cheese barrier; static or pulsing (props.pulse period, props.phase) ----------------
const FIELD_WARN = 0.35;   // s of flicker before a pulsing field switches on
const field = {
  init(e) {
    if (e.on === undefined) e.on = true;
    e.st.prev = e.on; e.warn = false; e.glow = e.on ? 1 : 0; e.frame = e.on ? 1 : 0;
  },
  update(e, dt, g) {
    const s = e.st;
    move(e, dt);
    if (e.pulse > 0) {
      const per = e.pulse, onF = DIFF.field.on[diffIdx(g)];
      const ph = (((e.t + (e.phase || 0)) % per) + per) % per / per;
      e.on = ph < onF;
      e.warn = !e.on && ph > 1 - Math.min(FIELD_WARN / per, (1 - onF) * 0.5);
    } else e.warn = false;
    if (e.on && !s.prev && g.player && Math.abs(e.y - g.player.y) < 300) g.sfx('field_zap', e);
    s.prev = e.on;
    e.glow = e.on ? 0.8 + 0.2 * Math.sin(e.t * 18) : e.warn ? (((e.t * 16) | 0) & 1) * 0.5 : 0;
    e.frame = e.on || (e.warn && e.glow > 0) ? 1 : 0;
  },
};

// ---------------- tuna: stationary fuel tin (flash highlight) ----------------
const tuna = {
  init(e) { e.frame = 0; },
  update(e, dt) {
    move(e, dt);
    e.frame = (e.t % 1.4) < 0.18 ? 1 : 0;
  },
};

// ---------------- radar: spinning cheese-wheel dish, bonus target ----------------
const radar = {
  init(e, g) {
    e.st.spin = e.spin > 0 ? e.spin : [2.2, 2.8, 3.4, 3.8][diffIdx(g)];
    e.st.byP = false;
    e.ang = g.rng.range(0, TAU); e.frame = frame4(e.ang);
  },
  update(e, dt) {
    move(e, dt);
    e.ang = wrapAng(e.ang + e.st.spin * dt);
    e.frame = frame4(e.ang);
  },
  onHit(e, dmg, g, src) { if (src && src.team === 'p') e.st.byP = true; },
  onDeath(e, g) { if (e.st.byP) g.popup('DISH-ABLED!', e.x, e.y, e.z + e.h + 24, '#ff9a2e'); },
};

// ---------------- formation -> mousejets ----------------
export const PATTERNS = ['vee', 'line', 'swoop', 'ring', 'zig'];
const CHAINED = { swoop: 1, zig: 1 };        // patterns where jets follow each other along one path

const formation = {
  init(e, g) {
    const r = g.rng;
    const n = clamp((e.n | 0) || 5, 1, 12);
    const pat = PATTERNS.indexOf(e.pattern) >= 0 ? e.pattern : 'vee';
    const side = e.side === 1 || e.side === -1 ? e.side : (r.chance(0.5) ? 1 : -1);
    const cx = e.x > 0 ? clamp(e.x, 48, FIELD_W - 48) : FIELD_W / 2;
    const cz = e.z > 0 ? clamp(e.z, 24, FIELD_H - 30) : r.range(28, 84);
    const rel0 = clamp(e.y - (g.scrollY || 0), 360, 560);
    for (let i = 0; i < n; i++) {
      g.spawn('mousejet', { x: cx, y: (g.scrollY || 0) + rel0, z: cz,
        fpat: pat, fi: i, fn: n, fcx: cx, fcz: cz, fside: side, frel: rel0 });
    }
    e.dead = true;                              // the formation marker itself is done
  },
  update(e) { e.dead = true; },
};

function tri(t) { const f = t - Math.floor(t); return f < 0.5 ? f * 4 - 1 : 3 - f * 4; }   // -1..1 triangle wave

/** Place a mousejet along its formation path (scroll-relative). */
function placeJet(e, g) {
  const s = e.st, i = s.i, tau = e.t - s.delay;
  const c = i - (s.n - 1) / 2;
  let ox = 0, oy = 0, oz = 0;
  switch (s.pat) {
    case 'vee':  ox = c * 20; oy = Math.abs(c) * 22; oz = 3 * Math.sin(tau * 2 + i); break;
    case 'line': ox = c * 20; oz = 6 * Math.sin(tau * 2.2 + i * 0.8); break;
    case 'ring': { const a = TAU * i / s.n + tau * 1.7; ox = 42 * Math.cos(a); oz = 24 * Math.sin(a); break; }
    case 'swoop': ox = s.side * 70 * Math.sin(tau * 1.1); oz = 18 * Math.sin(tau * 1.6); break;
    default:     ox = 80 * tri(tau * 0.35 + 0.25) * s.side; break;   // zig
  }
  const u = clamp(tau / s.t1, 0, 1), k = 1 - (1 - u) * (1 - u);
  let x = s.cx + ox * k + s.side * 120 * (1 - k);   // slide in from off-field on `side`
  let ry = tau < 0 ? s.rel0 - tau * 40 :   // queued jets wait a little further ahead (stay < despawn line)
    s.rel0 - (s.rel0 - s.hold) * k;
  let z = s.cz + oz;
  ry += oy + 6 * Math.sin(tau * 1.3 + i);
  const tp = tau - s.t1 - s.t2;
  if (tp > 0) {                                 // peel off: bank out to a side, slide back past the player, climb
    if (!s.peeled) {
      s.peeled = true;
      s.pdir = (x >= FIELD_W / 2 ? 1 : -1) * (s.pat === 'ring' && i & 1 ? -1 : 1);
      if (i === 0) g.sfx('jet_swoosh', e);
    }
    x += s.pdir * (30 * tp + 70 * tp * tp);
    ry -= 70 * tp + 30 * tp * tp;
    z += 25 * tp;
  }
  e.x = x; e.y = (g.scrollY || 0) + ry; e.z = z < 4 ? 4 : z;
}

const mousejet = {
  init(e, g) {
    const J = DIFF.jet, k = diffIdx(g), s = e.st, r = g.rng;
    s.pat = PATTERNS.indexOf(e.fpat) >= 0 ? e.fpat : 'swoop';
    s.i = e.fi | 0; s.n = e.fn > 0 ? e.fn : 1;
    s.cx = e.fcx !== undefined ? e.fcx : clamp(e.x || FIELD_W / 2, 48, FIELD_W - 48);
    s.cz = e.fcz !== undefined ? e.fcz : (e.z > 0 ? e.z : 50);
    s.side = e.fside === 1 || e.fside === -1 ? e.fside : (s.cx >= FIELD_W / 2 ? 1 : -1);
    s.rel0 = e.frel !== undefined ? e.frel : clamp(e.y - (g.scrollY || 0), 300, 560);
    s.t1 = J.t1[k]; s.t2 = J.t2[k]; s.hold = Math.min(J.hold[k], s.rel0 - 40);
    s.delay = CHAINED[s.pat] ? s.i * 0.32 : 0;
    s.fire = s.delay + s.t1 * 0.6 + r.range(0.3, 1.1) * J.fire[k];
    s.peeled = false; s.pdir = 1;
    s.lx = 0; s.ly = 0; s.lz = 0;
    placeJet(e, g);
    s.lx = e.x; s.ly = e.y; s.lz = e.z;
    e.bank = 0; e.frame = 2;
  },
  update(e, dt, g) {
    const J = DIFF.jet, k = diffIdx(g), s = e.st;
    placeJet(e, g);
    if (dt > 0) { e.vx = (e.x - s.lx) / dt; e.vy = (e.y - s.ly) / dt; e.vz = (e.z - s.lz) / dt; }
    s.lx = e.x; s.ly = e.y; s.lz = e.z;
    e.bank = approach(e.bank || 0, clamp(e.vx / 45, -2, 2), 8 * dt);
    e.frame = clamp(Math.round(e.bank) + 2, 0, 4);
    if ((s.fire -= dt) <= 0) {
      s.fire = J.fire[k] * g.rng.range(0.7, 1.3);
      const p = g.player;
      if (playerAlive(g) && !s.peeled && e.t > s.delay && e.y - p.y > 120 && g.rng.chance(J.chance[k])) {
        fireCheese(g, e.x, e.y - e.d / 2, e.z + e.h / 2, J.speed[k], J.lead[k], J.spread[k]);
        g.sfx('turret_fire', e);
      }
    }
  },
};

// ---------------- spud: hot potato, drifts and tumbles, splits into two small spuds ----------------
const SMALL = 10;
const spud = {
  init(e, g) {
    const r = g.rng, sc = DIFF.spud.speed[diffIdx(g)], s = e.st;
    if (e.small) { e.w = e.d = e.h = SMALL; }
    if (e.vx === 0) e.vx = r.range(-18, 18) * sc;   // spawn prop vx? overrides (0 = random)
    if (e.vy === 0) e.vy = -r.range(8, 26) * sc;    // drifts toward the player
    if (e.vz === 0) e.vz = r.range(-10, 10) * sc;
    if (!(e.z > 0)) e.z = r.range(16, 96);
    s.spin = r.range(2, 5) * (r.chance(0.5) ? 1 : -1) * (e.small ? 1.6 : 1);
    s.ph = r.range(0, TAU);
    e.ang = r.range(0, TAU); e.frame = frame4(e.ang); e.heat = 0.5;
  },
  update(e, dt) {
    move(e, dt);
    const hw = e.w / 2;
    if (e.x < TUNING.xMin + hw && e.vx < 0) { e.x = TUNING.xMin + hw; e.vx = -e.vx; }
    else if (e.x > TUNING.xMax - hw && e.vx > 0) { e.x = TUNING.xMax - hw; e.vx = -e.vx; }
    if (e.z < 4 && e.vz < 0) { e.z = 4; e.vz = -e.vz; }
    else if (e.z > FIELD_H - e.h && e.vz > 0) { e.z = FIELD_H - e.h; e.vz = -e.vz; }
    e.ang = wrapAng(e.ang + e.st.spin * dt);
    e.frame = frame4(e.ang);
    e.heat = 0.5 + 0.5 * Math.sin(e.t * 6 + e.st.ph);
  },
  onDeath(e, g) {
    if (e.small) return;
    g.fx('spud_burst', e.x, e.y, e.z + e.h / 2);
    const r = g.rng;
    for (let k = -1; k <= 1; k += 2) {
      g.spawn('spud', { x: clamp(e.x + k * 6, TUNING.xMin + 6, TUNING.xMax - 6), y: e.y, z: e.z + 3, small: true,
        w: SMALL, d: SMALL, h: SMALL, hp: 1, score: 40,
        vx: k * r.range(30, 45) + e.vx * 0.5, vy: e.vy || -10, vz: r.range(-15, 25) || 1 });
    }
  },
};

// ---------------- pickups: bob and rotate ----------------
const pickup = {
  init(e) { e.st.z0 = e.z > 0 ? e.z : 14; e.ang = 0; e.frame = 0; },
  update(e, dt) {
    e.x += e.vx * dt; e.y += e.vy * dt; e.st.z0 += e.vz * dt;
    e.z = e.st.z0 + 4 * Math.sin(e.t * 3.2);
    e.ang = wrapAng(e.t * 2.5);
    e.frame = (e.t * 8 | 0) & 3;
  },
};

export const BEHAVIORS = {
  cheeseball, turret, pad, can, field, tuna, radar, formation, mousejet, spud,
  nip: pickup, yarnpick: pickup, laserpick: pickup,
};
export default BEHAVIORS;
