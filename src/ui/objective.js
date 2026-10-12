// Shared bits for the objective twists (Collector, Killer): the locked-exit
// look and the short message that says what's still left.
// The rules themselves live in each genre scene.

import { pixelText } from './font.js';

const HINT_TIME = 1500; // ms the message stays up

// A one-line message in the middle of the screen. show() replaces any
// message already up and restarts its timer.
export function addObjectiveHint(scene, color) {
  const text = pixelText(scene, scene.scale.width / 2, 60, '', { color, align: 'center' })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(10)
    .setVisible(false);
  let timer = null;
  return {
    show(message) {
      text.setText(message).setVisible(true);
      timer?.remove();
      timer = scene.time.delayedCall(HINT_TIME, () => text.setVisible(false));
    },
  };
}

// What's left, in words for the hint. theme names the coins.
export function leftMessage(objective, theme, left) {
  return objective === 'collect' ? `${theme.names.hudCoin} LEFT: ${left}` : `ENEMIES LEFT: ${left}`;
}

// The exit is see-through while it's locked.
export const LOCKED_ALPHA = 0.35;
