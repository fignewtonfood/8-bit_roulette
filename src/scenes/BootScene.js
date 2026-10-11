import Phaser from 'phaser';
import theme from '../data/themes/haunted-castle.json';
import { makePlaceholderTextures } from '../art/placeholder.js';
import { randomSeed } from '../gen/rng.js';

// Builds the textures, picks a seed and a genre, starts the stage.
//   ?seed=12345     replay a specific stage
//   ?genre=shmup    start in the shoot-'em-up instead of the platformer
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    makePlaceholderTextures(this, theme);
    const params = new URLSearchParams(window.location.search);
    const param = params.get('seed');
    const seed = param && !Number.isNaN(Number(param)) ? Number(param) : randomSeed();
    const sceneKey = params.get('genre') === 'shmup' ? 'Shmup' : 'Stage';
    this.scene.start(sceneKey, { seed });
  }
}
