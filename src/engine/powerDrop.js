// Where a dropped power-up appears, and which way it first runs.
// Shared by the platformer and the brawler (the shmup has no floor).
// No Phaser here, so it's tested with plain Node (npm run check:levels).
//
// solid[y][x] is the stage grid; spikes is a Set of "x,y" tile keys.

// Is (x, y) an empty tile with solid ground right under it and no spikes in it?
const standable = (solid, spikes, x, y) =>
  y > 0 && y < solid.length - 1 && !solid[y][x] && !!solid[y + 1][x] && !spikes.has(`${x},${y}`);

// A column with no ground at all from row y down: a pit.
export const isPit = (solid, x, y) => x >= 0 && x < solid[0].length && !solid.slice(Math.max(0, y)).some((row) => row[x]);

// The nearest safe tile to stand on from (col, row): no spikes on it or right
// beside it, not next to a pit, and inside columns [lo, hi]. Columns closest
// to col come first; within a column, the ground at or below row comes first
// (so an enemy beaten in mid-air drops the power-up onto the floor under it).
// Returns { x, y } in tiles, or null if there's nowhere.
export function safeSpot(solid, spikes, col, row, lo = 0, hi = solid[0].length - 1) {
  const H = solid.length;
  const safe = (x, y) => standable(solid, spikes, x, y)
    && !spikes.has(`${x - 1},${y}`) && !spikes.has(`${x + 1},${y}`)
    && !isPit(solid, x - 1, y + 1) && !isPit(solid, x + 1, y + 1);
  for (let d = 0; d <= hi - lo; d++) {
    for (const x of d ? [col - d, col + d] : [col]) {
      if (x < lo || x > hi) continue;
      const below = [];
      const above = [];
      for (let y = 1; y < H - 1; y++) if (safe(x, y)) (y >= row ? below : above).push(y);
      const y = below[0] ?? above[above.length - 1];
      if (y !== undefined) return { x, y };
    }
  }
  return null;
}

// Which way to start running from (col, row) to get away from the nearest pit
// along the floor: 1 = right, -1 = left, 0 = no pit either way (in [lo, hi]).
// Looks along the row the power-up stands on, following the floor over small
// steps (a pit is a column with no ground at all below that row).
export function awayFromPit(solid, col, row, lo = 0, hi = solid[0].length - 1) {
  const dist = (dir) => {
    for (let x = col + dir, n = 1; x >= lo && x <= hi; x += dir, n++) {
      if (isPit(solid, x, row)) return n;
    }
    return Infinity;
  };
  const left = dist(-1);
  const right = dist(1);
  if (left === right) return 0;
  return left < right ? 1 : -1;
}
