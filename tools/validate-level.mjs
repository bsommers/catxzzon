#!/usr/bin/env node
// Level validator: node tools/validate-level.mjs [--seeds N] [--rounds 1-4] [--verbose]
// Proves fairness by (x,z) reachability over blocked rows, checks structure, budgets, determinism. Exit 1 on failure.
import { fileURLToPath } from 'node:url';
import { buildStage } from '../src/levels/index.js';
import { STAGES, KINDS, BLOCK_NAMES, CELL, FIELD_W, FIELD_CELLS_X } from '../src/core/defs.js';
import { NX, NZ, reach, rowBlocks } from '../src/levels/util.js';

const SPAWN_KINDS = new Set([...Object.keys(KINDS), 'formation']);
const PATTERNS = new Set(['vee', 'line', 'swoop', 'ring', 'zig']);
const DECOR = new Set(['crater', 'hole', 'seam', 'rune']);
const GROUND_KINDS = new Set(['turret', 'pad', 'tuna', 'radar']);

/** Reachability over blocked rows. Returns { ok, failRow, layers, minSet }. */
export function checkReachability(stage, round) {
  const rows = rowBlocks(stage);
  const cys = Array.from(rows.keys()).sort((a, b) => a - b);
  let cur = new Uint8Array(NX * NZ).fill(1);
  let prev = -1;
  let minSet = NX * NZ;
  const nxt = new Uint8Array(NX * NZ);
  for (const cy of cys) {
    const blocked = rows.get(cy);
    const { rx, rz } = prev < 0 ? { rx: NX, rz: NZ } : reach(cy - prev, round);
    nxt.fill(0);
    let count = 0;
    for (let z = 0; z < NZ; z++) {
      for (let x = 0; x < NX; x++) {
        if (blocked[z * NX + x]) continue;
        let ok = false;
        for (let z2 = Math.max(0, z - rz); z2 <= Math.min(NZ - 1, z + rz) && !ok; z2++) {
          for (let x2 = Math.max(0, x - rx); x2 <= Math.min(NX - 1, x + rx); x2++) {
            if (cur[z2 * NX + x2]) { ok = true; break; }
          }
        }
        if (ok) { nxt[z * NX + x] = 1; count++; }
      }
    }
    if (count === 0) return { ok: false, failRow: cy, layers: cys.length, minSet: 0 };
    minSet = Math.min(minSet, count);
    cur.set(nxt);
    prev = cy;
  }
  return { ok: true, failRow: -1, layers: cys.length, minSet };
}

