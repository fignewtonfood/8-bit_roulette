import Phaser from 'phaser';
import { content } from '../data/index.js';
import { getSave, session } from '../engine/profile.js';
import { startLives, respinsPerVisit } from '../engine/run.js';
import { makePlaceholderTextures, tex } from '../art/placeholder.js';
import { C, hex, label, onPress, HUB_THEME } from '../ui/machine.js';

// The hub: a small room with the slot machine, the shop and the story
// terminal. Walk up to one and press Up to use it.

const FLOOR_Y = 192;
const RUN_SPEED = 90;
const JUMP_VELOCITY = 240;
const REACH = 22; // how close (px) you need to stand to use a station

const STATIONS = [
  { id: 'shop', x: 40, verb: 'SHOP' },
  { id: 'machine', x: 128, verb: 'SPIN' },
  { id: 'terminal', x: 216, verb: 'READ' },
];

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

    this.drawRoom(W);

    // Player
    const spot = STATIONS.find((s) => s.id === session.hubSpot);
    const startX = spot ? spot.x + (spot.id === 'terminal' ? -18 : 18) : 88;
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

    // Shop: a prize counter
    g.fillStyle(hex(C.cabinetDark)).fillRect(18, 162, 44, 30);
    g.fillStyle(hex(C.cabinet)).fillRect(20, 164, 40, 28);
    g.fillStyle(hex(C.gold)).fillRect(18, 160, 44, 2);
    g.fillStyle(hex(C.gold)).fillCircle(32, 155, 4).fillCircle(46, 156, 3);
    g.fillStyle(hex(C.window)).fillRect(22, 118, 36, 14);
    label(this, 40, 125, 'SHOP', 8, C.ink);

    // The slot machine
    g.fillStyle(hex(C.cabinetDark)).fillRect(102, 96, 52, 96);
    g.fillStyle(hex(C.cabinet)).fillRect(104, 98, 48, 94);
    g.fillStyle(hex(C.gold)).fillRect(102, 96, 52, 3).fillRect(104, 158, 48, 2);
    for (let i = 0; i < 3; i++) g.fillStyle(hex(C.window)).fillRect(108 + i * 15, 124, 12, 18);
    g.fillStyle(hex(C.cabinetDark)).fillRect(110, 168, 36, 6); // coin tray
    g.fillStyle(hex(C.faint)).fillRect(155, 116, 3, 30);         // lever
    this.leverKnob = this.add.circle(156, 114, 4, hex(C.warn));
    label(this, 128, 109, 'SPIN', 8, C.gold);
    this.reelBits = [0, 1, 2].map((i) => label(this, 114 + i * 15, 133, '?', 8, C.ink));
    this.lights = Array.from({ length: 6 }, (_, i) => this.add.rectangle(107 + i * 8.4, 103, 3, 3, hex(C.gold)));
    this.time.addEvent({ delay: 220, loop: true, callback: this.blink, callbackScope: this });

    // Story terminal
    g.fillStyle(hex(C.faint)).fillRect(213, 172, 6, 20);
    g.fillStyle(hex(C.wallDark)).fillRect(198, 144, 36, 30);
    g.fillStyle(hex(C.screen)).fillRect(201, 147, 30, 22);
    this.cursorBlock = this.add.rectangle(206, 163, 4, 5, hex(C.screenText));
    this.tweens.add({ targets: this.cursorBlock, alpha: 0, duration: 400, yoyo: true, repeat: -1, hold: 200 });
    label(this, 216, 153, '>_', 8, C.screenText);
  }

  blink() {
    this.lightStep = (this.lightStep || 0) + 1;
    this.lights.forEach((l, i) => l.setFillStyle(hex((i + this.lightStep) % 3 ? C.cabinetDark : C.gold)));
    if (this.lightStep % 3 === 0) {
      const symbols = ['7', '$', '*', '?', '#'];
      this.reelBits.forEach((t) => t.setText(Phaser.Utils.Array.GetRandom(symbols)));
    }
  }

  nearest() {
    const x = this.player.x;
    return STATIONS.find((s) => Math.abs(s.x - x) <= REACH) || null;
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
    if (this.panel) return this.closePanel();
    const near = this.nearest();
    if (!near) return;
    session.hubSpot = near.id;
    if (near.id === 'machine') {
      this.tweens.add({ targets: this.leverKnob, y: 140, duration: 120, yoyo: true });
      this.time.delayedCall(180, () => this.scene.start('Spin', {}));
    } else if (near.id === 'shop') {
      this.scene.start('Shop');
    } else {
      this.openTerminal();
    }
  }

  // The story lives here from milestone 5. For now it shows your records.
  openTerminal() {
    const W = this.scale.width;
    const s = getSave().stats;
    const box = this.add.rectangle(W / 2, 98, 200, 136, hex(C.screen)).setStrokeStyle(2, hex(C.screenText));
    const lines = [
      '> SIGNAL WEAK',
      '> LOGS: 0 RECOVERED',
      '',
      `> RUNS PLAYED   ${s.runs}`,
      `> RUNS WON      ${s.wins}`,
      `> TOKENS EARNED ${s.tokensEarned}`,
      `> BEST PAYOUT   ${s.bestPayout}`,
      '',
      '> KEEP SPINNING.',
    ];
    const text = label(this, W / 2 - 88, 90, lines.join('\n'), 8, C.screenText, 0);
    const close = label(this, W / 2, 154, 'UP / X  CLOSE', 8, C.faint);
    this.panel = [box, text, close];
    this.prompt.setVisible(false);
  }

  closePanel() {
    if (!this.panel) return;
    this.panel.forEach((o) => o.destroy());
    this.panel = null;
  }
}
