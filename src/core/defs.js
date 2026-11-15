// CATXZZON canonical definitions. FROZEN: owned by the orchestrator. Pure data + tiny helpers; runs in Node and the browser.
// If something here is wrong or missing, record it under "Requests" in your report; do not edit.

export const CELL = 16;                       // one voxel = 16 world units
export const FIELD_CELLS_X = 14;              // playfield is 14 cells wide
export const FIELD_W = FIELD_CELLS_X * CELL;  // 224 units, x in [0, FIELD_W]
export const FIELD_CELLS_Z = 8;
export const FIELD_H = FIELD_CELLS_Z * CELL;  // 128 units, z in [0, FIELD_H]
export const cellKey = (cx, cy, cz) => cy * 1024 + cz * 32 + cx;   // cx<32, cz<32, cy>=0

// ---- view / projection (see iso.js) ----
export const VIEW = {
  W: 640, H: 360,           // internal canvas resolution (CSS-scaled, nearest neighbour)
  ox: 230, oy: 292,         // screen origin of (u=0, v=0, z=0), u = x - FIELD_W/2, v = y - camY
  A: 1, B: 0.5, C: 1,       // sx = ox + (u+v)*A ; sy = oy + (u-v)*B - z*C
  PLAYER_LEAD: 48,          // player.y = scrollY + PLAYER_LEAD
  SPAWN_AHEAD: 560,         // spawn/activate entities when y < scrollY + SPAWN_AHEAD
  DESPAWN_BEHIND: 80,       // remove entities when y < scrollY - DESPAWN_BEHIND
};

// ---- tuning (sim-core owns using them; others read) ----
export const TUNING = {
  baseSpeed: 84,            // forward scroll, units/s (round 1)
  speedPerRound: 10,        // + per round, capped at +50
  moveX: 150,               // lateral units/s
  moveZ: 110,               // climb/dive units/s
  zMin: 6, zMax: FIELD_H - 6, xMin: 8, xMax: FIELD_W - 8,
  fireRate: 7.5,            // shots/s while held
  shotSpeed: 330,           // forward units/s relative to world
  shotRange: 380,
  nipFireRate: 13,
  fuelMax: 100, fuelDrain: 2.1, fuelLow: 25, tunaFuel: 28,
  lives: 3, extraLifeAt: [20000, 60000, 120000, 200000],
  invulnAfterDeath: 2.2,    // seconds
  nipTime: 8, laserTime: 7,
  bombs: 2,                 // yarn bombs at start; bomb clears small enemies on screen, damages boss
  playerBox: { w: 10, d: 12, h: 8 },
  bossHits: 40,
};

// ---- entity kinds. Box = [x±w/2] x [y±d/2] x [z, z+h]. team: p=player side, e=enemy side, n=neutral/pickup. ----
// hit: can be damaged by player shots. solid: kills the player on contact (else only damages via its own attacks).
// shadow: renderer draws ground shadow. art: sprite name (defs.ART). score: points when destroyed.
export const KINDS = {
  cat:      { team: 'p', w: 10, d: 12, h: 8,  hp: 1,  art: 'cat_ship',    shadow: true },
  hairball: { team: 'p', w: 5,  d: 10, h: 5,  hp: 1,  art: 'hairball',    shadow: true },   // player shot, +y
  yarn:     { team: 'p', w: 8,  d: 8,  h: 8,  hp: 1,  art: 'yarn',        shadow: true },   // bomb shell (lobbed forward then bursts)
  cheeseball:{team: 'e', w: 6,  d: 6,  h: 6,  hp: 1,  art: 'cheeseball',  shadow: true },   // enemy bullet
  turret:   { team: 'e', w: 12, d: 12, h: 14, hp: 2,  art: 'rat_turret',  shadow: true, hit: true, score: 300 },  // rat gunner on ground or on a wall top
  pad:      { team: 'e', w: 14, d: 14, h: 10, hp: 3,  art: 'can_pad',     shadow: true, hit: true, score: 200 },  // spray-cheese-can silo; launches 'can' when player is within trigger dy
  can:      { team: 'e', w: 8,  d: 8,  h: 20, hp: 1,  art: 'can_rocket',  shadow: true, hit: true, score: 150 },  // launched spray-cheese-can rocket
  tuna:     { team: 'n', w: 14, d: 14, h: 12, hp: 1,  art: 'tuna_tin',    shadow: true, hit: true, score: 250 },  // shoot it for fuel
  radar:    { team: 'e', w: 14, d: 14, h: 18, hp: 2,  art: 'radar_dish',  shadow: true, hit: true, score: 500 },  // cheese-wheel dish; bonus
  field:    { team: 'e', w: 16, d: 8,  h: 16, hp: 99, art: 'field_post',  shadow: false, solid: true },           // spray-cheese strand barrier (x0..x1 via props.span cells, z0..z1)
  mousejet: { team: 'e', w: 14, d: 14, h: 10, hp: 1,  art: 'mouse_jet',   shadow: true, hit: true, score: 100 },  // space-stage fighter
  spud:     { team: 'e', w: 16, d: 16, h: 16, hp: 2,  art: 'hot_spud',    shadow: true, hit: true, score: 80, solid: true },  // hot potato hazard (space stage)
  boss:     { team: 'e', w: 56, d: 28, h: 64, hp: 40, art: 'jesse',       shadow: true, hit: true, score: 25000 }, // Big Boss Rat Jesse
  bossmissile:{team:'e',w: 12, d: 12, h: 12, hp: 2,  art: 'jesse_missile', shadow: true, hit: true, score: 500, solid: true },
  nip:      { team: 'n', w: 12, d: 12, h: 12, hp: 1,  art: 'nip',         shadow: true },   // pickup: catnip overdrive
  yarnpick: { team: 'n', w: 12, d: 12, h: 12, hp: 1,  art: 'yarn',        shadow: true },   // pickup: +1 yarn bomb
  laserpick:{ team: 'n', w: 12, d: 12, h: 12, hp: 1,  art: 'laser_dot',   shadow: true },   // pickup: laser pointer (homing shots)
};

