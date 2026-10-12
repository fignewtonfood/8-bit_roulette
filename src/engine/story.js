// The story's rules: which beats are unlocked, which logs are unread, what the
// hub should show, and when the machine glitches. No Phaser in here, so it can
// be tested with plain Node (npm run check:story). The words live in story.json.
//
// Nothing about the story is stored except which logs you've read and how
// many glitch runs you've played: a beat is unlocked whenever the save's
// lifetime stats meet it, so progress can never get out of step with the save.

import { levelOf } from './run.js';

const STAT_KEYS = ['runs', 'wins', 'tokensEarned', 'glitches'];
export const HUB_FEATURES = ['scratches', 'stranger', 'watching'];

// Does the save meet one unlock rule, e.g. { runs: 2, upgrade: { id, level } }?
export function meets(save, rule = {}) {
  for (const k of STAT_KEYS) if (rule[k] && (save.stats[k] || 0) < rule[k]) return false;
  if (rule.upgrade && levelOf(save, rule.upgrade.id) < (rule.upgrade.level || 1)) return false;
  return true;
}

// Beats unlock in order: each needs its own rule and every beat before it.
export function unlockedBeats(content, save) {
  const out = [];
  for (const beat of content.story.beats) {
    if (!meets(save, beat.unlock)) break;
    out.push(beat);
  }
  return out;
}

const readList = (save) => save.story?.read || [];

export const unreadBeats = (content, save) =>
  unlockedBeats(content, save).filter((b) => !readList(save).includes(b.id));

// Never changes the save it was given.
export function markRead(save, beatId) {
  if (readList(save).includes(beatId)) return save;
  return { ...save, story: { ...save.story, read: [...readList(save), beatId] } };
}

// Beats a change to the save just unlocked (to announce them).
export function newlyUnlocked(content, before, after) {
  const had = new Set(unlockedBeats(content, before).map((b) => b.id));
  return unlockedBeats(content, after).filter((b) => !had.has(b.id));
}

// What the hub should show: { scratches, stranger, watching, wall, says }.
export function hubState(content, save) {
  const state = { wall: [], says: [] };
  for (const beat of unlockedBeats(content, save)) {
    if (beat.hub) state[beat.hub] = true;
    if (beat.wall) state.wall = beat.wall;
    if (beat.says) state.says = beat.says; // the latest beat's lines win
  }
  return state;
}

// Should this spin glitch? random() is a 0..1 roll (Math.random in the game).
// The first glitch is forced on the next real spin once story.glitch.first is
// met; after that it's a chance per spin. Practice spins never glitch.
export function glitchNext(content, save, random, { practice = false } = {}) {
  const g = content.story.glitch;
  if (practice || !g) return false;
  if (!save.stats.glitches) return meets(save, g.first);
  return random() < (g.chance || 0);
}

// Testing shortcut (?story=3): the lowest lifetime stats that unlock the
// first n beats, merged into the save's own (never lowers anything).
// Upgrade rules aren't touched; buy those in the shop.
export function withStoryUnlocked(content, save, n) {
  const stats = { ...save.stats };
  for (const beat of content.story.beats.slice(0, n)) {
    for (const k of STAT_KEYS) if (beat.unlock[k]) stats[k] = Math.max(stats[k] || 0, beat.unlock[k]);
  }
  return { ...save, stats };
}
