// Autopilot (qa-bot): plans a path through wall gaps, dodges fields/cans/cheeseballs, shoots, refuels, bombs the boss.
// Pure and Node-safe; reads game state only. Never touches g.rng (own deterministic PRNG).
//   const ap = createAutopilot(game, { skill: 0..1 });  ap.input(game, dt) -> { dx, dz, fire, bomb }
import { CELL, FIELD_W, TUNING, FIELD_CELLS_X, FIELD_CELLS_Z } from '../core/defs.js';

const PB = TUNING.playerBox;
const SEEK = [9, 9];      // sentinel: proportional move straight at the target (lands exactly, no overshoot)
const MOVES = [SEEK, [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const HAZ_RANGE_Y = 260;          // hazards further ahead than this are ignored
const BOMB_COOLDOWN = 1.3;
const DT = 1 / 60;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Is a pulsing/static field on `t` seconds from now? */
function fieldOnAt(e, t) {
  if (!(e.pulse > 0)) return e.on !== false;
  const per = e.pulse, onF = e.onFrac ?? 0.55;
  const ph = ((((e.t + t + (e.phase || 0)) % per) + per) % per) / per;
  return ph < onF + 0.05;          // pessimistic
}

/** Target for a player at forward position y: first chain row whose far edge the player's rear has not left yet. */
function targetAt(tgt, y) {
  const ch = tgt.chain;
  if (!ch) return tgt;
  for (let i = 0; i < ch.length; i++) if (y < ch[i].y) return ch[i];
  return ch[ch.length - 1];
}

export function createAutopilot(game, opts = {}) {
  const skill = clamp(opts.skill ?? 1, 0, 1);
  const rnd = mulberry(((game && game.seed) | 0) ^ 0x9e3779b9 ^ Math.round(skill * 1000));
  const unfair = new Set();                // wall rows (cy) where no physically reachable path existed
  const rowCache = new Map(); let cacheStage = null;
  const prev = new Map();                 // ent id -> [x,y,z] last tick (for velocity)
  let lastT = -1, lastScroll = 0, scrollV = TUNING.baseSpeed;
  let planCache = null, lastMove = MOVES[0], hold = { dx: 0, dz: 0 }, holdN = 0, bombCd = 0, lastTarget = null;
  const reactEvery = 1 + Math.round((1 - skill) * 9);
  const horizon = 0.3 + 0.45 * skill;
  const margin = 1.5 + 2.5 * skill;
  const planEvery = skill >= 0.95 ? 3 : 2;
  const rowsLook = 1 + Math.round(skill * 5);

  // ---------- planning through wall gaps ----------
  // Fine (x,z) lattice per blocked row; backward boolean DP (feasible = free here AND reachable-to a feasible cell in the next row,
  // via separable box dilation), then a forward greedy walk picks the least-effort feasible chain from the player's position.
  const SX = 4, SZ = 4, NXS = Math.floor((TUNING.xMax - TUNING.xMin) / SX) + 1, NZS = Math.floor((TUNING.zMax - TUNING.zMin) / SZ) + 1;
  const xOf = (i) => TUNING.xMin + i * SX, zOf = (j) => TUNING.zMin + j * SZ;

  function rowFree(g, cy, fields) {
    const out = new Uint8Array(NXS * NZS);
    const rc = g.grid.rows(cy);
    const blk = new Uint8Array(FIELD_CELLS_X * 16);
    for (let i = 0; i < rc.length; i++) { const c = rc[i]; if (c.cx >= 0 && c.cx < FIELD_CELLS_X && c.cz >= 0 && c.cz < 16) blk[c.cx * 16 + c.cz] = 1; }
    for (let i = 0; i < NXS; i++) {
      const x = xOf(i), cx0 = Math.floor((x - PB.w / 2 + 0.9) / CELL), cx1 = Math.floor((x + PB.w / 2 - 0.9) / CELL);
      for (let j = 0; j < NZS; j++) {
        const z = zOf(j), cz0 = Math.floor((z + 0.9) / CELL), cz1 = Math.floor((z + PB.h - 0.9) / CELL);
        let ok = 1;
        for (let cx = cx0; ok && cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) if (cx >= 0 && cx < FIELD_CELLS_X && blk[cx * 16 + cz]) { ok = 0; break; }
        if (ok && fields) for (const f of fields) {
          if (Math.abs(x - f.x) * 2 < PB.w + f.w + 1 && z - 0.5 < f.z + f.h && f.z - 0.5 < z + PB.h) { ok = 0; break; }
        }
        out[i * NZS + j] = ok;
      }
    }
    return out;
  }
  /** D[i][j] = 1 if any set cell of `m` lies within +-wx,+-wz lattice steps. */
  function dilate(m, wx, wz) {
    const tmp = new Uint8Array(NXS * NZS), out = new Uint8Array(NXS * NZS);
    for (let j = 0; j < NZS; j++) {           // along x
      let acc = 0; const pre = new Int32Array(NXS + 1);
      for (let i = 0; i < NXS; i++) { acc += m[i * NZS + j]; pre[i + 1] = acc; }
      for (let i = 0; i < NXS; i++) tmp[i * NZS + j] = pre[Math.min(NXS, i + wx + 1)] - pre[Math.max(0, i - wx)] > 0 ? 1 : 0;
    }
    for (let i = 0; i < NXS; i++) {           // along z
      let acc = 0; const pre = new Int32Array(NZS + 1);
      for (let j = 0; j < NZS; j++) { acc += tmp[i * NZS + j]; pre[j + 1] = acc; }
      for (let j = 0; j < NZS; j++) out[i * NZS + j] = pre[Math.min(NZS, j + wz + 1)] - pre[Math.max(0, j - wz)] > 0 ? 1 : 0;
    }
    return out;
  }

  function planGap(g, p) {
    const gr = g.grid;
    if (cacheStage !== gr) { rowCache.clear(); cacheStage = gr; }
    const fieldsByRow = new Map();
    for (const e of g.ents) {
      if (e.dead || e.kind !== 'field' || e.pulse > 0 || e.on === false) continue;
      if (e.y < p.y - 20 || e.y > p.y + 420) continue;
      const cy = Math.floor(e.y / CELL);
      if (!fieldsByRow.has(cy)) fieldsByRow.set(cy, []);
      fieldsByRow.get(cy).push(e);
    }
    const cyStart = Math.floor((p.y - PB.d / 2) / CELL);
    const rows = [];
    for (let cy = cyStart; cy <= cyStart + 28 && rows.length < rowsLook + 2; cy++) {
      if (gr.rows(cy).length === 0 && !fieldsByRow.has(cy)) continue;
      const fl = fieldsByRow.get(cy);
      const key = cy + ':' + (fl ? fl.map((f) => f.id).join(',') : '');
      let free = rowCache.get(key);
      if (!free) { free = rowFree(g, cy, fl); rowCache.set(key, free); if (rowCache.size > 200) rowCache.delete(rowCache.keys().next().value); }
      rows.push({ cy, free });
    }
    if (!rows.length) return null;
    const spd = Math.max(scrollV, 30);
    // lattice reach window between row i and i+1 (centre to centre; the body is only inside a row for a short time)
    const win = (t, slack) => [Math.floor(TUNING.moveX * t * slack / SX), Math.floor(TUNING.moveZ * t * slack / SZ)];
    const D = PB.d - 1.8, IN_T = (CELL + D) / spd;                      // time the body takes to cross one row
    const solve = (K, slack) => {
      // E[i]: feasible positions when the nose enters row i; X[i]: when the tail leaves it (free in row i, reachable on to the next row)
      const E = new Array(K), X = new Array(K);
      const and = (f, d) => { const o = new Uint8Array(NXS * NZS); for (let q = 0; q < o.length; q++) o[q] = f[q] & d[q]; return o; };
      const [iwx, iwz] = win(IN_T, slack);
      for (let i = K - 1; i >= 0; i--) {
        if (i === K - 1) X[i] = rows[i].free;
        else { const [wx, wz] = win(Math.max(0, (rows[i + 1].cy - rows[i].cy) * CELL - CELL - D) / spd, slack); X[i] = and(rows[i].free, dilate(E[i + 1], wx, wz)); }
        E[i] = and(rows[i].free, dilate(X[i], iwx, iwz));
      }
      const chain = [];
      let cx = p.x, cz = p.z;
      const pick = (set, wx, wz) => {
        const ax = (wx + 1) * SX, az = (wz + 1) * SZ;
        let best = -1, bv = 1e9;
        for (let a = 0; a < NXS; a++) {
          const x = xOf(a); if (Math.abs(x - cx) > ax) continue;
          for (let b = 0; b < NZS; b++) {
            if (!set[a * NZS + b]) continue;
            const z = zOf(b); if (Math.abs(z - cz) > az) continue;
            const v = Math.abs(x - cx) / TUNING.moveX + Math.abs(z - cz) / TUNING.moveZ;
            if (v < bv) { bv = v; best = a * NZS + b; }
          }
        }
        if (best < 0) return false;
        cx = xOf((best / NZS) | 0); cz = zOf(best % NZS);
        return true;
      };
      for (let i = 0; i < K; i++) {
        const yIn = rows[i].cy * CELL - D / 2, yOut = (rows[i].cy + 1) * CELL + D / 2;
        const tIn = i === 0 ? Math.max(0, yIn - p.y) / spd : Math.max(0, yIn - ((rows[i - 1].cy + 1) * CELL + D / 2)) / spd;
        const [wx, wz] = win(tIn, slack);
        if (!pick(E[i], wx, wz)) return null;
        chain.push({ y: yIn, x: cx, z: cz });
        if (!pick(X[i], iwx, iwz)) return null;
        chain.push({ y: yOut, x: cx, z: cz });
      }
      return chain;
    };
    let K = Math.min(rows.length, rowsLook), chain = null;
    for (; K >= 1 && !chain; K--) chain = solve(K, 0.85) || solve(K, 1.0);
    if (!chain) {                       // unreachable: record it as an unfair segment
      unfair.add(rows[0].cy);
      let bd = 1e9, bi = -1;
      for (let q = 0; q < NXS * NZS; q++) {
        if (!rows[0].free[q]) continue;
        const d = Math.abs(xOf((q / NZS) | 0) - p.x) / TUNING.moveX + Math.abs(zOf(q % NZS) - p.z) / TUNING.moveZ;
        if (d < bd) { bd = d; bi = q; }
      }
      if (bi < 0) return null;
      chain = [{ y: (rows[0].cy + 1) * CELL + PB.d / 2, x: xOf((bi / NZS) | 0), z: zOf(bi % NZS) }];
    }
    return { x: chain[0].x, z: chain[0].z, dy: rows[0].cy * CELL - p.y, lock: true, K, chain, rows: rows.map((r) => r.cy) };
  }

  // ---------- opportunistic target (no wall near): pickups, fuel tins, enemies ----------
  function pickTarget(g, p) {
    let best = null, bs = 1e9;
    const lowFuel = g.fuel < 60;
    for (const e of g.ents) {
      if (e.dead) continue;
      const dy = e.y - p.y;
      if (dy < 24 || dy > 300) continue;
      let pri;
      if (e.kind === 'tuna') pri = lowFuel ? 0 : 3;
      else if (e.kind === 'nip' || e.kind === 'yarnpick' || e.kind === 'laserpick') pri = 1;
      else if (e.team === 'e' && e.hit && e.kind !== 'boss' && e.kind !== 'can' && e.kind !== 'bossmissile') pri = 2;
      else if (e.kind === 'boss') pri = 2;
      else continue;
      const s = pri * 200 + dy;
      if (s < bs) { bs = s; best = e; }
    }
    if (!best) return { x: FIELD_W / 2, z: 44, weak: true };
    const pick = best.team === 'n' && best.kind !== 'tuna';
    return { x: best.x, z: clamp(best.z + (pick ? best.h / 2 - PB.h / 2 : best.h / 2 - 3), TUNING.zMin + 2, TUNING.zMax - 8), weak: false };
  }

  // ---------- hazards ----------
  function collectHazards(g, p, dt) {
    const hz = [];
    for (const e of g.ents) {
      if (e.dead || e.team === 'p' || e.team === 'x') continue;
      const old = prev.get(e.id);
      let vx = 0, vy = 0, vz = 0;
      if (old && dt > 0) { vx = (e.x - old[0]) / dt; vy = (e.y - old[1]) / dt; vz = (e.z - old[2]) / dt; }
      else { vx = e.vx || 0; vy = e.vy || 0; vz = e.vz || 0; }      // freshly spawned: use declared velocity
      if (e.team === 'n') continue;
      const harmful = e.kind === 'cheeseball' || e.solid || e.hit || e.kind === 'field';
      if (!harmful) continue;
      const dy = e.y - p.y;
      if (dy > HAZ_RANGE_Y || dy < -40 - Math.abs(vy) * 0.5) continue;
      hz.push({ e, vx, vy, vz, field: e.kind === 'field' });
    }
    return hz;
  }

  function simulate(g, p, hz, m1, m2, tgt, T, sv) {
    const steps = Math.max(3, Math.round(T * 20)), h = T / steps;
    let x = p.x, z = p.z, cost = 0;
    const half = Math.max(1, steps >> 1);
    const hw = PB.w / 2 + margin, hd = PB.d / 2 + margin * 0.5, hh = PB.h + margin;
    for (let k = 1; k <= steps; k++) {
      const m = k <= half ? m1 : m2;
      let mx = m[0], mz = m[1];
      if (m === SEEK) {
        const tg = targetAt(tgt, p.y + sv * (k - 1) * h);
        mx = clamp((tg.x - x) / (TUNING.moveX * h), -1, 1); mz = clamp((tg.z - z) / (TUNING.moveZ * h), -1, 1);
      }
      x = clamp(x + mx * TUNING.moveX * h, TUNING.xMin, TUNING.xMax);
      z = clamp(z + mz * TUNING.moveZ * h, TUNING.zMin, TUNING.zMax);
      const t = k * h, y = p.y + sv * (t - h * 0.8);   // the game checks collisions before the scroll advance
      const w = 1 + (steps - k) / steps;     // nearer in time = worse
      if (g.grid.boxHit(x - PB.w / 2 + 0.9, x + PB.w / 2 - 0.9, y - PB.d / 2 + 0.9, y + PB.d / 2 - 0.9, z + 0.9, z + PB.h - 0.9)) { cost += 4000 * w; continue; }
      for (let i = 0; i < hz.length; i++) {
        const q = hz[i], e = q.e;
        if (q.field && !fieldOnAt(e, t)) continue;
        const ex = e.x + q.vx * t, ey = e.y + q.vy * t, ez = e.z + q.vz * t;
        if (Math.abs(x - ex) * 2 < 2 * hw + e.w && Math.abs(y - ey) * 2 < 2 * hd + e.d && z - margin * 0.5 < ez + e.h && ez < z + hh) {
          cost += (e.kind === 'cheeseball' ? 3000 : 4000) * w; break;
        }
      }
    }
    // goal: end near target
    const tg = targetAt(tgt, p.y + sv * T);
    const dx = Math.abs(x - tg.x) / TUNING.moveX, dz = Math.abs(z - tg.z) / TUNING.moveZ;
    cost += (tgt.lock ? 60 : tgt.weak ? 4 : 14) * (dx + dz);
    // slightly prefer to stay off the field edges, and small cost for moving
    cost += m1 === SEEK ? 0 : (Math.abs(m1[0]) + Math.abs(m1[1])) * 0.05;
    if (m1 !== lastMove) cost += 6;                       // hysteresis against dithering
    return cost;
  }

  function decide(g, p, dt) {
    let gap;
    if (planCache && g.t - planCache.t < planEvery * DT * 0.99 && g.stageIdx === planCache.stage) gap = planCache.gap;
    else { gap = planGap(g, p); planCache = { t: g.t, gap, stage: g.stageIdx }; }
    let tgt;
    if (gap && gap.dy < 380) tgt = gap;
    else tgt = pickTarget(g, p);
    lastTarget = tgt;
    const hz = collectHazards(g, p, dt);
    let best = null, bc = Infinity;
    const sv = scrollV;
    for (let a = 0; a < MOVES.length; a++) {
      for (let b = 0; b < MOVES.length; b++) {
        if (skill < 0.5 && b !== a) continue;       // novices commit to one move
        const c = simulate(g, p, hz, MOVES[a], MOVES[b], tgt, horizon, sv);
        if (c < bc - 1e-9) { bc = c; best = MOVES[a]; }
      }
    }
    lastMove = best;
    let dx = best[0], dz = best[1];
    if (best === SEEK) {
      const tg = targetAt(tgt, p.y);
      dx = clamp((tg.x - p.x) / (TUNING.moveX * DT), -1, 1);
      dz = clamp((tg.z - p.z) / (TUNING.moveZ * DT), -1, 1);
    }
    return { dx, dz };
  }

  function input(g, dt = 1 / 60) {
    const out = { dx: 0, dz: 0, fire: false, bomb: false };
    if (!g || !g.player) return out;
    const p = g.player;
    // track scroll velocity + entity velocities (every call; dt may be 0 on pause)
    if (lastT >= 0 && g.t > lastT) {
      const d = g.t - lastT;
      scrollV = d > 0 ? Math.max(0, (g.scrollY - lastScroll) / d) : scrollV;
    } else if (lastT < 0) scrollV = g.speed || TUNING.baseSpeed;
    const realDt = lastT >= 0 ? g.t - lastT : dt;
    lastT = g.t; lastScroll = g.scrollY;
    bombCd = Math.max(0, bombCd - (realDt > 0 ? realDt : 0));
    const live = g.state === 'play' || g.state === 'intro';
    if (!live || !p.alive) { remember(g); return out; }

    out.fire = true;
    if (holdN <= 0 || realDt <= 0) {
      if (realDt > 0) {
        hold = decide(g, p, realDt);
        if (skill < 1 && rnd() < (1 - skill) * 0.2) { hold = { dx: Math.round(rnd() * 2 - 1), dz: Math.round(rnd() * 2 - 1) }; }
      }
      holdN = reactEvery;
    }
    holdN--;
    out.dx = hold.dx; out.dz = hold.dz;

    // bombs: boss in front, or a dense cluster of enemies close ahead
    if (g.bombs > 0 && bombCd <= 0) {
      let near = 0, boss = false;
      for (const e of g.ents) {
        if (e.dead || e.team !== 'e') continue;
        const dy = e.y - p.y;
        if (e.kind === 'boss' && dy > 0 && dy < 260) boss = true;
        else if (e.hit && dy > 20 && dy < 150 && Math.abs(e.x - p.x) < 90) near++;
      }
      if (boss || (near >= 5 && g.bombs >= 2)) { out.bomb = true; bombCd = BOMB_COOLDOWN; }
    }
    remember(g);
    return out;
  }
  function remember(g) {
    const seen = new Set();
    for (const e of g.ents) { if (!e.dead) { prev.set(e.id, [e.x, e.y, e.z]); seen.add(e.id); } }
    if (prev.size > seen.size + 64) for (const k of prev.keys()) if (!seen.has(k)) prev.delete(k);
  }

  return { input, step: input, update: input, think: input, get skill() { return skill; }, get target() { return lastTarget; }, get unfairRows() { return [...unfair].sort((a, b) => a - b); } };
}

export default createAutopilot;
