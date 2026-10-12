import Phaser from 'phaser';
import { buildStage } from '../gen/buildStage.js';
import { content } from '../data/index.js';
import { twistSettings, objectiveOf, stageRules } from '../engine/content.js';
import { describeRun } from '../engine/spin.js';
import { addDarkness, GLOW_DEPTH } from '../engine/darkness.js';
import { endStage } from '../engine/startRun.js';
import { runSpeed, enemyScale } from '../engine/speed.js';
import { pixelText } from '../ui/font.js';
import { addGlitchFx } from '../ui/glitch.js';
import { addObjectiveHint, leftMessage, LOCKED_ALPHA } from '../ui/objective.js';
import { makePlaceholderTextures, tex } from '../art/placeholder.js';

const TILE = 16;

// Feel knobs — tweak these while playtesting.
const GRAVITY = 800;          // px/s² (the Low Gravity twist scales this)
const RUN_SPEED = 110;        // px/s
const JUMP_VELOCITY = 300;    // px/s upward; ~3.5 tiles high with gravity 800
const SHORT_HOP = 0.4;        // releasing jump early caps upward speed at 40%
const STOMP_BOUNCE = 0.7;
const COYOTE_TIME = 0.1;      // s you can still jump after walking off a ledge
const JUMP_BUFFER = 0.1;      // s a jump press is remembered before landing
const ENEMY_SPEED = 35;
// Starting lives come from economy.json (plus Extra Life upgrades) and carry
// over from stage to stage.

export default class StageScene extends Phaser.Scene {
  constructor() {
    super('Stage');
  }

  // data.run: see src/engine/run.js (reels, bet, stage number, lives left)
  init(data) {
    this.run = data.run;
    this.seed = data.run.seed;
    this.theme = content.themes[data.run.theme];
    this.mods = twistSettings(content, data.run.twist, 'platformer', data.run.levels?.twist); // the twist's settings
    this.objective = objectiveOf(content, data.run.twist); // Collector / Killer, or null
    this.lives = data.run.lives;
    this.coinsCollected = 0;
    this.dying = false;
    this.finished = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
  }

