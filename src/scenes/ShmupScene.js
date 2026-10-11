import Phaser from 'phaser';
import { buildShmup } from '../gen/buildShmup.js';
import { content } from '../data/index.js';
import { twistSettings } from '../engine/content.js';
import { describeRun } from '../engine/spin.js';
import { addDarkness, GLOW_DEPTH } from '../engine/darkness.js';
import { endStage } from '../engine/startRun.js';
import { makePlaceholderTextures, tex } from '../art/placeholder.js';
import { makeShmupTextures } from '../art/shmupPlaceholder.js';

const LANE = 16;

// Feel knobs — tweak these while playtesting.
const SHIP_SPEED = 120;        // px/s
const SHOT_SPEED = 260;
const FIRE_RATE = 0.15;        // seconds between shots while holding fire
const INVULNERABLE_TIME = 1.5; // seconds of flicker after getting hit
// Starting lives come from economy.json (plus Extra Life upgrades) and carry
// over from stage to stage.
const DIVE_SPEED = 120;
const ENEMY_SHOT_SPEED = 75;
const TURRET_FIRE_RATE = 1.4;
const TURRET_HOLD_TIME = 5;

const ENEMY = {
  straight: { texture: 'enemy', hp: 1, speed: 55 },
  weave: { texture: 'enemy', hp: 1, speed: 40 },
  dive: { texture: 'ghost', hp: 1, speed: 35 },
  turret: { texture: 'gargoyle', hp: 3, speed: 40 },
};

export default class ShmupScene extends Phaser.Scene {
  constructor() {
    // No gravity in space (the platformer keeps its gravity)
    super({ key: 'Shmup', physics: { arcade: { gravity: { x: 0, y: 0 } } } });
  }

  // data.run: see src/engine/run.js (reels, bet, stage number, lives left)
  init(data) {
    this.run = data.run;
    this.seed = data.run.seed;
    this.theme = content.themes[data.run.theme];
    this.mods = twistSettings(content, data.run.twist, 'shmup'); // the twist's settings
    this.lives = data.run.lives;
    this.coinsCollected = 0;
    this.elapsed = 0;
    this.nextEvent = 0;
    this.fireCooldown = 0;
    this.invulnerable = 0;
    this.finished = false;
  }

