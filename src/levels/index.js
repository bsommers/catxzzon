// Level API: buildStage(stageIdx, round, seed) -> Stage. Deterministic per (stageIdx, round, seed).
import { STAGES } from '../core/defs.js';
import { buildFortress } from './fortress.js';
import { buildSpace } from './space.js';
import { buildBoss } from './boss.js';

export function buildStage(stageIdx = 0, round = 1, seed = 1) {
  const n = STAGES.length;
  const idx = ((Math.floor(stageIdx) % n) + n) % n;
  const def = STAGES[idx];
  const r = Math.max(1, Math.floor(round) || 1);
  if (def.kind === 'space') return buildSpace(idx, r, seed, def);
  if (def.kind === 'boss') return buildBoss(idx, r, seed, def);
  return buildFortress(idx, r, seed, def);
}

export default buildStage;
