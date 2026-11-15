// Score, combo, extra lives, bonuses (sim-core).
import { TUNING, SCORES, POPUP_COLORS } from '../core/defs.js';

export const COMBO_WINDOW = 1.5;

export function comboMult(g) { return Math.max(1, Math.min(g.combo, SCORES.comboCap)); }

/** Add raw points (no multiplier). Emits `score`, handles hiscore + extra lives. */
export function addScore(g, delta) {
  if (!(delta > 0)) return;
  g.score += delta;
  if (g.score > g.hiscore) g.hiscore = g.score;
  g.bus.emit('score', { score: g.score, delta, combo: g.combo });
  const at = TUNING.extraLifeAt;
  while (g._lifeIdx < at.length && g.score >= at[g._lifeIdx]) {
    g._lifeIdx++;
    g.lives++;
    g.sfx('extra_life');
    g.bus.emit('life', { lives: g.lives });
    g.popup('1UP!', g.player.x, g.player.y, g.player.z + 14, POPUP_COLORS.cool);
  }
}

/** Register a player kill worth `base` points at (x,y,z); advances the combo chain. Returns points awarded. */
export function scoreKill(g, base, x, y, z) {
  g.combo = g.comboT > 0 ? g.combo + 1 : 1;
  g.comboT = COMBO_WINDOW;
  const mult = comboMult(g);
  if (g.combo >= 2) {
    g.bus.emit('combo', { n: g.combo, mult });
    if (g.combo <= SCORES.comboCap) g.sfx('combo_up');
  }
  const pts = (base | 0) * mult;
  if (pts > 0) {
    addScore(g, pts);
    g.popup(mult > 1 ? `${pts} x${mult}` : `${pts}`, x, y, z, POPUP_COLORS.score);
  }
  return pts;
}

/** Flat bonus with a popup at the player. */
export function bonus(g, pts, text) {
  addScore(g, pts);
  g.popup(text, g.player.x, g.player.y, g.player.z + 16, POPUP_COLORS.bonus);
}

export function tickCombo(g, dt) {
  if (g.comboT > 0) { g.comboT -= dt; if (g.comboT <= 0) { g.comboT = 0; g.combo = 0; } }
}