  create() {
    const theme = this.theme;
    const mods = this.mods;
    const t = (name) => tex(theme, name);
    makePlaceholderTextures(this, theme);

    const level = buildStage({ seed: this.seed, stage: this.run.stage, twist: this.run.twist, ...stageRules(content, this.run.twist, this.run.levels?.twist) });
    this.level = level;
    const worldW = level.widthTiles * TILE;
    const worldH = level.heightTiles * TILE;
    console.log(`[8-Bit Roulette] ${describeRun(content, this.run)} · stage ${this.run.stage}/${this.run.stages} · seed ${this.seed} · cost ${level.cost}/${level.budget}\n  ${level.chunks.join(' → ')}`);

    this.cameras.main.setBackgroundColor(theme.palette.sky);
    addGlitchFx(this, this.run);

    // Twist: Low Gravity. Set every time, because the physics world remembers
    // its gravity between runs.
    this.physics.world.gravity.y = GRAVITY * (mods.gravityScale ?? 1);
    this.jumpVelocity = JUMP_VELOCITY * (mods.jumpScale ?? 1);

    // Ground: tile 1 where the block has open air above it, tile 0 otherwise, -1 = empty
    const data = level.solid.map((row, y) =>
      row.map((solid, x) => (solid ? (y > 0 && level.solid[y - 1][x] ? 0 : 1) : -1)),
    );
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage('tiles', t('tiles'));
    this.layer = map.createLayer(0, tileset, 0, 0);
    this.layer.setCollision([0, 1]);

    // Hazards, pickups, exit
    this.spikes = this.physics.add.staticGroup();
    level.spikes.forEach(({ x, y }) => this.spikes.create(x * TILE + 8, y * TILE + 12, t('spike')));

    this.coins = this.physics.add.staticGroup();
    level.coins.forEach(({ x, y }) => this.coins.create(x * TILE + 8, y * TILE + 8, t('coin')));

    const f = level.flag;
    this.flag = this.physics.add.staticImage(f.x * TILE + 8, (f.y + 1) * TILE - 16, t('flag'));

    // Enemies walk back and forth, turning at walls and ledges
    this.enemies = this.physics.add.group();
    level.enemies.forEach(({ x, y }) => {
      const e = this.enemies.create(x * TILE + 8, (y + 1) * TILE - 5, t('enemy'));
      e.dir = -1;
    });

    // Player
    const s = level.playerStart;
    this.spawnPoint = { x: s.x * TILE + 8, y: (s.y + 1) * TILE - 7 };
    this.player = this.physics.add.sprite(this.spawnPoint.x, this.spawnPoint.y, t('player'));
    this.player.setCollideWorldBounds(true);

    // World edges block left/right/top but not the bottom, so pits are deadly
    this.physics.world.setBounds(0, -64, worldW, worldH + 64);
    this.physics.world.setBoundsCollision(true, true, true, false);

    // Collisions
    this.physics.add.collider(this.player, this.layer);
    this.physics.add.collider(this.enemies, this.layer);
    this.physics.add.overlap(this.player, this.spikes, () => this.die());
    this.physics.add.overlap(this.player, this.coins, (_p, coin) => this.collectCoin(coin));
    this.physics.add.overlap(this.player, this.enemies, (_p, enemy) => this.touchEnemy(enemy));
    this.physics.add.overlap(this.player, this.flag, () => this.reachFlag());

    // Twist: Darkness. Anything listed under "glow" stays visible in the dark.
    this.darkness = null; // the scene object is reused between runs, so reset it
    if (mods.lightRadius) {
      this.darkness = addDarkness(this, mods);
      const glow = new Set(mods.glow || []);
      if (glow.has('coins')) this.coins.setDepth(GLOW_DEPTH);
      if (glow.has('spikes')) this.spikes.setDepth(GLOW_DEPTH);
      if (glow.has('enemies')) this.enemies.setDepth(GLOW_DEPTH);
      if (glow.has('flag')) this.flag.setDepth(GLOW_DEPTH);
    }

    // Camera
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);

    // Input: arrows to move; Up or Space to jump (same in every genre)
    this.cursors = this.input.keyboard.createCursorKeys();
    this.jumpKeys = [this.cursors.up, this.cursors.space];

