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

// Power-up rules shared by the three genres:
// - one enemy in the first half of the stage carries it (a sparkle bobs over
//   it); beating that enemy drops it
// - from stage FLEE_FROM_STAGE on, the dropped power-up runs from you
// - taking damage keeps it, losing a life loses it
// - while you hold it, your sprite shows it ('<base>-<power>' textures)
export const FLEE_FROM_STAGE = 4;
export const FLEE_RANGE = 72;   // px: it starts running when you're this close

// The sparkle that follows the carrier. Call update() every frame.
export function addSparkle(scene, key) {
  const s = scene.add.image(0, 0, key).setDepth(9).setVisible(false); // above the dark (GLOW_DEPTH)
  let target = null;
  return {
    follow(obj) {
      target = obj;
    },
    update(time) {
      const on = !!target?.active && target.state !== 'dead' && target.visible !== false;
      s.setVisible(on && Math.floor(time / 150) % 2 === 0);
      if (on) s.setPosition(target.x, target.y - target.displayHeight / 2 - 5 + Math.sin(time / 120) * 1.5);
    },
    stop() {
      target = null;
      s.setVisible(false);
    },
  };
}

// Run away from (fromX, fromY) along the floor: returns the x speed, 0 at a
// ledge or spikes or when you're far off. edgeAhead(dir) says if it can't go
// that way.
export function fleeSpeed(item, fromX, speed, edgeAhead) {
  const dx = item.x - fromX;
  if (Math.abs(dx) > FLEE_RANGE) return 0;
  const dir = Math.sign(dx) || 1;
  return edgeAhead(dir) ? 0 : dir * speed;
}