// ---- block (voxel) types for castle geometry. Sprites are 32x32 iso cubes named blk_<name>. ----
export const BLOCKS = {
  cheddar: 1, swiss: 2, crown: 3, window: 4, mousehole: 5, rind: 6, flag: 7, gold: 8, cracker: 9,
};
export const BLOCK_NAMES = Object.fromEntries(Object.entries(BLOCKS).map(([k, v]) => [v, k]));

// ---- stages ----
// ground: tile sprite family ('cracker'|'gouda'|'keep') or 'none' (space). kind: fortress|space|boss.
export const STAGES = [
  { id: 'citadel', name: 'CHEDDAR CITADEL',  kind: 'fortress', ground: 'cracker', length: 5200, music: 'fortress', bg: 'dusk' },
  { id: 'spuds',   name: 'SPUD BELT',        kind: 'space',    ground: 'none',    length: 3600, music: 'space',    bg: 'void' },
  { id: 'keep',    name: 'GORGONZOLA KEEP',  kind: 'fortress', ground: 'gouda',   length: 5600, music: 'fortress2', bg: 'night' },
  { id: 'lair',    name: "JESSE'S LAIR",     kind: 'boss',     ground: 'keep',    length: 1500, music: 'boss',     bg: 'night' },
];

// Level generator output (src/levels/index.js: buildStage(stageIdx, round, seed) -> Stage):
//   Stage = { id, name, kind, ground, length, bg, music,
//             cells:  [{cx, cy, cz, t}],            // voxels; cy = absolute cell row (y = cy*CELL .. +CELL); t = BLOCKS value
//             spawns: [{y, kind, x, z=0, ...props}],// entities; sorted by y ascending; kind in KINDS (+ 'formation')
//             decor:  [{y, x, type}],               // flat ground decals ('crater'|'hole'|'seam'|'rune'), no collision
//             bossY?: number }                      // y where the boss arena starts (kind 'boss')
// Spawn props: turret{facing?}, pad{trigger=170}, field{span:cells, z0, z1, pulse?:period s, phase?}, tuna{}, radar{},
//   formation{pattern:'vee'|'line'|'swoop'|'ring'|'zig', n, side?:-1|1}, spud{vx?}, nip{}, yarnpick{}, laserpick{}.

// ---- bus events (sim -> render/audio/ui). payload shapes in ARCHITECTURE.md §6 ----
export const EVENTS = ['sfx', 'music', 'fx', 'shake', 'flash', 'hitstop', 'popup', 'stage', 'banner', 'score', 'life', 'fuel',
  'boss', 'gameover', 'victory', 'combo', 'bomb', 'pause', 'taunt'];

export const SFX = [
  'shot', 'shot_nip', 'boom_small', 'boom_big', 'boom_boss', 'tink', 'pickup_tuna', 'pickup_nip', 'pickup_yarn', 'pickup_laser',
  'bomb', 'can_launch', 'can_hiss', 'field_zap', 'turret_fire', 'jet_swoosh', 'player_hurt', 'player_die', 'meow_a', 'meow_b',
  'meow_hurt', 'extra_life', 'low_fuel', 'stage_start', 'stage_clear', 'boss_laugh', 'boss_hiss', 'boss_hit', 'boss_die',
  'spud_pop', 'ui_move', 'ui_select', 'ui_back', 'coin', 'combo_up', 'warning', 'thread_needle',
];
export const MUSIC = ['title', 'fortress', 'space', 'fortress2', 'boss', 'victory', 'gameover'];