    // HUD
    this.hud = pixelText(this, 4, 4, '', { color: theme.palette.text })
      .setScrollFactor(0)
      .setDepth(10);
    this.hint = addObjectiveHint(this, theme.palette.text);
    this.hintCooldown = 0;
    this.refreshObjective();
    this.updateHud();
    this.startTime = this.time.now;
  }

  update(_time, delta) {
    if (this.dying || this.finished) return;
    const dt = delta / 1000;
    const p = this.player;
    const body = p.body;

    // Run
    const left = this.cursors.left.isDown;
    const right = this.cursors.right.isDown;
    // Twists Speedy and Mud change your ground speed only, never your jumps.
    const speed = runSpeed(RUN_SPEED, this.mods, body.blocked.down);
    const runTarget = left === right ? 0 : left ? -speed : speed;
    if (this.mods.groundGrip !== undefined) {
      // Twist: Slippery. Speed eases toward what you're pushing for, slowly
      // on the ground (ice) and a bit faster in the air.
      const grip = body.blocked.down ? this.mods.groundGrip : this.mods.airGrip ?? this.mods.groundGrip;
      const k = Math.min(1, grip * dt);
      p.setVelocityX(body.velocity.x + (runTarget - body.velocity.x) * k);
    } else {
      p.setVelocityX(runTarget);
    }
    if (left !== right) p.setFlipX(left);

    // Jump, with coyote time and a jump buffer so it feels fair
    const jumpPressed = this.jumpKeys.map((k) => Phaser.Input.Keyboard.JustDown(k)).some(Boolean);
    const jumpHeld = this.jumpKeys.some((k) => k.isDown);
    this.coyote = body.blocked.down ? COYOTE_TIME : this.coyote - dt;
    this.jumpBuffer = jumpPressed ? JUMP_BUFFER : this.jumpBuffer - dt;

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      p.setVelocityY(-this.jumpVelocity);
      this.jumpBuffer = 0;
      this.coyote = 0;
    }
    if (!jumpHeld && body.velocity.y < -this.jumpVelocity * SHORT_HOP) {
      p.setVelocityY(-this.jumpVelocity * SHORT_HOP);
    }

    // Fell into a pit
    if (p.y > this.level.heightTiles * TILE + 16) this.die();

    this.updateEnemies();
    this.darkness?.update(p);
  }

  updateEnemies() {
    this.enemies.children.each((e) => {
      if (!e.active) return;
      const b = e.body;
      if (b.blocked.left) e.dir = 1;
      else if (b.blocked.right) e.dir = -1;
      else if (b.blocked.down) {
        const aheadX = e.dir > 0 ? b.right + 1 : b.left - 1;
        if (!this.layer.getTileAtWorldXY(aheadX, b.bottom + 1)) e.dir *= -1; // ledge ahead
      }
      e.setVelocityX(e.dir * ENEMY_SPEED * enemyScale(this.mods)); // Speedy speeds them up
      e.setFlipX(e.dir > 0);
    });
  }

  collectCoin(coin) {
    coin.disableBody(true, true);
    this.coinsCollected++;
    this.refreshObjective();
    this.updateHud();
  }

  // Twists Collector and Killer: how many coins / enemies are still left.
  objectiveLeft() {
    if (this.objective === 'collect') return this.level.coins.length - this.coinsCollected;
    if (this.objective === 'kill') return this.enemies.countActive();
    return 0;
  }

  // The flag fades while the objective isn't done.
  refreshObjective() {
    this.flag.setAlpha(this.objectiveLeft() > 0 ? LOCKED_ALPHA : 1);
  }

  reachFlag() {
    const left = this.objectiveLeft();
    if (!left) {
      this.finish(true);
      return;
    }
    if (this.time.now > this.hintCooldown) {
      this.hint.show(leftMessage(this.objective, this.theme, left));
      this.hintCooldown = this.time.now + 1000;
    }
  }

  touchEnemy(enemy) {
    if (this.dying || this.finished) return;
    const p = this.player.body;
    const stomp = p.velocity.y > 0 && p.bottom <= enemy.body.top + 6;
    if (stomp) {
      enemy.disableBody(true, true);
      this.player.setVelocityY(-this.jumpVelocity * STOMP_BOUNCE);
      this.refreshObjective();
      this.updateHud();
    } else {
      this.die();
    }
  }

  die() {
    if (this.dying || this.finished) return;
    this.dying = true;
    this.lives--;
    this.updateHud();
    this.player.disableBody(false, false);
    this.player.setTint(0xff4040);
    this.cameras.main.shake(150, 0.01);

    this.time.delayedCall(700, () => {
      if (this.lives <= 0) {
        this.finish(false);
        return;
      }
      this.player.clearTint();
      this.player.enableBody(true, this.spawnPoint.x, this.spawnPoint.y, true, true);
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.dying = false;
    });
  }

  finish(cleared) {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    const seconds = Math.round((this.time.now - this.startTime) / 1000);
    this.time.delayedCall(cleared ? 600 : 300, () =>
      endStage(this, this.run, {
        cleared,
        coins: this.coinsCollected,
        totalCoins: this.level.coins.length,
        seconds,
        livesLeft: this.lives,
      }),
    );
  }

  updateHud() {
    const gap = this.objective === 'kill' ? '  ' : '   ';
    const foes = this.objective === 'kill' ? `${gap}FOES ${this.enemies.countActive()}` : '';
    this.hud.setText(
      `LIVES ${this.lives}${gap}${this.theme.names.hudCoin} ${this.coinsCollected}/${this.level.coins.length}${foes}${gap}STAGE ${this.run.stage}/${this.run.stages}`,
    );
  }
}
