// Turns a seed into a shoot-'em-up stage: a timeline of spawn events.
// Same ideas as buildStage.js (pacing slots, difficulty budget, no repeats,
// mirroring), but the output is "spawn X in lane Y at time T" instead of a map.
// No Phaser in here, so it can be tested with plain Node.

import { WAVES, WAVE_W } from './waves.js';
import { fitsTwist, fitsLevel } from './chunks.js';
import { tagWeight, carrierIn } from './buildStage.js';
import { makeRng } from './rng.js';
import { pacingFor, EXTRA_ENEMY_COST } from './pacing.js';

export const SHMUP_PACING = ['easy', 'build', 'rest', 'build', 'hard', 'rest', 'hard'];
export const SHMUP_BUDGETS = [10, 14, 19, 24, 30];

// Timing knobs (seconds). Raise ROW_TIME / WAVE_GAP for a longer, calmer stage.
export const ROW_TIME = 0.7;
export const WAVE_GAP = 2.5;
const START_DELAY = 2;

const OPTIONAL_ENEMY_COST = 1;
const RARE_WEIGHT = { secret: 0.2 };
const KINDS = { S: 'straight', W: 'weave', D: 'dive', T: 'turret', P: 'splitter' };
// The boss (genre level 3) flies in this long after the last wave has started.
export const BOSS_DELAY = 3;

const SLOT_RULES = {
  easy: (w) => w.type === 'wave' && w.difficulty <= 1,
  build: (w) => w.type === 'wave' && w.difficulty >= 1 && w.difficulty <= 2,
  hard: (w) => w.type === 'wave' && w.difficulty >= 2,
  rest: (w) => w.type === 'rest' || w.type === 'secret',
};

// twist: the run's twist id. Waves tagged for other twists are left out.
// minCoins / minEnemies (Collector / Killer): if the waves bring fewer, extra
// coins (or straight-flying bats) are spread evenly through the stage.
// Normal stages pass 0 and are unaffected.
// genreLevel: the shmup's level picked at the machine (waves tagged with a
// higher minLevel are left out). powerUp: one enemy in the first half of the
// stage carries it (its event gets carrier: true) and drops it when shot down.
// If it gets away, the power-up goes with it. boss: true adds a boss after the last wave
// (level.bossAt, in seconds); the stage isn't cleared until it's down.
export function buildShmup({ seed, stage = 1, twist = null, minCoins = 0, minEnemies = 0, budgetScale = 1, genreLevel = 1, powerUp = null, boss = false }) {
  const level = buildOnce({ seed, stage, twist, budgetScale, genreLevel });
  const extra = makeRng(seed * 31 + stage + 1555);
  const enemies = level.events.filter((e) => e.kind !== 'coin').length;
  const added = [
    ...spread(level, extra, 'coin', minCoins - level.coins),
    ...spread(level, extra, 'straight', minEnemies - enemies),
  ];
  level.coins += added.filter((e) => e.kind === 'coin').length;
  level.events.push(...added);
  level.events.sort((a, b) => a.time - b.time || a.lane - b.lane);
  if (powerUp) {
    const prng = makeRng(seed * 31 + stage + 999);
    const half = level.duration / 2;
    let i = carrierIn(level.events, (e) => e.kind !== 'coin' && e.time < half, prng);
    if (i < 0) {
      const [ev] = spreadAt(level, prng, 'straight', START_DELAY + (half - START_DELAY) / 2);
      level.events.push(ev);
      level.events.sort((a, b) => a.time - b.time || a.lane - b.lane);
      i = level.events.indexOf(ev);
    }
    level.events[i] = { ...level.events[i], carrier: true };
    level.powerUp = { kind: powerUp };
  } else {
    level.powerUp = null;
  }
  level.bossAt = boss ? +(level.duration + BOSS_DELAY).toFixed(3) : null;
  return level;
}

// One event at a set time, in a lane clear of anything spawning about then.
function spreadAt(level, rng, kind, time) {
  const busy = (lane) => level.events.some((e) => Math.abs(e.time - time) < 0.6 && Math.abs(e.lane - lane) < 2);
  const lanes = rng.shuffle(Array.from({ length: WAVE_W - 4 }, (_, k) => k + 2));
  return [{ time: +time.toFixed(3), lane: lanes.find((l) => !busy(l)) ?? lanes[0], kind }];
}

