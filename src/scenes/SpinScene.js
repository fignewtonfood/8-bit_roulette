import Phaser from 'phaser';
import { content } from '../data/index.js';
import { spin, describeRun, runTitle } from '../engine/spin.js';
import { startRun } from '../engine/startRun.js';
import { randomSeed } from '../gen/rng.js';
import { getSave, session } from '../engine/profile.js';
import { lengthOptions, makeRun } from '../engine/run.js';
import { glitchNext } from '../engine/story.js';
import { levelOfEntry } from '../engine/progress.js';
import { twistAt, twistMaxLevel, genreAt, genreMaxLevel, themeAt, themeMaxLevel } from '../engine/content.js';
import { C, hex, onPress } from '../ui/machine.js';
import { pixelText } from '../ui/font.js';

// The slot machine: pick a bet (game length), pull, and three reels land on a
// theme, a genre and a twist. The result is decided by spin() the moment you
// pull; the spinning reels are just the show.
//
// Whatever lands, you play: once the lever is pulled there's no backing out,
// and spinning again needs a Re-spin from the shop (once per hub visit).
// Practice mode (opened from the URL with ?spin) spins freely and pays nothing.
//
// Sometimes the machine glitches (story.js decides when): the theme reel
// scrambles and lands on a theme that isn't on the strip.
//
// Levels: what lands isn't a choice, but the level you play it at is. If the
// theme, genre or twist that lands has reached level 2 or 3 (progress.js)
// and has settings for it ("levels" in its theme file, genres.json or its
// twist file), Left/Right picks its level before you play. If more than one
// can level, Up/Down switches between them. Practice mode offers every level.

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
      pixelText(this, x, y, s, { size: size / 8, color, align: 'center' }).setOrigin(0.5);

    this.title = text(W / 2, 18, '8-BIT ROULETTE', 16, C.gold);
    pixelText(this, 4, 220, this.practice ? 'PRACTICE' : `TOKENS ${getSave().tokens}`, { color: this.practice ? C.warn : C.gold }).setOrigin(0, 1);

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

    this.info = pixelText(this, W / 2, 150, '', { color: C.text, align: 'center' }).setOrigin(0.5, 0);
    // Bet and prompt sit clear of the token count / seed line at the bottom.
    this.betText = text(W / 2, 182, '', 8, C.text);
    this.prompt = text(W / 2, 197, '', 8, C.gold);
    this.seedText = pixelText(this, W - 4, 220, '', { color: C.faint }).setOrigin(1, 1);
    // One level picker under each reel that can have levels.
    this.levelTexts = {
      theme: text(this.reels[REELS.indexOf('theme')].x, 124, '', 8, C.gold),
      genre: text(this.reels[REELS.indexOf('genre')].x, 124, '', 8, C.gold),
      twist: text(this.reels[REELS.indexOf('twist')].x, 124, '', 8, C.gold),
    };
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
    onPress(this, ['LEFT'], () => (this.mode === 'landed' ? this.changeLevel(-1) : this.changeBet(-1)), 0);
    onPress(this, ['RIGHT'], () => (this.mode === 'landed' ? this.changeLevel(1) : this.changeBet(1)), 0);
    onPress(this, ['UP', 'DOWN'], () => this.mode === 'landed' && this.switchPicker(), 0);
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
    const levels = { theme: this.picked.theme || 1, genre: this.picked.genre || 1, twist: this.picked.twist || 1 };
    startRun(this, makeRun(content, getSave(), { ...this.result, levels }, len.id, { practice: this.practice }));
  }

  // ---------- The level ----------

  // The highest level you can play the landed theme, genre or twist at.
  levelCap(reel) {
    const id = this.result[reel];
    const most = { theme: themeMaxLevel, genre: genreMaxLevel, twist: twistMaxLevel }[reel](content, id);
    const reached = this.practice ? Infinity : levelOfEntry(content, getSave(), reel, id);
    return Math.min(reached, most);
  }

  // The reels whose level can be picked this spin, left to right. A glitched
  // theme has no levels.
  pickers() {
    return REELS.filter((reel) => this.levelCap(reel) > 1);
  }

  switchPicker() {
    const list = this.pickers();
    if (list.length < 2) return;
    this.active = list[(list.indexOf(this.active) + 1) % list.length];
    this.showLevel();
  }

  changeLevel(step) {
    const reel = this.active;
    if (!reel) return;
    this.picked[reel] = Phaser.Math.Clamp(this.picked[reel] + step, 1, this.levelCap(reel));
    session.levelPicks = { ...(session.levelPicks || {}), [`${reel}:${this.result[reel]}`]: this.picked[reel] };
    this.showLevel();
  }

  showLevel() {
    const run = this.result;
    const levels = { theme: this.picked.theme, genre: this.picked.genre, twist: this.picked.twist };
    for (const reel of REELS) {
      const cap = this.levelCap(reel);
      const lv = levels[reel];
      const on = reel === this.active;
      const label = on ? `${lv > 1 ? '<' : ' '} LV ${lv} ${lv < cap ? '>' : ' '}` : `LV ${lv}`;
      this.levelTexts[reel].setText(cap > 1 ? label : '').setColor(on ? C.gold : C.faint);
    }
    // The description is the one for whatever you're picking: the genre's
    // level, or the twist (at its level), which is also the default.
    let about = twistAt(content, run.twist, levels.twist).description;
    if (this.active === 'theme') {
      const t = themeAt(content, run.theme, levels.theme);
      about = levels.theme > 1 ? content.themes[run.theme].levels[levels.theme - 2].description : `Plain ${t.name}: no hazard.`;
    }
    if (this.active === 'genre') {
      const g = genreAt(content, run.genre, levels.genre);
      about = levels.genre > 1 ? g.levels[levels.genre - 2].description : g.description;
    }
    this.info.setText(`${runTitle(content, { ...run, levels })}\n${run.glitch ? 'IT STUTTERED. THIS ISN\'T ON THE STRIP.' : about}`);
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
    const glitch = !this.locks.theme && (session.forceGlitch || glitchNext(content, getSave(), Math.random, { practice: this.practice }));
    session.forceGlitch = false;
    this.result = spin(content, randomSeed(), this.locks, { glitch });
    const themeReel = this.reels[0];
    themeReel.glitchy = this.result.glitch;
    if (this.result.glitch && !themeReel.strip.some((e) => e.id === this.result.theme)) {
      themeReel.strip.push({ id: this.result.theme, label: this.label('theme', this.result.theme) });
    }
    this.info.setText('');
    this.prompt.setText('');
    Object.values(this.levelTexts).forEach((t) => t.setText(''));
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
    if (r.glitchy) {
      r.glitchy = false;
      r.frame.setStrokeStyle(2, hex(C.screenText));
      this.cameras.main.flash(160, 95, 224, 138);
      this.cameras.main.shake(200, 0.01);
      this.title.setText('8-B?T R0UL#TTE').setColor(C.screenText);
      this.time.delayedCall(500, () => this.title.setText('8-BIT ROULETTE').setColor(C.gold));
    }
    r.pos = r.strip.findIndex((e) => e.id === id);
    this.drawReel(r);
    this.tweens.add({ targets: r.lines, y: '+=3', duration: 60, yoyo: true }); // little clunk
  }

  showResult() {
    const run = this.result;
    console.log(`[8-Bit Roulette] spin ${run.seed}: ${describeRun(content, run)}${run.rerolled.length ? ` (re-rolled: ${run.rerolled.join(', ')})` : ''}`);
    // Start on the levels you picked last time for this genre and twist (this
    // visit), within what you've reached. The twist's picker starts active.
    this.picked = {};
    for (const reel of REELS) {
      this.picked[reel] = Math.min(session.levelPicks?.[`${reel}:${run[reel]}`] || 1, this.levelCap(reel));
    }
    const pickers = this.pickers();
    this.active = pickers.includes('twist') ? 'twist' : pickers[0] || null;
    this.showLevel();
    if (run.glitch) this.seedText.setText('SEED ????');
    const respin = this.practice ? '      S SPIN AGAIN' : session.respinsLeft > 0 ? `      S RE-SPIN (${session.respinsLeft})` : '';
    const level = pickers.length > 1 ? '   ARROWS LEVEL' : pickers.length ? '   < > LEVEL' : '';
    // Keep it on one line (42 characters): tighter gaps when both are there.
    const line = `SPACE PLAY${respin}${level}`;
    this.prompt.setText(line.length > 42 ? line.replace(/ {6}/, '   ') : line).setColor(C.gold);
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
    if (r.glitchy && r.spinning) {
      const junk = () => Array.from({ length: Phaser.Math.Between(3, 6) }, () => Phaser.Utils.Array.GetRandom([...'#?%@*01_/$&'])).join('');
      r.lines.forEach((line) => line.setText(junk()));
      return;
    }
    const n = r.strip.length;
    const at = (k) => r.strip[(((Math.floor(r.pos) + k) % n) + n) % n].label;
    r.lines.forEach((line, j) => line.setText(at(j - 1)));
  }
}
