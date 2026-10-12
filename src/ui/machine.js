// The machine's own look, shared by the hub, the slot machine and the shop.
// Themes only apply once you're inside a game.

import Phaser from 'phaser';
import { pixelText } from './font.js';

export const C = {
  bg: '#0e0b16',
  wall: '#1a1426',
  wallDark: '#130e1c',
  cabinet: '#6e1f2e',
  cabinetDark: '#3c0f19',
  gold: '#f2c14e',
  window: '#f4ead2',
  ink: '#1b1424',
  faint: '#9a8f86',
  warn: '#d8402e',
  text: '#e8e2f0',
  screen: '#0f2a1c',
  screenText: '#5fe08a',
};

export const hex = (c) => Phaser.Display.Color.HexStringToColor(c).color;

// Text in the pixel font, centred vertically on y. size 8 = normal, 16 = big.
export function label(scene, x, y, s, size = 8, color = C.text, originX = 0.5) {
  const align = originX === 0.5 ? 'center' : originX === 1 ? 'right' : 'left';
  return pixelText(scene, x, y, s, { size: size / 8, color, align }).setOrigin(originX, 0.5);
}

// Keyboard helper: fires once per press (held keys and the key still held
// from the previous screen are ignored).
export function onPress(scene, keys, fn, delayMs = 250) {
  const ready = scene.time.now + delayMs;
  for (const key of keys) {
    scene.input.keyboard.on(`keydown-${key}`, (e) => {
      if (!e.repeat && scene.time.now > ready) fn(e);
    });
  }
}

// A pretend theme, so the hub can borrow the platformer's placeholder sprites.
export const HUB_THEME = {
  id: 'hub',
  name: 'Hub',
  palette: {
    sky: C.bg,
    ground: '#3a2a44',
    groundDark: '#241a2c',
    groundTop: C.gold,
    player: C.text,
    enemy: C.warn,
    spike: C.warn,
    coin: C.gold,
    flag: C.gold,
    text: C.text,
  },
  names: { enemy: 'bat', coin: 'token', hudCoin: 'TOKENS' },
};