// count events of one kind, evenly spaced in time, in lanes clear of anything
// spawning at about the same moment.
function spread(level, rng, kind, count) {
  const out = [];
  if (count <= 0) return out;
  const span = level.duration - START_DELAY;
  for (let i = 0; i < count; i++) {
    const time = +(START_DELAY + ((i + 0.5) * span) / count).toFixed(3);
    const busy = (lane) => [...level.events, ...out].some((e) => Math.abs(e.time - time) < 0.6 && Math.abs(e.lane - lane) < 2);
    const lanes = rng.shuffle(Array.from({ length: WAVE_W - 4 }, (_, k) => k + 2));
    out.push({ time, lane: lanes.find((l) => !busy(l)) ?? lanes[0], kind });
  }
  return out;
}

function buildOnce({ seed, stage, twist, budgetScale, genreLevel }) {
  const rng = makeRng(seed * 31 + stage + 1000);
  const pool = WAVES.filter((w) => fitsTwist(w, twist) && fitsLevel(w, genreLevel));
  const slotMin = (slot) => Math.min(...pool.filter(SLOT_RULES[slot]).map((w) => w.difficulty));
  // budgetScale (Sudden Death levels): a bigger or smaller difficulty budget,
  // never below what the pacing slots need at their cheapest.
  const pacing = pacingFor(SHMUP_PACING, stage);
  const budget = Math.max(pacing.reduce((sum, s) => sum + slotMin(s), 0), Math.round(SHMUP_BUDGETS[Math.min(stage, SHMUP_BUDGETS.length) - 1] * budgetScale));

  // 1. Pick a wave for each slot without blowing the budget.
  let remaining = budget;
  const picks = [];
  const timesUsed = {};

  pacing.forEach((slot, i) => {
    const reserve = pacing.slice(i + 1).reduce((sum, s) => sum + slotMin(s), 0);
    const affordable = pool.filter((w) => SLOT_RULES[slot](w) && w.difficulty <= remaining - reserve);
    const prev = picks[picks.length - 1];

    let wave = rng.weighted(affordable, (w) => {
      if (prev && w.id === prev.wave.id) return 0;
      const rarity = (RARE_WEIGHT[w.type] ?? 1) * tagWeight(w);
      return rarity / (1 + 3 * (timesUsed[w.id] || 0));
    });
    if (!wave) wave = pool.find((w) => w.type === 'rest');

    timesUsed[wave.id] = (timesUsed[wave.id] || 0) + 1;
    remaining -= wave.difficulty;
    picks.push({ wave, mirrored: rng.chance(0.5) });
  });

  // 2. Turn the waves into a timeline of spawn events.
  const level = { seed, stage, twist, budget, cost: 0, duration: 0, events: [], waves: [], coins: 0 };
  const optionalEnemies = [];
  let t = START_DELAY;

  picks.forEach(({ wave, mirrored }) => {
    level.waves.push(wave.id + (mirrored ? ' (mirrored)' : ''));
    wave.rows.forEach((row, r) => {
      const chars = mirrored ? [...row].reverse() : [...row];
      chars.forEach((ch, lane) => {
        const time = +(t + r * ROW_TIME).toFixed(3);
        if (ch === 'C') {
          level.events.push({ time, lane, kind: 'coin' });
          level.coins++;
        } else if (KINDS[ch]) {
          level.events.push({ time, lane, kind: KINDS[ch] });
        } else if (KINDS[ch.toUpperCase()]) {
          optionalEnemies.push({ time, lane, kind: KINDS[ch.toUpperCase()] });
        }
      });
    });
    t += wave.rows.length * ROW_TIME + WAVE_GAP;
  });

  // 3. Spend leftover budget on optional enemies.
  for (const ev of rng.shuffle(optionalEnemies)) {
    if (remaining < OPTIONAL_ENEMY_COST) break;
    level.events.push(ev);
    remaining -= OPTIONAL_ENEMY_COST;
  }

  level.duration = +t.toFixed(3);

  // 4. Still budget left (later stages, Sudden Death level 3): extra enemies
  //    spread through the stage, at most one per wave. Divers join from stage 3.
  const spare = makeRng(seed * 31 + stage + 777);
  const extraCount = Math.min(Math.floor(remaining / EXTRA_ENEMY_COST), picks.length);
  const kinds = [...(stage >= 3 ? ['straight', 'weave', 'dive'] : ['straight', 'weave']), ...(genreLevel >= 2 ? ['splitter'] : [])];
  const extras = spread(level, spare, 'straight', extraCount).map((ev, i) => ({ ...ev, kind: kinds[i % kinds.length] }));
  level.events.push(...extras);
  remaining -= extras.length * EXTRA_ENEMY_COST;

  level.events.sort((a, b) => a.time - b.time || a.lane - b.lane);
  level.cost = budget - remaining;
  level.lanes = WAVE_W;
  return level;
}
