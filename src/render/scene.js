// World pass: ground -> shadows -> voxels + entities + strands merged in painter order. Owner: render-scene.
// Node-safe (no DOM at import time). Positions come from core/iso.js project(); the camera is applied as an integer
// pixel offset (cdx,cdy) so world-static art never shimmers against the voxels while scrolling.
import { KINDS, CELL, VIEW, TUNING } from '../core/defs.js';
import { project } from '../core/iso.js';
import { buildVoxelIndex, createBlockSprites, isoDepth } from './blocks.js';
import { createGround, GROUND_ROWS_BEHIND, GROUND_ROWS_AHEAD } from './ground.js';
import { createSprites, frameOf, catFrame, spriteTopLeft, fieldGeom, fieldLevel, boxOf } from './sprites.js';

const W = VIEW.W, H = VIEW.H;
const T_SPRITE = 1, T_STRAND = 2, T_POST = 3, T_SHADOW = 4, T_ALT = 5, T_TRAIL = 6, T_PSHADOW = 7, T_POLE = 8, T_GATE = 9;
const SHADOW = 'rgba(16,6,34,0.34)', SHADOW_SPACE = 'rgba(140,220,255,0.10)';
const TRAIL_LIFE = 0.5, FLASH = 0.09, EMPTY = [];
const GATE_RANGE = 184, GATE_FADE = 56, GATE_MIN_COLS = 5, GATE = { y: 0, blocked: false };
const A0 = { sx: 0, sy: 0 }, A1 = { sx: 0, sy: 0 }, TL = { x: 0, y: 0 }, BOX = {};

