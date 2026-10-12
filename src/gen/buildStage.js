// Turns a seed into a playable stage by stitching chunks together.
// No Phaser in here on purpose: it can be tested with plain Node (npm run check).

import { CHUNKS, CHUNK_W, CHUNK_H, fitsTwist } from './chunks.js';
import { makeRng } from './rng.js';
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

// twist: the run's twist id. Chunks tagged for other twists are left out.
// minCoins / minEnemies (Collector / Killer): if the chunks bring fewer than
// that, unused optional enemy spots fill in first, then extra coins/enemies go
// on safe floor (see topUp.js). Normal stages pass 0 and are unaffected.
export function buildStage({ seed, stage = 1, twist = null, minCoins = 0, minEnemies = 0 }) {
  const rng = makeRng(seed * 31 + stage);
  const budget = STAGE_BUDGETS[Math.min(stage, STAGE_BUDGETS.length) - 1];
  const usable = CHUNKS.filter((c) => fitsTwist(c, twist));
  const pool = usable.filter((c) => c.type !== 'start' && c.type !== 'exit');
  const slotMin = (slot) => Math.min(...pool.filter(SLOT_RULES[slot]).map((c) => c.difficulty));

  // 1. Pick a chunk for each slot without blowing the budget.
  let remaining = budget;
  const picks = [];
  const timesUsed = {};

  PACING.forEach((slot, i) => {
    // Hold back enough budget for the cheapest option in every later slot.
    const reserve = PACING.slice(i + 1).reduce((sum, s) => sum + slotMin(s), 0);
    const affordable = pool.filter((c) => SLOT_RULES[slot](c) && c.difficulty <= remaining - reserve);
    const prev = picks[picks.length - 1];

    let chunk = rng.weighted(affordable, (c) => {
      if (prev && c.id === prev.chunk.id) return 0;            // never twice in a row
      const rarity = (RARE_WEIGHT[c.type] ?? 1) * (c.twists ? TWIST_WEIGHT : 1);
      return rarity / (1 + 3 * (timesUsed[c.id] || 0));         // fade out repeats
    });
    if (!chunk) chunk = pool.filter((c) => c.type === 'rest')[0]; // safe fallback, costs 0

    timesUsed[chunk.id] = (timesUsed[chunk.id] || 0) + 1;
    remaining -= chunk.difficulty;
    picks.push({ chunk, mirrored: rng.chance(0.5) });
  });

  // 2. Lay the chunks out side by side.
  const pickOne = (type) => rng.weighted(usable.filter((c) => c.type === type), (c) => (c.twists ? TWIST_WEIGHT : 1));
  const sequence = [
    { chunk: pickOne('start'), mirrored: false },
    ...picks,
    { chunk: pickOne('exit'), mirrored: false },
  ];

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
        else if (ch === 'E') level.enemies.push(pos);
        else if (ch === 'e') optionalEnemies.push(pos);
        else if (ch === 'P') level.playerStart = pos;
        else if (ch === 'F') level.flag = pos;
      });
    });
  });

  // 3. Spend leftover budget on optional enemies.
  for (const pos of rng.shuffle(optionalEnemies)) {
    if (remaining < OPTIONAL_ENEMY_COST) break;
    level.enemies.push(pos);
    remaining -= OPTIONAL_ENEMY_COST;
  }

  level.cost = budget - remaining;

  // 4. Collector / Killer minimums (doesn't touch the budget: these twists pay more).
  const extra = makeRng(seed * 31 + stage + 555);
  const used = new Set(level.enemies);
  for (const pos of extra.shuffle(optionalEnemies.filter((p) => !used.has(p)))) {
    if (level.enemies.length >= minEnemies) break;
    level.enemies.push(pos);
  }
  const columns = [CHUNK_W, level.widthTiles - CHUNK_W]; // not in the start or exit chunk
  const taken = () => [...level.coins, ...level.enemies, level.playerStart, level.flag];
  level.enemies.push(...findSpots({ solid: level.solid, spikes: level.spikes, taken: taken(), columns, rng: extra, wide: true, count: minEnemies - level.enemies.length }));
  level.coins.push(...findSpots({ solid: level.solid, spikes: level.spikes, taken: taken(), columns, rng: extra, count: minCoins - level.coins.length }));
  return level;
}
