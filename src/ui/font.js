// A pixel font drawn in code, so every letter lands on whole pixels and stays
// sharp at any zoom. (Browser fonts at 8px get smoothed into grey mush.)
//
// Each glyph is 5x7 pixels in a 6x8 cell, capitals only, like an NES.
// Lowercase text is shown in capitals. Characters missing here show as "?".
// To add one: draw it as 7 rows of 5 characters ('#' = pixel on).

import Phaser from 'phaser';

export const FONT = 'pixel';
const CELL_W = 6;
const CELL_H = 8;
const LINE_GAP = 3; // extra pixels between lines

const GLYPHS = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .####',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# #...# ##..# #.#.# #..## #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  0: '.###. #...# #..## #.#.# ##..# #...# .###.',
  1: '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  2: '.###. #...# ....# ...#. ..#.. .#... #####',
  3: '##### ...#. ..#.. ...#. ....# #...# .###.',
  4: '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  5: '##### #.... ####. ....# ....# #...# .###.',
  6: '..##. .#... #.... ####. #...# #...# .###.',
  7: '##### ....# ...#. ..#.. .#... .#... .#...',
  8: '.###. #...# #...# .###. #...# #...# .###.',
  9: '.###. #...# #...# .#### ....# ...#. .##..',
  ' ': '..... ..... ..... ..... ..... ..... .....',
  '.': '..... ..... ..... ..... ..... .##.. .##..',
  ',': '..... ..... ..... ..... .##.. ..#.. .#...',
  ':': '..... .##.. .##.. ..... .##.. .##.. .....',
  ';': '..... .##.. .##.. ..... .##.. ..#.. .#...',
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  "'": '..#.. ..#.. .#... ..... ..... ..... .....',
  '"': '.#.#. .#.#. ..... ..... ..... ..... .....',
  '-': '..... ..... ..... .###. ..... ..... .....',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  '=': '..... ..... ##### ..... ##### ..... .....',
  '/': '....# ...#. ...#. ..#.. .#... .#... #....',
  '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
  ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
  '[': '.###. .#... .#... .#... .#... .#... .###.',
  ']': '.###. ...#. ...#. ...#. ...#. ...#. .###.',
  '<': '...#. ..#.. .#... #.... .#... ..#.. ...#.',
  '>': '.#... ..#.. ...#. ....# ...#. ..#.. .#...',
  '_': '..... ..... ..... ..... ..... ..... #####',
  '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.',
  $: '..#.. .#### #.#.. .###. ..#.# ####. ..#..',
  '%': '##..# ##..# ...#. ..#.. .#... #..## #..##',
  '*': '..... ..#.. #.#.# .###. #.#.# ..#.. .....',
  '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#',
  '@': '.###. #...# #.### #.#.# #.### #.... .###.',
  '^': '..#.. .#.#. #...# ..... ..... ..... .....',
  '|': '..#.. ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  '·': '..... ..... ..... ..#.. ..... ..... .....',
  '■': '..... ##### ##### ##### ##### ##### .....',
  '□': '..... ##### #...# #...# #...# ##### .....',
};
const CHARS = Object.keys(GLYPHS).join('');
const PER_ROW = 16;

// Draws the font into a texture and registers it. Call once, from BootScene.
export function makePixelFont(scene) {
  if (scene.cache.bitmapFont.exists(FONT)) return;
  const rows = Math.ceil(CHARS.length / PER_ROW);
  const canvas = scene.textures.createCanvas(FONT, PER_ROW * CELL_W, rows * CELL_H);
  const ctx = canvas.getContext();
  ctx.fillStyle = '#ffffff';
  [...CHARS].forEach((ch, i) => {
    const ox = (i % PER_ROW) * CELL_W;
    const oy = Math.floor(i / PER_ROW) * CELL_H;
    GLYPHS[ch].split(' ').forEach((row, y) => {
      [...row].forEach((px, x) => px === '#' && ctx.fillRect(ox + x, oy + y, 1, 1));
    });
  });
  canvas.refresh();
  scene.cache.bitmapFont.add(
    FONT,
    Phaser.GameObjects.RetroFont.Parse(scene, {
      image: FONT,
      width: CELL_W,
      height: CELL_H,
      chars: CHARS,
      charsPerRow: PER_ROW,
      lineSpacing: LINE_GAP,
    }),
  );
}

// Capitals only; anything the font can't draw becomes "?".
export const toFontText = (s) => [...String(s).toUpperCase()].map((ch) => (GLYPHS[ch] || ch === '\n' ? ch : '?')).join('');

// The one way to put text on screen.
//   size   1 = normal (8px tall), 2 = big titles
//   color  '#rrggbb'
//   align  'left' | 'center' | 'right' for multi-line text
// Returns a BitmapText with setText/setColor that work like the old Text ones.
export function pixelText(scene, x, y, text, { size = 1, color = '#ffffff', align = 'left' } = {}) {
  const t = scene.add.bitmapText(x, y, FONT, toFontText(text), CELL_W * size) // the font's native size is its cell width;
  const setText = t.setText.bind(t);
  t.setText = (s) => setText(toFontText(s));
  t.setColor = (c) => t.setTint(Phaser.Display.Color.HexStringToColor(c).color);
  t.setColor(color);
  if (align === 'center') t.setCenterAlign();
  else if (align === 'right') t.setRightAlign();
  return t;
}
