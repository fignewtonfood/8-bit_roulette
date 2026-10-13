// HUD bits for genre levels, shared by the three genre scenes: the boss's
// health bar and the power-up names.

import { pixelText } from './font.js';

// Shown when the power-up is picked up, and on the HUD while it's held.
export const POWER_NAMES = {
  'double-jump': 'DOUBLE JUMP',
  'spread-shot': 'SPREAD SHOT',
  'power-fists': 'POWER FISTS',
};

// The power-up you're holding, on the third HUD line (left), or nothing.
export function addPowerLabel(scene, color) {
  const text = pixelText(scene, 4, 24, '', { color }).setScrollFactor(0).setDepth(10);
  return { set: (power) => text.setText(power ? POWER_NAMES[power] : '') };
}

// "BOSS ■■■■□□" on the second HUD line, hidden until the fight starts.
export function addBossBar(scene, color) {
  const text = pixelText(scene, 4, 14, '', { color }).setScrollFactor(0).setDepth(10).setVisible(false);
  return {
    show(hp, maxHp) {
      const left = Math.max(0, hp);
      text.setText(`BOSS ${'■'.repeat(left)}${'□'.repeat(Math.max(0, maxHp - left))}`).setVisible(true);
    },
    hide() {
      text.setVisible(false);
    },
  };
}
