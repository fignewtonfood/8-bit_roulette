import Phaser from 'phaser';
import { content } from '../data/index.js';
import { getSave, setSave, session } from '../engine/profile.js';
import { startLives, respinsPerVisit } from '../engine/run.js';
import { unlockedBeats, unreadBeats, markRead, hubState } from '../engine/story.js';
import { makePlaceholderTextures, tex } from '../art/placeholder.js';
import { C, hex, label, onPress, HUB_THEME } from '../ui/machine.js';
import { pixelText } from '../ui/font.js';

// The hub: a small room with the slot machine, the shop and the story
// terminal. Walk up to one and press Up to use it.
//
// The room changes as the story unlocks (story.json): marks appear on the
// wall, another player shows up, and eventually the machine starts watching.

const FLOOR_Y = 192;
const RUN_SPEED = 90;
const JUMP_VELOCITY = 240;
const REACH = 22; // how close (px) you need to stand to use a station
const TYPE_MS = 12; // how fast a new log types out, per character

const BASE_STATIONS = [
  { id: 'shop', x: 40, verb: 'SHOP' },
  { id: 'machine', x: 128, verb: 'SPIN' },
  { id: 'terminal', x: 216, verb: 'READ' },
];
const WALL = { id: 'wall', x: 84, verb: 'READ' };
const STRANGER = { id: 'stranger', x: 172, verb: 'TALK' };

export default class HubScene extends Phaser.Scene {
  constructor() {
    super('Hub');
  }

