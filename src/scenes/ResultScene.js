import Phaser from 'phaser';
import { content } from '../data/index.js';
import { describeRun } from '../engine/spin.js';
import { startRun } from '../engine/startRun.js';
import { randomSeed } from '../gen/rng.js';

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(d) {
    const cx = this.scale.width / 2;
    const run = d.run;
    const theme = content.themes[run.theme];
    const p = theme.palette;
    this.cameras.main.setBackgroundColor(p.sky);

    this.add
      .text(cx, 40, d.cleared ? 'STAGE CLEAR' : 'GAME OVER', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: d.cleared ? p.flag : p.enemy,
      })
      .setOrigin(0.5);

    const lines = [
      describeRun(content, run),
      '',
      `${theme.names.hudCoin.padEnd(7)} ${d.coins}/${d.totalCoins}`,
      `TIME    ${d.seconds}s`,
      `SEED    ${run.seed}`,
      '',
      'SPACE  back to the machine',
      'R      replay this run',
      'N      same reels, new seed',
    ];
    this.add
      .text(cx, 68, lines.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: p.text,
        align: 'center',
        lineSpacing: 4,
      })
      .setOrigin(0.5, 0);

    // Wait a moment and ignore held keys, so the fire button you were holding
    // in the shmup doesn't skip this screen.
    const kb = this.input.keyboard;
    const on = (key, fn) => kb.on(`keydown-${key}`, (e) => !e.repeat && this.time.now > this.ready && fn());
    this.ready = this.time.now + 400;
    on('SPACE', () => this.scene.start('Spin', {}));
    on('R', () => startRun(this, run));
    on('N', () => startRun(this, { ...run, seed: randomSeed() }));
  }
}
