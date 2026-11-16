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
  const rear = y - PB.d / 2;
  for (let i = 0; i < ch.length; i++) if (rear < ch[i].end) return ch[i];
  return ch[ch.length - 1];
}

export function createAutopilot(game, opts = {}) {
  const skill = clamp(opts.skill ?? 1, 0, 1);
  const rnd = mulberry(((game && game.seed) | 0) ^ 0x9e3779b9 ^ Math.round(skill * 1000));
  const prev = new Map();                 // ent id -> [x,y,z] last tick (for velocity)
  let lastT = -1, lastScroll = 0, scrollV = TUNING.baseSpeed;
  let lastMove = MOVES[0], hold = { dx: 0, dz: 0 }, holdN = 0, bombCd = 0, lastTarget = null;
  const reactEvery = 1 + Math.round((1 - skill) * 9);
  const horizon = 0.3 + 0.45 * skill;
  const margin = 1.5 + 2.5 * skill;
  const rowsLook = 1 + Math.round(skill * 5);

  // ---------- planning through wall gaps ----------
  function blockedGrid(g, cy, fieldsByRow) {
    // returns Uint8Array [cx*8+cz] = 1 if the player box centred in that cell touches a voxel/field
    const out = new Uint8Array(FIELD_CELLS_X * FIELD_CELLS_Z);
    const rowCells = g.grid.rows(cy);
    for (let i = 0; i < rowCells.length; i++) {
      const c = rowCells[i];
      if (c.cx >= 0 && c.cx < FIELD_CELLS_X && c.cz >= 0 && c.cz < FIELD_CELLS_Z) out[c.cx * FIELD_CELLS_Z + c.cz] = 1;
    }
    const fl = fieldsByRow.get(cy);
    if (fl) for (const f of fl) {
      for (let cx = 0; cx < FIELD_CELLS_X; cx++) for (let cz = 0; cz < FIELD_CELLS_Z; cz++) {
        const px = cx * CELL + CELL / 2, pz = clamp(cz * CELL + (CELL - PB.h) / 2, TUNING.zMin, TUNING.zMax);
        if (Math.abs(px - f.x) * 2 < PB.w + f.w && pz < f.z + f.h && f.z < pz + PB.h) out[cx * FIELD_CELLS_Z + cz] = 1;
      }
    }
    return out;
  }
  const cellPos = (cx, cz) => [cx * CELL + CELL / 2, clamp(cz * CELL + (CELL - PB.h) / 2, TUNING.zMin, TUNING.zMax)];

  function planGap(g, p) {
    const gr = g.grid;
    const fieldsByRow = new Map();
    for (const e of g.ents) {
      if (e.dead || e.kind !== 'field' || e.pulse > 0 || e.on === false) continue;
      if (e.y < p.y - 20 || e.y > p.y + 420) continue;
      const cy = Math.floor(e.y / CELL);
      if (!fieldsByRow.has(cy)) fieldsByRow.set(cy, []);
      fieldsByRow.get(cy).push(e);
    }
    const cyStart = Math.floor((p.y - PB.d / 2) / CELL);
    const cyEnd = cyStart + 28;
    const rows = [];
    for (let cy = cyStart; cy <= cyEnd && rows.length < rowsLook + 2; cy++) {
      if (gr.rows(cy).length === 0 && !fieldsByRow.has(cy)) continue;
      rows.push({ cy, blk: blockedGrid(g, cy, fieldsByRow) });
    }
    if (!rows.length) return null;
    const spd = Math.max(scrollV, 30);
    const N = FIELD_CELLS_X * FIELD_CELLS_Z, INF = 1e9;
    let slack = 1;
    const trav = (ax, az, bx, bz, dy) => {
      const t = Math.max(0, dy) / spd * slack;
      const needX = Math.abs(ax - bx) - 5, needZ = Math.abs(az - bz) - 7;   // cell regions leave a few units of play
      if (needX > TUNING.moveX * t || needZ > TUNING.moveZ * t) return INF;
      return Math.abs(ax - bx) / TUNING.moveX + Math.abs(az - bz) / TUNING.moveZ;
    };
    const solve = (K) => {
      const cost = [], nxt = [];
      for (let i = K - 1; i >= 0; i--) {
        const ci = new Float64Array(N).fill(INF), ni = new Int16Array(N).fill(-1);
        for (let c = 0; c < N; c++) {
          if (rows[i].blk[c]) continue;
          if (i === K - 1) { ci[c] = 0; continue; }
          const [ax, az] = cellPos((c / FIELD_CELLS_Z) | 0, c % FIELD_CELLS_Z);
          const dy = (rows[i + 1].cy - rows[i].cy) * CELL - 28;   // free travel distance between leaving row i and entering row i+1
          let best = INF, bn = -1;
          for (let d = 0; d < N; d++) {
            if (rows[i + 1].blk[d] || cost[0][d] >= INF) continue;
            const [bx, bz] = cellPos((d / FIELD_CELLS_Z) | 0, d % FIELD_CELLS_Z);
            const tc = trav(ax, az, bx, bz, dy);
            if (tc >= INF) continue;
            const v = tc + cost[0][d];
            if (v < best) { best = v; bn = d; }
          }
          ci[c] = best; ni[c] = bn;
        }
        cost.unshift(ci); nxt.unshift(ni);
      }
      // first hop from the player
      const dy0 = rows[0].cy * CELL - (p.y + PB.d / 2);
      let best = INF, bc = -1;
      for (let c = 0; c < N; c++) {
        if (cost[0][c] >= INF) continue;
        const [bx, bz] = cellPos((c / FIELD_CELLS_Z) | 0, c % FIELD_CELLS_Z);
        const tc = trav(p.x, p.z, bx, bz, dy0);
        if (tc >= INF) continue;
        const v = tc + cost[0][c];
        if (v < best) { best = v; bc = c; }
      }
      return bc >= 0 ? { bc, nxt } : null;
    };
    let K = Math.min(rows.length, rowsLook), bc = -1, sol = null;
    for (; K >= 1; K--) { slack = 0.6; sol = solve(K); if (!sol) { slack = 1; sol = solve(K); } if (sol) { bc = sol.bc; break; } }
    if (bc < 0) {                       // unreachable: head for the nearest free cell of the first row
      let bd = 1e9;
      for (let c = 0; c < N; c++) {
        if (rows[0].blk[c]) continue;
        const [bx, bz] = cellPos((c / FIELD_CELLS_Z) | 0, c % FIELD_CELLS_Z);
        const d = Math.abs(bx - p.x) / TUNING.moveX + Math.abs(bz - p.z) / TUNING.moveZ;
        if (d < bd) { bd = d; bc = c; }
      }
      if (bc < 0) return null;
    }
    if (K < 1) K = 1;
    // chain of per-row targets; each is aimed inside its cell at the point closest to the next row's cell (pre-positioning)
    const chain = [];
    let c = bc;
    for (let j = 0; j < K && c >= 0; j++) {
      const cxo = (c / FIELD_CELLS_Z) | 0, czo = c % FIELD_CELLS_Z;
      const [cx0, cz0] = cellPos(cxo, czo);
      const nc = sol && j < K - 1 ? sol.nxt[j][c] : -1;
      let tx = cx0, tz = cz0;
      if (nc >= 0) {
        const [nx, nz] = cellPos((nc / FIELD_CELLS_Z) | 0, nc % FIELD_CELLS_Z);
        const mx = (CELL - PB.w) / 2 - 1, mz = (CELL - PB.h) / 2 - 1;
        tx = clamp(nx, cx0 - mx, cx0 + mx); tz = clamp(nz, cz0 - mz, cz0 + mz);
      }
      chain.push({ end: (rows[j].cy + 1) * CELL, x: tx, z: clamp(tz, TUNING.zMin, TUNING.zMax) });
      c = nc;
    }
    const tx = chain[0].x, tz = chain[0].z;
    return { x: tx, z: tz, dy: rows[0].cy * CELL - p.y, lock: true, K, chain, rows: rows.map((r) => r.cy) };
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
      if (g.grid.boxHit(x - PB.w / 2 + 0.6, x + PB.w / 2 - 0.6, y - PB.d / 2 + 0.6, y + PB.d / 2 - 0.6, z + 0.6, z + PB.h - 0.6)) { cost += 4000 * w; continue; }
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
    const gap = planGap(g, p);
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

  return { input, step: input, update: input, think: input, get skill() { return skill; }, get target() { return lastTarget; } };
}

export default createAutopilot;
