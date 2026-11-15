// Space stage (Spud Belt): formations of mousejets, drifting hot spuds, pickups. No voxels.
import { createRng } from '../core/rng.js';
import { Builder, clamp, mixSeed } from './util.js';

const PATTERNS = ['vee', 'line', 'swoop', 'ring', 'zig'];

export function buildSpace(stageIdx, round, seed, def) {
  const rng = createRng(mixSeed(seed, stageIdx, round));
  const b = new Builder();
  const L = def.length;
  const d0 = (round - 1) * 0.12;
  const diff = (y) => clamp(y / L * 0.7 + d0, 0, 1);

  // formations
  let y = 420, k = 0;
  while (y < L - 260) {
    const d = diff(y);
    const pattern = PATTERNS[(k + rng.int(0, 2)) % PATTERNS.length];
    const n = clamp(3 + Math.floor(d * 4) + rng.int(0, 2) + (round > 2 ? 1 : 0), 3, 9);
    b.spawn(y, 'formation', rng.int(60, 164), rng.int(36, 92), { pattern, n, side: rng.chance(0.5) ? -1 : 1 });
    k++;
    y += Math.max(110, 250 - d * 90 - (round - 1) * 12 + rng.int(-30, 30));
  }

  // spud hazards: lanes at least 3 cells apart inside a 96-unit band, <= 4 per band
  for (let band = 480; band < L - 200; band += 96) {
    const d = diff(band);
    if (!rng.chance(0.35 + d * 0.4)) continue;
    const cnt = clamp(1 + Math.floor(d * 2.5) + rng.int(0, 1), 1, 4);
    const taken = [];
    for (let i = 0; i < cnt; i++) {
      for (let t = 0; t < 8; t++) {
        const x = rng.int(20, 204);
        if (taken.every((p) => Math.abs(p - x) >= 56)) {
          taken.push(x);
          const props = rng.chance(0.4 + d * 0.3) ? { vx: rng.pick([-1, 1]) * rng.int(12, 26 + Math.floor(d * 20)) } : undefined;
          b.spawn(band + rng.int(0, 90), 'spud', x, rng.int(24, 104), props);
          break;
        }
      }
    }
  }

  // tuna every ~550, pickups every ~1150
  for (let ty = 300; ty < L - 150; ty += 520 + rng.int(0, 80)) b.spawn(ty, 'tuna', rng.int(30, 194), rng.int(30, 90));
  const picks = ['nip', 'yarnpick', 'laserpick'];
  for (let i = 0, py = 800; py < L - 300; i++, py += 1100 + rng.int(0, 100)) b.spawn(py, picks[i % 3], rng.int(40, 184), rng.int(30, 90));

  return {
    id: def.id, name: def.name, kind: def.kind, ground: def.ground, length: def.length, bg: def.bg, music: def.music,
    cells: [], spawns: b.sortedSpawns(), decor: [],
  };
}
