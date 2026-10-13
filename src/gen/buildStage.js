// Turns a seed into a playable stage by stitching chunks together.
// No Phaser in here on purpose: it can be tested with plain Node (npm run check).

import { CHUNKS, BOSS_ROOMS, CHUNK_W, CHUNK_H, fitsTwist, fitsLevel, LEVEL_WEIGHT } from './chunks.js';
import { makeRng } from './rng.js';
import { pacingFor, EXTRA_ENEMY_COST } from './pacing.js';
import { findSpots } from './topUp.js';

// Pacing template: the order of chunk "slots" between start and exit.
export const PACING = ['easy', 'build', 'rest', 'build', 'hard', 'rest', 'hard'];

// Difficulty budget per stage number (from the design doc).
export const STAGE_BUDGETS = [10, 14, 19, 24, 30];

const OPTIONAL_ENEMY_COST = 1;
const RARE_WEIGHT = { secret: 0.2 }; // secret chunks show up ~5x less often
export const TWIST_WEIGHT = 2;        // twist-only chunks show up 2x as often when their twist is on

const isCore = (c) => c.type !== 'rest' && c.type !== 'secret';
const SLOT_RULES = {
  easy: (c) => isCore(c) && c.difficulty <= 1,
  build: (c) => isCore(c) && c.difficulty >= 1 && c.difficulty <= 2,
  hard: (c) => isCore(c) && c.difficulty >= 2,
  rest: (c) => c.type === 'rest' || c.type === 'secret',
};

// The weight a piece gets from its tags: twist-only and new-at-this-level
// pieces show up more often. Shared by all three generators.
export const tagWeight = (piece) => (piece.twists ? TWIST_WEIGHT : 1) * (piece.minLevel ? LEVEL_WEIGHT : 1);

