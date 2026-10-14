// Hand-built race track pieces. The generator strings these together into a
// stage, left to right: you race to the flag at the far end.
//
// Every piece is 20 tiles wide and 14 tall.
// You only draw the bottom rows; missing rows at the top are filled with
// empty space. Draw the ground as one solid shape: only the top of each
// column matters, so no overhangs or floating platforms.
//
// Legend
//   .  empty            #  ground
//   /  ramp up (one tile up, left to right; ground under it)
//   \  ramp down (one tile down, left to right; ground under it)
//      Riding off the top of a ramp launches you. Ramps are 45 degrees: a
//      stack of them climbs one tile per column.
//   ^  spikes (crash if you touch them)    ~  mud (halves your top speed)
//   =  boost pad (shoots you forward)      C  coin
//   P  player start (start pieces)          F  finish flag (exit pieces)
//   R  rival: rides along and kicks when you're side by side; kick it off
//      the track first (Z or X). r = optional rival (only if the budget allows)
//   M  rammer: waits until you pass, then charges from behind. Jump it or
//      kick it. m = optional. Genre level 2+ pieces only; see minLevel below.
//   K  the champion (boss starting pieces only; see BOSS_TRACKS at the bottom)
//   Spikes, mud, pads, rivals, P, F and K sit on flat ground (the row right
//   above a '#' top). Coins go anywhere in the air.
//
// Rules (checked when the game loads, and by npm run check:race):
//   - every row is exactly 20 characters
//   - the first 4 and last 4 columns are flat ground on row 12 with nothing
//     to jump, so a jump at the end of one piece never lands in a pit at the
//     start of the next (and the boss loop's end joins its start cleanly).
//   - ramps join the ground smoothly (no wall right before or after one)
//   - npm run check:race rides a test bot through every piece with every
//     twist at every level, and fails if a piece can't be cleared.
//
// How far things are (top speed, normal gravity): a hop is about 2.5 tiles
// high and 6 tiles long; a one-tile ramp at speed throws you about 7 tiles;
// pits up to 3 tiles can be hopped from a run-up. Leave about 7 tiles between
// the start of one thing to jump and the next, so you land on flat ground.
//
// Twist-only pieces: { twists: [...] } after the art, exactly like chunks.js;
// { notTwists: [...] } is the opposite. Genre-level pieces: { minLevel: 2 }
// keeps a piece out until racing is played at level 2 or 3. Rammers (M, m)
// only go in those.

import { twistTags, checkDifficulty, checkLevelOnly } from './chunks.js';

export const TRACK_W = 20;
export const TRACK_H = 14;
export const GROUND_ROW = 12;
export const EDGE = 4; // flat columns at each end of a piece
export const RIVAL_KINDS = { R: 'rider', M: 'rammer' };
const GROUND = '#/\\';
const ON_GROUND = '^~=RrMmPFK';
const raw = String.raw;

// What each column is: { kind: 'flat' | 'up' | 'down' | 'pit', row } where
// row is the top ground cell. Throws if the column isn't one solid shape.
export function columnOf(rows, x, what) {
  const top = rows.findIndex((row) => GROUND.includes(row[x]));
  if (top < 0) return { kind: 'pit', row: GROUND_ROW };
  for (let y = top + 1; y < rows.length; y++) {
    if (rows[y][x] !== '#') throw new Error(`${what}: column ${x} has "${rows[y][x]}" under the ground at row ${y}; draw the ground as one solid shape (ramps only on top).`);
  }
  const ch = rows[top][x];
  return { kind: ch === '#' ? 'flat' : ch === '/' ? 'up' : 'down', row: top };
}

// The ground's height (px from the top) at a column's left and right edges.
const TILE = 16;
const leftY = (c) => (c.kind === 'pit' ? null : c.kind === 'up' ? (c.row + 1) * TILE : c.row * TILE);
const rightY = (c) => (c.kind === 'pit' ? null : c.kind === 'down' ? (c.row + 1) * TILE : c.row * TILE);

