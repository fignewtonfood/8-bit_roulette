// Turns a seed into a race stage: a row of track pieces from the start line
// to the finish flag. Same ideas as buildStage.js and buildBrawl.js (pacing
// slots, a difficulty budget, no repeats back to back), and the same tags
// (twists, notTwists, minLevel). Pieces are never mirrored: races go right.
// No Phaser in here, so it can be tested with Node (npm run check:race).

import { TRACKS, BOSS_TRACKS, LOOP_PIECES, LOOP_MAX_DIFFICULTY, TRACK_H, GROUND_ROW, RIVAL_KINDS, columnOf } from './tracks.js';
import { fitsTwist, fitsLevel } from './chunks.js';
import { tagWeight, carrierIn } from './buildStage.js';
import { makeRng } from './rng.js';
import { pacingFor, EXTRA_ENEMY_COST } from './pacing.js';

// Longer than the other genres' (a piece goes by in about two seconds).
export const RACE_PACING = ['easy', 'build', 'rest', 'build', 'hard', 'rest', 'build', 'build', 'hard', 'rest', 'build', 'hard'];
export const RACE_BUDGETS = [18, 24, 30, 37, 45];
// Race pieces (rivals) come up this much more often than jumps.
export const RACE_WEIGHT = 1.5;

const OPTIONAL_RIVAL_COST = 1;
// How fast rivals ride, as a share of your top speed: a range per stage
// (later stages are quicker). Rivals never ride faster than you can.
export const RIVAL_PACE = { min: 0.6, max: 0.8, perStage: 0.025 };
// Safe respawn columns need this many columns of run-up ahead with nothing
// to jump, so you're back to speed by the next jump.
export const RUN_UP = 6;
// Extra coins (Collector) go this many rows above the ground: a full hop's peak.
export const COIN_HOP = 3;

const SLOT_RULES = {
  easy: (t) => (t.type === 'jump' || t.type === 'race') && t.difficulty <= 1,
  build: (t) => (t.type === 'jump' || t.type === 'race') && t.difficulty >= 1 && t.difficulty <= 2,
  hard: (t) => (t.type === 'jump' || t.type === 'race') && t.difficulty >= 2,
  rest: (t) => t.type === 'rest',
};

