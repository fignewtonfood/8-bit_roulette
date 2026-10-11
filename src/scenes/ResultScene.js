import Phaser from 'phaser';
import { content } from '../data/index.js';
import { describeRun } from '../engine/spin.js';
import { startRun } from '../engine/startRun.js';
import { makeRun } from '../engine/run.js';
import { getSave } from '../engine/profile.js';
import { randomSeed } from '../gen/rng.js';
import { onPress } from '../ui/machine.js';

// Two kinds of screen, in the theme's colours:
//   between  a stage was cleared and the run goes on: SPACE starts the next stage
//   final    the run is over: shows the payout (already saved), SPACE goes to the hub
// Practice runs (from the URL) pay nothing and can be replayed with R / N.

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
    const text = (y, s, size, color, originY = 0.5) =>
      this.add
        .text(cx, y, s, { fontFamily: 'monospace', fontSize: `${size}px`, color, align: 'center', lineSpacing: 4 })
        .setOrigin(0.5, originY);

    const stageLine = `${theme.names.hudCoin} ${d.stage.coins}/${d.stage.totalCoins}   TIME ${d.stage.seconds}s`;

    if (d.mode === 'between') {
      text(36, `STAGE ${run.stage - 1} CLEAR`, 16, p.flag);
      text(70, [describeRun(content, run), '', stageLine, `LIVES ${run.lives}`].join('\n'), 8, p.text, 0);
      text(150, `NEXT: STAGE ${run.stage} OF ${run.stages}`, 8, p.coin);
      text(196, 'SPACE  NEXT STAGE', 8, p.text);
      // Wait a moment so the fire button held in the shmup doesn't skip this.
      onPress(this, ['SPACE', 'Z', 'ENTER'], () => startRun(this, run), 400);
      return;
    }

    // Final screen
    const pay = d.pay;
    text(30, pay.won ? (run.stages > 1 ? 'RUN COMPLETE' : 'STAGE CLEAR') : 'GAME OVER', 16, pay.won ? p.flag : p.enemy);

    const width = 28;
    const row = (label, n) => `${label.padEnd(width - String(n).length - 1)} ${n}`;
    const lines = [
      describeRun(content, run),
      `${run.length.toUpperCase()} · ${run.cleared}/${run.stages} STAGE${run.stages === 1 ? '' : 'S'} CLEARED`,
      '',
      ...pay.lines.map(([label, n]) => row(label, n)),
      '-'.repeat(width),
    ];
    if (pay.practice) {
      lines.push('PRACTICE RUN · NO TOKENS');
    } else {
      lines.push(row('TOKENS WON', `+${pay.total}`), row('TOKENS', `${d.tokensBefore} > ${getSave().tokens}`));
    }
    text(52, lines.join('\n'), 8, p.text, 0);

    if (pay.practice) {
      text(190, 'SPACE hub   R replay   N new seed', 8, p.text);
      const again = (seed) => startRun(this, makeRun(content, getSave(), { ...run, seed }, run.length, { practice: true }));
      onPress(this, ['R'], () => again(run.seed), 400);
      onPress(this, ['N'], () => again(randomSeed()), 400);
    } else {
      text(196, 'SPACE  BACK TO THE HUB', 8, p.text);
    }
    onPress(this, ['SPACE', 'ENTER'], () => this.scene.start('Hub'), 400);
  }
}