  create() {
    const W = this.scale.width;
    const save = getSave();
    session.respinsLeft = respinsPerVisit(content, save); // a fresh trip to the hub
    makePlaceholderTextures(this, HUB_THEME);
    this.cameras.main.setBackgroundColor(C.bg);
    this.panel = null;
    this.story = hubState(content, save);
    this.stations = [...BASE_STATIONS];
    if (this.story.scratches) this.stations.push(WALL);
    if (this.story.stranger) this.stations.push(STRANGER);

    this.drawRoom(W);

    // Player
    const spot = this.stations.find((s) => s.id === session.hubSpot);
    const startX = spot ? spot.x + (spot.x > W / 2 ? -18 : 18) : 88;
    this.player = this.physics.add.sprite(startX, FLOOR_Y - 7, tex(HUB_THEME, 'player'));
    this.player.setCollideWorldBounds(true);
    const floor = this.add.zone(W / 2, FLOOR_Y + 8, W, 16);
    this.physics.add.existing(floor, true);
    this.physics.add.collider(this.player, floor);

    // HUD
    label(this, 6, 10, `TOKENS ${save.tokens}`, 8, C.gold, 0);
    const respins = respinsPerVisit(content, save);
    label(this, W - 6, 10, `LIVES ${startLives(content, save)}${respins ? `  RE-SPIN ${respins}` : ''}`, 8, C.faint, 1);

    this.prompt = label(this, 0, 0, '', 8, C.gold).setVisible(false);
    this.tweens.add({ targets: this.prompt, alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });

    if (save.stats.runs === 0) {
      const hint = label(this, W / 2, 30, 'ARROWS WALK   Z JUMP   UP USE', 8, C.faint);
      this.time.delayedCall(6000, () => this.tweens.add({ targets: hint, alpha: 0, duration: 800 }));
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.jumpKeys = [this.cursors.space, this.input.keyboard.addKey('Z')];
    onPress(this, ['UP', 'ENTER'], () => this.use());
    onPress(this, ['X', 'ESC'], () => this.closePanel());
    onPress(this, ['LEFT'], () => this.flip(-1), 0);
    onPress(this, ['RIGHT'], () => this.flip(1), 0);

    // The very first visit opens on the first log: you wake up here.
    const unread = unreadBeats(content, save);
    if (unread[0]?.id === content.story.beats[0]?.id) this.time.delayedCall(700, () => this.openTerminal());
  }

  drawRoom(W) {
    const g = this.add.graphics();

    // Back wall with a few panel seams, and the floor
    g.fillStyle(hex(C.wall)).fillRect(0, 20, W, FLOOR_Y - 20);
    g.fillStyle(hex(C.wallDark));
    for (let x = 0; x < W; x += 32) g.fillRect(x, 20, 1, FLOOR_Y - 20);
    g.fillRect(0, 60, W, 1);
    g.fillStyle(hex(HUB_THEME.palette.ground)).fillRect(0, FLOOR_Y, W, 224 - FLOOR_Y);
    g.fillStyle(hex(C.gold)).fillRect(0, FLOOR_Y, W, 1);
    g.fillStyle(hex(HUB_THEME.palette.groundDark));
    for (let x = 8; x < W; x += 16) g.fillRect(x, FLOOR_Y + 4, 8, 1);

    // Tally marks scratched into the wall (story: scratches)
    if (this.story.scratches) {
      g.fillStyle(hex(C.faint));
      for (let row = 0; row < 4; row++) {
        for (let group = 0; group < (row === 3 ? 2 : 3); group++) {
          const ox = 68 + group * 12;
          const oy = 70 + row * 10;
          for (let i = 0; i < 4; i++) g.fillRect(ox + i * 2, oy, 1, 7);
          if (row < 3 || group === 0) g.fillRect(ox - 1, oy + 3, 9, 1); // the strike through
        }
      }
    }

    // Shop: a prize counter
    g.fillStyle(hex(C.cabinetDark)).fillRect(18, 162, 44, 30);
    g.fillStyle(hex(C.cabinet)).fillRect(20, 164, 40, 28);
    g.fillStyle(hex(C.gold)).fillRect(18, 160, 44, 2);
    g.fillStyle(hex(C.gold)).fillCircle(32, 155, 4).fillCircle(46, 156, 3);
    g.fillStyle(hex(C.window)).fillRect(22, 118, 36, 14);
    label(this, 40, 125, 'SHOP', 8, C.ink);

    // The slot machine. Once it's watching you, its lights go red.
    const light = this.story.watching ? C.warn : C.gold;
    this.lightColor = light;
    g.fillStyle(hex(C.cabinetDark)).fillRect(102, 96, 52, 96);
    g.fillStyle(hex(C.cabinet)).fillRect(104, 98, 48, 94);
    g.fillStyle(hex(light)).fillRect(102, 96, 52, 3).fillRect(104, 158, 48, 2);
    for (let i = 0; i < 3; i++) g.fillStyle(hex(C.window)).fillRect(108 + i * 15, 124, 12, 18);
    g.fillStyle(hex(C.cabinetDark)).fillRect(110, 168, 36, 6); // coin tray
    g.fillStyle(hex(C.faint)).fillRect(155, 116, 3, 30);         // lever
    this.leverKnob = this.add.circle(156, 114, 4, hex(C.warn));
    label(this, 128, 109, 'SPIN', 8, light);
    this.reelBits = [0, 1, 2].map((i) => label(this, 114 + i * 15, 133, '?', 8, C.ink));
    this.lights = Array.from({ length: 6 }, (_, i) => this.add.rectangle(107 + i * 8.4, 103, 3, 3, hex(light)));
    this.time.addEvent({ delay: 220, loop: true, callback: this.blink, callbackScope: this });

    // Story terminal, with a NEW light when there's an unread log
    g.fillStyle(hex(C.faint)).fillRect(213, 172, 6, 20);
    g.fillStyle(hex(C.wallDark)).fillRect(198, 144, 36, 30);
    g.fillStyle(hex(C.screen)).fillRect(201, 147, 30, 22);
    this.cursorBlock = this.add.rectangle(206, 163, 4, 5, hex(C.screenText));
    this.tweens.add({ targets: this.cursorBlock, alpha: 0, duration: 400, yoyo: true, repeat: -1, hold: 200 });
    label(this, 216, 153, '>_', 8, C.screenText);
    this.newLight = label(this, 216, 137, 'NEW', 8, C.screenText);
    this.tweens.add({ targets: this.newLight, alpha: 0.2, duration: 300, yoyo: true, repeat: -1 });
    this.refreshNewLight();

    // The other player (story: stranger): gray, flickering, never quite there.
    if (this.story.stranger) {
      this.stranger = this.add.sprite(STRANGER.x, FLOOR_Y - 7, tex(HUB_THEME, 'player')).setFlipX(true).setTint(0x6a6470).setAlpha(0.6);
      this.time.addEvent({
        delay: 140,
        loop: true,
        callback: () => {
          const r = Math.random();
          this.stranger.setAlpha(r < 0.04 ? 0 : 0.45 + Math.random() * 0.25);
          this.stranger.x = STRANGER.x + (r > 0.97 ? Phaser.Math.Between(-2, 2) : 0);
        },
      });
      this.speech = label(this, W / 2, 72, '', 8, C.faint).setVisible(false);
    }
  }

  blink() {
    this.lightStep = (this.lightStep || 0) + 1;
    this.lights.forEach((l, i) => l.setFillStyle(hex((i + this.lightStep) % 3 ? C.cabinetDark : this.lightColor)));
    if (this.lightStep % 3 !== 0) return;
    // Once it's watching, every so often the reels spell it out.
    if (this.story.watching && this.lightStep % 27 === 0) {
      ['Y', 'O', 'U'].forEach((ch, i) => this.reelBits[i].setText(ch));
      return;
    }
    const symbols = ['7', '$', '*', '?', '#'];
    this.reelBits.forEach((t) => t.setText(Phaser.Utils.Array.GetRandom(symbols)));
  }

  refreshNewLight() {
    this.newLight.setVisible(unreadBeats(content, getSave()).length > 0);
  }

  nearest() {
    const x = this.player.x;
    return this.stations.find((s) => Math.abs(s.x - x) <= REACH) || null;
  }

  update() {
    if (this.panel) {
      this.player.setVelocityX(0);
      return;
    }
    const p = this.player;
    const left = this.cursors.left.isDown;
    const right = this.cursors.right.isDown;
    p.setVelocityX(left === right ? 0 : left ? -RUN_SPEED : RUN_SPEED);
    if (left !== right) p.setFlipX(left);
    const jump = this.jumpKeys.some((k) => Phaser.Input.Keyboard.JustDown(k));
    if (jump && p.body.blocked.down) p.setVelocityY(-JUMP_VELOCITY);

    const near = this.nearest();
    this.prompt.setVisible(!!near);
    if (near) this.prompt.setText(`UP ${near.verb}`).setPosition(near.x, near.id === 'machine' ? 86 : 108);
  }

  use() {
    if (this.panel) {
      // A log still typing out finishes first; the next press closes it.
      if (this.panel.typing) return this.finishTyping();
      return this.closePanel();
    }
    const near = this.nearest();
    if (!near) return;
    session.hubSpot = near.id;
    if (near.id === 'machine') {
      this.tweens.add({ targets: this.leverKnob, y: 140, duration: 120, yoyo: true });
      this.time.delayedCall(180, () => this.scene.start('Spin', {}));
    } else if (near.id === 'shop') {
      this.scene.start('Shop');
    } else if (near.id === 'wall') {
      this.openWall();
    } else if (near.id === 'stranger') {
      this.talk();
    } else {
      this.openTerminal();
    }
  }

  // ---------- Panels ----------

  // A screen-like box with a title, a body and a footer. Returns the panel.
  openBox(title, footer, colors = { bg: C.screen, ink: C.screenText }) {
    const W = this.scale.width;
    const box = this.add.rectangle(W / 2, 98, 204, 152, hex(colors.bg)).setStrokeStyle(2, hex(colors.ink));
    const head = pixelText(this, W / 2 - 94, 28, title, { color: colors.ink });
    const body = pixelText(this, W / 2 - 94, 44, '', { color: colors.ink });
    const foot = label(this, W / 2, 164, footer, 8, C.faint);
    this.prompt.setVisible(false);
    if (this.speech) this.speech.setVisible(false);
    this.panel = { parts: [box, head, body, foot], head, body, foot };
    return this.panel;
  }

  // The terminal: one page per recovered log, then your records.
  // Opens on the oldest unread log, if there is one.
  openTerminal() {
    if (this.panel) return;
    const save = getSave();
    const logs = unlockedBeats(content, save);
    const firstUnread = logs.findIndex((b) => unreadBeats(content, save).some((u) => u.id === b.id));
    this.openBox('', '');
    this.panel.kind = 'terminal';
    this.panel.logs = logs;
    this.showPage(firstUnread >= 0 ? firstUnread : logs.length); // records page by default
  }

  showPage(i) {
    const panel = this.panel;
    const { logs } = panel;
    const pages = logs.length + 1;
    panel.page = (i + pages) % pages;
    this.finishTyping(false);
    panel.foot.setText(pages > 1 ? '< >  MORE LOGS      X CLOSE' : 'UP / X  CLOSE');

    if (panel.page === logs.length) {
      const s = getSave().stats;
      panel.head.setText('> RECORDS');
      panel.body.setText([
        `> LOGS RECOVERED ${logs.length}/${content.story.beats.length}`,
        '',
        `> RUNS PLAYED    ${s.runs}`,
        `> RUNS WON       ${s.wins}`,
        `> TOKENS EARNED  ${s.tokensEarned}`,
        `> BEST PAYOUT    ${s.bestPayout}`,
        '',
        logs.length < content.story.beats.length ? '> KEEP SPINNING.' : '> SIGNAL LOST.',
      ].join('\n'));
      return;
    }

    const beat = logs[panel.page];
    const save = getSave();
    const isNew = !(save.story?.read || []).includes(beat.id);
    panel.head.setText(`LOG ${panel.page + 1}/${content.story.beats.length}  ${beat.title}`);
    const text = beat.log.join('\n');
    if (isNew) {
      setSave(markRead(save, beat.id));
      this.refreshNewLight();
      this.typeOut(text);
    } else {
      panel.body.setText(text);
    }
  }

  typeOut(text) {
    const panel = this.panel;
    let n = 0;
    panel.fullText = text;
    panel.body.setText('');
    panel.typing = this.time.addEvent({
      delay: TYPE_MS,
      loop: true,
      callback: () => {
        n += 1;
        panel.body.setText(text.slice(0, n));
        if (n >= text.length) this.finishTyping();
      },
    });
  }

  finishTyping(showAll = true) {
    const panel = this.panel;
    if (!panel?.typing) return;
    panel.typing.remove();
    panel.typing = null;
    if (showAll) panel.body.setText(panel.fullText);
  }

  flip(step) {
    if (this.panel?.kind !== 'terminal') return;
    this.showPage(this.panel.page + step);
  }

  openWall() {
    const panel = this.openBox('SCRATCHED INTO THE WALL', 'UP / X  CLOSE', { bg: C.wallDark, ink: C.faint });
    panel.kind = 'wall';
    panel.body.setText(this.story.wall.join('\n'));
  }

  // The other player says one line at a time, in order, and never waits for you.
  talk() {
    const lines = this.story.says;
    if (!lines.length) return;
    const i = (session.saysIndex || 0) % lines.length;
    session.saysIndex = i + 1;
    this.speech.setText(`"${lines[i]}"`).setVisible(true).setAlpha(1);
    this.tweens.killTweensOf(this.speech);
    this.tweens.add({ targets: this.speech, alpha: 0, delay: 3200, duration: 600 });
  }

  closePanel() {
    if (!this.panel) return;
    this.finishTyping(false);
    this.panel.parts.forEach((o) => o.destroy());
    this.panel = null;
  }
}
