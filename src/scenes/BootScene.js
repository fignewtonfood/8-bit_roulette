import Phaser from 'phaser';
import { content } from '../data/index.js';
import { spin, describeRun } from '../engine/spin.js';
import { startRun } from '../engine/startRun.js';
import { randomSeed } from '../gen/rng.js';

// Reads the URL, then either opens the slot machine or (for testing) jumps
// straight into a game.
//
//   (nothing)                 the slot machine
//   ?seed=12345               replay a run exactly (same reels, same stage)
//   ?genre=shmup              force a reel; also ?theme=neon-space, ?twist=darkness
//   ?spin                     open the machine even with the options above;
//                             forced reels stay locked when it spins
// Mix them freely: ?genre=platformer&twist=low-gravity&seed=7
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    const params = new URLSearchParams(window.location.search);

    const locks = {};
    for (const [reel, known] of [['theme', content.themes], ['genre', content.genres], ['twist', content.twists]]) {
      const id = params.get(reel);
      if (!id) continue;
      if (known[id]) locks[reel] = id;
      else console.warn(`[8-Bit Roulette] unknown ${reel} "${id}". Options: ${Object.keys(known).join(', ')}`);
    }

    const seedParam = params.get('seed');
    const hasSeed = seedParam !== null && seedParam !== '' && !Number.isNaN(Number(seedParam));

    if (params.has('spin') || (!hasSeed && !Object.keys(locks).length)) {
      this.scene.start('Spin', { locks });
      return;
    }

    const result = spin(content, hasSeed ? Number(seedParam) : randomSeed(), locks);
    if (result.problem) console.warn(`[8-Bit Roulette] ${describeRun(content, result)} is blocked (${result.problem}), playing it anyway for testing.`);
    startRun(this, result);
  }
}
