// Seeded random numbers: the same seed always builds the same stage,
// so an unfair layout found in playtesting can be replayed and fixed.

export function makeRng(seed) {
  let a = seed >>> 0;
  // mulberry32 — tiny, fast, good enough for games
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    // Pick one item; weightFn returns how likely each item is (0 = never).
    weighted(items, weightFn) {
      const weights = items.map(weightFn);
      const total = weights.reduce((s, w) => s + w, 0);
      if (total <= 0) return null;
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r < 0) return items[i];
      }
      return items[items.length - 1];
    },
  };
}

export function randomSeed() {
  return Math.floor(Math.random() * 1_000_000_000);
}
