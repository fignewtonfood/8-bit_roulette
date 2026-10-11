// Starts the right genre's scene for a run.
// A run is everything needed to rebuild a game exactly: { seed, theme, genre, twist }.

import { content } from '../data/index.js';

export function toRun({ seed, theme, genre, twist }) {
  return { seed, theme, genre, twist };
}

export function startRun(scene, run) {
  scene.scene.start(content.genres[run.genre].scene, { run: toRun(run) });
}
