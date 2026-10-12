// Turns a seed into a brawler stage: a row of one-screen arenas.
// Same ideas as buildStage.js (pacing slots, difficulty budget, no repeats,
// mirroring), but each piece is a whole screen, and enemies belong to the
// arena they lock you into. No Phaser in here, so it can be tested with Node.

import { ARENAS, ARENA_W, ARENA_H, ENEMY_KINDS } from './arenas.js';
import { fitsTwist } from './chunks.js';
import { TWIST_WEIGHT } from './buildStage.js';
import { makeRng } from './rng.js';
import { findSpots } from './topUp.js';

// Shorter than the platformer's: each arena is a full screen and a fight.
export const BRAWL_PACING = ['easy', 'build', 'rest', 'hard', 'build', 'hard'];
export const BRAWL_BUDGETS = [9, 12, 16, 20, 25];

const OPTIONAL_ENEMY_COST = 1;
const RARE_WEIGHT = { secret: 0.2 };

const SLOT_RULES = {
  easy: (a) => a.type === 'fight' && a.difficulty <= 1,
  build: (a) => a.type === 'fight' && a.difficulty >= 1 && a.difficulty <= 2,
  hard: (a) => a.type === 'fight' && a.difficulty >= 2,
  rest: (a) => a.type === 'rest' || a.type === 'secret',
};

// twist: the run's twist id. Arenas tagged for other twists are left out.
// minCoins (Collector): if the arenas bring fewer coins than that, extra ones
// go on safe floor anywhere past the start arena (see topUp.js).
export function buildBrawl({ seed, stage = 1, twist = null, minCoins = 0 }) {
  const rng = makeRng(seed * 31 + stage + 2000);
  const budget = BRAWL_BUDGETS[Math.min(stage, BRAWL_BUDGETS.length) - 1];
  const usable = ARENAS.filter((a) => fitsTwist(a, twist));
  const pool = usable.filter((a) => a.type !== 'start' && a.type !== 'exit');
  const slotMin = (slot) => Math.min(...pool.filter(SLOT_RULES[slot]).map((a) => a.difficulty));

  // 1. Pick an arena for each slot without blowing the budget.
  let remaining = budget;
  const picks = [];
  const timesUsed = {};

  BRAWL_PACING.forEach((slot, i) => {
    const reserve = BRAWL_PACING.slice(i + 1).reduce((sum, s) => sum + slotMin(s), 0);
    const affordable = pool.filter((a) => SLOT_RULES[slot](a) && a.difficulty <= remaining - reserve);
    const prev = picks[picks.length - 1];

    let pick = rng.weighted(affordable, (a) => {
      if (prev && a.id === prev.arena.id) return 0;
      const rarity = (RARE_WEIGHT[a.type] ?? 1) * (a.twists ? TWIST_WEIGHT : 1);
      return rarity / (1 + 3 * (timesUsed[a.id] || 0));
    });
    if (!pick) pick = pool.find((a) => a.type === 'rest'); // safe fallback, costs 0

    timesUsed[pick.id] = (timesUsed[pick.id] || 0) + 1;
    remaining -= pick.difficulty;
    picks.push({ arena: pick, mirrored: rng.chance(0.5) });
  });

  // 2. Lay the arenas out side by side.
  const pickOne = (type) => rng.weighted(usable.filter((a) => a.type === type), (a) => (a.twists ? TWIST_WEIGHT : 1));
  const sequence = [
    { arena: pickOne('start'), mirrored: false },
    ...picks,
    { arena: pickOne('exit'), mirrored: false },
  ];

  const level = {
    seed,
    stage,
    twist,
    budget,
    cost: 0,
    widthTiles: sequence.length * ARENA_W,
    heightTiles: ARENA_H,
    solid: Array.from({ length: ARENA_H }, () => []), // solid[y][x] = true/false
    spikes: [],
    coins: [],
    playerStart: null,
    flag: null,
    // One entry per arena: where it starts (in tiles) and who's waiting in it.
    arenas: [],
    names: [],
  };
  const optional = [];

  sequence.forEach(({ arena, mirrored }, ai) => {
    const x0 = ai * ARENA_W;
    const room = { id: arena.id, x0, waves: [[], []] };
    level.names.push(arena.id + (mirrored ? ' (mirrored)' : ''));

    const read = (rows, wave) => rows.forEach((row, y) => {
      const chars = mirrored ? [...row].reverse() : [...row];
      chars.forEach((ch, x) => {
        const pos = { x: x0 + x, y };
        if (wave === 0) {
          level.solid[y][pos.x] = ch === '#';
          if (ch === '^') level.spikes.push(pos);
          else if (ch === 'C') level.coins.push(pos);
          else if (ch === 'P') level.playerStart = pos;
          else if (ch === 'F') level.flag = pos;
        }
        if (ENEMY_KINDS[ch]) room.waves[wave].push({ ...pos, kind: ENEMY_KINDS[ch] });
        else if (ENEMY_KINDS[ch.toUpperCase()]) optional.push({ room, wave, enemy: { ...pos, kind: ENEMY_KINDS[ch.toUpperCase()] } });
      });
    });
    read(arena.rows, 0);
    if (arena.reinforce) read(arena.reinforce, 1);
    level.arenas.push(room);
  });

  // 3. Spend leftover budget on optional enemies.
  for (const { room, wave, enemy } of rng.shuffle(optional)) {
    if (remaining < OPTIONAL_ENEMY_COST) break;
    room.waves[wave].push(enemy);
    remaining -= OPTIONAL_ENEMY_COST;
  }

  // An empty second wave is no wave; an optional-only reinforcement that
  // didn't get budget simply doesn't come. If wave 1 ended up empty but wave 2
  // didn't, promote it so the arena still locks properly.
  for (const room of level.arenas) {
    if (!room.waves[0].length && room.waves[1].length) room.waves = [room.waves[1], []];
    room.waves = room.waves.filter((w) => w.length);
    room.fight = room.waves.length > 0;
  }

  level.cost = budget - remaining;

  // 4. Collector minimum (doesn't touch the budget: the twist pays more).
  const enemies = level.arenas.flatMap((r) => r.waves.flat());
  level.coins.push(...findSpots({
    solid: level.solid,
    spikes: level.spikes,
    taken: [...level.coins, ...enemies, level.playerStart, level.flag],
    columns: [ARENA_W, level.widthTiles],
    rng: makeRng(seed * 31 + stage + 2555),
    count: minCoins - level.coins.length,
  }));
  return level;
}
