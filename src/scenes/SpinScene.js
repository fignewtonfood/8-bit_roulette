import Phaser from 'phaser';
import { content } from '../data/index.js';
import { spin, describeRun } from '../engine/spin.js';
import { startRun } from '../engine/startRun.js';
import { randomSeed } from '../gen/rng.js';

// The slot machine: three reels that land on a theme, a genre and a twist.
// The result is decided by spin() the moment you pull; the spinning reels are
// just the show. The hub, the length bet and the payouts come in milestone 4.

const REELS = ['theme', 'genre', 'twist'];
const LABELS = { theme: 'THEME', genre: 'GENRE', twist: 'TWIST' };

// Show knobs (seconds)
const FIRST_STOP = 0.9;      // when the first reel stops
const STOP_GAP = 0.5;        // time between reels stopping
const SPIN_RATE = 14;        // entries per second while spinning
const REROLL_PAUSE = 0.6;    // how long a blocked roll is shown before it re-rolls
const REROLL_SPIN = 0.35;

// The machine has its own colours; the theme only applies once you're in a game.
const C = {
  bg: '#0e0b16',
  cabinet: '#6e1f2e',
  cabinetDark: '#3c0f19',
  gold: '#f2c14e',
  window: '#f4ead2',
  ink: '#1b1424',
  faint: '#9a8f86',
  warn: '#d8402e',
  text: '#e8e2f0',
};
const hex = (c) => Phaser.Display.Color.HexStringToColor(c).color;

export default class SpinScene extends Phaser.Scene {
  constructor() {
    super('Spin');
  }

  init(data) {
    this.locks = data.locks || {};
    this.mode = 'ready'; // ready → spinning → landed
  }

  create() {
    const W = this.scale.width;
    this.cameras.main.setBackgroundColor(C.bg);
    const text = (x, y, s, size, color) =>
      this.add.text(x, y, s, { fontFamily: 'monospace', fontSize: `${size}px`, color }).setOrigin(0.5);

    text(W / 2, 18, '8-BIT ROULETTE', 16, C.gold);

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
    this.prompt = text(W / 2, 206, '', 8, C.gold);
    this.seedText = this.add
      .text(W - 4, 220, '', { fontFamily: 'monospace', fontSize: '8px', color: C.faint })
      .setOrigin(1, 1);
    this.tweens.add({ targets: this.prompt, alpha: 0.25, duration: 500, yoyo: true, repeat: -1 });

    const locked = Object.keys(this.locks);
    this.info.setText(locked.length ? `Locked by the URL: ${locked.join(', ')}` : 'Three reels. One game.\nWhatever lands, you play.');
    this.prompt.setText('SPACE / Z  PULL');

    const go = () => (this.mode === 'ready' ? this.pull() : this.mode === 'landed' ? startRun(this, this.result) : null);
    const kb = this.input.keyboard;
    const on = (key, fn) => kb.on(`keydown-${key}`, (e) => !e.repeat && fn()); // ignore held keys
    ['SPACE', 'Z', 'ENTER'].forEach((k) => on(k, go));
    on('S', () => this.mode === 'landed' && this.pull());
  }

  label(reel, id) {
    const item = reel === 'genre' ? content.genres[id] : content[`${reel}s`][id];
    return (item.short || item.name).toUpperCase();
  }

  pull() {
    this.mode = 'spinning';
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
    this.info.setText(`${describeRun(content, run)}\n\n${twist.description}`);
    this.prompt.setText('SPACE PLAY      S SPIN AGAIN');
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
