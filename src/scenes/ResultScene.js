import Phaser from 'phaser';
import { content } from '../data/index.js';
import { runTitle } from '../engine/spin.js';
import { startRun } from '../engine/startRun.js';
import { makeRun, runTheme } from '../engine/run.js';
import { shortName } from '../engine/progress.js';
import { getSave } from '../engine/profile.js';
import { randomSeed } from '../gen/rng.js';
import { onPress } from '../ui/machine.js';
import { pixelText } from '../ui/font.js';

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
    const theme = runTheme(content, run); // a level 3 theme is its variant
    const p = theme.palette;
    this.cameras.main.setBackgroundColor(p.sky);
    const text = (y, s, size, color, originY = 0.5) =>
      pixelText(this, cx, y, s, { size: size / 8, color, align: 'center' }).setOrigin(0.5, originY);

    const stageLine = `${theme.names.hudCoin} ${d.stage.coins}/${d.stage.totalCoins}   TIME ${Math.floor(d.stage.seconds / 60)}:${String(d.stage.seconds % 60).padStart(2, '0')}`;

    if (d.mode === 'between') {
      text(36, `STAGE ${run.stage - 1} CLEAR`, 16, p.flag);
      text(70, [runTitle(content, run), '', stageLine, `LIVES ${run.lives}`].join('\n'), 8, p.text, 0);
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
      runTitle(content, run),
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
      // News: level-ups first, then new logs, one blinking line each.
      const news = [];
      const ups = d.levelUps || [];
      if (ups.length === 1) news.push(`${shortName(content, ups[0].reel, ups[0].id)} REACHED LEVEL ${ups[0].level}`);
      else if (ups.length > 1) news.push(`${ups.length} LEVEL-UPS · SEE THE TERMINAL`);
      if (d.newLogs) news.push(d.newLogs === 1 ? 'NEW LOG AT THE TERMINAL' : `${d.newLogs} NEW LOGS AT THE TERMINAL`);
      news.forEach((line, i) => {
        const note = text(176 - (news.length - 1 - i) * 11, line, 8, p.coin);
        this.tweens.add({ targets: note, alpha: 0.3, duration: 400, yoyo: true, repeat: -1 });
      });
    }
    onPress(this, ['SPACE', 'ENTER'], () => this.scene.start('Hub'), 400);
  }
}
