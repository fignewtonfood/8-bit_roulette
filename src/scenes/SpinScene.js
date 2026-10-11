import Phaser from 'phaser';
import { content } from '../data/index.js';
import { spin, describeRun } from '../engine/spin.js';
import { startRun } from '../engine/startRun.js';
import { randomSeed } from '../gen/rng.js';
import { getSave, session } from '../engine/profile.js';
import { lengthOptions, makeRun } from '../engine/run.js';
import { C, hex, onPress } from '../ui/machine.js';

// The slot machine: pick a bet (game length), pull, and three reels land on a
// theme, a genre and a twist. The result is decided by spin() the moment you
// pull; the spinning reels are just the show.
//
// Whatever lands, you play: once the lever is pulled there's no backing out,
// and spinning again needs a Re-spin from the shop (once per hub visit).
// Practice mode (opened from the URL with ?spin) spins freely and pays nothing.

const REELS = ['theme', 'genre', 'twist'];
const LABELS = { theme: 'THEME', genre: 'GENRE', twist: 'TWIST' };

// Show knobs (seconds)
const FIRST_STOP = 0.9;      // when the first reel stops
const STOP_GAP = 0.5;        // time between reels stopping
const SPIN_RATE = 14;        // entries per second while spinning
const REROLL_PAUSE = 0.6;    // how long a blocked roll is shown before it re-rolls
const REROLL_SPIN = 0.35;


export default class SpinScene extends Phaser.Scene {
  constructor() {
    super('Spin');
  }

  init(data) {
    this.locks = data.locks || {};
    this.practice = !!data.practice;
    this.mode = 'ready'; // ready → spinning → landed
  }

  create() {
    const W = this.scale.width;
    this.cameras.main.setBackgroundColor(C.bg);
    const text = (x, y, s, size, color) =>
      this.add.text(x, y, s, { fontFamily: 'monospace', fontSize: `${size}px`, color }).setOrigin(0.5);

    text(W / 2, 18, '8-BIT ROULETTE', 16, C.gold);
    this.add
      .text(4, 4, this.practice ? 'PRACTICE' : `TOKENS ${getSave().tokens}`, { fontFamily: 'monospace', fontSize: '8px', color: this.practice ? C.warn : C.gold })
      .setOrigin(0, 0);

    // Cabinet
    const g = this.add.graphics();
    g.fillStyle(hex(C.cabinetDark)).fillRect(10, 40, W - 20, 104);
    g.fillStyle(hex(C.cabinet)).fillRect(12, 42, W - 24, 100);
    g.fillStyle(hex(C.gold)).fillRect(12, 42, W - 24, 2).fillRect(12, 140, W - 24, 2);

    // Reel windows
    this.reels = REELS.map((reel, i) => {
      const x = 50 + i * 78;
      const y = 92;
      text(x, 56, LABELS[reel], 8, this.locks[reel] ? C.warn : C.gold);
      const frame = this.add.rectangle(x, y, 70, 44, hex(C.window)).setStrokeStyle(2, hex(C.cabinetDark));
      const strip = content.reels[reel].map((e) => ({ id: e.id, label: this.label(reel, e.id) }));
      const lines = [-14, 0, 14].map((dy, j) => text(x, y + dy, '', j === 1 ? 10 : 8, j === 1 ? C.ink : C.faint));
      const state = { reel, x, y, frame, strip, lines, pos: Phaser.Math.Between(0, strip.length - 1), spinning: false };
      this.drawReel(state);
      return state;
    });

    // Payline arrows
    text(14, 92, '>', 10, C.gold);
    text(W - 14, 92, '<', 10, C.gold);

    this.info = this.add
      .text(W / 2, 150, '', { fontFamily: 'monospace', fontSize: '8px', color: C.text, align: 'center', lineSpacing: 3 })
      .setOrigin(0.5, 0);
    this.betText = text(W / 2, 188, '', 8, C.text);
    this.prompt = text(W / 2, 206, '', 8, C.gold);
    this.seedText = this.add
      .text(W - 4, 220, '', { fontFamily: 'monospace', fontSize: '8px', color: C.faint })
      .setOrigin(1, 1);
    this.tweens.add({ targets: this.prompt, alpha: 0.25, duration: 500, yoyo: true, repeat: -1 });

    // The bet: every length, locked ones included so you can see what's coming.
    this.lengths = lengthOptions(content, getSave(), session.unlockAll || this.practice);
    this.bet = Math.max(0, this.lengths.findIndex((l) => l.id === session.lastLength && !l.locked));

    const locked = Object.keys(this.locks);
    this.readyInfo = locked.length ? `Locked by the URL: ${locked.join(', ')}` : 'Three reels. One game.\nWhatever lands, you play.';
    this.info.setText(this.readyInfo);
    this.showBet();

    onPress(this, ['SPACE', 'Z', 'ENTER'], () => {
      if (this.mode === 'ready') this.pull();
      else if (this.mode === 'landed') this.play();
    });
    onPress(this, ['LEFT'], () => this.changeBet(-1), 0);
    onPress(this, ['RIGHT'], () => this.changeBet(1), 0);
    onPress(this, ['S'], () => this.mode === 'landed' && this.canRespin() && this.respin());
    onPress(this, ['X', 'ESC'], () => this.mode === 'ready' && this.scene.start('Hub'));
  }

