// Extra placeholder sprites for racing, drawn from the theme palette.
// Reuses 'spike', 'coin' and 'sparkle' from placeholder.js and
// levelPlaceholder.js. Bikes face right (races always go right).

import Phaser from 'phaser';
import { tex } from './placeholder.js';

const toColor = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;

// A bike and rider (20x14), wheels at the bottom. body: the rider's colour.
export function drawBike(g, p, body, { wheel = p.groundDark, trim = null, flame = null } = {}) {
  // wheels
  g.fillStyle(toColor(wheel)).fillCircle(4, 10, 4).fillCircle(16, 10, 4);
  g.fillStyle(toColor(p.text)).fillRect(3, 9, 2, 2).fillRect(15, 9, 2, 2);
  // frame and seat
  g.fillStyle(toColor(body)).fillRect(4, 7, 12, 2).fillRect(6, 6, 5, 1);
  // rider: body, head, arm to the bars
  g.fillRect(7, 1, 4, 6).fillRect(11, 3, 4, 2).fillRect(14, 4, 2, 3);
  g.fillStyle(toColor(p.sky)).fillRect(10, 2, 1, 1); // eye, facing right
  if (trim) g.fillStyle(toColor(trim)).fillRect(4, 7, 12, 1).fillRect(7, 1, 4, 1);
  if (flame) g.fillStyle(toColor(flame)).fillTriangle(0, 6, 4, 7, 0, 9);
}

export function makeRaceTextures(scene, theme) {
  if (scene.textures.exists(tex(theme, 'rtiles'))) return;
  const p = theme.palette;
  const g = scene.add.graphics();

  // Track tiles (64x16): 0 buried ground, 1 ground with a top edge,
  // 2 ramp up, 3 ramp down. The ramps are drawn a pixel column at a time so
  // the slope stays sharp.
  for (let i = 0; i < 2; i++) {
    const ox = i * 16;
    g.fillStyle(toColor(p.ground)).fillRect(ox, 0, 16, 16);
    g.fillStyle(toColor(p.groundDark)).fillRect(ox, 7, 16, 1).fillRect(ox + 7, 0, 1, 7).fillRect(ox + 3, 8, 1, 8).fillRect(ox + 11, 8, 1, 8);
  }
  g.fillStyle(toColor(p.groundTop)).fillRect(16, 0, 16, 3);
  for (let u = 0; u < 16; u++) {
    const up = 15 - u; // the slope's height in column u of the up-ramp
    g.fillStyle(toColor(p.ground)).fillRect(32 + u, up, 1, 16 - up).fillRect(48 + u, u, 1, 16 - u);
    g.fillStyle(toColor(p.groundTop)).fillRect(32 + u, up, 1, 3).fillRect(48 + u, u, 1, 3);
  }
  g.fillStyle(toColor(p.groundDark)).fillRect(40, 12, 8, 1).fillRect(48, 12, 7, 1);
  g.generateTexture(tex(theme, 'rtiles'), 64, 16).clear();

  // The player's bike (20x14), and a rival's in the enemy colour
  drawBike(g, p, p.player);
  g.generateTexture(tex(theme, 'bike'), 20, 14).clear();
  drawBike(g, p, p.enemy, { trim: p.groundTop });
  g.generateTexture(tex(theme, 'rival'), 20, 14).clear();

  // Mud (16x6): lumpy, sits on the ground
  g.fillStyle(toColor(p.groundDark)).fillRect(0, 2, 16, 4).fillRect(2, 1, 4, 1).fillRect(9, 0, 4, 2);
  g.fillStyle(toColor(p.ground)).fillRect(4, 3, 2, 1).fillRect(11, 3, 2, 1);
  g.generateTexture(tex(theme, 'mud'), 16, 6).clear();

  // Boost pad (16x5): arrows pointing the way
  g.fillStyle(toColor(p.groundDark)).fillRect(0, 3, 16, 2);
  g.fillStyle(toColor(p.coin)).fillTriangle(1, 0, 6, 2, 1, 4).fillTriangle(8, 0, 13, 2, 8, 4);
  g.generateTexture(tex(theme, 'boost'), 16, 5).clear();

  // Finish flag (16x32): a chequered flag on a pole
  g.fillStyle(toColor(p.text)).fillRect(1, 0, 2, 32);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle(toColor((x + y) % 2 ? p.flag : p.sky)).fillRect(3 + x * 3, 2 + y * 3, 3, 3);
  }
  g.fillStyle(toColor(p.text)).fillRect(3, 1, 12, 1).fillRect(3, 11, 12, 1);
  g.generateTexture(tex(theme, 'finish'), 16, 32).clear();

  // Kick (12x8): the swing of a foot, shown on both sides of the bike
  g.fillStyle(toColor(p.text)).fillRect(2, 0, 6, 1).fillRect(7, 1, 3, 1).fillRect(9, 2, 3, 4).fillRect(7, 6, 3, 1).fillRect(2, 7, 6, 1);
  g.generateTexture(tex(theme, 'kick'), 12, 8).clear();

  // Cone (10x10): what the champion drops behind it; jump over it
  g.fillStyle(toColor(p.coin)).fillTriangle(5, 0, 0, 9, 10, 9);
  g.fillStyle(toColor(p.text)).fillRect(2, 5, 6, 2);
  g.fillStyle(toColor(p.groundDark)).fillRect(0, 9, 10, 1);
  g.generateTexture(tex(theme, 'cone'), 10, 10).clear();

  // Dust (4x4): kicked up by a landing
  g.fillStyle(toColor(p.groundTop)).fillRect(1, 0, 2, 4).fillRect(0, 1, 4, 2);
  g.generateTexture(tex(theme, 'dust'), 4, 4);

  g.destroy();
}
