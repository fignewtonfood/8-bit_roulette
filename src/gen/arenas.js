// Hand-built brawler arenas. The generator strings these together into a stage.
//
// Every arena is one screen: 16 tiles wide and 14 tall. You only draw the
// bottom rows; missing rows at the top are filled with empty space.
// When the player walks to the middle of an arena that has enemies, the
// screen locks: the enemies appear, and the way on only opens once they're
// all down. Arenas with no enemies (start, exit, rest) never lock.
//
// Legend
//   .  empty            #  solid ground
//   ^  spikes (hurt you, and finish off any enemy knocked into them)
//   C  coin             P  player start      F  exit flag
//   G  grunt: walks up and punches (3 hits)
//   R  rusher: winds up, then charges across the floor (2 hits)
//   T  thrower: keeps its distance and lobs rocks (2 hits)
//   B  brute: slow, tough, hard to knock around (6 hits)
//   lowercase g / r / t / b = optional enemy (spawns only if the budget allows)
//
// Reinforcements: add { reinforce: `...` } after the art to bring in a second
// wave once only one enemy from the first is left. Draw only enemies and
// dots, 16 wide. Its bottom row lines up with the row just above the floor
// (row 11), so a single line puts enemies on the floor; add rows above it to
// put enemies up on ledges.
//
// Rules (checked automatically when the game loads):
//   - every row is exactly 16 characters
//   - row 12 (second from the bottom, the ground surface) must be solid in the
//     first and last column, so any arena joins any other, and the player has
//     somewhere safe to respawn after a fall
//   - every enemy must stand on something (npm run check:brawl checks this)
//
// Jump limits: about 3 tiles up (Low Gravity makes that 4), gaps of 3 tiles max.
// Enemies don't walk off ledges or onto spikes on their own, but they can be
// knocked off them. That's the fun of pits and spikes in a brawler.
//
// Twist-only arenas: add { twists: [...] } exactly like twist-only chunks.

export const ARENA_W = 16;
export const ARENA_H = 14;
const GROUND_ROW = 12;
export const ENEMY_KINDS = { G: 'grunt', R: 'rusher', T: 'thrower', B: 'brute' };

const FLOOR_ROWS = ARENA_H - (GROUND_ROW - 1) - 1; // rows below row 11

function padRows(id, label, art, { aboveFloor = false } = {}) {
  const rows = art.trim().split('\n').map((line) => line.trim());
  if (aboveFloor) for (let i = 0; i < FLOOR_ROWS; i++) rows.push('.'.repeat(ARENA_W));
  if (rows.length > ARENA_H) throw new Error(`Arena "${id}"${label} has ${rows.length} rows; the max is ${ARENA_H}.`);
  while (rows.length < ARENA_H) rows.unshift('.'.repeat(ARENA_W));
  rows.forEach((row, y) => {
    if (row.length !== ARENA_W) {
      throw new Error(`Arena "${id}"${label} row ${y} ("${row}") is ${row.length} wide; expected ${ARENA_W}.`);
    }
  });
  return rows;
}

function arena(id, type, difficulty, art, { twists, reinforce } = {}) {
  const rows = padRows(id, '', art);
  const ground = rows[GROUND_ROW];
  if (ground[0] !== '#' || ground[ARENA_W - 1] !== '#') {
    throw new Error(`Arena "${id}" must have solid ground at both edges of row ${GROUND_ROW} so it joins cleanly.`);
  }
  if (twists !== undefined && (!Array.isArray(twists) || !twists.length || twists.some((t) => typeof t !== 'string'))) {
    throw new Error(`Arena "${id}": "twists" should be a list of twist ids, like ['slippery'].`);
  }
  const out = { id, type, difficulty, rows };
  if (reinforce !== undefined) {
    out.reinforce = padRows(id, ' reinforcements', reinforce, { aboveFloor: true });
    out.reinforce.forEach((row, y) => {
      const bad = [...row].find((ch) => ch !== '.' && !ENEMY_KINDS[ch.toUpperCase()]);
      if (bad) throw new Error(`Arena "${id}" reinforcements row ${y}: "${bad}" isn't allowed; only enemies and dots.`);
    });
  }
  if (twists) out.twists = twists;
  return out;
}

