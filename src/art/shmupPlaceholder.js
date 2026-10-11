// Extra placeholder sprites for the shoot-'em-up, drawn from the theme palette.
// Reuses 'enemy' (bat) and 'coin' from placeholder.js.

import Phaser from 'phaser';
import { tex } from './placeholder.js';

const toColor = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;

export function makeShmupTextures(scene, theme) {
  if (scene.textures.exists(tex(theme, 'ship'))) return;
  const p = theme.palette;
  const g = scene.add.graphics();

  // Player ship (12x12), points up
  g.fillStyle(toColor(p.player)).fillTriangle(6, 0, 0, 12, 12, 12);
  g.fillStyle(toColor(p.sky)).fillRect(5, 6, 2, 3);
  g.generateTexture(tex(theme, 'ship'), 12, 12).clear();

  // Player shot (2x6)
  g.fillStyle(toColor(p.text)).fillRect(0, 0, 2, 6);
  g.generateTexture(tex(theme, 'shot'), 2, 6).clear();

  // Enemy shot (4x4)
  g.fillStyle(toColor(p.enemy)).fillCircle(2, 2, 2);
  g.generateTexture(tex(theme, 'eshot'), 4, 4).clear();

  // Ghost diver (12x12)
  g.fillStyle(toColor(p.text)).fillCircle(6, 5, 5).fillRect(1, 5, 10, 5);
  g.fillTriangle(1, 10, 3, 12, 5, 10).fillTriangle(5, 10, 7, 12, 9, 10).fillTriangle(9, 10, 11, 12, 11, 10);
  g.fillStyle(toColor(p.sky)).fillRect(3, 4, 2, 2).fillRect(7, 4, 2, 2);
  g.generateTexture(tex(theme, 'ghost'), 12, 12).clear();

  // Gargoyle turret (14x12)
  g.fillStyle(toColor(p.groundTop)).fillRect(2, 2, 10, 10);
  g.fillTriangle(0, 0, 4, 2, 2, 5).fillTriangle(14, 0, 10, 2, 12, 5);
  g.fillStyle(toColor(p.enemy)).fillRect(4, 5, 2, 2).fillRect(8, 5, 2, 2);
  g.generateTexture(tex(theme, 'gargoyle'), 14, 12);

  g.destroy();
}