  create() {
    const theme = this.theme;
    const mods = this.mods;
    makePlaceholderTextures(this, theme); // bats and shards come from the platformer set
    makeShmupTextures(this, theme);
    this.t = (name) => tex(theme, name);

    const level = buildShmup({ seed: this.seed, stage: this.run.stage });
    this.level = level;
    console.log(`[8-Bit Roulette] ${describeRun(content, this.run)} · stage ${this.run.stage}/${this.run.stages} · seed ${this.seed} · cost ${level.cost}/${level.budget} · ${level.duration}s\n  ${level.waves.join(' → ')}`);

    const W = this.scale.width;
    const H = this.scale.height;
    this.cameras.main.setBackgroundColor(theme.palette.sky);

    // Scrolling starfield (cosmetic, so it doesn't need the seed)
    const starColor = Phaser.Display.Color.HexStringToColor(theme.palette.groundTop).color;
    this.stars = Array.from({ length: 40 }, () => {
      const s = this.add.rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), 1, 1, starColor);
      s.speed = Phaser.Math.Between(10, 40);
      return s;
    });

    // Player ship with a small, forgiving hitbox
    this.player = this.physics.add.sprite(W / 2, H - 24, this.t('ship'));
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(6, 6);

    this.shots = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.enemyShots = this.physics.add.group();
    this.coins = this.physics.add.group();

    this.physics.add.overlap(this.shots, this.enemies, (shot, enemy) => this.hitEnemy(shot, enemy));
    this.physics.add.overlap(this.player, this.enemies, () => this.hurt());
    this.physics.add.overlap(this.player, this.enemyShots, (_p, shot) => {
      shot.destroy();
      this.hurt();
    });
    this.physics.add.overlap(this.player, this.coins, (_p, coin) => {
      coin.destroy();
      this.coinsCollected++;
      this.updateHud();
    });

    // Twist: Darkness. Anything listed under "glow" stays visible in the dark.
    this.darkness = null; // the scene object is reused between runs, so reset these
    this.glow = null;
    if (mods.lightRadius) {
      this.darkness = addDarkness(this, mods);
      this.glow = new Set(mods.glow || []);
    }

    // Input: arrows to fly, hold Space or Z to fire
    this.cursors = this.input.keyboard.createCursorKeys();
    this.fireKeys = [this.cursors.space, this.input.keyboard.addKey('Z')];

    this.hud = this.add
      .text(4, 4, '', { fontFamily: 'monospace', fontSize: '8px', color: theme.palette.text })
      .setScrollFactor(0)
      .setDepth(10);
    this.updateHud();
  }

  update(_time, delta) {
    if (this.finished) return;
    const dt = delta / 1000;
    const W = this.scale.width;
    const H = this.scale.height;
    this.elapsed += dt;

    this.stars.forEach((s) => {
      s.y += s.speed * dt;
      if (s.y > H) {
        s.y = 0;
        s.x = Phaser.Math.Between(0, W);
      }
    });

    // Fly (diagonals aren't faster than straight lines)
    const c = this.cursors;
    const dx = (c.right.isDown ? 1 : 0) - (c.left.isDown ? 1 : 0);
    const dy = (c.down.isDown ? 1 : 0) - (c.up.isDown ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    const vx = (dx / len) * SHIP_SPEED;
    const vy = (dy / len) * SHIP_SPEED;
    if (this.mods.shipResponse !== undefined) {
      // Twist: Low Gravity. The ship eases toward the speed you're pushing
      // for instead of snapping to it, so it drifts.
      const k = Math.min(1, this.mods.shipResponse * dt);
      const b = this.player.body.velocity;
      this.player.setVelocity(b.x + (vx - b.x) * k, b.y + (vy - b.y) * k);
    } else {
      this.player.setVelocity(vx, vy);
    }

    // Fire
    this.fireCooldown -= dt;
    if (this.fireKeys.some((k) => k.isDown) && this.fireCooldown <= 0) {
      const shot = this.shots.create(this.player.x, this.player.y - 8, this.t('shot'));
      shot.setVelocityY(-SHOT_SPEED);
      this.fireCooldown = FIRE_RATE;
    }

    // Flicker while invulnerable
    if (this.invulnerable > 0) {
      this.invulnerable -= dt;
      this.player.setAlpha(this.invulnerable > 0 && Math.floor(this.invulnerable * 10) % 2 ? 0.3 : 1);
    }

    // Spawn everything whose time has come
    const events = this.level.events;
    while (this.nextEvent < events.length && events[this.nextEvent].time <= this.elapsed) {
      this.spawn(events[this.nextEvent++]);
    }

    this.updateEnemies(dt);
    this.darkness?.update(this.player);

    // Clean up anything that left the screen
    [this.shots, this.enemyShots, this.coins, this.enemies].forEach((group) => {
      group.getChildren().slice().forEach((o) => {
        if (o.y < -24 || o.y > H + 24 || o.x < -24 || o.x > W + 24) o.destroy();
      });
    });

    // Cleared: every wave has spawned and nothing hostile is left
    if (this.nextEvent >= events.length && this.elapsed > this.level.duration && this.enemies.countActive() === 0) {
      this.finish(true);
    }
  }

  spawn(ev) {
    const x = ev.lane * LANE + LANE / 2;
    if (ev.kind === 'coin') {
      const coin = this.coins.create(x, -8, this.t('coin')).setVelocityY(40);
      this.glowIf('coins', coin);
      return;
    }
    const def = ENEMY[ev.kind];
    const enemy = this.enemies.create(x, -8, this.t(def.texture));
    this.glowIf('enemies', enemy);
    enemy.kind = ev.kind;
    enemy.hp = def.hp;
    enemy.age = 0;
    enemy.state = 'enter';
    enemy.setVelocityY(def.speed);
  }

  updateEnemies(dt) {
    this.enemies.getChildren().forEach((e) => {
      e.age += dt;

      if (e.kind === 'weave') {
        e.setVelocityX(Math.cos(e.age * 3) * 60); // ~20px side to side
      } else if (e.kind === 'dive' && e.state === 'enter' && e.y > 40) {
        e.state = 'dive';
        this.physics.moveToObject(e, this.player, DIVE_SPEED);
      } else if (e.kind === 'turret') {
        if (e.state === 'enter' && e.y > 44) {
          e.state = 'hold';
          e.setVelocity(0, 0);
          e.holdTime = 0;
          e.fireTimer = 0.6;
        } else if (e.state === 'hold') {
          e.holdTime += dt;
          e.fireTimer -= dt;
          if (e.fireTimer <= 0) {
            const shot = this.enemyShots.create(e.x, e.y + 6, this.t('eshot'));
            this.glowIf('enemyShots', shot);
            this.physics.moveToObject(shot, this.player, ENEMY_SHOT_SPEED);
            e.fireTimer = TURRET_FIRE_RATE;
          }
          if (e.holdTime > TURRET_HOLD_TIME) {
            e.state = 'leave';
            e.setVelocityY(ENEMY.turret.speed);
          }
        }
      }
    });
  }

  // Darkness twist: lift this object above the dark if the twist says it glows.
  glowIf(kind, obj) {
    if (this.glow?.has(kind)) obj.setDepth(GLOW_DEPTH);
  }

  hitEnemy(shot, enemy) {
    if (!shot.active || !enemy.active) return;
    shot.destroy();
    enemy.hp--;
    if (enemy.hp <= 0) {
      enemy.destroy();
      return;
    }
    enemy.setTintFill(0xffffff); // flash white when hit
    this.time.delayedCall(60, () => enemy.active && enemy.clearTint());
  }

  hurt() {
    if (this.invulnerable > 0 || this.finished) return;
    this.lives--;
    this.updateHud();
    this.cameras.main.shake(150, 0.01);
    if (this.lives <= 0) {
      this.player.setVisible(false);
      this.finish(false);
      return;
    }
    this.invulnerable = INVULNERABLE_TIME;
  }

  finish(cleared) {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    this.time.delayedCall(cleared ? 600 : 500, () =>
      endStage(this, this.run, {
        cleared,
        coins: this.coinsCollected,
        totalCoins: this.level.coins,
        seconds: Math.round(this.elapsed),
        livesLeft: this.lives,
      }),
    );
  }

  updateHud() {
    this.hud.setText(`LIVES ${this.lives}   ${this.theme.names.hudCoin} ${this.coinsCollected}/${this.level.coins}   STAGE ${this.run.stage}/${this.run.stages}`);
  }
}