// type: start | exit | rest | secret | fight
// difficulty: 0-3 (costs this many points from the stage's budget, like chunks)
export const ARENAS = [
  // --- start ---
  arena('start', 'start', 0, `
    ................
    ..P.............
    ################
    ################`),

  arena('start_steps', 'start', 0, `
    ................
    ..P.............
    #####...........
    ################
    ################`),

  // --- exit ---
  arena('exit', 'exit', 0, `
    .............F..
    ################
    ################`),

  arena('exit_stairs', 'exit', 0, `
    .............F..
    ...........#####
    .........#######
    ################
    ################`),

  // --- rest (no enemies, so no lock) ---
  arena('rest_coins', 'rest', 0, `
    ......C..C......
    ................
    .....######.....
    ................
    ################
    ################`),

  arena('rest_hop', 'rest', 0, `
    .......C........
    ......C.C.......
    ######...#######
    ######...#######`),

  arena('rest_walk', 'rest', 0, `
    ................
    ...C....C....C..
    ################
    ################`),

  // --- secret (rare, coin-heavy) ---
  arena('stash', 'secret', 0, `
    ....CCCCCCCC....
    ...##########...
    ................
    ..C..........C..
    ################
    ################`),

  // --- fights, difficulty 1 ---
  arena('two_grunts', 'fight', 1, `
    ................
    ..........G..G..
    ################
    ################`),

  arena('grunt_ledge', 'fight', 1, `
    ................
    .........G......
    .......#####....
    ................
    ...g........G...
    ################
    ################`),

  arena('lone_rusher', 'fight', 1, `
    ................
    .....g........R.
    ################
    ################`),

  arena('rock_lobber', 'fight', 1, `
    ................
    .............T..
    ...........#####
    ................
    ..g.............
    ################
    ################`),

  // --- fights, difficulty 2 ---
  arena('pincer', 'fight', 2, `
    ................
    .G...........G..
    ################
    ################`, {
    reinforce: `
    .......t........`,
  }),

  arena('spike_floor', 'fight', 2, `
    ................
    ...G...^^...R...
    ################
    ################`),

  arena('the_gap', 'fight', 2, `
    ................
    ..G..........G..
    #######..#######
    #######..#######`, {
    reinforce: `
    .............r..`,
  }),

  arena('high_ground', 'fight', 2, `
    ................
    ..T..........T..
    #####......#####
    ................
    ......G..g......
    ################
    ################`),

  arena('charge_line', 'fight', 2, `
    ................
    .R............R.
    ################
    ################`, {
    reinforce: `
    ......g..g......`,
  }),

  // --- fights, difficulty 3 ---
  arena('brute_den', 'fight', 3, `
    ................
    ...........B....
    ################
    ################`, {
    reinforce: `
    ..G..........G..`,
  }),

  arena('gauntlet', 'fight', 3, `
    ................
    .......T........
    .....######.....
    ................
    .G..R......G..r.
    ################
    ################`),

  arena('pit_boss', 'fight', 3, `
    ................
    ..B.............
    #####...########
    #####...########`, {
    reinforce: `
    ..........T..g..`,
  }),

  arena('mob', 'fight', 3, `
    ................
    .G..G......G..G.
    ################
    ################`, {
    reinforce: `
    ......b.........`,
  }),

  // --- twist-only (examples; redesign or add your own) ---
  arena('ice_island', 'fight', 2, `
    ................
    ......G..G......
    ###..######..###
    ###..######..###`, { twists: ['slippery'] }),

  arena('lurkers', 'fight', 2, `
    ................
    G..............G
    ################
    ################`, {
    twists: ['darkness'],
    reinforce: `
    .......T........`,
  }),
];
