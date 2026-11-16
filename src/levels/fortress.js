// Fortress stage generator (Cheddar Citadel / Gorgonzola Keep). Pure + deterministic.
// Every wall/field/tower layer keeps the "anchor" (last gap cell) reachable from the previous layer's anchor
// under the conservative reach model in util.js, so the stage is always completable (proved by tools/validate-level.mjs).
import { CELL } from '../core/defs.js';
import { createRng } from '../core/rng.js';
import { Builder, NX, NZ, clamp, reach, mixSeed } from './util.js';

const yc = (cy) => cy * CELL + CELL / 2;
const xc = (cx) => cx * CELL + CELL / 2;

export function buildFortress(stageIdx, round, seed, def) {
  const rng = createRng(mixSeed(seed, stageIdx, round));
  const b = new Builder();
  const rows = Math.floor(def.length / CELL);
  const startCy = 36;
  const endCy = rows - 14;
  const keep = stageIdx >= 2;
  const S = { ax: 6, az: 3, pcy: -1 };
  const used = new Set();          // rows holding voxels / fields (never used for ground spawns)
  let lastTunaY = -9999;
  let lastSeg = '';

  const diff = (cy) => clamp((cy - startCy) / Math.max(1, endCy - startCy) * 0.75 + (round - 1) * 0.12 + (keep ? 0.12 : 0), 0, 1);

  // ---------- primitives ----------
  function bodyType(cx, cz, H) {
    if (cz === H - 1) return (cx & 1) ? 'crown' : 'rind';
    if (cz === (H >> 1) && rng.chance(0.09)) return 'window';
    const r = rng.next();
    if (r < 0.12) return 'swiss';
    if (keep && r < 0.27) return 'cracker';
    return 'cheddar';
  }
  const T = { cheddar: 1, swiss: 2, crown: 3, window: 4, mousehole: 5, rind: 6, flag: 7, gold: 8, cracker: 9 };

  function field(cy, cx0, span, czA, czB, pulse) {
    if (span <= 0 || czB <= czA) return;
    const props = { span, z0: czA * CELL, z1: czB * CELL };
    if (pulse) { props.pulse = pulse; props.phase = Math.round(rng.next() * 100) / 100; }
    b.spawn(yc(cy), 'field', (cx0 + span / 2) * CELL, czA * CELL, props);
    used.add(cy);
  }
  const inGap = (gaps, cx, cz) => {
    for (let i = 0; i < gaps.length; i++) {
      const g = gaps[i];
      if (cx >= g.gx && cx < g.gx + g.w && cz >= g.gz && cz < g.gz + g.h) return true;
    }
    return false;
  };
  const gapRows = [];              // centre of each wall's real gap (tins are lined up with the next one)
  const tight = [];                // rows needing precise flying (a gap one cell wide or tall): no shooters/rocket pads in their approach
  function wallRow(cy, H, gaps, cap) {
    for (const g of gaps) if (!g.decoy && (g.w === 1 || g.h === 1)) tight.push(yc(cy));
    for (const g of gaps) if (!g.decoy) { gapRows.push({ y: yc(cy), x: (g.gx + g.w / 2) * CELL, z: g.gz * CELL, z1: (g.gz + g.h) * CELL }); break; }
    for (let cx = 0; cx < NX; cx++) {
      for (let cz = 0; cz < H; cz++) {
        if (!inGap(gaps, cx, cz)) b.cell(cx, cy, cz, T[bodyType(cx, cz, H)]);
      }
    }
    used.add(cy);
    if (cap && H < NZ) field(cy, 0, NX, H, NZ);
    return cap && H < NZ;
  }
  function holeFlank(cy, g) {
    if (g.w !== 1 || g.h !== 1) return;
    if (g.gx > 0 && b.has(g.gx - 1, cy, g.gz)) b.cell(g.gx - 1, cy, g.gz, T.mousehole);
    if (g.gx < NX - 1 && b.has(g.gx + 1, cy, g.gz)) b.cell(g.gx + 1, cy, g.gz, T.mousehole);
  }
  function topTurrets(cy, H, n, rad) {
    if (H >= NZ) return;
    for (let i = 0; i < n; i++) {
      const cx = rng.int(0, NX - 1);
      if (!b.has(cx, cy, H - 1)) continue;
      b.spawn(yc(cy), rad && i === 0 ? 'radar' : 'turret', xc(cx), H * CELL);
    }
  }

  // choose a gap whose anchor cell is reachable from the previous layer's anchor
  function pickGap(cy, w, h, o) {
    o = o || {};
    const rr = S.pcy < 0 ? { rx: NX, rz: NZ } : reach(cy - S.pcy, round);
    let ax, az;
    if (o.tx !== undefined) ax = clamp(o.tx, S.ax - rr.rx, S.ax + rr.rx);
    else if (o.bx) ax = S.ax + o.bx * rr.rx;
    else ax = rng.int(S.ax - rr.rx, S.ax + rr.rx);
    if (o.tz !== undefined) az = clamp(o.tz, S.az - rr.rz, S.az + rr.rz);
    else if (o.bz) az = S.az + o.bz * rr.rz;
    else az = rng.int(S.az - rr.rz, S.az + rr.rz);
    ax = clamp(ax, 0, NX - 1);
    az = clamp(az, 0, NZ - 1);
    const gxLo = Math.max(0, ax - w + 1), gxHi = Math.min(ax, NX - w);
    const gzLo = Math.max(0, az - h + 1), gzHi = Math.min(az, NZ - h);
    return { gx: rng.int(gxLo, gxHi), gz: rng.int(gzLo, gzHi), w, h, ax, az };
  }
  const anchors = [];              // [cy, ax] of every committed gap: tins are lined up with the lane the player is flying
  const commit = (g, cy) => { S.ax = g.ax; S.az = g.az; S.pcy = cy; anchors.push([cy, g.ax, g.az]); };
  const laneZ = (cy) => {   // altitude of the flown lane: a tin there can be shot without diving to the floor (1 in 4 stays on the ground)
    let az = 3;
    for (let i = 0; i < anchors.length; i++) if (anchors[i][0] <= cy) az = anchors[i][2];
    return rng.chance(0.25) ? 0 : clamp(az * CELL + rng.int(0, 3), 0, 100);
  };
  const laneX = (cy) => {
    let ax = 6;
    for (let i = 0; i < anchors.length; i++) if (anchors[i][0] <= cy) ax = anchors[i][1];
    return clamp(xc(ax) + rng.int(-6, 6), 20, 204);
  };
  const wallH = (gaps, want) => {
    let m = want;
    for (const g of gaps) m = Math.max(m, g.gz + g.h);
    return clamp(m, 2, NZ);
  };
  const capChance = (H, d) => (H >= 6 ? 0.8 : 0.35 + d * 0.2);
  function pickW(d) {
    const r = rng.next();
    if (d < 0.3) return r < 0.6 ? 3 : 2;
    if (d < 0.65) return r < 0.12 ? 1 : r < 0.62 ? 2 : 3;
    return r < 0.3 ? 1 : r < 0.8 ? 2 : 3;
  }

  // ---------- ground life ----------
  function groundSpawn(kind, cy, props) {
    const x = rng.int(20, 204);
    const y = yc(cy);
    const s = b.spawn(y, kind, x, 0, props);
    return s;
  }
  function breather(cy, n, heavy) {
    if (n <= 0) return;
    const d = diff(cy);
    const y0 = cy * CELL;
    if (y0 - lastTunaY > 420 || rng.chance(0.22)) {
      const ty = cy + (n >= 6 ? rng.int(3, n - 2) : rng.int(0, n - 1));
      const s = b.spawn(yc(ty), 'tuna', laneX(ty), laneZ(ty));
      lastTunaY = s.y;
    }
    const pads = Math.floor(d * 2.2 + rng.next()) + (heavy ? 2 : 0) - (cy < startCy ? 1 : 0);
    for (let i = 0; i < Math.max(0, pads); i++) groundSpawn('pad', cy + rng.int(0, n - 1), { trigger: 170 + rng.int(-20, 30) });
    const tur = rng.int(0, 1 + Math.floor(d * 3));
    for (let i = 0; i < tur; i++) groundSpawn('turret', cy + rng.int(0, n - 1));
    if (rng.chance(0.1 + d * 0.08)) groundSpawn('radar', cy + rng.int(0, n - 1));
  }

  // ---------- set pieces: each returns the first free row after it ----------
  function single(cy) {
    const d = diff(cy);
    const w = pickW(d), h = rng.int(2, 3) - (d > 0.6 && rng.chance(0.5) ? 1 : 0);
    const g = pickGap(cy, w, Math.max(1, h));
    const H = wallH([g], rng.int(3, 6));
    const capped = wallRow(cy, H, [g], rng.chance(capChance(H, d)));
    holeFlank(cy, g);
    if (!capped) topTurrets(cy, H, rng.int(0, 1 + Math.floor(d * 2)), rng.chance(0.12));
    commit(g, cy);
    return cy + 1;
  }
  function zig(cy) {
    const d = diff(cy);
    const n = rng.int(3, 5);
    const want = Math.min(4, 2 + Math.floor(d * 2));
    let s = 5;
    for (let k = 2; k <= 7; k++) if (reach(k, round).rx >= want) { s = k; break; }
    let sign = rng.chance(0.5) ? 1 : -1;
    let last = cy;
    for (let i = 0; i < n; i++) {
      const r = cy + i * s;
      const g = pickGap(r, rng.int(2, 3 - (d > 0.7 ? 1 : 0)), rng.int(2, 3), { bx: sign });
      const H = wallH([g], rng.int(4, 6));
      const capped = wallRow(r, H, [g], rng.chance(capChance(H, d)));
      if (!capped) topTurrets(r, H, rng.int(0, 1), false);
      commit(g, r);
      sign = -sign;
      last = r;
    }
    return last + 1;
  }
  function double(cy) {
    const d = diff(cy);
    const g1 = pickGap(cy, 3, rng.int(2, 3));
    const H1 = wallH([g1], rng.int(4, 6));
    wallRow(cy, H1, [g1], rng.chance(0.5));
    commit(g1, cy);
    const g2 = pickGap(cy + 1, rng.int(1, 2), rng.int(1, 2));
    // nest the second gap inside the first (a funnel): rows one apart leave no free flight, so no lateral shift may be required
    g2.w = Math.min(g2.w, g1.w); g2.h = Math.min(g2.h, g1.h);
    g2.gx = clamp(g2.gx, g1.gx, g1.gx + g1.w - g2.w); g2.gz = clamp(g2.gz, g1.gz, g1.gz + g1.h - g2.h);
    g2.ax = clamp(g2.ax, g2.gx, g2.gx + g2.w - 1); g2.az = clamp(g2.az, g2.gz, g2.gz + g2.h - 1);
    const H2 = wallH([g2], rng.int(4, 7));
    const c2 = wallRow(cy + 1, H2, [g2], rng.chance(capChance(H2, d)));
    holeFlank(cy + 1, g2);
    if (!c2) topTurrets(cy + 1, H2, 1, false);
    commit(g2, cy + 1);
    let end = cy + 2;
    if (d > 0.35 && rng.chance(0.5)) {   // third leaf of a stacked wall after a short hop
      const r3 = cy + 4;
      const g3 = pickGap(r3, rng.int(1, 2), 2);
      const H3 = wallH([g3], rng.int(5, 7));
      wallRow(r3, H3, [g3], true);
      commit(g3, r3);
      end = r3 + 1;
    }
    return end;
  }
  function mouse(cy) {
    const d = diff(cy);
    const g = pickGap(cy, 1, 1);
    const H = wallH([g], rng.int(5, 7));
    wallRow(cy, H, [g], true);
    holeFlank(cy, g);
    commit(g, cy);
    const cy2 = cy + rng.int(2, 3);
    if (rng.chance(0.5)) {            // curtain with a vertical slot
      const sw = d < 0.8 || round < 3 ? 2 : 1;
      if (sw === 1) tight.push(yc(cy2));
      const sx = clamp(S.ax - rng.int(0, sw - 1), 0, NX - sw);
      field(cy2, 0, sx, 0, NZ, rng.chance(0.3) ? 2.6 : 0);
      field(cy2, sx + sw, NX - sx - sw, 0, NZ);
    } else {                          // horizontal slit
      const sh = d < 0.5 ? 2 : 1;
      if (sh === 1) tight.push(yc(cy2));
      const sz = clamp(S.az - rng.int(0, sh - 1), 0, NZ - sh);
      field(cy2, 0, NX, 0, sz);
      field(cy2, 0, NX, sz + sh, NZ);
    }
    S.pcy = cy2;
    if (d > 0.2) {                    // ambush behind the curtain
      for (let i = 0; i < 1 + Math.floor(d * 2); i++) groundSpawn('turret', cy2 + 1 + rng.int(0, 2));
    }
    return cy2 + 1;
  }
  function stairs(cy) {
    const d = diff(cy);
    const n = rng.int(4, 6);
    let s = 5;
    for (let k = 3; k <= 5; k++) if (reach(k, round).rz >= 1) { s = k; break; }
    const step = clamp(reach(s, round).rz, 1, 2);
    const w = d < 0.5 ? 3 : 2, h = 2;
    let g = pickGap(cy, w, h);
    const dir = g.az < 3 ? 1 : -1;
    let last = cy;
    for (let i = 0; i < n; i++) {
      const r = cy + i * s;
      if (i > 0) g = pickGap(r, w, h, { tx: S.ax + (rng.chance(0.4) ? rng.int(-1, 1) : 0), tz: S.az + dir * step });
      const H = wallH([g], 7);
      wallRow(r, H, [g], true);
      commit(g, r);
      last = r;
    }
    return last + 1;
  }
  function towers(cy) {
    const d = diff(cy);
    const L = rng.int(5, 8);
    const k = 2 + Math.floor(d * 3) + rng.int(0, 2);
    const lo = S.ax - 1, hi = S.ax + 1;
    for (let i = 0; i < k; i++) {
      for (let tries = 0; tries < 12; tries++) {
        const cx = rng.int(0, NX - 2), ty = cy + rng.int(0, L - 2);
        if (cx + 1 >= lo && cx <= hi) continue;
        const h = rng.int(2, 5 + (d > 0.5 ? 2 : 1));
        let clash = false;
        for (let dx = 0; dx < 2 && !clash; dx++) for (let dy = 0; dy < 2; dy++) if (b.has(cx + dx, ty + dy, 0)) clash = true;
        if (clash) continue;
        for (let dx = 0; dx < 2; dx++) {
          for (let dy = 0; dy < 2; dy++) {
            for (let cz = 0; cz < h; cz++) b.cell(cx + dx, ty + dy, cz, cz === h - 1 ? T.crown : (cz === 1 && rng.chance(0.2) ? T.window : T.cheddar));
            used.add(ty + dy);
          }
        }
        const r = rng.next();
        if (h < NZ - 1) {
          if (r < 0.15) b.spawn(ty * CELL + CELL, 'radar', (cx + 1) * CELL, h * CELL);
          else if (r < 0.85) b.spawn(ty * CELL + CELL, 'turret', (cx + 1) * CELL, h * CELL);
        }
        break;
      }
    }
    S.pcy = Math.max(S.pcy, cy + L - 1);
    return cy + L;
  }
  function alley(cy) {
    const d = diff(cy);
    const L = rng.int(8, 12);
    const cx0 = clamp(rng.int(S.ax - 2, S.ax), 0, NX - 3);
    const hw = rng.int(2, 3);
    for (let r = cy; r < cy + L; r++) {
      for (let cz = 0; cz < hw; cz++) {
        const t = cz === hw - 1 ? T.crown : T.cheddar;
        b.cell(cx0 - 1, r, cz, t);
        b.cell(cx0 + 3, r, cz, t);
      }
      used.add(r);
      if ((r - cy) % 3 === 1) {
        const s = b.spawn(yc(r), 'tuna', xc(cx0 + 1), 0, { alley: true });
        lastTunaY = s.y;
      }
      if (d > 0.15 && (r - cy) % 4 === 2) {
        const side = rng.chance(0.5);
        const cx = side ? cx0 - 1 : cx0 + 3;
        if (b.has(cx, r, hw - 1)) b.spawn(yc(r), 'turret', xc(cx), hw * CELL);
      }
    }
    S.pcy = Math.max(S.pcy, cy + L - 1);
    return cy + L;
  }
  function gate(cy) {
    const d = diff(cy);
    const main = pickGap(cy, rng.int(2, 3), rng.int(2, 3));
    const gaps = [main];
    const decoys = 1 + (d > 0.45 ? 1 : 0);
    for (let n = 0; n < decoys; n++) {
      for (let tries = 0; tries < 10; tries++) {
        const w = rng.int(2, 3), h = rng.int(2, 3);
        const gx = rng.int(0, NX - w), gz = rng.int(0, NZ - 1 - h);
        let ok = true;
        for (const g of gaps) if (gx < g.gx + g.w + 1 && gx + w + 1 > g.gx) ok = false;
        if (!ok) continue;
        gaps.push({ gx, gz, w, h, decoy: true });
        break;
      }
    }
    const H = wallH(gaps, 7);
    wallRow(cy, H, gaps, true);
    for (const g of gaps) if (g.decoy) field(cy, g.gx, g.w, g.gz, g.gz + g.h, rng.chance(0.5) ? 1.8 + rng.next() : 0);
    commit(main, cy);
    // guards behind the gate
    for (let i = 0; i < 1 + Math.floor(d * 2); i++) groundSpawn('turret', cy + 2 + rng.int(0, 2));
    return cy + 1;
  }
  function ambush(cy) {
    const n = 6;
    breather(cy, n, true);
    return single(cy + n);
  }

  const SEGS = {
    single: [single, () => 3], zig: [zig, (d) => 2 + d * 2], double: [double, (d) => 0.8 + d * 2],
    mouse: [mouse, (d) => 0.8 + d * 2.2], stairs: [stairs, () => 1.6], towers: [towers, () => 2],
    alley: [alley, () => 1.4], gate: [gate, (d) => (d > 0.2 ? 1.2 + d * 1.5 : 0)], ambush: [ambush, (d) => 0.6 + d],
  };
  const NAMES = Object.keys(SEGS);
  function chooseSeg(d) {
    let tot = 0;
    const w = NAMES.map((n) => { const v = n === lastSeg ? 0 : SEGS[n][1](d); tot += v; return v; });
    let r = rng.next() * tot;
    for (let i = 0; i < NAMES.length; i++) { r -= w[i]; if (r < 0) return NAMES[i]; }
    return 'single';
  }

  // ---------- compose ----------
  breather(0, startCy, false);
  let cy = startCy;
  const BUDGET = 4200;
  while (cy < endCy - 34) {
    const d = diff(cy);
    let name = chooseSeg(d);
    if (b.map.size > BUDGET) name = 'single';
    lastSeg = name;
    cy = SEGS[name][0](cy);
    const gap = Math.max(2, rng.int(4, 8) - Math.floor(d * 2.5)) + (b.map.size > 3600 ? 3 : 0);
    breather(cy, gap, false);
    cy += gap;
  }
  // finale: a set-piece gate then a run-out
  if (cy < endCy - 6) { cy = gate(cy); breather(cy, 3, false); cy += 3; }
  if (cy < endCy - 28 && b.map.size < 4600) { cy = zig(cy); }
  breather(Math.min(cy, rows - 12), 8, false);

  // ---------- post passes ----------
  const sp = b.spawns;
  // ground spawns must not sit inside voxels
  b.spawns = sp.filter((s) => !((s.kind === 'turret' || s.kind === 'pad' || s.kind === 'tuna' || s.kind === 'radar') && (s.z || 0) === 0 &&
    (b.has(Math.floor(s.x / CELL), Math.floor(s.y / CELL), 0) || b.has(Math.floor(s.x / CELL), Math.floor(s.y / CELL), 1))));
  b.spawns = b.spawns.filter((s) => !((s.kind === 'pad' || s.kind === 'turret') && tight.some((ty) => s.y > ty - 300 && s.y < ty + 90)));
  const isClear = (q) => q > 2 && q < rows - 2 && !used.has(q) && !used.has(q - 1) && !used.has(q + 1);
  const clearRow = (r, lo, hi) => {
    for (let k = 0; k < 80; k++) {
      for (const q of [r - k, r + k]) if (q >= lo && q <= hi && isClear(q)) return q;
    }
    return -1;
  };
  // tuna every <= ~650 units
  for (let guard = 0; guard < 40; guard++) {
    const ys = b.spawns.filter((s) => s.kind === 'tuna').map((s) => s.y).sort((p, q) => p - q);
    ys.push(def.length);
    let prev = 0, ins = -1;
    for (const y of ys) { if (y - prev > 680) { ins = prev + 560; break; } prev = y; }
    if (ins < 0) break;
    const r = clearRow(Math.floor(ins / CELL), Math.floor((prev + 100) / CELL), Math.floor((prev + 660) / CELL));
    if (r < 0) {   // dense stretch: settle for any unused row
      let q = -1;
      for (let k = 0; k < 40 && q < 0; k++) for (const c of [Math.floor(ins / CELL) - k, Math.floor(ins / CELL) + k]) if (q < 0 && c * CELL > prev + 60 && c * CELL < prev + 680 && !used.has(c)) q = c;
      if (q < 0) break;
      b.spawn(yc(q), 'tuna', laneX(q), laneZ(q));
      continue;
    }
    b.spawn(yc(r), 'tuna', laneX(r), laneZ(r));
  }
  // line each loose tin up with the next wall's gap so a bot (or player) that holds fire collects it on the way in
  gapRows.sort((p, q) => p.y - q.y);
  const extra = [];
  for (const s of b.spawns) {
    if (s.kind !== 'tuna' || s.alley) continue;
    const g = gapRows.find((q) => q.y > s.y + 40);
    if (g && g.y - s.y < 300) {   // a low tin and a high tin on the same line: whichever side of the gap you hug, one is in the line of fire
      s.x = clamp(Math.round(g.x), 20, 204); s.z = clamp(g.z + 6, 0, 100);
      extra.push({ y: s.y + 6, kind: 'tuna', x: s.x, z: clamp(Math.max(g.z + 12, g.z1 - 18), 0, 100) });
    }
  }
  for (const s of extra) b.spawns.push(s);
  // pickups every ~1200
  const picks = ['yarnpick', 'nip', 'laserpick'];
  for (let k = 0, y = 900; y < def.length - 400; k++, y += 1150 + rng.int(0, 100)) {
    const r0 = Math.floor(y / CELL);
    const r = clearRow(r0, r0 - 40, r0 + 40) < 0 ? r0 : clearRow(r0, r0 - 40, r0 + 40);
    b.spawn(yc(r), picks[k % 3], rng.int(40, 184), rng.int(24, 80));
  }
  // ground decals
  const kinds = keep ? ['crater', 'hole', 'seam', 'rune'] : ['crater', 'hole', 'seam'];
  for (let y = 40; y < def.length; y += rng.int(36, 90)) {
    const r = Math.floor(y / CELL);
    if (!used.has(r)) b.addDecor(y, rng.int(8, 216), rng.pick(kinds));
  }

  return {
    id: def.id, name: def.name, kind: def.kind, ground: def.ground, length: def.length, bg: def.bg, music: def.music,
    cells: b.cells(), spawns: b.sortedSpawns(), decor: b.sortedDecor(),
  };
}
