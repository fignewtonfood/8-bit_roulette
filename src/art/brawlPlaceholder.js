// Extra placeholder sprites for the brawler, drawn from the theme palette.
// Reuses 'tiles', 'player', 'spike', 'coin' and 'flag' from placeholder.js.
// Every enemy faces right; the scene flips them.

import Phaser from 'phaser';
import { tex } from './placeholder.js';

const toColor = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;

export function makeBrawlTextures(scene, theme) {
  if (scene.textures.exists(tex(theme, 'grunt'))) return;
  const p = theme.palette;
  const g = scene.add.graphics();
  const eyes = (...xy) => {
    g.fillStyle(toColor(p.text));
    for (let i = 0; i < xy.length; i += 2) g.fillRect(xy[i], xy[i + 1], 2, 2);
  };

  // Grunt (12x14): a squat body with a fist out front
  g.fillStyle(toColor(p.enemy)).fillRect(1, 2, 9, 12);
  g.fillRect(9, 7, 3, 3);
  eyes(5, 4, 8, 4);
  g.generateTexture(tex(theme, 'grunt'), 12, 14).clear();

  // Rusher (14x11): low and wide, horns forward
  g.fillStyle(toColor(p.enemy)).fillRect(0, 3, 12, 8);
  g.fillStyle(toColor(p.groundTop)).fillTriangle(10, 3, 14, 0, 12, 5);
  eyes(9, 5);
  g.generateTexture(tex(theme, 'rusher'), 14, 11).clear();

  // Thrower (10x14): tall and thin, arm raised
  g.fillStyle(toColor(p.enemy)).fillRect(2, 3, 6, 11);
  g.fillRect(7, 0, 2, 6);
  eyes(5, 5);
  g.generateTexture(tex(theme, 'thrower'), 10, 14).clear();

  // Brute (16x18): big, with a dark belt
  g.fillStyle(toColor(p.enemy)).fillRect(1, 1, 14, 17);
  g.fillStyle(toColor(p.groundDark)).fillRect(1, 11, 14, 2);
  g.fillStyle(toColor(p.enemy)).fillRect(13, 6, 3, 5);
  eyes(8, 4, 11, 4);
  g.generateTexture(tex(theme, 'brute'), 16, 18).clear();

  // Thrown rock (6x6)
  g.fillStyle(toColor(p.groundTop)).fillCircle(3, 3, 3);
  g.fillStyle(toColor(p.groundDark)).fillRect(2, 2, 1, 1);
  g.generateTexture(tex(theme, 'rock'), 6, 6).clear();

  // The player's swing (12x8): a crescent shown where the punch lands
  g.fillStyle(toColor(p.text)).fillRect(2, 0, 6, 1).fillRect(7, 1, 3, 1).fillRect(9, 2, 3, 4).fillRect(7, 6, 3, 1).fillRect(2, 7, 6, 1);
  g.generateTexture(tex(theme, 'swing'), 12, 8);

  g.destroy();
}
