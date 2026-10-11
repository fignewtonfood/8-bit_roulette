import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import StageScene from './scenes/StageScene.js';
import ResultScene from './scenes/ResultScene.js';

const params = new URLSearchParams(window.location.search);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 256,               // NES-ish resolution: 16 x 14 tiles of 16px
  height: 224,
  pixelArt: true,           // no blurry scaling
  backgroundColor: '#000000',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 800 }, debug: params.has('debug') }, // ?debug shows hitboxes
  },
  scene: [BootScene, StageScene, ResultScene],
});
