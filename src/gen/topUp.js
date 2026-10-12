// Tops a stage up to a minimum number of coins or enemies (the "minimum" in
// twists/collector.json and killer.json). Used by the platformer and brawler
// generators when the hand-drawn pieces didn't bring enough on their own.
// No Phaser here, so it's tested with plain Node like the generators.

const SPACING = 3; // tiles kept between anything this places

// Finds spots to stand on and returns up to `count` of them.
//   solid       solid[y][x] grid of the stage
//   spikes      [{x, y}] spike positions (never placed on or next to)
//   taken       [{x, y}] coins/enemies/starts already there (kept clear of)
//   columns     [from, to) x range allowed (skips the start area, for example)
//   wide        true = needs floor on both sides too (walking enemies)
export function findSpots({ solid, spikes, taken, columns, count, rng, wide = false }) {
  if (count <= 0) return [];
  const H = solid.length;
  const spike = new Set(spikes.map(({ x, y }) => `${x},${y}`));
  const near = (a, b) => Math.abs(a.x - b.x) < SPACING && Math.abs(a.y - b.y) < SPACING;
  const floorAt = (x, y) => !!solid[y + 1]?.[x] && !solid[y]?.[x] && !spike.has(`${x},${y}`);

  const candidates = [];
  for (let x = columns[0]; x < columns[1]; x++) {
    for (let y = 1; y < H - 1; y++) {
      if (!floorAt(x, y)) continue;
      if (solid[y - 1]?.[x]) continue; // no room overhead
      if (wide && !(floorAt(x - 1, y) && floorAt(x + 1, y))) continue;
      if ([-1, 1].some((dx) => spike.has(`${x + dx},${y}`))) continue;
      candidates.push({ x, y });
    }
  }

  const chosen = [];
  for (const spot of rng.shuffle(candidates)) {
    if (chosen.length >= count) break;
    if (taken.some((t) => near(t, spot)) || chosen.some((c) => near(c, spot))) continue;
    chosen.push(spot);
  }
  return chosen;
}