function track(id, type, difficulty, art, tagOptions = {}) {
  const what = `Track "${id}"`;
  const W = TRACK_W;
  const rows = art.trim().split('\n').map((line) => line.trim());
  if (rows.length > TRACK_H) throw new Error(`${what} has ${rows.length} rows; the max is ${TRACK_H}.`);
  while (rows.length < TRACK_H) rows.unshift('.'.repeat(W));
  rows.forEach((row, y) => {
    if (row.length !== W) throw new Error(`${what} row ${y} ("${row}") is ${row.length} wide; expected ${W}.`);
    for (const ch of row) if (!'.#/\\^~=CRrMmPFK'.includes(ch)) throw new Error(`${what} row ${y}: unknown character "${ch}".`);
  });
  checkDifficulty(what, difficulty);
  const tags = twistTags(what, tagOptions);
  checkLevelOnly(what, rows, 'Mm', 'rammers', tags);

  const cols = [...Array(W).keys()].map((x) => columnOf(rows, x, what));
  // Ramps join the ground smoothly.
  cols.forEach((c, x) => {
    const prev = cols[x - 1];
    const next = cols[x + 1];
    if (c.kind === 'up') {
      if (!prev || prev.kind === 'pit' || rightY(prev) !== leftY(c)) throw new Error(`${what}: the ramp up in column ${x} must start from the ground just left of it (same height as its bottom).`);
      if (next && next.kind !== 'pit' && leftY(next) < rightY(c)) throw new Error(`${what}: column ${x + 1} is a wall right after the ramp in column ${x}.`);
    }
    if (c.kind === 'down') {
      if (prev && prev.kind !== 'pit' && rightY(prev) > leftY(c)) throw new Error(`${what}: the ramp down in column ${x} starts below the ground left of it (a wall).`);
      if (next && next.kind !== 'pit' && leftY(next) < rightY(c)) throw new Error(`${what}: column ${x + 1} is a wall right after the ramp down in column ${x}.`);
    }
  });
  // The ends: flat ground on row 12, nothing to jump.
  const edge = [...Array(EDGE).keys()].flatMap((i) => [i, W - 1 - i]);
  for (const x of edge) {
    if (cols[x].kind !== 'flat' || cols[x].row !== GROUND_ROW) throw new Error(`${what}: column ${x} must be flat ground on row ${GROUND_ROW} (the first and last ${EDGE} columns join other pieces).`);
    if (rows[GROUND_ROW - 1][x] === '^') throw new Error(`${what}: no spikes in column ${x} (the first and last ${EDGE} columns stay clear).`);
  }
  // Things that sit on the ground must sit on flat ground.
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!ON_GROUND.includes(ch)) return;
    if (cols[x].kind !== 'flat' || cols[x].row !== y + 1) throw new Error(`${what}: "${ch}" in column ${x} must sit on flat ground (the row right above a "#" top).`);
  }));
  const count = (chars) => rows.join('').split('').filter((ch) => chars.includes(ch)).length;
  if (type === 'start' && count('P') !== 1) throw new Error(`${what}: a start piece needs exactly one P.`);
  if (type !== 'start' && count('P')) throw new Error(`${what}: "P" only goes in start pieces.`);
  if (type === 'exit' && count('F') !== 1) throw new Error(`${what}: an exit piece needs exactly one F.`);
  if (type !== 'exit' && count('F')) throw new Error(`${what}: "F" only goes in exit pieces.`);
  if (type === 'boss' && count('K') !== 1) throw new Error(`${what}: a boss starting piece needs exactly one K.`);
  if (type !== 'boss' && count('K')) throw new Error(`${what}: "K" (boss) only goes in BOSS_TRACKS.`);
  if (type === 'race' && !count('RM')) throw new Error(`${what}: a race piece needs at least one capital-letter rival (R or M).`);
  if (type !== 'race' && count('RrMm')) throw new Error(`${what}: only "race" pieces can have rivals (this one is "${type}").`);
  if (type === 'rest' && (cols.some((c) => c.kind === 'pit') || count('^'))) throw new Error(`${what}: rest pieces have no pits or spikes.`);
  return { id, type, difficulty, rows, cols, width: W, ...tags };
}

