// When a theme's hazard comes (theme level 2+). No Phaser here, so it's
// tested with plain Node (npm run check:levels). The hazards themselves
// (what they look like and how they move) are in src/ui/hazards.js.
//
// The theme file's hazard "every" is the average number of seconds between
// two hazards. The real gaps wobble around it (seeded, so a seed replays the
// same), come a little quicker on later stages, and much quicker while a boss
// is calling them in.

import { makeRng } from '../gen/rng.js';

export const FIRST_HAZARD = 4;     // s of calm at the start of a stage
export const MAX_HAZARDS = 3;      // never more than this many at once
export const STAGE_HURRY = 0.08;   // each stage after the first: 8% more often
export const BOSS_HURRY = 0.55;    // during a boss fight, gaps are this long
export const WOBBLE = 0.5;         // a gap is every × (1 ± WOBBLE / 2)

// A timer for one stage. next(boss) gives the seconds until the next hazard.
export function hazardTimer(hazard, seed, stage) {
  const rng = makeRng((seed * 13 + stage * 101 + 5) >>> 0);
  const base = hazard.every / (1 + STAGE_HURRY * (stage - 1));
  return {
    first: FIRST_HAZARD,
    next(boss = false) {
      const gap = base * (1 - WOBBLE / 2 + WOBBLE * rng.next());
      return boss ? gap * BOSS_HURRY : gap;
    },
    // A number from 0 to 1, for where the hazard appears.
    roll: () => rng.next(),
  };
}

// How many hazards come in a stage of this many seconds (for the checks).
export function hazardCount(hazard, seed, stage, seconds, boss = false) {
  const t = hazardTimer(hazard, seed, stage);
  let at = t.first;
  let n = 0;
  while (at <= seconds) {
    n++;
    at += t.next(boss);
  }
  return n;
}
