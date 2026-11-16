// Shared harness for boss tests (owner: sim-boss).
import { createGame } from '../src/sim/game.js';
import { buildStage } from '../src/levels/index.js';
import { createBus } from '../src/core/events.js';
export const DT = 1 / 60;
export function mkGame(seed = 11, round = 1) {
  const bus = createBus(), log = [];
  bus.on('*', (type, p) => log.push({ type, p: p && typeof p === 'object' ? { ...p } : p }));
  const g = createGame({ seed, bus, round, stageIdx: 3, buildStage });
  return { g, bus, log };
}
const INP = { dx: 0, dz: 0, fire: false, bomb: false, pause: false };
/** Run until the boss exists (god mode on the way). */
export function toArena(g, maxT = 40) {
  for (let t = 0; t < maxT && !g.boss; t += DT) { g.player.invuln = 99; g.fuel = 100; INP.dx = 0; INP.dz = 0; INP.fire = false; g.update(DT, INP); }
  return g.boss;
}
/** Perfect-aim bot: tracks Jesse's head and holds fire. god: keep invulnerable. */
export function botStep(g, god = true) {
  const b = g.boss, p = g.player;
  if (god) { p.invuln = 99; }
  INP.fire = true;
  if (b && !b.dead) {
    const tz = b.z + b.h * 0.72 - 4;
    INP.dx = Math.max(-1, Math.min(1, (b.x - p.x) / 6));
    INP.dz = Math.max(-1, Math.min(1, (tz - p.z) / 6));
  } else { INP.dx = 0; INP.dz = 0; }
  g.update(DT, INP);
}
export function idle(g, god = true) { if (god) g.player.invuln = 99; INP.dx = INP.dz = 0; INP.fire = false; g.update(DT, INP); }
