// Levels from playing: every finished run counts as one play of its theme,
// its genre and its twist. Enough plays raise that entry's level (thresholds
// in economy.json "levels"; 10 plays = level 2, 50 = level 3, max 3).
// What a level actually does comes later; this is the counting and tracking.
// No Phaser in here, so it's tested with plain Node (npm run check:loop).

export const REELS = ['theme', 'genre', 'twist'];

// The plays a save has for one reel entry.
export const playsOf = (save, reel, id) => save.plays?.[reel]?.[id] || 0;

// Level for a number of plays: 1, then one more for each threshold reached.
export function levelFor(content, plays) {
  const steps = content.economy.levels || [];
  return 1 + steps.filter((n) => plays >= n).length;
}

export const levelOfEntry = (content, save, reel, id) => levelFor(content, playsOf(save, reel, id));
export const maxLevel = (content) => 1 + (content.economy.levels || []).length;

// Adds one play for each of the run's reels. Never changes the save it was given.
export function addPlays(save, run) {
  const plays = { theme: {}, genre: {}, twist: {}, ...(save.plays || {}) };
  for (const reel of REELS) {
    const id = run[reel];
    if (!id) continue;
    plays[reel] = { ...plays[reel], [id]: (plays[reel][id] || 0) + 1 };
  }
  return { ...save, plays };
}

// What went up between two saves: [{ reel, id, level }].
export function levelsGained(content, before, after) {
  const out = [];
  for (const reel of REELS) {
    for (const id of Object.keys(after.plays?.[reel] || {})) {
      const was = levelOfEntry(content, before, reel, id);
      const now = levelOfEntry(content, after, reel, id);
      if (now > was) out.push({ reel, id, level: now });
    }
  }
  return out;
}

// Everything above level 1, highest first: [{ reel, id, level }].
// The progress page lists only these, never what's still to come.
export function reachedLevels(content, save) {
  const out = [];
  for (const reel of REELS) {
    for (const id of Object.keys(save.plays?.[reel] || {})) {
      const level = levelOfEntry(content, save, reel, id);
      if (level > 1) out.push({ reel, id, level });
    }
  }
  return out.sort((a, b) => b.level - a.level || REELS.indexOf(a.reel) - REELS.indexOf(b.reel));
}

// The short on-screen name of a reel entry ("NEON", "SHMUP", "LOW-G").
export function shortName(content, reel, id) {
  const map = { theme: content.themes, genre: content.genres, twist: content.twists }[reel];
  const entry = map?.[id];
  return (entry?.short || entry?.name || id).toUpperCase();
}

// The terminal's progress pages, as lines of text: levels reached and shop
// upgrades owned. Only what you have; nothing about what's still to come.
export function progressLines(content, save) {
  const lines = [];
  const levels = reachedLevels(content, save);
  lines.push('> LEVELS');
  if (!levels.length) lines.push('  NONE YET');
  for (const { reel, id, level } of levels) {
    lines.push(`  ${reel.toUpperCase().padEnd(6)}${shortName(content, reel, id).padEnd(15)}LV ${level}`);
  }
  const owned = Object.values(content.shop.upgrades).filter((u) => (save.upgrades?.[u.id] || 0) > 0);
  if (owned.length) {
    lines.push('', '> UPGRADES');
    for (const u of owned) {
      const lv = save.upgrades[u.id];
      lines.push(`  ${u.short.padEnd(21)}${u.costs.length > 1 ? `LV ${lv}` : ''}`);
    }
  }
  return lines;
}