// twist: the run's twist id. Pieces tagged for other twists are left out.
// minCoins (Collector) / minEnemies (Killer): extra coins / rivals go on flat
// ground past the start piece when the pieces bring too few.
// genreLevel: racing's level picked at the machine (pieces tagged with a
// higher minLevel are left out; at level 2+ some extra rivals are rammers).
// powerUp: one rival in the first half of the stage carries it (carrier: true).
// boss: true puts the boss loop just before the exit: a starting piece
// (BOSS_TRACKS) and 2-4 more pieces (5 pieces in all on stage 5, 3 or 4
// before that), then a copy of the starting piece, so the loop's end runs
// seamlessly into what looks like its start. No coins or rivals in the loop.
export function buildRace({ seed, stage = 1, twist = null, minCoins = 0, minEnemies = 0, budgetScale = 1, genreLevel = 1, powerUp = null, boss = false }) {
  const rng = makeRng(seed * 37 + stage + 5000);
  const usable = TRACKS.filter((t) => fitsTwist(t, twist) && fitsLevel(t, genreLevel));
  const pool = usable.filter((t) => t.type !== 'start' && t.type !== 'exit');
  const slotMin = (slot) => Math.min(...pool.filter(SLOT_RULES[slot]).map((t) => t.difficulty));
  const pacing = pacingFor(RACE_PACING, stage);
  const budget = Math.max(pacing.reduce((sum, s) => sum + slotMin(s), 0), Math.round(RACE_BUDGETS[Math.min(stage, RACE_BUDGETS.length) - 1] * budgetScale));

  // 1. Pick a piece for each slot without blowing the budget.
  let remaining = budget;
  const picks = [];
  const timesUsed = {};
  pacing.forEach((slot, i) => {
    const reserve = pacing.slice(i + 1).reduce((sum, s) => sum + slotMin(s), 0);
    const affordable = pool.filter((t) => SLOT_RULES[slot](t) && t.difficulty <= remaining - reserve);
    const prev = picks[picks.length - 1];
    let pick = rng.weighted(affordable, (t) => (prev && t.id === prev.id ? 0 : (tagWeight(t) * (t.type === 'race' ? RACE_WEIGHT : 1)) / (1 + 3 * (timesUsed[t.id] || 0))));
    if (!pick) pick = pool.find((t) => t.type === 'rest'); // safe fallback, costs 0
    timesUsed[pick.id] = (timesUsed[pick.id] || 0) + 1;
    remaining -= pick.difficulty;
    picks.push(pick);
  });

  // 2. Lay the pieces out side by side.
  const pickOne = (type) => rng.weighted(usable.filter((t) => t.type === type), tagWeight);
  const sequence = [pickOne('start'), ...picks, pickOne('exit')];
  // The boss loop goes just before the exit, with its own random numbers so
  // the rest of the stage is the same with or without it.
  const loopPieces = new Set();
  let seamPiece = null;
  if (boss) {
    const brng = makeRng(seed * 37 + stage + 4321);
    const count = stage >= 5 ? LOOP_PIECES.max : brng.int(LOOP_PIECES.min, LOOP_PIECES.max - 1);
    const first = BOSS_TRACKS[brng.int(0, BOSS_TRACKS.length - 1)];
    const options = usable.filter((t) => (t.type === 'jump' || t.type === 'rest') && t.difficulty <= LOOP_MAX_DIFFICULTY);
    // Copies, so a piece also used earlier in the stage isn't mistaken for a loop piece.
    const loop = [first, ...brng.shuffle(options).slice(0, count - 1)].map((t) => ({ ...t }));
    loop.forEach((t) => loopPieces.add(t));
    seamPiece = { ...first };
    sequence.splice(sequence.length - 1, 0, ...loop, seamPiece);
  }

  const widthTiles = sequence.reduce((sum, t) => sum + t.width, 0);
  const level = {
    seed,
    stage,
    twist,
    budget,
    cost: 0,
    widthTiles,
    heightTiles: TRACK_H,
    grid: Array.from({ length: TRACK_H }, () => ''), // the art, stitched (grid[y][x])
    cols: [],      // per column: { kind: 'flat' | 'up' | 'down' | 'pit', row }
    spikes: [],    // [{ x, y }] tiles
    mud: [],
    boosts: [],
    coins: [],
    rivals: [],    // [{ x, y, kind: 'rider' | 'rammer', pace, carrier? }]
    playerStart: null,
    flag: null,
    pieces: [],    // [{ id, x0, width, type }]
    names: [],
    safe: [],      // columns a crashed rider can come back on (sorted)
    bossLoop: null, // { x0, w, pieces, safe: [columns] } in tiles, when there's a boss
    boss: null,    // { x, y } where the boss starts
    powerUp: null, // { kind } or null; the rival carrying it has carrier: true
  };
  const optional = [];
  const paceRng = makeRng(seed * 37 + stage + 6060);
  const pace = () => {
    const shift = RIVAL_PACE.perStage * (Math.min(stage, 5) - 1);
    return Math.round((RIVAL_PACE.min + shift + (RIVAL_PACE.max - RIVAL_PACE.min) * paceRng.next()) * 100) / 100;
  };

  let x0 = 0;
  for (const t of sequence) {
    const inBoss = loopPieces.has(t) || t === seamPiece;
    level.pieces.push({ id: t.id, x0, width: t.width, type: t === seamPiece ? 'seam' : t.type, loop: loopPieces.has(t) || undefined });
    level.names.push(t.id);
    t.rows.forEach((row, y) => {
      level.grid[y] += row.replace(/[^#/\\]/g, '.');
      [...row].forEach((ch, x) => {
        const pos = { x: x0 + x, y };
        if (ch === '^') level.spikes.push(pos);
        else if (ch === '~') level.mud.push(pos);
        else if (ch === '=') level.boosts.push(pos);
        else if (ch === 'C' && !inBoss) level.coins.push(pos);
        else if (ch === 'P') level.playerStart = pos;
        else if (ch === 'F') level.flag = pos;
        else if (ch === 'K' && t !== seamPiece) level.boss = pos;
        else if (RIVAL_KINDS[ch]) level.rivals.push({ ...pos, kind: RIVAL_KINDS[ch], pace: pace() });
        else if (RIVAL_KINDS[ch.toUpperCase()]) optional.push({ ...pos, kind: RIVAL_KINDS[ch.toUpperCase()] });
      });
    });
    level.cols.push(...t.cols);
    if (loopPieces.has(t)) {
      if (!level.bossLoop) level.bossLoop = { x0, w: 0, pieces: 0, safe: [] };
      level.bossLoop.w += t.width;
      level.bossLoop.pieces++;
    }
    x0 += t.width;
  }

  // 3. Spend leftover budget on optional rivals.
  for (const r of rng.shuffle(optional)) {
    if (remaining < OPTIONAL_RIVAL_COST) break;
    level.rivals.push({ ...r, pace: pace() });
    remaining -= OPTIONAL_RIVAL_COST;
  }

  // Columns with something on them (rivals and coins don't count: they move
  // or get picked up).
  const hazard = new Set([...level.spikes, ...level.mud, ...level.boosts].map((p) => p.x));
  const spikeCols = new Set(level.spikes.map((p) => p.x));
  const flatAt = (x, row = GROUND_ROW) => level.cols[x]?.kind === 'flat' && level.cols[x].row === row;
  const inLoop = (x) => level.bossLoop && x >= level.bossLoop.x0 && x < level.bossLoop.x0 + level.bossLoop.w;
  // The loop and the copy of its start after it: no rivals or extra coins.
  const inBossArea = (x) => level.bossLoop && x >= level.bossLoop.x0 && x < level.bossLoop.x0 + level.bossLoop.w + BOSS_TRACKS[0].width;
  const startPiece = level.pieces[0];
  const finishX = level.flag.x;
  const taken = () => new Set(level.rivals.map((r) => r.x));
  // Flat, clear ground away from the ends and from anything else on it.
  const freeSpots = (from, to) => {
    const used = taken();
    const out = [];
    for (let x = from; x < to; x++) {
      if (inBossArea(x) || !flatAt(x) || !flatAt(x - 1) || !flatAt(x + 1)) continue;
      if ([x - 1, x, x + 1].some((c) => hazard.has(c) || used.has(c))) continue;
      out.push({ x, y: GROUND_ROW - 1 });
    }
    return out;
  };

  // 4. Still budget left (later stages, Sudden Death levels 2-3): extra
  //    rivals on flat ground, at least 3 tiles apart.
  const spare = makeRng(seed * 37 + stage + 777);
  let budgetLeft = Math.floor(remaining / EXTRA_ENEMY_COST);
  const spots = spare.shuffle(freeSpots(startPiece.width + 2, finishX - 4));
  for (const spot of spots) {
    if (budgetLeft <= 0) break;
    if (level.rivals.some((r) => Math.abs(r.x - spot.x) < 3)) continue;
    const kinds = genreLevel >= 2 ? ['rider', 'rider', 'rammer'] : ['rider'];
    level.rivals.push({ ...spot, kind: kinds[spare.int(0, kinds.length - 1)], pace: pace() });
    remaining -= EXTRA_ENEMY_COST;
    budgetLeft--;
  }
  level.cost = budget - remaining;

  // 5. Killer minimum (doesn't touch the budget: the twist pays more).
  if (level.rivals.length < minEnemies) {
    const krng = makeRng(seed * 37 + stage + 2666);
    for (const spot of krng.shuffle(freeSpots(startPiece.width + 2, finishX - 4))) {
      if (level.rivals.length >= minEnemies) break;
      if (level.rivals.some((r) => Math.abs(r.x - spot.x) < 3)) continue;
      level.rivals.push({ ...spot, kind: 'rider', pace: pace() });
    }
  }
  // 6. Collector minimum: coins at the top of a hop over flat ground
  //    (anywhere past the start): COIN_HOP rows up, where a full hop peaks.
  if (level.coins.length < minCoins) {
    const crng = makeRng(seed * 37 + stage + 2555);
    const coinAt = new Set(level.coins.map((c) => c.x));
    for (const spot of crng.shuffle(freeSpots(startPiece.width, finishX - 2))) {
      if (level.coins.length >= minCoins) break;
      if ([spot.x - 1, spot.x, spot.x + 1].some((x) => coinAt.has(x))) continue;
      level.coins.push({ x: spot.x, y: GROUND_ROW - COIN_HOP });
      coinAt.add(spot.x);
    }
  }
  level.rivals.sort((a, b) => a.x - b.x);

  // 7. The power-up (genre level 2+): a rival in the first half of the stage
  //    carries it (the first rival if none are in that half).
  if (powerUp) {
    const half = level.rivals.filter((r) => r.x < finishX / 2);
    const pool2 = half.length ? half : level.rivals.slice(0, 1);
    const i = carrierIn(pool2, () => true, makeRng(seed * 37 + stage + 999));
    if (i >= 0) {
      pool2[i].carrier = true;
      level.powerUp = { kind: powerUp };
    }
  }

  // 8. Safe respawn columns: flat, with nothing on or next to them, and a
  //    clear run-up ahead (no pit, spikes or wall for RUN_UP columns).
  const clearAhead = (x) => {
    for (let c = x; c <= x + RUN_UP && c < level.cols.length; c++) {
      const col = level.cols[c];
      if (col.kind === 'pit' || spikeCols.has(c)) return false;
      const prev = level.cols[c - 1];
      if (c > x && prev && prev.kind !== 'pit') {
        const prevTop = prev.kind === 'down' ? (prev.row + 1) : prev.row;
        const top = col.kind === 'up' ? col.row + 1 : col.row;
        if (top < prevTop) return false; // a wall
      }
    }
    return true;
  };
  for (let x = 1; x < finishX; x++) {
    if (level.cols[x].kind !== 'flat') continue;
    if ([x - 1, x, x + 1].some((c) => hazard.has(c)) || !clearAhead(x)) continue;
    // The loop keeps its own (the copy of its start after it shows what's ahead).
    (inLoop(x) ? level.bossLoop.safe : level.safe).push(x);
  }
  if (!level.safe.includes(level.playerStart.x)) level.safe.unshift(level.playerStart.x);
  level.safe.sort((a, b) => a - b);
  return level;
}

// The track's ground columns for a stretch of art (used by the check tool).
export const colsOf = (rows) => [...Array(rows[0].length).keys()].map((x) => columnOf(rows, x, 'piece'));
