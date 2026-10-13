// Placeholder sprites for what genre levels add: the level 2 enemies, the
// power-ups and the level 3 bosses, for all three genres. Drawn from the
// theme palette like the rest (see placeholder.js). Enemies and bosses face
// right; the scenes flip them.

import Phaser from 'phaser';
import { tex } from './placeholder.js';

const toColor = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;

export function makeLevelTextures(scene, theme) {
  if (scene.textures.exists(tex(theme, 'hopper'))) return;
  const p = theme.palette;
  const g = scene.add.graphics();
  const eyes = (color, ...xy) => {
    g.fillStyle(toColor(color));
    for (let i = 0; i < xy.length; i += 2) g.fillRect(xy[i], xy[i + 1], 2, 2);
  };

  // ---- Power-ups (10x10): a capsule in the coin colour with a mark on it
  const capsule = (name, mark) => {
    g.fillStyle(toColor(p.text)).fillRoundedRect(0, 0, 10, 10, 3);
    g.fillStyle(toColor(p.coin)).fillRoundedRect(1, 1, 8, 8, 2);
    g.fillStyle(toColor(p.sky));
    mark();
    g.generateTexture(tex(theme, name), 10, 10).clear();
  };
  // Double jump: two chevrons pointing up
  capsule('power-double-jump', () => g.fillRect(4, 2, 2, 1).fillRect(3, 3, 4, 1).fillRect(4, 5, 2, 1).fillRect(3, 6, 4, 1));
  // Spread shot: three dots fanning out
  capsule('power-spread-shot', () => g.fillRect(2, 2, 2, 2).fillRect(4, 3, 2, 2).fillRect(6, 2, 2, 2).fillRect(4, 6, 2, 2));
  // Power fists: a fist
  capsule('power-power-fists', () => g.fillRect(2, 3, 6, 4).fillRect(7, 4, 1, 3));

  // ---- Powered-up player looks: the normal sprite plus the power-up's colour
  // (the coin colour), so you can tell at a glance. Same size as the normal
  // sprite, so hitboxes don't change. Keys: 'player-<power>' / 'ship-<power>'.
  // Double jump (12x14): glowing boots and a band
  g.fillStyle(toColor(p.player)).fillRect(1, 0, 10, 14);
  g.fillStyle(toColor(p.sky)).fillRect(6, 3, 2, 3).fillRect(9, 3, 2, 3);
  g.fillStyle(toColor(p.coin)).fillRect(0, 11, 12, 3).fillRect(1, 7, 10, 1);
  g.generateTexture(tex(theme, 'player-double-jump'), 12, 14).clear();
  // Power fists (12x14): big glowing fists out front and back
  g.fillStyle(toColor(p.player)).fillRect(1, 0, 10, 14);
  g.fillStyle(toColor(p.sky)).fillRect(6, 3, 2, 3).fillRect(9, 3, 2, 3);
  g.fillStyle(toColor(p.coin)).fillRect(8, 7, 4, 4).fillRect(0, 7, 3, 4).fillRect(1, 1, 10, 1);
  g.generateTexture(tex(theme, 'player-power-fists'), 12, 14).clear();
  // Spread shot (12x12): the ship with glowing side guns
  g.fillStyle(toColor(p.player)).fillTriangle(6, 0, 0, 12, 12, 12);
  g.fillStyle(toColor(p.sky)).fillRect(5, 6, 2, 3);
  g.fillStyle(toColor(p.coin)).fillRect(0, 7, 2, 5).fillRect(10, 7, 2, 5).fillRect(5, 0, 2, 2);
  g.generateTexture(tex(theme, 'ship-spread-shot'), 12, 12).clear();

  // ---- Brawler: jumper (12x13), a crouched body on a spring (stages 4-5)
  g.fillStyle(toColor(p.enemy)).fillRect(1, 1, 10, 8);
  g.fillStyle(toColor(p.groundTop)).fillRect(3, 9, 6, 1).fillRect(4, 10, 4, 1).fillRect(3, 11, 6, 1).fillRect(2, 12, 8, 1);
  eyes(p.text, 6, 3, 9, 3);
  g.generateTexture(tex(theme, 'jumper'), 12, 13).clear();

  // A sparkle over the enemy carrying the power-up (4x4)
  g.fillStyle(toColor(p.coin)).fillRect(1, 0, 2, 4).fillRect(0, 1, 4, 2);
  g.generateTexture(tex(theme, 'sparkle'), 4, 4).clear();

  // ---- Platformer: hopper (12x12), a frog-ish blob with legs
  g.fillStyle(toColor(p.enemy)).fillRect(1, 2, 10, 7);
  g.fillRect(0, 9, 3, 3).fillRect(9, 9, 3, 3);
  eyes(p.text, 3, 3, 8, 3);
  g.generateTexture(tex(theme, 'hopper'), 12, 12).clear();

  // ---- Platformer boss (26x24): a big blob with a flat, rounded top (no
  // points or spikes up there: you're meant to stomp on its head). A flat
  // gold band marks it as the boss.
  g.fillStyle(toColor(p.enemy)).fillRoundedRect(1, 2, 24, 22, 5);
  g.fillStyle(toColor(p.coin)).fillRect(3, 6, 20, 3);
  g.fillStyle(toColor(p.sky)).fillRect(8, 7, 2, 1).fillRect(16, 7, 2, 1);
  g.fillStyle(toColor(p.groundDark)).fillRect(1, 19, 24, 2);
  eyes(p.text, 14, 10, 20, 10);
  g.generateTexture(tex(theme, 'pboss'), 26, 24).clear();

  // ---- Shmup: splitter (14x14), a diamond that breaks in two, and its halves (8x8)
  g.fillStyle(toColor(p.enemy)).fillTriangle(7, 0, 0, 7, 14, 7).fillTriangle(0, 7, 14, 7, 7, 14);
  g.fillStyle(toColor(p.sky)).fillRect(6, 1, 2, 12);
  g.generateTexture(tex(theme, 'splitter'), 14, 14).clear();
  g.fillStyle(toColor(p.enemy)).fillTriangle(4, 0, 0, 4, 8, 4).fillTriangle(0, 4, 8, 4, 4, 8);
  g.generateTexture(tex(theme, 'shard'), 8, 8).clear();

  // ---- Shmup boss (48x22): a wide mothership with three guns
  g.fillStyle(toColor(p.groundTop)).fillRect(4, 4, 40, 12);
  g.fillTriangle(0, 4, 4, 4, 4, 14).fillTriangle(48, 4, 44, 4, 44, 14);
  g.fillStyle(toColor(p.enemy)).fillRect(10, 0, 28, 6);
  g.fillRect(8, 16, 4, 6).fillRect(22, 16, 4, 6).fillRect(36, 16, 4, 6);
  eyes(p.sky, 18, 8, 28, 8);
  g.generateTexture(tex(theme, 'sboss'), 48, 22).clear();

  // ---- Brawler: shield guard (14x14), a grunt holding a tall shield out front
  g.fillStyle(toColor(p.enemy)).fillRect(1, 2, 9, 12);
  g.fillStyle(toColor(p.groundTop)).fillRect(10, 1, 4, 13);
  g.fillStyle(toColor(p.groundDark)).fillRect(11, 3, 2, 9);
  eyes(p.text, 5, 4, 8, 4);
  g.generateTexture(tex(theme, 'shield'), 14, 14).clear();

  // ---- Brawler boss (22x28): a huge brute with a crown and big fists
  g.fillStyle(toColor(p.enemy)).fillRect(2, 5, 16, 23);
  g.fillRect(17, 12, 5, 7);
  g.fillStyle(toColor(p.coin)).fillTriangle(3, 5, 6, 0, 9, 5).fillTriangle(9, 5, 12, 0, 15, 5);
  g.fillStyle(toColor(p.groundDark)).fillRect(2, 19, 16, 2);
  eyes(p.text, 10, 9, 14, 9);
  g.generateTexture(tex(theme, 'bboss'), 22, 28).clear();

  // Brawler boss shockwave (12x8): slides along the floor; jump over it
  g.fillStyle(toColor(p.coin)).fillTriangle(0, 8, 6, 0, 12, 8);
  g.fillStyle(toColor(p.text)).fillTriangle(3, 8, 6, 3, 9, 8);
  g.generateTexture(tex(theme, 'shock'), 12, 8);

  g.destroy();
}