// type: start | exit | rest | jump | race
// difficulty: 0-4 (costs this many points from the stage's budget, like chunks)
export const TRACKS = [
  // --- start ---
  track('start', 'start', 0, raw`
    ..P.................
    ####################
    ####################`),

  track('start_hump', 'start', 0, raw`
    ....................
    ....................
    ....................
    ..P...../##\........
    ####################
    ####################`),

  // --- exit ---
  track('exit', 'exit', 0, raw`
    ..............F.....
    ####################
    ####################`),

  track('exit_hill', 'exit', 0, raw`
    ........C..F........
    ...../########\.....
    ####################
    ####################`),

  // --- rest (no rivals, nothing to jump) ---
  track('rest_coins', 'rest', 0, raw`
    ..........C.........
    ......C.............
    ####################
    ####################`),

  track('rest_boost', 'rest', 0, raw`
    .....==...C...C.....
    ####################
    ####################`),

  track('rest_hump', 'rest', 0, raw`
    ........C...........
    ............C.......
    ..../#\.............
    ####################
    ####################`),

  track('rest_arc', 'rest', 0, raw`
    .........C..........
    ........C...........
    ....................
    ####################
    ####################`),

  // --- jumps: ramps, pits, spikes, walls ---
  track('hump', 'jump', 1, raw`
    ........C...........
    ....................
    .............C......
    ....../##\..........
    ...../####\.........
    ####################
    ####################`),

  track('gap_small', 'jump', 1, raw`
    ........C...........
    ....................
    ########..##########
    ########..##########`),

  track('spikes_small', 'jump', 1, raw`
    .........C..........
    ....................
    .........^^.........
    ####################
    ####################`),

  track('step_up', 'jump', 1, raw`
    ........C...........
    .....#########\.....
    ####################
    ####################`),

  track('mud_patch', 'jump', 1, raw`
    .......C............
    .....~~~~~~~~~......
    ####################
    ####################`),

  track('boost_gap', 'jump', 1, raw`
    .........C.C........
    ....................
    .....==.............
    #########...########
    #########...########`),

  track('ramp_gap', 'jump', 2, raw`
    ........C.C.........
    ....................
    ....../.............
    ...../#....####\....
    #######....#########
    #######....#########`),

  track('spike_pair', 'jump', 2, raw`
    ......C.............
    ....................
    ......^^......^^....
    ####################
    ####################`),

  track('double_gap', 'jump', 2, raw`
    ....C.......C.......
    ....................
    ####..######..######
    ####..######..######`),

  track('tabletop', 'jump', 2, raw`
    ........C...........
    ....................
    ...../######\.......
    ..../########\......
    ####################
    ####################`),

  track('wall_hop', 'jump', 2, raw`
    .......C............
    ....#######.........
    ####################
    ####################`),

  track('mud_gap', 'jump', 2, raw`
    ...........C........
    ....~~~~............
    ###########..#######
    ###########..#######`),

  track('ramp_spikes', 'jump', 3, raw`
    .........C..........
    ....................
    ....................
    ...../\.............
    .==./##\^^^^........
    ####################
    ####################`),

  track('big_air', 'jump', 3, raw`
    .........C..........
    ....................
    ....................
    ....../.............
    ...../#.............
    ..../##.....###\....
    #######.....########
    #######.....########`),

  track('mega_jump', 'jump', 4, raw`
    .........C.C........
    ....................
    ....................
    ....../.............
    ...../#.....##\.....
    .==./##.....###\....
    #######.....########
    #######.....########`),

  // --- races: rivals to pass or kick off the track ---
  track('rival_flat', 'race', 1, raw`
    ......C...R.........
    ####################
    ####################`),

  track('rival_hump', 'race', 2, raw`
    ....R.../##\...r....
    ####################
    ####################`),

  track('rival_gap', 'race', 2, raw`
    ......C.............
    ............R...r...
    ######..############
    ######..############`),

  track('rival_mud', 'race', 2, raw`
    ...R..~~~~~~~~..r...
    ####################
    ####################`),

  track('pack', 'race', 3, raw`
    ..==..R...R...r..r..
    ####################
    ####################`),

  track('spike_pack', 'race', 3, raw`
    ...R....^^....R..r..
    ####################
    ####################`),

  track('rival_table', 'race', 3, raw`
    ........R...........
    ...../######\.......
    ..../########\..r...
    ####################
    ####################`),

  track('spike_race', 'race', 4, raw`
    ....R.^^...R..^^.r..
    ####################
    ####################`),

  // --- twist-only pieces (see the notes at the top) ---
  track('ice_run', 'jump', 2, raw`
    ....C...C...........
    ##############..####
    ##############..####`, { twists: ['slippery'] }),

  track('moon_leap', 'jump', 3, raw`
    ........C.C.........
    ....................
    ....................
    ....................
    ...../..............
    ..../#..............
    ######........######
    ######........######`, { twists: ['low-gravity'] }),

  track('night_riders', 'race', 2, raw`
    .....R....^^...R....
    ####################
    ####################`, { twists: ['darkness'] }),

  track('bog', 'jump', 2, raw`
    ......C.....C.......
    ....~~~~~~~~~~~~....
    ####################
    ####################`, { twists: ['mud'] }),

  track('gusty_gaps', 'jump', 2, raw`
    ....C.......C.......
    ....................
    ....................
    ####..######..######
    ####..######..######`, { twists: ['windy'] }),

  track('coin_rush', 'jump', 1, raw`
    ........C.C.........
    ............C.......
    ..CC/##\......CCC...
    ####################
    ####################`, { twists: ['collector'] }),

  track('gauntlet', 'race', 3, raw`
    ....R...R...R...R...
    ####################
    ####################`, { twists: ['killer'] }),

  track('heavy_hills', 'jump', 2, raw`
    ......C.............
    ....................
    ..../##\../##\......
    ####################
    ####################`, { twists: ['gravity'] }),

  track('turbo_lane', 'jump', 2, raw`
    ..............C.....
    ..==....^^.==.......
    ####################
    ####################`, { twists: ['speedy'] }),

  track('blind_ramp', 'jump', 2, raw`
    .........C..........
    ....................
    ....../######\......
    ...../########\.....
    ####################
    ####################`, { notTwists: ['darkness'] }),

  track('last_life', 'race', 1, raw`
    ............C.......
    .........R..........
    ####################
    ####################`, { twists: ['sudden-death'] }),

  track('cruise', 'race', 1, raw`
    .....C..R...........
    ####################
    ####################`, { twists: ['classic'] }),

  // --- genre level 2: rammers (starter set; add your own) ---
  track('rammer_flat', 'race', 2, raw`
    .....M.....C........
    ####################
    ####################`, { minLevel: 2 }),

  track('rammer_gap', 'race', 3, raw`
    ..........C.........
    ...M...........R....
    ##########..########
    ##########..########`, { minLevel: 2 }),

  track('rammer_hump', 'race', 3, raw`
    ....M..../##\....r..
    ####################
    ####################`, { minLevel: 2 }),

  track('rammer_pack', 'race', 3, raw`
    ....M....m...R......
    ####################
    ####################`, { minLevel: 2 }),

  track('ambush', 'race', 4, raw`
    ..M....R...^^...m...
    ####################
    ####################`, { minLevel: 2 }),

];

// The boss loop (genre level 3): on the run's last stage (and stage 3 of a
// Long run) the track before the exit becomes a circuit of 3 to 5 pieces
// (LOOP_PIECES): one of these starting pieces, where the champion waits at
// K, then 2 to 4 pieces drawn from the jump and rest pieces above (the ones
// with difficulty LOOP_MAX_DIFFICULTY or less; no rivals, no coins). Riding
// in locks the loop: off its end you come back round to its start, lap after
// lap, until the champion is knocked off. Starting pieces follow the same
// rules as every piece, and have no rivals or coins.
export const LOOP_PIECES = { min: 3, max: 5 };
export const LOOP_MAX_DIFFICULTY = 2;
export const BOSS_TRACKS = [
  track('grid', 'boss', 0, raw`
    .............K......
    ####################
    ####################`),

  track('grid_hump', 'boss', 0, raw`
    ...../##\.....K.....
    ####################
    ####################`),

  track('grid_pads', 'boss', 0, raw`
    ....==.......K......
    ####################
    ####################`),
];