export function createScene(artRef, mk) {
  const ground = createGround(artRef, mk), blocks = createBlockSprites(artRef, mk), spr = createSprites(artRef, mk);
  let vox = null, voxStage = null, voxN = -1;
  const state = new WeakMap();                       // entity -> render state (measured velocity, hit flash)
  const pstate = { x: 0, y: 0, z: 0, vx: 0, vz: 0, seen: false };
  const dyn = [], order = [], fields = [], hist = [];
  let dynN = 0, fieldN = 0;
  let lastT = NaN, tickDt = 1 / 60, lastScroll = 0, scrollV = 0, camStage = null;
  let cdx = 0, cdy = 0, now = 0, simT = 0;
  const stats = { cells: 0, cellsDrawn: 0, hidden: 0, ents: 0, sprites: 0, strips: 0, fields: 0, dyn: 0 };

  function push(k, type) {
    let d = dyn[dynN];
    if (!d) dyn[dynN] = d = { k: 0, type: 0, name: '', frame: 0, X: 0, Y: 0, f: null, a: 0, b: 0, c: 0, d: 0, e: 0, g: 0, flash: 0, glow: 0, scale: 1, alpha: 1 };
    dynN++; d.k = k; d.type = type;
    return d;
  }
  function sprite(k, name, frame, X, Y, flash, glow, scale, alpha) {
    const d = push(k, T_SPRITE);
    d.name = name; d.frame = frame; d.X = X; d.Y = Y; d.flash = flash; d.glow = glow; d.scale = scale; d.alpha = alpha;
    return d;
  }
  function reset() { hist.length = 0; lastT = NaN; scrollV = 0; pstate.seen = false; }

  // ---- fly-through reticle: the next wall row / live cheese field ahead of the cat --------------------------------
  let colsVox = null; const colsCache = new Map();
  /** Number of columns of row cy holding at least one voxel (a "wall" spans >= GATE_MIN_COLS of the 14). */
  function wallCols(cy) {
    if (colsVox !== vox) { colsVox = vox; colsCache.clear(); }
    let n = colsCache.get(cy);
    if (n === undefined) { n = 0; for (let cx = 0; cx < 32; cx++) if (vox.heights.has(cy * 32 + cx)) n++; colsCache.set(cy, n); }
    return n;
  }
  /**
   * Nearest obstacle plane within GATE_RANGE ahead of the cat box (x,y,z = box bottom centre): a wall-like voxel row
   * or a live field overlapping the cat's x. Fills GATE { y, blocked } and returns it, or null when the way is open.
   * Uses the sim's collision box (TUNING.playerBox, 1 unit of grace) so "mint" really means "fits".
   */
  function findGate(x, y, z, pb) {
    const front = y + pb.d / 2, x0 = x - pb.w / 2 + 1, x1 = x + pb.w / 2 - 1, z0 = z + 1, z1 = z + pb.h - 1;
    let best = Infinity, blocked = false;
    if (vox && vox.count) {
      const c0 = Math.floor(front / CELL) + 1, c1 = c0 + Math.ceil(GATE_RANGE / CELL);
      for (let cy = c0; cy <= c1; cy++) {
        if (wallCols(cy) < GATE_MIN_COLS) continue;
        best = cy * CELL;
        for (let k = cy; k < cy + 3 && !blocked && wallCols(k) >= GATE_MIN_COLS; k++) {      // walls may be a few rows thick
          for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL) && !blocked; cx++)
            for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) if (vox.has(cx, k, cz)) { blocked = true; break; }
        }
        break;
      }
    }
    for (let i = 0; i < fieldN; i++) {
      const f = fields[i];
      if (!(f.lvl > 0) || f.y <= front || f.y >= best || f.y - front > GATE_RANGE) continue;
      if (x1 < f.x0 - 3 || x0 > f.x1 + 3) continue;                    // the field does not span the cat's lane
      best = f.y; blocked = z0 < f.z1 && f.z0 < z1;
    }
    if (best === Infinity || best - front > GATE_RANGE) return null;
    GATE.y = best; GATE.blocked = blocked;
    return GATE;
  }

  function addField(e, x, y, t) {
    const f = fields[fieldN] || (fields[fieldN] = {});
    fieldN++;
    fieldGeom(e, f);
    const dx = x - e.x; f.x0 += dx; f.x1 += dx; f.y = y;
    f.lvl = fieldLevel(e, t);
    f.glow = f.lvl >= 1 && Number.isFinite(e.glow) ? e.glow : f.lvl;
    const frame = Number.isFinite(e.frame) ? e.frame | 0 : f.lvl > 0.3 ? 1 : 0;
    const zb = Math.max(0, f.z1 - (artRef.art.size('field_post').h - 6));
    for (let side = 0; side < 2; side++) {
      const px = side ? f.x1 : f.x0;
      for (let za = 0; za < zb; za += CELL) { const d = push(isoDepth(px, y, Math.min(zb, za + CELL)), T_POLE); d.a = px; d.b = y; d.c = za; d.d = Math.min(zb, za + CELL); }
      const d = push(isoDepth(px, y, zb + 34), T_POST); d.f = f; d.a = px; d.frame = frame; d.glow = f.glow;
    }
    // one drawable per (cell-wide slice in x) x (cell-tall band in z) so ropes sort correctly against walls and the cat
    for (let xa = f.x0; xa < f.x1 - 0.01;) {
      const xb = Math.min(f.x1, (Math.floor(xa / CELL + 1e-6) + 1) * CELL);
      for (let i0 = 0; i0 < f.n;) {
        const zBase = f.z0 + 3 + ((f.z1 - f.z0 - 6) * i0) / (f.n - 1), band = Math.floor(zBase / CELL);
        let i1 = i0 + 1;
        while (i1 < f.n && Math.floor((f.z0 + 3 + ((f.z1 - f.z0 - 6) * i1) / (f.n - 1)) / CELL) === band) i1++;
        const d = push(isoDepth((xa + xb) / 2, y, band * CELL + CELL / 2), T_STRAND);
        d.f = f; d.a = xa; d.b = xb; d.c = i0; d.d = i1;
        i0 = i1;
      }
      xa = xb;
    }
  }

  /**
   * Draw the world into ctx (640x360 space). view: { alpha, dt, now } in; { camY, cdx, cdy } out.
   * alpha = fraction of a sim step since the last tick (positions are extrapolated with measured velocities).
   */
  function draw(ctx, game, view) {
    const stage = game.stage, art = artRef.art;
    now = view.now || 0;
    const fdt = view.dt || 0;
    // ---- voxel index (rebuilt on stage change)
    const cellsArr = (stage && stage.cells) || EMPTY;
    if (stage !== voxStage || cellsArr.length !== voxN) { vox = buildVoxelIndex(cellsArr); voxStage = stage; voxN = cellsArr.length; }
    // ---- tick tracking / extrapolation
    const gt = game.t || 0, newTick = gt !== lastT;
    if (newTick) {
      const d = gt - lastT, ds = game.scrollY - lastScroll, ok = d > 0 && d < 0.1 && camStage === stage;
      tickDt = ok ? d : 1 / 60;
      scrollV = ok && Math.abs(ds) < 24 ? ds / d : 0;
      lastT = gt; lastScroll = game.scrollY; camStage = stage;
    }
    const ext = Math.max(0, Math.min(1, view.alpha || 0)) * tickDt;
    const camY = (game.scrollY || 0) + scrollV * ext;
    simT = gt + ext;
    const t = simT;
    project(0, 0, 0, 0, A0); project(0, 0, 0, camY, A1);
    const edx = A1.sx - A0.sx, edy = A1.sy - A0.sy;
    cdx = Math.round(edx); cdy = Math.round(edy);
    view.camY = camY; view.cdx = cdx; view.cdy = cdy;
    const space = !stage || !stage.ground || stage.ground === 'none';

    // ---- ground, cast shadows, decor
    stats.strips = ground.draw(ctx, stage, camY, cdx, cdy, now, vox);

    // ---- collect drawables
    dynN = 0; fieldN = 0;
    const ents = game.ents || EMPTY, player = game.player;
    let nSprites = 0;
    ctx.beginPath();                                   // ground shadows accumulate into one path
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e || e.dead || e === player || e.kind === 'cat') continue;
      const v = e.y - camY;
      if (!(v > -GROUND_ROWS_BEHIND - 40 && v < GROUND_ROWS_AHEAD + 60)) continue;
      let s = state.get(e);
      if (!s) { s = { hp: e.hp, flashT: 0, muzzleT: 0, x: e.x, y: e.y, z: e.z, vx: 0, vy: 0, vz: 0 }; state.set(e, s); }
      else if (newTick) {
        const dx = e.x - s.x, dy = e.y - s.y, dz = e.z - s.z;
        if (Math.abs(dx) < 24 && Math.abs(dy) < 24 && Math.abs(dz) < 24) { s.vx = dx / tickDt; s.vy = dy / tickDt; s.vz = dz / tickDt; } else { s.vx = s.vy = s.vz = 0; }
        s.x = e.x; s.y = e.y; s.z = e.z;
        if (e.hp < s.hp) s.flashT = FLASH;
        s.hp = e.hp;
      }
      if (s.flashT > 0) s.flashT -= fdt;
      const x = e.x + s.vx * ext, y = e.y + s.vy * ext, z = (e.z || 0) + s.vz * ext;
      if (e.kind === 'field') { addField(e, x, y, t); continue; }
      const kd = KINDS[e.kind], name = e.art || (kd && kd.art);
      if (!name) continue;
      boxOf(e, BOX);
      const sz = art.size(name), scale = e.small ? 10 / 16 : 1;
      spriteTopLeft(name, sz.w, sz.h, x, y, z, BOX.w, BOX.d, BOX.h, TL);
      const X = Math.round(TL.x) + cdx, Y = Math.round(TL.y) + cdy;
      if (X > W + 32 || X + sz.w < -32 || Y > H + 96 || Y + sz.h < -32) continue;
      const flash = Math.max(s.flashT > 0 ? s.flashT / FLASH : 0, e.tele > 0 ? e.tele * 0.32 : 0);
      const glow = e.kind === 'spud' && Number.isFinite(e.heat) ? 0.35 + 0.65 * e.heat : 0.72 + 0.2 * Math.sin(now * 9 + (e.id | 0));
      sprite(isoDepth(x, y, z + BOX.h / 2), name, frameOf(e, game, t, s), X, Y, flash, glow, scale, 1);
      nSprites++;
      if (!kd || kd.shadow !== false) {
        const z0 = vox.count ? vox.topUnder(x, y, z) : 0, sc = e.small ? 0.62 : 1;
        if (z0 > 0) { const d = push(isoDepth((Math.floor(x / CELL) + 0.5) * CELL, (Math.floor(y / CELL) + 0.5) * CELL, z0 - CELL) + 0.5, T_SHADOW); d.a = x; d.b = y; d.c = z0; d.d = z - z0; d.e = BOX.w * sc; d.g = BOX.d * sc; }
        else spr.shadowPath(ctx, x, y, 0, z, BOX.w * sc, BOX.d * sc, cdx, cdy);
      }
    }
    ctx.fillStyle = space ? SHADOW_SPACE : SHADOW;
    ctx.fill();

    // ---- player: shadow, altitude line, rainbow, aura, ship
    const nip = game.nipT > 0;
    if (player && Number.isFinite(player.x)) {
      if (newTick) {
        const dx = player.x - pstate.x, dz = player.z - pstate.z, ok = pstate.seen && Math.abs(dx) < 24 && Math.abs(dz) < 24;
        pstate.vx = ok ? dx / tickDt : 0; pstate.vz = ok ? dz / tickDt : 0;
        pstate.x = player.x; pstate.z = player.z; pstate.seen = true;
      }
      const px = player.x + pstate.vx * ext, pz = (player.z || 0) + pstate.vz * ext;
      const py = (Number.isFinite(player.y) ? player.y : (game.scrollY || 0) + VIEW.PLAYER_LEAD) + scrollV * ext;
      const alive = player.alive !== false && game.state !== 'gameover';
      const pb = TUNING.playerBox, kp = isoDepth(px, py, pz + pb.h / 2);
      if (alive) {
        const z0 = vox.count ? vox.topUnder(px, py, pz) : 0;
        if (z0 > 0) { const d = push(isoDepth((Math.floor(px / CELL) + 0.5) * CELL, (Math.floor(py / CELL) + 0.5) * CELL, z0 - CELL) + 0.6, T_PSHADOW); d.a = px; d.b = py; d.c = z0; d.d = pz - z0; }
        else spr.playerShadow(ctx, px, py, 0, pz, edx, edy, space);
        for (let za = z0; za < pz - 0.5;) {
          const zb = Math.min(pz, (Math.floor(za / CELL + 1e-6) + 1) * CELL);
          const d = push(isoDepth(px, py, (za + zb) / 2) - 0.4, T_ALT); d.a = px; d.b = py; d.c = za; d.d = zb;
          za = zb;
        }
        const gate = game.state === 'play' || game.state === undefined ? findGate(px, py, pz, pb) : null;
        if (gate) {
          const dist = gate.y - (py + pb.d / 2), ga = Math.min(1, (GATE_RANGE - dist) / GATE_FADE, dist / 14);
          if (ga > 0.02) { const d = push(isoDepth(px + pb.w / 2, gate.y - 1, pz + pb.h) + 0.7, T_GATE); d.a = px; d.b = gate.y - 0.5; d.c = pz; d.d = gate.blocked ? 1 : 0; d.e = ga * 0.92; }
        }
        if (nip) {
          const last = hist[hist.length - 1];
          if (!last || now - last.t > 0.012) hist.push({ x: px, y: py - 9, z: pz + 4, t: now });
          const sz = art.size('cat_aura');
          spriteTopLeft('cat_aura', sz.w, sz.h, px, py, pz, pb.w, pb.d, pb.h, TL);
          sprite(kp - 0.2, 'cat_aura', Math.floor(now * 10) & 3, Math.round(TL.x + edx), Math.round(TL.y + edy), 0, 0.8, 1, 0.82 + 0.12 * Math.sin(now * 13));
        }
        const blink = player.invuln > 0 && !nip && Math.floor(now * 18) % 3 === 0;
        if (!blink) {
          const sz = art.size('cat_ship');
          spriteTopLeft('cat_ship', sz.w, sz.h, px, py, pz, pb.w, pb.d, pb.h, TL);
          const bob = Math.round(Math.sin(now * 5.2) * 1.1);
          sprite(kp, 'cat_ship', catFrame(player.bank, t), Math.round(TL.x + edx), Math.round(TL.y + edy) + bob, 0, 0.85, 1, 1);
          nSprites++;
        }
      }
      while (hist.length && now - hist[0].t > TRAIL_LIFE) hist.shift();
      if (hist.length > 1) push(kp - 0.3, T_TRAIL);
    }

    // ---- painter pass: merge cached sorted cells with the sorted dynamic list
    order.length = dynN;
    for (let i = 0; i < dynN; i++) order[i] = dyn[i];
    order.sort((a, b) => a.k - b.k);
    const cy0 = Math.floor((camY - GROUND_ROWS_BEHIND) / CELL), cy1 = Math.floor((camY + GROUND_ROWS_AHEAD) / CELL);
    const cells = vox.count ? vox.visibleCells(cy0, cy1) : EMPTY, nc = cells.length;
    let ci = 0, di = 0, drawn = 0;
    while (ci < nc || di < dynN) {
      if (di >= dynN || (ci < nc && cells[ci].k <= order[di].k)) {
        const c = cells[ci++], X = c.bx + cdx, Y = c.by + cdy;
        if (X > W + 20 || X < -52 || Y > H + 20 || Y < -52) continue;
        ctx.drawImage(blocks.get(c.t, c.lvl), X, Y);
        drawn++;
        const g = blocks.glow(c.t);
        if (g) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.55 + 0.3 * Math.sin(now * 7 + c.cx * 1.7 + c.cy * 0.9 + c.cz);
          ctx.drawImage(g, X - 4, Y - 4);
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
      } else drawDyn(ctx, order[di++], edx, edy, space);
    }
    stats.cells = nc; stats.cellsDrawn = drawn; stats.hidden = vox.hidden; stats.ents = ents.length; stats.sprites = nSprites; stats.fields = fieldN; stats.dyn = dynN;
  }

  const OPT = { flash: 0, glow: 0, scale: 1, alpha: 1 };
  function drawDyn(ctx, d, edx, edy, space) {
    switch (d.type) {
      case T_SPRITE: OPT.flash = d.flash; OPT.glow = d.glow; OPT.scale = d.scale; OPT.alpha = d.alpha; spr.drawSprite(ctx, d.name, d.frame, d.X, d.Y, OPT); break;
      case T_STRAND: spr.strandSlice(ctx, d.f, d.a, d.b, d.c, d.d, now, cdx, cdy, d.f.lvl); break;
      case T_POST: spr.post(ctx, d.f, d.a, d.frame, cdx, cdy, d.glow); break;
      case T_POLE: spr.pole(ctx, d.a, d.b, d.c, d.d, cdx, cdy); break;
      case T_SHADOW: ctx.beginPath(); spr.shadowPath(ctx, d.a, d.b, d.c, d.d, d.e, d.g, cdx, cdy); ctx.fillStyle = SHADOW; ctx.fill(); break;
      case T_PSHADOW: spr.playerShadow(ctx, d.a, d.b, d.c, d.d, edx, edy, false); break;
      case T_ALT: spr.altSegment(ctx, d.a, d.b, d.c, d.d, edx, edy); break;
      case T_GATE: spr.gateMarker(ctx, d.a, d.b, d.c, TUNING.playerBox.w, TUNING.playerBox.h, cdx, cdy, d.d === 1, d.e, now); break;
      case T_TRAIL: spr.rainbowTrail(ctx, hist, now, TRAIL_LIFE, cdx, cdy); break;
      default: break;
    }
  }

  /** Additive bloom for live cheese fields; call with globalCompositeOperation = 'lighter' after the world pass. */
  function drawGlow(ctx) {
    for (let i = 0; i < fieldN; i++) { const f = fields[i]; if (f.lvl > 0) spr.strandBloom(ctx, f, now, cdx, cdy, f.glow); }
  }
  return { draw, drawGlow, reset, stats, findGate, get vox() { return vox; } };
}
