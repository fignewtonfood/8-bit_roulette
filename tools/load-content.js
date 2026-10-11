// Node version of src/data/index.js: reads the same data files from disk.

import { readFileSync, readdirSync } from 'node:fs';
import { assembleContent } from '../src/engine/content.js';

const dir = new URL('../src/data/', import.meta.url);
const read = (path) => {
  try {
    return JSON.parse(readFileSync(new URL(path, dir), 'utf8'));
  } catch (err) {
    throw new Error(`src/data/${path}: ${err.message}`);
  }
};
const folder = (name) =>
  Object.fromEntries(
    readdirSync(new URL(`${name}/`, dir))
      .filter((f) => f.endsWith('.json'))
      .map((f) => read(`${name}/${f}`))
      .map((d) => [d.id, d]),
  );

export function loadContent() {
  return assembleContent({
    reels: read('reels.json'),
    genres: read('genres.json'),
    compatibility: read('compatibility.json'),
    economy: read('economy.json'),
    shop: read('shop.json'),
    themes: folder('themes'),
    twists: folder('twists'),
  });
}
