import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import HubScene from './scenes/HubScene.js';
import ShopScene from './scenes/ShopScene.js';
import SpinScene from './scenes/SpinScene.js';
import StageScene from './scenes/StageScene.js';
import ShmupScene from './scenes/ShmupScene.js';
import ResultScene from './scenes/ResultScene.js';

const params = new URLSearchParams(window.location.search);

const WIDTH = 256;  // NES-ish resolution: 16 x 14 tiles of 16px
const HEIGHT = 224;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  pixelArt: true,           // no smoothing when sprites are scaled
  backgroundColor: '#000000',
  // We pick the zoom ourselves (below) instead of letting Phaser stretch to fit.
  scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 800 }, debug: params.has('debug') }, // ?debug shows hitboxes
  },
  scene: [BootScene, HubScene, ShopScene, SpinScene, StageScene, ShmupScene, ResultScene],
});

// Pixel-perfect scaling: every game pixel becomes a whole number of screen
// pixels (2x2, 3x3, 4x4...), as big as fits the window. Stretching to an
// in-between size like 3.7x makes some pixels wider than others, which looks
// smeared. This also accounts for Windows display scaling (125%, 150%), where
// one CSS pixel isn't one screen pixel.
// ?zoom=3 forces a size (in screen pixels per game pixel).
function fitZoom() {
  const dpr = window.devicePixelRatio || 1;
  const forced = Number(params.get('zoom'));
  const best = Math.floor(Math.min((window.innerWidth * dpr) / WIDTH, (window.innerHeight * dpr) / HEIGHT));
  const screenPixels = forced > 0 ? Math.floor(forced) : Math.max(1, best);
  game.scale.setZoom(screenPixels / dpr);
}
game.events.once('ready', fitZoom);
window.addEventListener('resize', fitZoom);

