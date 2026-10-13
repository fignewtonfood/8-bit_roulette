// Hand-built level chunks. The generator stitches these together into a stage.
//
// Every chunk is 10 tiles wide and 14 tall. You only draw the bottom rows;
// missing rows at the top are filled with empty space.
//
// Legend
//   .  empty            #  solid ground
//   ^  spikes           C  coin (soul shard)
//   E  enemy (always)   e  optional enemy (spawns only if the budget allows)
//   H  hopper (always)  h  optional hopper     (genre level 2+ pieces only)
//   P  player start     F  exit flag
//   B  boss (boss rooms only; see BOSS_ROOMS at the bottom)
//
// Rules (checked automatically when the game loads):
//   - every row is exactly 10 characters
//   - row 12 (second from the bottom, the ground surface) must be solid
//     in the first and last column, so any chunk can join any other chunk
//
// Jump limits (keep chunks beatable): about 3 tiles up, and gaps of 3 tiles max.
//
// Twist-only chunks: add { twists: [...] } after the art and the chunk only
// shows up when one of those twists is on the reel (and a bit more often
// than usual then; see TWIST_WEIGHT in buildStage.js). Chunks without it show
// up with every twist. The twist ids are the file names in src/data/twists/.
//
//   chunk('ice_rink', 'jump', 2, `
//     ..........
//     ##......##
//     ##########`, { twists: ['slippery'] }),
//
// Twist-excluded chunks: { notTwists: [...] } is the opposite. The chunk shows
// up with every twist EXCEPT those (at its normal rate). Use it for a chunk
// that's unfair or pointless with a twist, like a leap of faith in Darkness.
//
//   chunk('blind_drop', 'jump', 2, `...`, { notTwists: ['darkness'] }),
//
// A chunk can have one or the other, not both.
//
// Genre-level chunks: { minLevel: 2 } keeps a chunk out until the platformer
// is played at level 2 or higher (picked at the machine). Hoppers (H, h) only
// go in these. It combines with twists or notTwists:
//
//   chunk('hop_pit', 'combat', 2, `...`, { minLevel: 2, notTwists: ['darkness'] }),

export const CHUNK_W = 10;
export const CHUNK_H = 14;
const GROUND_ROW = 12;

// The highest difficulty a piece can have (its cost from the stage budget).
export const MAX_DIFFICULTY = 4;
export function checkDifficulty(what, difficulty) {
  if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > MAX_DIFFICULTY) {
    throw new Error(`${what}: difficulty should be a whole number from 0 to ${MAX_DIFFICULTY} (it's ${difficulty}).`);
  }
}

// The highest genre level (economy.json "levels" gives levels 2 and 3).
export const MAX_GENRE_LEVEL = 3;

// Checks a piece's twist and level tags and returns the ones it has, ready to
// attach. Shared by chunks, waves (waves.js) and arenas (arenas.js).
export function twistTags(what, { twists, notTwists, minLevel }) {
  const tags = {};
  if (minLevel !== undefined) {
    if (!Number.isInteger(minLevel) || minLevel < 2 || minLevel > MAX_GENRE_LEVEL) {
      throw new Error(`${what}: "minLevel" should be 2 or ${MAX_GENRE_LEVEL} (leave it out for level 1).`);
    }
    tags.minLevel = minLevel;
  }
  for (const [key, list] of [['twists', twists], ['notTwists', notTwists]]) {
    if (list === undefined) continue;
    if (!Array.isArray(list) || !list.length || list.some((t) => typeof t !== 'string')) {
      throw new Error(`${what}: "${key}" should be a list of twist ids, like ['slippery'].`);
    }
    tags[key] = list;
  }
  if (tags.twists && tags.notTwists) {
    throw new Error(`${what}: use "twists" (only with these) or "notTwists" (never with these), not both.`);
  }
  return tags;
}

function chunk(id, type, difficulty, art, tagOptions = {}) {
  const rows = art.trim().split('\n').map((line) => line.trim());
  while (rows.length < CHUNK_H) rows.unshift('.'.repeat(CHUNK_W));

  if (rows.length !== CHUNK_H) {
    throw new Error(`Chunk "${id}" has ${rows.length} rows; the max is ${CHUNK_H}.`);
  }
  rows.forEach((row, y) => {
    if (row.length !== CHUNK_W) {
      throw new Error(`Chunk "${id}" row ${y} ("${row}") is ${row.length} wide; expected ${CHUNK_W}.`);
    }
  });
  const ground = rows[GROUND_ROW];
  if (ground[0] !== '#' || ground[CHUNK_W - 1] !== '#') {
    throw new Error(`Chunk "${id}" must have solid ground at both edges of row ${GROUND_ROW} so it joins cleanly.`);
  }
  checkDifficulty(`Chunk "${id}"`, difficulty);
  const tags = twistTags(`Chunk "${id}"`, tagOptions);
  checkLevelOnly(`Chunk "${id}"`, rows, 'Hh', 'hoppers', tags);
  if (type !== 'boss' && rows.join('').includes('B')) throw new Error(`Chunk "${id}": "B" (boss) only goes in BOSS_ROOMS.`);
  return { id, type, difficulty, rows, ...tags };
}

