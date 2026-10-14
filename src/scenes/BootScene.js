import Phaser from 'phaser';
import { content } from '../data/index.js';
import { spin, describeRun } from '../engine/spin.js';
import { startRun } from '../engine/startRun.js';
import { makeRun } from '../engine/run.js';
import { getSave, setSave, resetSave, session } from '../engine/profile.js';
import { randomSeed } from '../gen/rng.js';
import { makePixelFont } from '../ui/font.js';
import { withStoryUnlocked } from '../engine/story.js';

// Reads the URL, then opens the hub or (for testing) jumps somewhere else.
//
//   (nothing)                 the hub: walk up to the machine to play
//   ?seed=12345               practice: replay a run exactly (same reels, same stages)
//   ?genre=shmup              practice: force a reel; also ?theme=neon-space, ?twist=darkness
//   ?length=medium            practice: how many stages (short, medium, long)
//   ?genrelevel=3             practice: play the genre at level 2 or 3 (also ?twistlevel=2,
//                             ?themelevel=3)
//   ?spin                     practice slot machine; forced reels stay locked,
//                             every length is open, spin again freely
// Practice runs pay no tokens. Mix them freely: ?genre=platformer&twist=low-gravity&seed=7
//
// Save tools (for playtesting):
//   ?unlock                   every length open in the real game (this visit only)
//   ?tokens=500               add 500 tokens to your save
//   ?reset                    wipe your save and start over
//   ?story=3                  unlock the first 3 story beats (raises your lifetime stats)
//   ?glitch                   the next spin glitches (this visit only)
//   ?plays=50                 set every theme, genre and twist to 50 plays (levels)
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    makePixelFont(this);
    const params = new URLSearchParams(window.location.search);

    if (params.has('reset')) {
      resetSave();
      console.log('[8-Bit Roulette] Save wiped.');
    }
    const bonus = Number(params.get('tokens'));
    if (bonus > 0) {
      const save = getSave();
      setSave({ ...save, tokens: save.tokens + Math.floor(bonus) });
      console.log(`[8-Bit Roulette] +${Math.floor(bonus)} tokens (now ${getSave().tokens}). Remove ?tokens from the URL or a refresh adds them again.`);
    }
    const plays = Number(params.get('plays'));
    if (params.has('plays') && plays >= 0) {
      const n = Math.floor(plays);
      const all = (map) => Object.fromEntries(Object.keys(map).map((id) => [id, n]));
      setSave({ ...getSave(), plays: { theme: all(content.themes), genre: all(content.genres), twist: all(content.twists) } });
      console.log(`[8-Bit Roulette] Every theme, genre and twist set to ${n} plays. Remove ?plays from the URL or every refresh resets them.`);
    }
    session.unlockAll = params.has('unlock');
    session.forceGlitch = params.has('glitch');
    const storyBeats = Number(params.get('story'));
    if (storyBeats > 0) {
      setSave(withStoryUnlocked(content, getSave(), Math.floor(storyBeats)));
      console.log(`[8-Bit Roulette] Story unlocked up to beat ${Math.min(Math.floor(storyBeats), content.story.beats.length)}.`);
    }

    const locks = {};
    for (const [reel, known] of [['theme', content.themes], ['genre', content.genres], ['twist', content.twists]]) {
      const id = params.get(reel);
      if (!id) continue;
      if (known[id]) locks[reel] = id;
      else console.warn(`[8-Bit Roulette] unknown ${reel} "${id}". Options: ${Object.keys(known).join(', ')}`);
    }

    const seedParam = params.get('seed');
    const hasSeed = seedParam !== null && seedParam !== '' && !Number.isNaN(Number(seedParam));
    const lengthId = params.get('length');
    if (lengthId && !content.economy.lengths.some((l) => l.id === lengthId)) {
      console.warn(`[8-Bit Roulette] unknown length "${lengthId}". Options: ${content.economy.lengths.map((l) => l.id).join(', ')}`);
    }

    if (params.has('spin')) {
      if (lengthId) session.lastLength = lengthId;
      this.scene.start('Spin', { locks, practice: true });
      return;
    }
    const levelParam = params.has('themelevel') || params.has('genrelevel') || params.has('twistlevel');
    if (!hasSeed && !Object.keys(locks).length && !lengthId && !levelParam) {
      this.scene.start('Hub');
      return;
    }

    const result = spin(content, hasSeed ? Number(seedParam) : randomSeed(), locks);
    result.levels = {};
    for (const reel of ['theme', 'genre', 'twist']) {
      const lv = Math.floor(Number(params.get(`${reel}level`)));
      if (lv >= 1) result.levels[reel] = Math.min(lv, 1 + content.economy.levels.length);
    }
    if (result.problem) console.warn(`[8-Bit Roulette] ${describeRun(content, result)} is blocked (${result.problem}), playing it anyway for testing.`);
    startRun(this, makeRun(content, getSave(), result, lengthId, { practice: true }));
  }
}