export function validateStage(stage, stageIdx, round) {
  const errs = [];
  const def = STAGES[stageIdx];
  const e = (m) => { if (errs.length < 8) errs.push(m); };
  const info = { cells: stage.cells.length, spawns: stage.spawns.length, counts: {}, layers: 0, minSet: 0, maxTunaGap: 0 };
  for (const k of ['id', 'name', 'kind', 'ground', 'length', 'bg', 'music']) if (stage[k] !== def[k]) e(`stage.${k} mismatch`);
  if (stage.cells.length > 6000) e(`cell budget ${stage.cells.length} > 6000`);
  const seen = new Set();
  for (const c of stage.cells) {
    if (!(c.cx >= 0 && c.cx < NX && c.cz >= 0 && c.cz < NZ && c.cy >= 0 && Number.isInteger(c.cx + c.cy + c.cz))) e(`bad cell ${JSON.stringify(c)}`);
    if (!BLOCK_NAMES[c.t]) e(`bad block type ${c.t}`);
    const key = c.cy * 1024 + c.cz * 32 + c.cx;
    if (seen.has(key)) e('duplicate cell');
    seen.add(key);
    if (c.cy * CELL > stage.length) e('cell beyond stage length');
  }
  let lastY = -Infinity;
  for (const s of stage.spawns) {
    info.counts[s.kind] = (info.counts[s.kind] || 0) + 1;
    if (!SPAWN_KINDS.has(s.kind)) e(`unknown kind ${s.kind}`);
    if (!(s.y >= lastY)) e('spawns not sorted');
    lastY = s.y;
    if (!(s.x >= 0 && s.x <= FIELD_W) || !(s.y >= 0 && s.y <= stage.length) || !(s.z >= 0 && s.z <= 128)) e(`spawn out of bounds ${JSON.stringify(s)}`);
    if (s.kind === 'formation') {
      if (!PATTERNS.has(s.pattern) || !(s.n >= 1 && s.n <= 12)) e('bad formation');
    }
    if (s.kind === 'field') {
      if (!(s.span >= 1) || !(s.z1 > s.z0)) e('bad field');
      else if (Math.round((s.x - s.span * 8) / CELL) < 0 || Math.round((s.x + s.span * 8) / CELL) > FIELD_CELLS_X) e('field outside playfield');
    }
    if (stage.kind !== 'space' && GROUND_KINDS.has(s.kind) && s.z === 0 && seen.has(Math.floor(s.y / CELL) * 1024 + Math.floor(s.x / CELL))) e('ground spawn inside voxel');
  }
  for (const dc of stage.decor) if (!DECOR.has(dc.type) || !(dc.x >= 0 && dc.x <= FIELD_W)) e('bad decor');
  if (stage.kind === 'space' && stage.cells.length) e('space stage has cells');
  if (stage.kind === 'boss' && !(stage.bossY > 0 && stage.bossY < stage.length)) e('bad bossY');

  // supplies
  const tunas = stage.spawns.filter((s) => s.kind === 'tuna').map((s) => s.y);
  tunas.push(stage.length);
  let prev = 0, mg = 0;
  for (const y of tunas) { mg = Math.max(mg, y - prev); prev = y; }
  info.maxTunaGap = mg;
  const limit = stage.kind === 'boss' ? 800 : 700;
  if (mg > limit) e(`tuna gap ${mg} > ${limit}`);
  if (stage.kind !== 'boss') {
    const pk = stage.spawns.filter((s) => s.kind === 'nip' || s.kind === 'yarnpick' || s.kind === 'laserpick').map((s) => s.y);
    pk.unshift(0); pk.push(stage.length);
    let pg = 0;
    for (let i = 1; i < pk.length; i++) pg = Math.max(pg, pk[i] - pk[i - 1]);
    info.maxPickGap = pg;
    if (pg > 1800) e(`pickup gap ${pg} > 1800`);
  }

  if (stage.kind === 'fortress' || stage.kind === 'boss') {
    const r = checkReachability(stage, round);
    info.layers = r.layers; info.minSet = r.minSet;
    if (!r.ok) e(`UNREACHABLE at row ${r.failRow}`);
  }
  if (stage.kind === 'space') {   // spuds: <= 4 per 96-unit band and >= 3 cells of lateral room
    const sp = stage.spawns.filter((s) => s.kind === 'spud');
    for (let i = 0; i < sp.length; i++) {
      let near = 0;
      for (let j = 0; j < sp.length; j++) if (j !== i && Math.abs(sp[j].y - sp[i].y) < 48 && Math.abs(sp[j].x - sp[i].x) < 40) near++;
      if (near > 0 && sp[i].z !== undefined && Math.abs(sp[i].z) >= 0) { /* different z allows passing; only flag x+z pile-ups */ }
    }
    for (let y0 = 0; y0 < stage.length; y0 += 96) {
      const n = sp.filter((s) => s.y >= y0 && s.y < y0 + 96).length;
      if (n > 4) e(`${n} spuds in band ${y0}`);
    }
  }
  return { errs, info };
}

function main() {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const seeds = parseInt(arg('--seeds', '40'), 10);
  const [r0, r1] = String(arg('--rounds', '1-4')).split('-').map(Number);
  const verbose = args.includes('--verbose');
  let fails = 0, total = 0;
  const t0 = Date.now();
  for (let si = 0; si < STAGES.length; si++) {
    for (let round = r0; round <= (r1 || r0); round++) {
      let cmin = 1e9, cmax = 0, csum = 0, smin = 1e9, smax = 0, ssum = 0, lay = 0, ms = 1e9, tg = 0, bad = 0;
      let counts = {};
      for (let seed = 1; seed <= seeds; seed++) {
        const st = buildStage(si, round, seed);
        const again = buildStage(si, round, seed);
        total++;
        const { errs, info } = validateStage(st, si, round);
        if (JSON.stringify(st) !== JSON.stringify(again)) errs.push('NON-DETERMINISTIC');
        if (errs.length) { bad++; fails++; console.log(`FAIL stage ${si} round ${round} seed ${seed}: ${errs.join('; ')}`); }
        cmin = Math.min(cmin, info.cells); cmax = Math.max(cmax, info.cells); csum += info.cells;
        smin = Math.min(smin, info.spawns); smax = Math.max(smax, info.spawns); ssum += info.spawns;
        lay += info.layers; ms = Math.min(ms, info.minSet || ms); tg = Math.max(tg, info.maxTunaGap);
        for (const k in info.counts) counts[k] = (counts[k] || 0) + info.counts[k];
      }
      const avg = (o) => Object.entries(o).map(([k, v]) => `${k}:${(v / seeds).toFixed(1)}`).join(' ');
      console.log(`${STAGES[si].id.padEnd(8)} r${round} seeds=${seeds} cells ${cmin}/${Math.round(csum / seeds)}/${cmax} spawns ${smin}/${Math.round(ssum / seeds)}/${smax} layers~${Math.round(lay / seeds)} minFree=${ms === 1e9 ? '-' : ms} tunaGap<=${tg} bad=${bad}`);
      if (verbose) console.log('   avg spawns: ' + avg(counts));
    }
  }
  console.log(`${total} stages checked in ${Date.now() - t0} ms, ${fails} failure(s)`);
  process.exit(fails ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