export const POPUP_COLORS = { score: '#ffe14a', bonus: '#ff9a2e', warn: '#ff4a4a', cool: '#6af0ff' };

// ---- art manifest: every sprite the art modules must produce (checked by tools/sheet.mjs). ----
// row: [name, kind, w, h, frames, module, desc]. kind 'sprite' (transparent bg) | 'tile' (fully opaque, tileable).
// Iso conventions: forward (+y) points UP-RIGHT on screen; light comes from the upper-left; every sprite has a 1px dark outline (#1a1420).
// Entity sprites are anchored at BOTTOM-CENTER of the 3D footprint (renderer positions them); blocks fill the full 32x32 cube bounding box.
const ART_ROWS = [
  // --- hero + shots (module cat) ---
  ['cat_ship', 'sprite', 48, 40, 10, 'cat', 'Orange tabby cat as spaceship seen from behind/above, facing up-right. Frames = (bank+2)*2+anim; bank -2..2 (-2 = hard left roll), anim 0/1 = tail-flame flicker'],
  ['cat_head', 'sprite', 14, 14, 2, 'cat', 'HUD life icon: orange cat head (frame 1 = grey/lost)'],
  ['cat_portrait', 'sprite', 64, 64, 3, 'cat', 'Major Marmalade bust for title/game over: frame 0 grin, 1 worried, 2 victorious'],
  ['hairball', 'sprite', 10, 12, 2, 'cat', 'player shot: glowing furball, 2-frame spin'],
  ['yarn', 'sprite', 14, 14, 4, 'cat', 'ball of red yarn, 4-frame roll (bomb shell + pickup)'],
  ['nip', 'sprite', 16, 16, 4, 'cat', 'catnip leaf pickup, sparkly, 4-frame pulse'],
  ['laser_dot', 'sprite', 16, 16, 4, 'cat', 'laser-pointer pickup (red dot + pen), 4-frame pulse'],
  ['cat_aura', 'sprite', 56, 48, 4, 'cat', 'catnip overdrive rainbow aura drawn behind the ship, 4 frames'],
  // --- effects (module fx) ---
  ['boom_small', 'sprite', 32, 32, 6, 'fx', 'cheese-splat explosion, orange/yellow/white, 6 frames'],
  ['boom_big', 'sprite', 64, 64, 8, 'fx', 'big explosion with crumb ring, 8 frames'],
  ['crumb', 'sprite', 4, 4, 4, 'fx', 'cheese crumb particles, 4 colour variants'],
  ['spark', 'sprite', 8, 8, 4, 'fx', 'white-yellow hit spark, 4 frames shrinking'],
  ['smoke', 'sprite', 16, 16, 4, 'fx', 'puff, 4 frames growing/fading'],
  ['ring', 'sprite', 48, 24, 4, 'fx', 'iso shockwave ellipse, 4 frames expanding'],
  ['field_post', 'sprite', 16, 40, 2, 'fx', 'spray-cheese-nozzle post (a can standing on end, nozzle up) that anchors a barrier; frame 1 = glowing'],
  ['strand', 'tile', 16, 16, 4, 'fx', 'tileable horizontal yellow/orange spray-cheese strand (wavy rope of cheese, dripping); draws OPAQUE on #000; renderer uses it as a mask/additive; 4 anim frames'],
  ['cheeseball', 'sprite', 10, 10, 2, 'fx', 'enemy bullet: yellow cheese glob with highlight, 2 frames'],
  // --- castle (module castle) ---
  ['blk_cheddar', 'sprite', 32, 32, 1, 'castle', 'iso cube (top+front-left+side-right faces), orange cheddar brick, mortar lines'],
  ['blk_swiss', 'sprite', 32, 32, 1, 'castle', 'iso cube, pale swiss cheese with dark holes'],
  ['blk_crown', 'sprite', 32, 32, 1, 'castle', 'iso cube with battlement merlons shaped like cheese wedges on top (top face is notched)'],
  ['blk_window', 'sprite', 32, 32, 1, 'castle', 'iso cube with dark arched window, tiny glowing candle'],
  ['blk_mousehole', 'sprite', 32, 32, 1, 'castle', 'iso cube with a mouse-hole arch door (dark, whisker-tuft sign) on front face'],
  ['blk_rind', 'sprite', 32, 32, 1, 'castle', 'iso cube, dark waxy red rind / base course'],
  ['blk_flag', 'sprite', 32, 32, 1, 'castle', 'iso cube topped by a pole with a red pennant; emblem = black cheese wedge in white disc (NO real-world insignia)'],
  ['blk_gold', 'sprite', 32, 32, 1, 'castle', 'iso cube, gold foil cheese wrapper, glossy'],
  ['blk_cracker', 'sprite', 32, 32, 1, 'castle', 'iso cube, tan cracker with dotted holes'],
  ['gnd_cracker', 'tile', 32, 16, 4, 'castle', '2:1 iso diamond ground tile; corners are FILLED (sheet.mjs requires opaque tiles) so the renderer MUST clip to the diamond (castle.js exports topMask); tan cracker plain with 4 variants (crumbs/cracks)'],
  ['gnd_gouda', 'tile', 32, 16, 4, 'castle', 'iso diamond ground tile, red-rind/yellow gouda moon surface, 4 variants'],
  ['gnd_keep', 'tile', 32, 16, 4, 'castle', 'iso diamond ground tile, dark checkered keep floor, purple/gold, 4 variants'],
  ['decor_crater', 'sprite', 32, 16, 3, 'castle', 'flat iso crater / cheese-hole decal'],
  ['decor_hole', 'sprite', 24, 12, 2, 'castle', 'flat iso mouse-hole decal'],
  ['decor_rune', 'sprite', 32, 16, 2, 'castle', 'flat iso decal: glowing cheese-wedge sigil'],
  // --- ratty enemies (module enemies) ---
  ['rat_turret', 'sprite', 24, 28, 6, 'enemies', 'grey rat gunner with spiked helmet at a cheese-block gun nest; frames 0-3 aim toward the 4 iso diagonals (down-left,down-right,up-left,up-right), 4 = muzzle flash, 5 = hit'],
  ['can_pad', 'sprite', 24, 20, 3, 'enemies', 'silo hatch holding a spray-cheese can; 0 closed, 1 armed (can nozzle visible, blinking light), 2 opening'],
  ['can_rocket', 'sprite', 16, 32, 4, 'enemies', 'spray-cheese can in flight, nozzle up, cheese-jet exhaust below, 4-frame flicker; label reads SQUEEZ CHEEZ (no real brands)'],
  ['tuna_tin', 'sprite', 20, 16, 2, 'enemies', 'open tuna tin with fish, blue label; frame 1 = flashing highlight'],
  ['radar_dish', 'sprite', 28, 32, 4, 'enemies', 'cheese-wheel radar dish with whisker antenna, 4-frame rotation'],
  ['mouse_jet', 'sprite', 28, 24, 5, 'enemies', 'tiny mouse piloting a cheese-wedge jet, seen from behind/above, banks -2..2'],
  ['hot_spud', 'sprite', 24, 24, 4, 'enemies', 'angry glowing hot potato with ember cracks, 4-frame tumble'],
  // --- boss (module boss) ---
  ['jesse', 'sprite', 112, 120, 8, 'boss', 'BIG BOSS RAT "Jesse": giant rat that looks like a grey dilute tortie cat: soft blue-grey fur, cream+apricot patches (split face), amber eyes, imperious; seated in a cheese-throne walker; frames: 0 idle,1 idle2,2 taunt,3 charge/glow,4 fire,5 hurt,6 enraged,7 defeated'],
  ['jesse_missile', 'sprite', 24, 24, 4, 'boss', 'giant homing spray-cheese can missile with angry eyes, 4 frames'],
  ['jesse_bust', 'sprite', 64, 64, 2, 'boss', 'HUD/intro bust of Jesse; frame 1 = enraged'],
  // --- background (module spuds) ---
  ['spud_bg', 'sprite', 32, 32, 12, 'spuds', 'space potatoes, 12 variants: plain, with eyes, sunglasses, tiny crown, sprouted, purple sweet potato, tater tot, half-peeled, french-fry comet, baked w/ butter, mashed blob, golden spud. Drawn once at 32x32, renderer scales'],
  ['planet_baked', 'sprite', 128, 128, 1, 'spuds', 'giant baked-potato planet with butter pat and steam'],
  ['planet_gouda', 'sprite', 96, 96, 1, 'spuds', 'cratered gouda moon with red rind equator'],
  ['star', 'sprite', 8, 8, 3, 'spuds', 'twinkle star, 3 sizes'],
];
export const ART = ART_ROWS.map(([name, kind, w, h, frames, module, desc]) => ({ name, kind, w, h, frames, module, desc }));
export const ART_MODULES = ['cat', 'fx', 'castle', 'enemies', 'boss', 'spuds'];
export function artManifest() { return ART; }

export const SCORES = { thread: 500, cleanSweep: 2000, stageClear: 3000, fuelBonusPerUnit: 20, comboCap: 8 };

export const TAUNTS = [   // Jesse barks (boss module + HUD)
  'YOU DARE ENTER MY CASTLE?', 'MY CHEESE. MINE.', 'NAP TIME IS OVER, KITTEN.', 'I WAS BOSSING BEFORE YOU WERE BORN.',
  'FEED ME. NOW.', 'BEHOLD MY DILUTE FURY!', 'THE RUG IS MINE TOO.', 'YOU CALL THAT A MEOW?',
];
