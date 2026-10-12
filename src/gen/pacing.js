// Later stages get more pieces, so their bigger difficulty budgets have
// somewhere to go. Shared by all three generators.
//
// EXTRA_SLOTS[n] is what stage n+1 adds to a genre's base pacing. The extras
// go in just before the base's last slot, so every stage still ends on its
// hardest piece. (Stage 1 is the base pacing as it was.)

export const EXTRA_SLOTS = [
  [],
  ['build'],
  ['build', 'hard'],
  ['hard', 'rest', 'build'],
  ['hard', 'build', 'rest', 'hard'],
];

export function pacingFor(base, stage) {
  const extra = EXTRA_SLOTS[Math.min(stage, EXTRA_SLOTS.length) - 1];
  return [...base.slice(0, -1), ...extra, base[base.length - 1]];
}

// Leftover budget becomes extra enemies, this many points each (a placed
// enemy costs more than an optional one drawn into a piece, which is 1).
export const EXTRA_ENEMY_COST = 2;
