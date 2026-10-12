// Turns a seed into a shoot-'em-up stage: a timeline of spawn events.
// Same ideas as buildStage.js (pacing slots, difficulty budget, no repeats,
// mirroring), but the output is "spawn X in lane Y at time T" instead of a map.
// No Phaser in here, so it can be tested with plain Node.

import { WAVES, WAVE_W } from './waves.js';
import { fitsTwist } from './chunks.js';
import { TWIST_WEIGHT } from './buildStage.js';
import { makeRng } from './rng.js';

export const SHMUP_PACING = ['easy', 'build', 'rest', 'build', 'hard', 'rest', 'hard'];
export const SHMUP_BUDGETS = [10, 14, 19, 24, 30];

// Timing knobs (seconds). Raise ROW_TIME / WAVE_GAP for a longer, calmer stage.
export const ROW_TIME = 0.7;
export const WAVE_GAP = 2.5;
const START_DELAY = 2;

const OPTIONAL_ENEMY_COST = 1;
const RARE_WEIGHT = { secret: 0.2 };
const KINDS = { S: 'straight', W: 'weave', D: 'dive', T: 'turret' };

const SLOT_RULES = {
  easy: (w) => w.type === 'wave' && w.difficulty <= 1,
  build: (w) => w.type === 'wave' && w.difficulty >= 1 && w.difficulty <= 2,
  hard: (w) => w.type === 'wave' && w.difficulty >= 2,
  rest: (w) => w.type === 'rest' || w.type === 'secret',
};

// twist: the run's twist id. Waves tagged for other twists are left out.
export function buildShmup({ seed, stage = 1, twist = null }) {
  const rng = makeRng(seed * 31 + stage + 1000);
  const budget = SHMUP_BUDGETS[Math.min(stage, SHMUP_BUDGETS.length) - 1];
  const pool = WAVES.filter((w) => fitsTwist(w, twist));
  const slotMin = (slot) => Math.min(...pool.filter(SLOT_RULES[slot]).map((w) => w.difficulty));

  // 1. Pick a wave for each slot without blowing the budget.
  let remaining = budget;
  const picks = [];
  const timesUsed = {};

  SHMUP_PACING.forEach((slot, i) => {
    const reserve = SHMUP_PACING.slice(i + 1).reduce((sum, s) => sum + slotMin(s), 0);
    const affordable = pool.filter((w) => SLOT_RULES[slot](w) && w.difficulty <= remaining - reserve);
    const prev = picks[picks.length - 1];

    let wave = rng.weighted(affordable, (w) => {
      if (prev && w.id === prev.wave.id) return 0;
      const rarity = (RARE_WEIGHT[w.type] ?? 1) * (w.twists ? TWIST_WEIGHT : 1);
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

  level.events.sort((a, b) => a.time - b.time || a.lane - b.lane);
  level.cost = budget - remaining;
  level.duration = +t.toFixed(3);
  level.lanes = WAVE_W;
  return level;
}
