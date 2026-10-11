// Loads every data file for the game. Vite finds the theme and twist files
// automatically, so adding content = drop a JSON file in the folder and add
// its id to reels.json. No code changes.

import { assembleContent } from '../engine/content.js';
import reels from './reels.json';
import genres from './genres.json';
import compatibility from './compatibility.json';

const byId = (modules) =>
  Object.fromEntries(Object.values(modules).map((m) => [m.default.id, m.default]));

export const content = assembleContent({
  reels,
  genres,
  compatibility,
  themes: byId(import.meta.glob('./themes/*.json', { eager: true })),
  twists: byId(import.meta.glob('./twists/*.json', { eager: true })),
});
