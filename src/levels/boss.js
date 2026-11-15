// Boss stage (Jesse's Lair): a courtyard of flags and runes leading to the arena at bossY.
import { CELL } from '../core/defs.js';
import { createRng } from '../core/rng.js';
import { Builder, NX, clamp, mixSeed } from './util.js';

const T = { cheddar: 1, crown: 3, window: 4, rind: 6, flag: 7, gold: 8 };

export function buildBoss(stageIdx, round, seed, def) {
  const rng = createRng(mixSeed(seed, stageIdx, round));
  const b = new Builder();
  const L = def.length;
  const bossY = 1200;
  const rows = Math.floor(L / CELL);
  const sideEnd = Math.floor((bossY + 260) / CELL);

  // side walls (cx 0 and 13), 2 high, crowned; flags every 6 rows on the crown cell above
  for (let cy = 14; cy < sideEnd; cy++) {
    for (const cx of [0, NX - 1]) {
      b.cell(cx, cy, 0, T.cheddar);
      b.cell(cx, cy, 1, (cy & 1) ? T.crown : T.rind);
      if (cy % 6 === 0) b.cell(cx, cy, 2, T.flag);
    }
    if (cy % 5 === 2) { b.cell(0, cy, 0, T.window); b.cell(NX - 1, cy, 0, T.window); }
  }
  // gold trim around the arena mouth
  for (const cx of [0, NX - 1]) b.cell(cx, Math.floor(bossY / CELL), 2, T.gold);

  // runes lead the eye to the arena; craters and seams elsewhere
  for (let y = 100; y < bossY + 200; y += rng.int(40, 70)) {
    b.addDecor(y, 112 + rng.int(-30, 30), y > bossY - 200 ? 'rune' : rng.pick(['seam', 'crater', 'hole']));
  }
  for (let y = bossY - 160; y < bossY + 160; y += 48) b.addDecor(y, 112, 'rune');

  // courtyard guards (center and edges), fewer once the arena opens
  const d = clamp((round - 1) * 0.2, 0, 0.8);
  for (let y = 360; y < bossY - 120; y += rng.int(110, 170)) {
    const n = 1 + (rng.chance(0.4 + d) ? 1 : 0);
    for (let i = 0; i < n; i++) b.spawn(y + i * 12, 'turret', rng.int(28, 196), 0);
  }
  for (let y = 520; y < bossY - 200; y += rng.int(380, 460)) b.spawn(y, 'pad', rng.int(40, 184), 0, { trigger: 170 });
  if (round > 1) b.spawn(900, 'radar', rng.int(60, 164), 0);

  // supplies: tuna every ~550 into the arena; pickups before the fight
  for (let y = 240; y < bossY + 100; y += 480 + rng.int(0, 70)) b.spawn(y, 'tuna', rng.int(40, 184), 0);
  b.spawn(bossY - 380, 'yarnpick', rng.int(50, 174), 40);
  b.spawn(bossY - 150, 'nip', rng.int(50, 174), 50);
  b.spawn(bossY + 60, 'laserpick', rng.int(60, 164), 50);
  b.spawn(bossY + 180, 'tuna', rng.int(60, 164), 0);

  void rows;
  return {
    id: def.id, name: def.name, kind: def.kind, ground: def.ground, length: def.length, bg: def.bg, music: def.music,
    cells: b.cells(), spawns: b.sortedSpawns(), decor: b.sortedDecor(), bossY,
  };
}
