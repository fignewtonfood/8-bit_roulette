import Phaser from 'phaser';
import theme from '../data/themes/haunted-castle.json';
import { makePlaceholderTextures } from '../art/placeholder.js';
import { randomSeed } from '../gen/rng.js';

// Builds the textures, picks a seed, starts the stage.
// Add ?seed=12345 to the URL to replay a specific stage.
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    makePlaceholderTextures(this, theme);
    const param = new URLSearchParams(window.location.search).get('seed');
    const seed = param && !Number.isNaN(Number(param)) ? Number(param) : randomSeed();
    this.scene.start('Stage', { seed });
  }
}
