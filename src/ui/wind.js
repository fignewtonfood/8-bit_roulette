// The Windy twist's clock and its HUD readout, shared by the platformer and
// the brawler. The wind starts blowing left (so moving right is the hard way)
// and swaps every mods.windEvery seconds; the readout blinks for the last
// second before a swap so it never catches you mid-run without warning.

import { pixelText } from './font.js';

const WARN = 1; // seconds of blinking before the wind swaps

export function addWind(scene, mods, color) {
  if (!mods.wind) return null;
  const text = pixelText(scene, scene.scale.width - 4, 14, '', { color }).setOrigin(1, 0).setScrollFactor(0).setDepth(10);
  const wind = { dir: -1, left: mods.windEvery };
  const draw = () => {
    const arrows = wind.dir < 0 ? '<<<' : '>>>';
    const blink = wind.left < WARN && Math.floor(wind.left * 6) % 2;
    text.setText(blink ? '' : wind.dir < 0 ? `${arrows} WIND` : `WIND ${arrows}`);
  };
  wind.update = (dt) => {
    wind.left -= dt;
    if (wind.left <= 0) {
      wind.dir = -wind.dir;
      wind.left += mods.windEvery;
    }
    draw();
  };
  draw();
  return wind;
}
