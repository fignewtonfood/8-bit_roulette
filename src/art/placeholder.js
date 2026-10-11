// Placeholder art drawn in code from the theme's palette, so there are no image
// files yet. Every theme gets its own copy of each texture, named
// "<theme id>/<name>" (e.g. "neon-space/player"), so switching themes between
// runs is instant. Real pixel art can replace these later by loading images
// with the same keys.

import Phaser from 'phaser';

const toColor = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;

// The texture key for one sprite in one theme.
export const tex = (theme, name) => `${theme.id}/${name}`;

// Draws the theme's platformer sprites the first time they're needed.
export function makePlaceholderTextures(scene, theme) {
  if (scene.textures.exists(tex(theme, 'tiles'))) return;
  const p = theme.palette;
  const g = scene.add.graphics();

  // Tileset (32x16): frame 0 = buried stone, frame 1 = stone with a top edge
  for (let i = 0; i < 2; i++) {
    const ox = i * 16;
    g.fillStyle(toColor(p.ground)).fillRect(ox, 0, 16, 16);
    g.fillStyle(toColor(p.groundDark));
    g.fillRect(ox, 7, 16, 1);         // mortar line
    g.fillRect(ox + 7, 0, 1, 7);      // brick joints
    g.fillRect(ox + 3, 8, 1, 8);
    g.fillRect(ox + 11, 8, 1, 8);
  }
  g.fillStyle(toColor(p.groundTop)).fillRect(16, 0, 16, 3);
  g.generateTexture(tex(theme, 'tiles'), 32, 16).clear();

  // Player (12x14), eyes face right
  g.fillStyle(toColor(p.player)).fillRect(1, 0, 10, 14);
  g.fillStyle(toColor(p.sky)).fillRect(6, 3, 2, 3).fillRect(9, 3, 2, 3);
  g.generateTexture(tex(theme, 'player'), 12, 14).clear();

  // Enemy (14x10), a bat-ish blob
  g.fillStyle(toColor(p.enemy));
  g.fillRect(3, 2, 8, 7);
  g.fillTriangle(0, 0, 4, 3, 3, 7);
  g.fillTriangle(14, 0, 10, 3, 11, 7);
  g.fillStyle(toColor(p.text)).fillRect(4, 4, 2, 2).fillRect(8, 4, 2, 2);
  g.generateTexture(tex(theme, 'enemy'), 14, 10).clear();

  // Spikes (16x8)
  g.fillStyle(toColor(p.spike));
  g.fillTriangle(0, 8, 4, 0, 8, 8);
  g.fillTriangle(8, 8, 12, 0, 16, 8);
  g.generateTexture(tex(theme, 'spike'), 16, 8).clear();

  // Coin / soul shard (8x8)
  g.fillStyle(toColor(p.coin)).fillCircle(4, 4, 4);
  g.fillStyle(toColor(p.sky)).fillRect(3, 2, 2, 4);
  g.generateTexture(tex(theme, 'coin'), 8, 8).clear();

  // Exit flag (16x32)
  g.fillStyle(toColor(p.text)).fillRect(1, 0, 2, 32);
  g.fillStyle(toColor(p.flag)).fillTriangle(3, 2, 15, 7, 3, 12);
  g.generateTexture(tex(theme, 'flag'), 16, 32);

  g.destroy();
}
