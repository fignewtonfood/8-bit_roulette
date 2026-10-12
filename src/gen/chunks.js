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

export const CHUNK_W = 10;
export const CHUNK_H = 14;
const GROUND_ROW = 12;

function chunk(id, type, difficulty, art, { twists } = {}) {
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
  if (twists !== undefined && (!Array.isArray(twists) || !twists.length || twists.some((t) => typeof t !== 'string'))) {
    throw new Error(`Chunk "${id}": "twists" should be a list of twist ids, like ['slippery'].`);
  }
  return twists ? { id, type, difficulty, rows, twists } : { id, type, difficulty, rows };
}

// Can this chunk (or wave) be used with this twist? Untagged ones always can.
export const fitsTwist = (piece, twist) => !piece.twists || piece.twists.includes(twist);

// type: start | exit | rest | secret | jump | combat
// difficulty: 0-3 for now (costs this many points from the stage's budget)
export const CHUNKS = [
  chunk('start', 'start', 0, `
    ..P.......
    ##########
    ##########`),

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

  // --- rest ---
  chunk('rest_coins', 'rest', 0, `
    ...C..C...
    ..........
    ..........
    ##########
    ##########`),

  chunk('rest_quiet', 'rest', 0, `
    .....C....
    ##########
    ##########`),

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
    ##......##`),

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
    #.######.#`),

  chunk('enemy_ledge', 'combat', 2, `
    ....CC....
    ....e.....
    ..######..
    .......E..
    ##########
    ##########`),



  // --- hard (difficulty 3) ---
  chunk('pillar_hop', 'jump', 3, `
    .....C....
    ..........
    .....#....
    ##...#...#
    ##...#...#`),

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
    ##..#..#.#`),

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

  chunk('secret_trap', 'secret', 3, `
    ..........
    ...#####..
    ...CEC#e..
    ##########
    ##########`)
];
