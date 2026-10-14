// The slot machine itself: seed in, { theme, genre, twist } out.
// No Phaser in here, so it can be tested with plain Node (npm run check:engine).
//
// How a spin works, reel by reel (left to right):
//   1. Roll the reel normally, using each entry's weight.
//   2. If that roll can't lead to a playable combo (see compatibility.json),
//      it's re-rolled among the entries that can. The result remembers which
//      reels were re-rolled so the machine can show a "re-roll" on screen.
// Because every reel only lands on something that still has a valid
// combination, a spin can never get stuck.

import { makeRng } from '../gen/rng.js';
import { whyIncompatible, themeAt, SCREEN_CHARS } from './content.js';

const REELS = ['theme', 'genre', 'twist'];

// glitch: true puts the story's glitch theme on the theme reel (story.js
// decides when). The other reels still roll normally around it.
export function spin(content, seed, locks = {}, { glitch = false } = {}) {
  const rng = makeRng(seed * 7 + 99991); // offset so it doesn't mirror the stage generator
  const result = { seed, rerolled: [], firstRoll: {}, glitch: false };
  const glitchTheme = content.story?.glitch?.theme;
  if (glitch && glitchTheme && !locks.theme) {
    locks = { ...locks, theme: glitchTheme };
    result.glitch = true;
  }

  // Does any full combo exist that starts with these choices?
  const canFinish = (partial) => {
    const fill = (i, combo) => {
      if (i === REELS.length) return !whyIncompatible(content, combo);
      const reel = REELS[i];
      const options = combo[reel] ? [combo[reel]] : content.reels[reel].map((e) => e.id);
      return options.some((id) => fill(i + 1, { ...combo, [reel]: id }));
    };
    return fill(0, partial);
  };

  for (const reel of REELS) {
    const strip = content.reels[reel];

    // A locked reel (from the URL, or later a shop upgrade) is used as-is.
    if (locks[reel]) {
      result[reel] = locks[reel];
      continue;
    }

    const roll = rng.weighted(strip, (e) => e.weight).id;
    if (canFinish(pick(result, locks, reel, roll))) {
      result[reel] = roll;
    } else {
      const valid = strip.filter((e) => canFinish(pick(result, locks, reel, e.id)));
      result[reel] = rng.weighted(valid, (e) => e.weight)?.id ?? roll;
      result.rerolled.push(reel);
      result.firstRoll[reel] = roll;
    }
  }

  result.problem = whyIncompatible(content, result); // only possible with locks
  return result;
}

// The combo so far (earlier reels + any locked reels), with one reel set to id.
function pick(result, locks, reel, id) {
  const combo = {};
  for (const r of REELS) if (result[r] || locks[r]) combo[r] = result[r] || locks[r];
  combo[reel] = id;
  return combo;
}

// The short version that fits on one line of the 256px screen.
export function runTitle(content, run) {
  const t = themeAt(content, run.theme, run.levels?.theme); // level 3: the variant's names
  const g = content.genres[run.genre];
  const tw = content.twists[run.twist];
  const lv = (reel) => (run.levels?.[reel] > 1 ? ` LV${run.levels[reel]}` : '');
  const rest = ` · ${g.short || g.name}${lv('genre')} · ${tw.short || tw.name}${lv('twist')}`;
  // With levels showing, a long theme name drops to its short one to fit.
  const full = `${t.name}${lv('theme')}`;
  const name = full.length + rest.length > SCREEN_CHARS ? `${t.short || t.name}${lv('theme')}` : full;
  return `${name}${rest}`;
}

export function describeRun(content, run) {
  const t = themeAt(content, run.theme, run.levels?.theme);
  const g = content.genres[run.genre];
  const tw = content.twists[run.twist];
  const lv = (reel) => (run.levels?.[reel] > 1 ? ` (level ${run.levels[reel]})` : '');
  return `${t.name}${lv('theme')} · ${g.name}${lv('genre')} · ${tw.name}${lv('twist')}`;
}
