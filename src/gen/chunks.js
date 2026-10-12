// Hand-built level chunks. The generator stitches these together into a stage.
//
// Every chunk is 10 tiles wide and 14 tall. You only draw the bottom rows;
// missing rows at the top are filled with empty space.
//
// Legend
//   .  empty            #  solid ground
//   ^  spikes           C  coin (soul shard)
//   E  enemy (always)   e  optional enemy (spawns only if the budget allows)
//   P  player start     F  exit flag
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

export const CHUNK_W = 10;
export const CHUNK_H = 14;
const GROUND_ROW = 12;

// Checks a piece's twist tags and returns the ones it has, ready to attach.
// Shared by chunks, waves (waves.js) and arenas (arenas.js).
export function twistTags(what, { twists, notTwists }) {
  const tags = {};
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
  return { id, type, difficulty, rows, ...twistTags(`Chunk "${id}"`, tagOptions) };
}

// Can this chunk (or wave, or arena) be used with this twist? Untagged ones always can.
export const fitsTwist = (piece, twist) =>
  (!piece.twists || piece.twists.includes(twist)) && !piece.notTwists?.includes(twist);

// type: start | exit | rest | secret | jump | combat
// difficulty: 0-3 for now (costs this many points from the stage's budget)
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
];
