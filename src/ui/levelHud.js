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
//   it); beating that enemy drops it, always onto the nearest safe floor
//   (src/engine/powerDrop.js), even if the enemy went down mid-air, on
//   spikes or in a pit
// - from stage FLEE_FROM_STAGE on, the dropped power-up runs once you get
//   close: away from the nearest pit, then bouncing off walls, spikes and
//   enemies, and it can fall into a pit (see stepRunner below)
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

// A dropped power-up on the floor (platformer, brawler). Before stage 4 it
// sits still. From stage 4, once you come within FLEE_RANGE it starts
// running: first away from the nearest pit (awayFromPit in powerDrop.js), or
// away from you if there's no pit either way. After that it keeps going,
// turns around at walls, spikes and enemies, and can fall into a pit.
//   d          the power-up sprite (arcade body, collides with the ground)
//   startDir   () => -1 | 0 | 1: away from the nearest pit, or 0
//   spikeAhead (dir) => true if spikes are just ahead
export function stepRunner(d, { stage, playerX, speed, startDir, spikeAhead }) {
  const b = d.body;
  d.bounceCool = (d.bounceCool || 0) - (d.scene?.game.loop.delta || 16) / 1000;
  if (!d.running) {
    if (b.blocked.down) d.setVelocityX(0);
    if (stage < FLEE_FROM_STAGE || !b.blocked.down || Math.abs(d.x - playerX) > FLEE_RANGE) return;
    d.running = true;
    d.dir = startDir() || Math.sign(d.x - playerX) || 1;
  }
  if ((d.dir > 0 && b.blocked.right) || (d.dir < 0 && b.blocked.left) || (b.blocked.down && spikeAhead(d.dir))) bounce(d);
  d.setVelocityX(d.dir * speed);
}

// Turn the running power-up around (walls, spikes, enemies). A short
// cooldown stops it flip-flopping while it's still touching what it hit.
export function bounce(d, awayFromX = null) {
  if (!d.running || d.bounceCool > 0) return;
  d.dir = awayFromX === null ? -d.dir : Math.sign(d.x - awayFromX) || -d.dir;
  d.bounceCool = 0.25;
}