// twist: the run's twist id. Chunks tagged for other twists are left out.
// genreLevel: the platformer's level picked at the machine. Chunks tagged with
// a higher minLevel are left out. At level 2+ some extra enemies are hoppers.
// powerUp: the genre level's power-up id (or null); one is placed per stage.
// boss: true puts a boss room before the exit (genre level 3, last stage).
// minCoins / minEnemies (Collector / Killer): if the chunks bring fewer than
// that, unused optional enemy spots fill in first, then extra coins/enemies go
// on safe floor (see topUp.js). Normal stages pass 0 and are unaffected.
export function buildStage({ seed, stage = 1, twist = null, minCoins = 0, minEnemies = 0, budgetScale = 1, genreLevel = 1, powerUp = null, boss = false }) {
  const rng = makeRng(seed * 31 + stage);
  const usable = CHUNKS.filter((c) => fitsTwist(c, twist) && fitsLevel(c, genreLevel));
  const pool = usable.filter((c) => c.type !== 'start' && c.type !== 'exit');
  const slotMin = (slot) => Math.min(...pool.filter(SLOT_RULES[slot]).map((c) => c.difficulty));
  // budgetScale (Sudden Death levels): a bigger or smaller difficulty budget,
  // never below what the pacing slots need at their cheapest.
  const pacing = pacingFor(PACING, stage);
  const budget = Math.max(pacing.reduce((sum, s) => sum + slotMin(s), 0), Math.round(STAGE_BUDGETS[Math.min(stage, STAGE_BUDGETS.length) - 1] * budgetScale));

  // 1. Pick a chunk for each slot without blowing the budget.
  let remaining = budget;
  const picks = [];
  const timesUsed = {};

  pacing.forEach((slot, i) => {
    // Hold back enough budget for the cheapest option in every later slot.
    const reserve = pacing.slice(i + 1).reduce((sum, s) => sum + slotMin(s), 0);
    const affordable = pool.filter((c) => SLOT_RULES[slot](c) && c.difficulty <= remaining - reserve);
    const prev = picks[picks.length - 1];

    let chunk = rng.weighted(affordable, (c) => {
      if (prev && c.id === prev.chunk.id) return 0;            // never twice in a row
      const rarity = (RARE_WEIGHT[c.type] ?? 1) * tagWeight(c);
      return rarity / (1 + 3 * (timesUsed[c.id] || 0));         // fade out repeats
    });
    if (!chunk) chunk = pool.filter((c) => c.type === 'rest')[0]; // safe fallback, costs 0

    timesUsed[chunk.id] = (timesUsed[chunk.id] || 0) + 1;
    remaining -= chunk.difficulty;
    picks.push({ chunk, mirrored: rng.chance(0.5) });
  });

  // 2. Lay the chunks out side by side.
  const pickOne = (type) => rng.weighted(usable.filter((c) => c.type === type), tagWeight);
  const sequence = [
    { chunk: pickOne('start'), mirrored: false },
    ...picks,
    { chunk: pickOne('exit'), mirrored: false },
  ];
  // The boss room goes just before the exit. Its own random numbers, so the
  // rest of the stage is the same with or without it.
  if (boss) {
    const room = BOSS_ROOMS[makeRng(seed * 31 + stage + 4321).int(0, BOSS_ROOMS.length - 1)];
    sequence.splice(sequence.length - 1, 0, ...room.map((chunk) => ({ chunk, mirrored: false })));
  }

  const level = {
    seed,
    stage,
    twist,
    budget,
    cost: 0,
    widthTiles: sequence.length * CHUNK_W,
    heightTiles: CHUNK_H,
    solid: Array.from({ length: CHUNK_H }, () => []), // solid[y][x] = true/false
    spikes: [],
    coins: [],
    enemies: [],
    playerStart: null,
    flag: null,
    chunks: [],
    powerUp: null,  // { x, y, kind } or null
    boss: null,     // { x, y } where the boss starts, or null
    bossRoom: null, // { x0, x1 } tile columns of the boss room
  };
  const optionalEnemies = [];

  sequence.forEach(({ chunk, mirrored }, ci) => {
    level.chunks.push(chunk.id + (mirrored ? ' (mirrored)' : ''));
    chunk.rows.forEach((row, y) => {
      const chars = mirrored ? [...row].reverse() : [...row];
      chars.forEach((ch, x) => {
        const pos = { x: ci * CHUNK_W + x, y };
        level.solid[y][pos.x] = ch === '#';
        if (ch === '^') level.spikes.push(pos);
        else if (ch === 'C') level.coins.push(pos);
        else if (ch === 'E') level.enemies.push({ ...pos, kind: 'walker' });
        else if (ch === 'e') optionalEnemies.push({ ...pos, kind: 'walker' });
        else if (ch === 'H') level.enemies.push({ ...pos, kind: 'hopper' });
        else if (ch === 'h') optionalEnemies.push({ ...pos, kind: 'hopper' });
        else if (ch === 'P') level.playerStart = pos;
        else if (ch === 'F') level.flag = pos;
        else if (ch === 'B') level.boss = pos;
      });
    });
    if (chunk.type === 'boss') {
      const x0 = ci * CHUNK_W;
      level.bossRoom = { x0: level.bossRoom?.x0 ?? x0, x1: x0 + CHUNK_W };
    }
  });

  // 3. Spend leftover budget on optional enemies.
  for (const pos of rng.shuffle(optionalEnemies)) {
    if (remaining < OPTIONAL_ENEMY_COST) break;
    level.enemies.push(pos);
    remaining -= OPTIONAL_ENEMY_COST;
  }

  // 4. Still budget left (later stages, Sudden Death level 3): extra walkers
  //    on open floor, at most one per piece.
  const spare = makeRng(seed * 31 + stage + 777);
  const extraCount = Math.min(Math.floor(remaining / EXTRA_ENEMY_COST), picks.length);
  const extras = findSpots({
    solid: level.solid,
    spikes: level.spikes,
    taken: [...level.coins, ...level.enemies, level.playerStart, level.flag],
    columns: [CHUNK_W, level.widthTiles - CHUNK_W],
    rng: spare,
    wide: true,
    count: extraCount,
  }).map((pos, i) => ({ ...pos, kind: genreLevel >= 2 && i % 3 === 2 ? 'hopper' : 'walker' }));
  level.enemies.push(...extras);
  remaining -= extras.length * EXTRA_ENEMY_COST;

  level.cost = budget - remaining;

  // 5. Collector / Killer minimums (doesn't touch the budget: these twists pay more).
  const extra = makeRng(seed * 31 + stage + 555);
  const used = new Set(level.enemies);
  for (const pos of extra.shuffle(optionalEnemies.filter((p) => !used.has(p)))) {
    if (level.enemies.length >= minEnemies) break;
    level.enemies.push(pos);
  }
  // Not in the start or exit chunk, or the boss room.
  const columns = [CHUNK_W, level.bossRoom ? level.bossRoom.x0 : level.widthTiles - CHUNK_W];
  const taken = () => [...level.coins, ...level.enemies, level.playerStart, level.flag];
  // Walkers want room to patrol; only if that runs out do narrower spots get used.
  const walkers = (spots) => spots.map((pos) => ({ ...pos, kind: 'walker' }));
  level.enemies.push(...walkers(findSpots({ solid: level.solid, spikes: level.spikes, taken: taken(), columns, rng: extra, wide: true, count: minEnemies - level.enemies.length })));
  level.enemies.push(...walkers(findSpots({ solid: level.solid, spikes: level.spikes, taken: taken(), columns, rng: extra, count: minEnemies - level.enemies.length })));
  level.coins.push(...findSpots({ solid: level.solid, spikes: level.spikes, taken: taken(), columns, rng: extra, count: minCoins - level.coins.length }));

  // 6. The power-up (genre level 2+): somewhere in the first half of the
  //    stage, so there's plenty of stage left to use it in.
  if (powerUp) {
    const half = [CHUNK_W, Math.max(CHUNK_W * 2, Math.floor(columns[1] / 2))];
    const [spot] = findSpots({ solid: level.solid, spikes: level.spikes, taken: taken(), columns: half, rng: makeRng(seed * 31 + stage + 999), count: 1 })
      .concat(findSpots({ solid: level.solid, spikes: level.spikes, taken: taken(), columns, rng: makeRng(seed * 31 + stage + 998), count: 1 }));
    if (spot) level.powerUp = { ...spot, kind: powerUp };
  }
  return level;
}
