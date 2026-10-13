// Turns a seed into a brawler stage: a row of one-screen arenas.
// Same ideas as buildStage.js (pacing slots, difficulty budget, no repeats,
// mirroring), but each piece is a whole screen, and enemies belong to the
// arena they lock you into. No Phaser in here, so it can be tested with Node.

import { ARENAS, BOSS_ARENAS, ARENA_W, ARENA_H, ENEMY_KINDS } from './arenas.js';
import { fitsTwist, fitsLevel } from './chunks.js';
import { tagWeight, carrierIn } from './buildStage.js';
import { makeRng } from './rng.js';
import { pacingFor, EXTRA_ENEMY_COST } from './pacing.js';
import { findSpots } from './topUp.js';

// Shorter than the platformer's: each arena is a full screen and a fight.
export const BRAWL_PACING = ['easy', 'build', 'rest', 'hard', 'build', 'hard'];
export const BRAWL_BUDGETS = [9, 12, 16, 20, 25];

const OPTIONAL_ENEMY_COST = 1;
export const JUMPERS = { 4: 2, 5: 3 }; // stage -> how many jumpers
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
// genreLevel: the brawler's level picked at the machine (arenas tagged with a
// higher minLevel are left out; at level 2+ some extra enemies are shield
// guards). powerUp: one enemy in an arena in the first half of the stage
// carries it (carrier: true) and drops it when beaten.
// boss: true puts a boss arena before the exit.
// Stages 4 and 5 (only Long runs get that far) bring jumpers: JUMPERS[stage]
// of the stage's grunts, rushers and throwers become jumpers, and if there
// aren't enough, more join.
export function buildBrawl({ seed, stage = 1, twist = null, minCoins = 0, budgetScale = 1, genreLevel = 1, powerUp = null, boss = false }) {
  const rng = makeRng(seed * 31 + stage + 2000);
  const usable = ARENAS.filter((a) => fitsTwist(a, twist) && fitsLevel(a, genreLevel));
  const pool = usable.filter((a) => a.type !== 'start' && a.type !== 'exit');
  const slotMin = (slot) => Math.min(...pool.filter(SLOT_RULES[slot]).map((a) => a.difficulty));
  // budgetScale (Sudden Death levels): a bigger or smaller difficulty budget,
  // never below what the pacing slots need at their cheapest.
  const pacing = pacingFor(BRAWL_PACING, stage);
  const budget = Math.max(pacing.reduce((sum, s) => sum + slotMin(s), 0), Math.round(BRAWL_BUDGETS[Math.min(stage, BRAWL_BUDGETS.length) - 1] * budgetScale));

  // 1. Pick an arena for each slot without blowing the budget.
  let remaining = budget;
  const picks = [];
  const timesUsed = {};

  pacing.forEach((slot, i) => {
    const reserve = pacing.slice(i + 1).reduce((sum, s) => sum + slotMin(s), 0);
    const affordable = pool.filter((a) => SLOT_RULES[slot](a) && a.difficulty <= remaining - reserve);
    const prev = picks[picks.length - 1];

    let pick = rng.weighted(affordable, (a) => {
      if (prev && a.id === prev.arena.id) return 0;
      const rarity = (RARE_WEIGHT[a.type] ?? 1) * tagWeight(a);
      return rarity / (1 + 3 * (timesUsed[a.id] || 0));
    });
    if (!pick) pick = pool.find((a) => a.type === 'rest'); // safe fallback, costs 0

    timesUsed[pick.id] = (timesUsed[pick.id] || 0) + 1;
    remaining -= pick.difficulty;
    picks.push({ arena: pick, mirrored: rng.chance(0.5) });
  });

  // 2. Lay the arenas out side by side.
  const pickOne = (type) => rng.weighted(usable.filter((a) => a.type === type), tagWeight);
  const sequence = [
    { arena: pickOne('start'), mirrored: false },
    ...picks,
    { arena: pickOne('exit'), mirrored: false },
  ];
  // The boss arena goes just before the exit, with its own random numbers so
  // the rest of the stage is the same with or without it.
  if (boss) {
    const room = BOSS_ARENAS[makeRng(seed * 31 + stage + 4321).int(0, BOSS_ARENAS.length - 1)];
    sequence.splice(sequence.length - 1, 0, { arena: room, mirrored: false });
  }

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
    powerUp: null, // { kind } or null; the enemy carrying it has carrier: true
  };
  const optional = [];

  sequence.forEach(({ arena, mirrored }, ai) => {
    const x0 = ai * ARENA_W;
    const room = { id: arena.id, x0, waves: [[], []], boss: arena.type === 'boss' };
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
          else if (ch === 'K') room.waves[0].push({ ...pos, kind: 'boss' });
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

  // 4. Still budget left (later stages, Sudden Death level 3): extra enemies
  //    join fight arenas, at most two per arena, in the first wave.
  const spare = makeRng(seed * 31 + stage + 777);
  const fights = level.arenas.filter((r) => !r.boss && (r.waves[0].length || r.waves[1].length));
  let budgetLeft = Math.floor(remaining / EXTRA_ENEMY_COST);
  for (let round = 0; round < 2 && budgetLeft > 0; round++) {
    for (const room of spare.shuffle(fights)) {
      if (budgetLeft <= 0) break;
      const [spot] = findSpots({
        solid: level.solid,
        spikes: level.spikes,
        taken: [...level.coins, ...room.waves.flat(), level.playerStart, level.flag].filter(Boolean),
        columns: [room.x0 + 1, room.x0 + ARENA_W - 1],
        rng: spare,
        wide: true,
        count: 1,
      });
      if (!spot) continue;
      const kinds = genreLevel >= 2 ? ['grunt', 'thrower', 'rusher', 'shield'] : ['grunt', 'thrower', 'rusher'];
      const kind = spare.weighted(kinds, (k) => (k === 'grunt' ? 2 : 1));
      room.waves[0].push({ ...spot, kind });
      remaining -= EXTRA_ENEMY_COST;
      budgetLeft--;
    }
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

  // 5. Jumpers (stages 4 and 5): some ordinary enemies become jumpers.
  const want = JUMPERS[Math.min(stage, 5)] || 0;
  if (want) {
    const jrng = makeRng(seed * 31 + stage + 3333);
    const fightRooms = level.arenas.filter((r) => r.fight && !r.boss);
    const plain = jrng.shuffle(fightRooms.flatMap((r) => r.waves.flat()).filter((e) => ['grunt', 'rusher', 'thrower'].includes(e.kind)));
    plain.slice(0, want).forEach((e) => { e.kind = 'jumper'; });
    for (let n = Math.min(plain.length, want); n < want; n++) {
      const room = fightRooms[jrng.int(0, fightRooms.length - 1)];
      if (!room) break;
      const [spot] = findSpots({
        solid: level.solid,
        spikes: level.spikes,
        taken: [...level.coins, ...level.arenas.flatMap((r) => r.waves.flat()), level.playerStart, level.flag].filter(Boolean),
        columns: [room.x0 + 1, room.x0 + ARENA_W - 1],
        rng: jrng,
        wide: true,
        count: 1,
      });
      if (spot) room.waves[0].push({ ...spot, kind: 'jumper' });
    }
  }

  // 6. The power-up (genre level 2+): an enemy in a fight in the first half
  //    of the stage carries it (the earliest fight if none are in that half).
  if (powerUp) {
    const fightRooms = level.arenas.filter((r) => r.fight && !r.boss);
    const firstHalf = fightRooms.filter((r) => level.arenas.indexOf(r) < level.arenas.length / 2);
    const rooms = firstHalf.length ? firstHalf : fightRooms.slice(0, 1);
    const pool = rooms.flatMap((r) => r.waves.flat());
    const i = carrierIn(pool, () => true, makeRng(seed * 31 + stage + 999));
    if (i >= 0) {
      pool[i].carrier = true;
      level.powerUp = { kind: powerUp };
    }
  }
  return level;
}