// New enemies from a genre level only go in pieces tagged with that level.
export function checkLevelOnly(what, rows, chars, name, tags) {
  if ((tags.minLevel ?? 1) >= 2) return;
  if (rows.some((row) => [...row].some((ch) => chars.includes(ch)))) {
    throw new Error(`${what} has ${name} (${[...chars].join(', ')}), which need { minLevel: 2 } so they only come at genre level 2+.`);
  }
}

// Can this piece be used at this genre level? Untagged ones always can.
export const fitsLevel = (piece, level = 1) => (piece.minLevel ?? 1) <= level;
// Pieces new at a genre level show up a bit more often than the rest, so the
// level feels different (see buildStage.js).
export const LEVEL_WEIGHT = 1.5;

// Can this chunk (or wave, or arena) be used with this twist? Untagged ones always can.
export const fitsTwist = (piece, twist) =>
  (!piece.twists || piece.twists.includes(twist)) && !piece.notTwists?.includes(twist);

// type: start | exit | rest | secret | jump | combat
// difficulty: 0-4 (costs this many points from the stage's budget). 4 is the
// top tier: it only fits the 'hard' slots, and mostly on later stages.
export const CHUNKS = [
  chunk('start', 'start', 0, `
    ..P.......
    ##########
    ##########`),

  chunk('start', 'start', 0, `
    ##########   
    #.P.......
    ##########
    ##########`,{twists:['slippery']}),

  chunk('start', 'start', 0, `
    ..P.......
    ######....
    ########..
    ##########
    ##########`),

  chunk('exit', 'exit', 0, `
    .......F..
    ##########
    ##########`),

  chunk('exit', 'exit', 0, `
    .......F..
    ....######
    ..########
    ##########
    ##########`),

  chunk('exit', 'exit', 0, `
    .......F..
    ......####
    ......####
    ......####
    ##########
    ##########`,{twists:['low-gravity']}),

  // --- rest ---
  chunk('rest_coins', 'rest', 0, `
    ...C..C...
    ..........
    ..........
    ##########
    ##########`),

  chunk('rest_coins_high', 'rest', 0, `
    ...C..C...
    ..........
    ..........
    ..........
    ##########
    ##########`,{twists:['low-gravity']}),

  chunk('rest_quiet', 'rest', 0, `
    .....C....
    ##########
    ##########`),

  chunk('rest_quiet', 'rest', 0, `
    #########.
    ########..
    #######...
    .....C....
    ##########
    ##########`, {twists: ['slippery']}),

  // --- easy (difficulty 1) ---
  chunk('hill', 'jump', 1, `
    ....CC....
    ....##....
    ..######..
    ##########
    ##########`),

  chunk('underground', 'rest', 1, `
    ..........
    ....##....
    ...####...
    ##..CC..##
    ##########`),

  chunk('mountain_cave', 'combat', 1, `
    ..........
    ....##....
    ...####...
    ##..CC..##
    ##########
    ##########
    ##########`, {twists:['low-gravity']}),

  chunk('gap_small', 'jump', 1, `
    ....C.....
    ..........
    ###...####
    ###...####`),

  chunk('spikes_low', 'jump', 1, `
    ....C.....
    ..........
    ....^^....
    ##########
    ##########`),

  chunk('patrol', 'combat', 1, `
    ..C....C..
    ..........
    .....E....
    ##########
    ##########`),

  // --- build (difficulty 2) ---
  chunk('floating_pit', 'jump', 2, `
    ...CC.....
    ...##.....
    ..........
    ##......##
    ##......##`, { notTwists: ['slippery'] }), // the only way across is a 2-wide float; ice slides further than that

  chunk('spike_platform', 'jump', 2, `
    ....CC....
    ....##....
    ...^^^^...
    ##########
    ##########`),

  chunk('spike_fall', 'jump', 2, `
    ....CC....
    ....##....
    ...^^^^...
    #.######.#
    #.######.#`, { notTwists: ['slippery'] }), // 1-tile safe spots between pits and spikes

  chunk('enemy_ledge', 'combat', 2, `
    ....CC....
    ....e.....
    ..######..
    .......E..
    ##########
    ##########`),

  chunk('spike_ramp', 'jump', 2, `
    .......CC.
    ......^##.
    .....^###.
    ....^####.
    ##########
    ##########`,{twists:['low-gravity']}),



  // --- hard (difficulty 3) ---
  chunk('pillar_hop', 'jump', 3, `
    .....C....
    ..........
    .....#....
    ##...#...#
    ##...#...#`, { notTwists: ['slippery', 'darkness'] }), // ice slides you off a 1-wide pillar; in the dark it's out of sight from the take-off

  chunk('spike_trap', 'jump', 3, `
    .....C....
    ....C.....
    ....^^....
    ..######..
    ..e....e..
    ##########
    ##########`),

chunk('double_pillar_hop', 'jump', 3, `
    ....C..C..
    ..........
    ....#..#..
    ##..#..#.#
    ##..#..#.#`, { notTwists: ['slippery'] }), // 1-wide pillars: on ice you slide straight off

chunk('moon_pillar_hop', 'jump', 3, `
    ....C..C..
    ..........
    .......#..
    ##.....#.#
    ##.....#.#`,{twists:['low-gravity']}),

  chunk('gauntlet', 'combat', 3, `
    ..C....C..
    ..........
    ..E....E..
    ##########
    ##########`),

chunk('trap', 'combat', 3, `
    ..C...C...
    ..#####...
    #.E.C.E.#.
    ##########
    ##########`),

  // --- brutal (difficulty 4) ---
  // Over a spike bed: the only safe line is up onto the slab and off the far
  // side, with a walker waiting on each end.
  chunk('spike_bed', 'combat', 4, `
    ....CC....
    ...####...
    ..........
    .E.^^^^.E.
    ##########
    ##########`),

  // --- rare ---
  chunk('secret_high', 'secret', 1, `
    ...CCC....
    ...###....
    ..........
    ..........
    ......##..
    ..........
    ##########
    ##########`),

  chunk('secret_very_high', 'secret', 1, `
    ...CCC....
    ...###....
    ..........
    ..........
    ..........
    ......##..
    ..........
    ##########
    ##########`,{twists:['low-gravity']}),

  chunk('secret_trap', 'secret', 3, `
    ..........
    ...#####..
    ...CEC#e..
    ##########
    ##########`),

  // --- twist: slippery ---
  // Ice makes these about stopping and starting, not jumping far.
  chunk('ice_hurdles', 'jump', 1, `
    ..C..C..C.
    ...^...^..
    ##########
    ##########`, { twists: ['slippery'] }),

  chunk('ice_islands', 'jump', 2, `
    ....CC....
    ..........
    ##..###..#
    ##..###..#`, { twists: ['slippery'] }),

  chunk('ice_summit', 'jump', 2, `
    ......CC..
    ......##..
    ....####..
    ..######^.
    ##########
    ##########`, { twists: ['slippery'] }),

  // --- twist: darkness ---
  // Spikes and enemies don't glow, but coins do: the coins show the way.
  chunk('blind_leap', 'jump', 2, `
    .....CC...
    ..........
    ##...##..#
    ##...##..#`, { twists: ['darkness'] }),

  chunk('lurker', 'combat', 3, `
    ..C...C...
    ..........
    ...^.E..^.
    ##########
    ##########`, { twists: ['darkness'] }),

  // --- genre level 2: hoppers (starter set; add your own) ---
  // Hoppers bob up and down as they creep along, so the stomp is about timing.
  chunk('hop_lane', 'combat', 2, `
    ....C.C...
    ..........
    ..H....h..
    ##########
    ##########`, { minLevel: 2 }),

  chunk('hop_steps', 'jump', 2, `
    ........C.
    .......###
    ....H..###
    ##########
    ##########`, { minLevel: 2 }),

  chunk('hop_pit', 'jump', 3, `
    ....C.....
    ..........
    .H......H.
    ###...####
    ###...####`, { minLevel: 2, notTwists: ['darkness'] }),
];

// Boss rooms (genre level 3): a flat room two chunks wide that goes just
// before the exit on the run's last stage. B marks where the boss starts.
// The flag stays locked until the boss is down, and losing a life in the
// room puts you back at its left edge, not the start of the stage.
// Each room is [left chunk, right chunk]; both follow the same rules as
// every chunk (10 wide, solid ground at both edges of row 12).
const bossChunk = (id, art) => chunk(id, 'boss', 0, art);

export const BOSS_ROOMS = [
  [
    bossChunk('boss_flat_l', `
      ..........
      ..........
      ...###....
      ..........
      ..........
      ##########
      ##########`),
    bossChunk('boss_flat_r', `
      ..........
      ..........
      ....###...
      ..........
      .....B....
      ##########
      ##########`),
  ],
  [
    bossChunk('boss_ledges_l', `
      ..........
      ..........
      ..........
      .......###
      ..........
      ##########
      ##########`),
    bossChunk('boss_ledges_r', `
      ..........
      ..........
      ###.......
      ..........
      .......B..
      ##########
      ##########`),
  ],
];
