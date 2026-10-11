// Glue between the rules in run.js and the Phaser scenes:
// starts the right genre scene for a stage, and decides what happens when a
// stage ends (next stage, or payout and back to the hub).

import { content } from '../data/index.js';
import { afterStage, payout, bank } from './run.js';
import { getSave, setSave } from './profile.js';

export function startRun(scene, run) {
  scene.scene.start(content.genres[run.genre].scene, { run });
}

// Every genre scene calls this when its stage is over.
// stageResult = { cleared, coins, totalCoins, seconds, livesLeft }
export function endStage(scene, run, stageResult) {
  const { run: next, done } = afterStage(run, stageResult);

  if (!done) {
    scene.scene.start('Result', { mode: 'between', run: next, stage: stageResult });
    return;
  }

  // Bank the payout right away, so it's saved even if the next screen is skipped.
  const save = getSave();
  const pay = payout(content, save, next);
  const before = save.tokens;
  setSave(bank(save, next, pay));
  scene.scene.start('Result', { mode: 'final', run: next, stage: stageResult, pay, tokensBefore: before });
}
