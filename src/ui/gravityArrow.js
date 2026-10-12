// The Gravity twist (shmup): which way the ship is being pulled, shown as an
// arrow in the top-right corner. At level 1 the pull never moves; at levels 2
// and 3 it swaps to a new direction every mods.shiftEvery seconds, and the
// arrow blinks for the last second before a swap. The strength never changes.
// Directions come from the run's seed, so a replayed seed swaps the same way.

import Phaser from 'phaser';
import { GRAVITY_DIRS } from '../engine/speed.js';
import { makeRng } from '../gen/rng.js';

const WARN = 1; // seconds of blinking before a swap
const ANGLE = { down: 90, left: 180, up: 270, right: 0 }; // the arrow is drawn pointing right

export function addGravity(scene, mods, color, seed) {
  if (!mods.pull) return null;
  if (!scene.textures.exists('gravity-arrow')) {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff).fillRect(0, 5, 9, 4).fillTriangle(8, 0, 15, 7, 8, 14);
    g.generateTexture('gravity-arrow', 16, 14);
    g.destroy();
  }
  const rng = makeRng(seed * 13 + 4242);
  const arrow = scene.add.image(scene.scale.width - 14, 22, 'gravity-arrow')
    .setTint(Phaser.Display.Color.HexStringToColor(color).color)
    .setScrollFactor(0)
    .setDepth(10);
  const grav = { name: 'down', left: mods.shiftEvery || Infinity };
  const point = () => arrow.setAngle(ANGLE[grav.name]);

  grav.vector = () => GRAVITY_DIRS[grav.name].map((n) => n * mods.pull);
  grav.update = (dt) => {
    grav.left -= dt;
    if (grav.left <= 0) {
      const others = Object.keys(GRAVITY_DIRS).filter((d) => d !== grav.name);
      grav.name = others[Math.floor(rng.next() * others.length)];
      grav.left += mods.shiftEvery;
      point();
    }
    arrow.setVisible(!(grav.left < WARN && Math.floor(grav.left * 6) % 2));
  };
  point();
  return grav;
}
