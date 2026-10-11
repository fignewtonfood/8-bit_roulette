import Phaser from 'phaser';
import theme from '../data/themes/haunted-castle.json';
import { randomSeed } from '../gen/rng.js';

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(d) {
    const cx = this.scale.width / 2;
    const p = theme.palette;
    const sceneKey = d.sceneKey || 'Stage';                   // which genre we just played
    const otherKey = sceneKey === 'Stage' ? 'Shmup' : 'Stage';
    this.cameras.main.setBackgroundColor(p.sky);

    this.add
      .text(cx, 48, d.cleared ? 'STAGE CLEAR' : 'GAME OVER', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: d.cleared ? p.flag : p.enemy,
      })
      .setOrigin(0.5);

    const lines = [
      `SHARDS  ${d.coins}/${d.totalCoins}`,
      `TIME    ${d.seconds}s`,
      `SEED    ${d.seed}`,
      '',
      'R  replay this seed',
      'N  new seed',
      `G  switch to ${otherKey === 'Shmup' ? "shoot-'em-up" : 'platformer'}`,
    ];
    this.add
      .text(cx, 84, lines.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: p.text,
        align: 'center',
        lineSpacing: 4,
      })
      .setOrigin(0.5, 0);

    this.input.keyboard.once('keydown-R', () => this.scene.start(sceneKey, { seed: d.seed }));
    this.input.keyboard.once('keydown-N', () => this.scene.start(sceneKey, { seed: randomSeed() }));
    this.input.keyboard.once('keydown-G', () => this.scene.start(otherKey, { seed: randomSeed() }));
  }
}