  // ---------- The bet ----------

  changeBet(step) {
    if (this.mode !== 'ready') return;
    this.bet = (this.bet + step + this.lengths.length) % this.lengths.length;
    this.info.setText(this.readyInfo).setColor(C.text);
    this.showBet();
  }

  showBet() {
    const len = this.lengths[this.bet];
    const many = this.lengths.length > 1;
    const stages = `${len.stages} STAGE${len.stages === 1 ? '' : 'S'}`;
    const body = len.locked ? `${len.name.toUpperCase()}  LOCKED` : `${len.name.toUpperCase()}  ${stages}  x${len.multiplier}`;
    this.betText.setText(many && this.mode === 'ready' ? `< ${body} >` : body).setColor(len.locked ? C.faint : C.text);
    if (this.mode !== 'ready') return;
    this.prompt.setText(len.locked ? `NEEDS ${len.unlockedBy} FROM THE SHOP` : 'SPACE PULL      X BACK').setColor(len.locked ? C.faint : C.gold);
  }

  canRespin() {
    return this.practice || session.respinsLeft > 0;
  }

  respin() {
    if (!this.practice) session.respinsLeft--;
    this.pull();
  }

  play() {
    const len = this.lengths[this.bet];
    session.lastLength = len.id;
    startRun(this, makeRun(content, getSave(), this.result, len.id, { practice: this.practice }));
  }

  label(reel, id) {
    const item = reel === 'genre' ? content.genres[id] : content[`${reel}s`][id];
    return (item.short || item.name).toUpperCase();
  }

  pull() {
    const len = this.lengths[this.bet];
    if (len.locked) {
      this.info.setText(`${len.name} runs unlock with ${len.unlockedBy}.`).setColor(C.warn);
      this.cameras.main.shake(80, 0.003);
      return;
    }
    this.mode = 'spinning';
    this.info.setColor(C.text);
    this.showBet();
    this.result = spin(content, randomSeed(), this.locks);
    this.info.setText('');
    this.prompt.setText('');
    this.seedText.setText(`SEED ${this.result.seed}`);
    this.cameras.main.shake(80, 0.004);

    this.reels.forEach((r, i) => {
      r.frame.setStrokeStyle(2, hex(C.cabinetDark));
      if (this.locks[r.reel]) {
        this.land(r, this.result[r.reel]); // a locked reel doesn't move
        return;
      }
      r.spinning = true;
      const stopAt = (FIRST_STOP + i * STOP_GAP) * 1000;
      const blocked = this.result.firstRoll[r.reel];

      if (!blocked) {
        this.time.delayedCall(stopAt, () => this.land(r, this.result[r.reel]));
        return;
      }
      // Compatibility re-roll: land on the blocked roll, flash, spin again.
      this.time.delayedCall(stopAt, () => {
        this.land(r, blocked);
        r.frame.setStrokeStyle(2, hex(C.warn));
        this.info.setText(`${this.label(r.reel, blocked)} won't work here. RE-ROLL!`);
        this.cameras.main.flash(120, 216, 64, 46);
      });
      this.time.delayedCall(stopAt + REROLL_PAUSE * 1000, () => {
        r.spinning = true;
        this.info.setText('');
      });
      this.time.delayedCall(stopAt + (REROLL_PAUSE + REROLL_SPIN) * 1000, () => {
        r.frame.setStrokeStyle(2, hex(C.cabinetDark));
        this.land(r, this.result[r.reel]);
      });
    });

    // Shift the reels after a re-roll so the last one still stops last.
    const lastStop = Math.max(
      ...this.reels.map((r, i) =>
        this.locks[r.reel] ? 0 : FIRST_STOP + i * STOP_GAP + (this.result.firstRoll[r.reel] ? REROLL_PAUSE + REROLL_SPIN : 0),
      ),
    );
    this.time.delayedCall(lastStop * 1000 + 250, () => this.showResult());
  }

  land(r, id) {
    r.spinning = false;
    r.pos = r.strip.findIndex((e) => e.id === id);
    this.drawReel(r);
    this.tweens.add({ targets: r.lines, y: '+=3', duration: 60, yoyo: true }); // little clunk
  }

  showResult() {
    const run = this.result;
    const twist = content.twists[run.twist];
    console.log(`[8-Bit Roulette] spin ${run.seed}: ${describeRun(content, run)}${run.rerolled.length ? ` (re-rolled: ${run.rerolled.join(', ')})` : ''}`);
    this.info.setText(`${describeRun(content, run)}\n${twist.description}`);
    const respin = this.practice ? '      S SPIN AGAIN' : session.respinsLeft > 0 ? `      S RE-SPIN (${session.respinsLeft})` : '';
    this.prompt.setText(`SPACE PLAY${respin}`).setColor(C.gold);
    this.mode = 'landed';
  }

  update(_time, delta) {
    for (const r of this.reels) {
      if (!r.spinning) continue;
      r.pos += (SPIN_RATE * delta) / 1000;
      this.drawReel(r);
    }
  }

  drawReel(r) {
    const n = r.strip.length;
    const at = (k) => r.strip[(((Math.floor(r.pos) + k) % n) + n) % n].label;
    r.lines.forEach((line, j) => line.setText(at(j - 1)));
  }
}
