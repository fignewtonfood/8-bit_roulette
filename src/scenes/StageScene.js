import Phaser from 'phaser';
import theme from '../data/themes/haunted-castle.json';
import { buildStage } from '../gen/buildStage.js';

const TILE = 16;

// Feel knobs — tweak these while playtesting.
const RUN_SPEED = 110;        // px/s
const JUMP_VELOCITY = 300;    // px/s upward; ~3.5 tiles high with gravity 800
const SHORT_HOP = 0.4;        // releasing jump early caps upward speed at 40%
const STOMP_BOUNCE = 0.7;
const COYOTE_TIME = 0.1;      // s you can still jump after walking off a ledge
const JUMP_BUFFER = 0.1;      // s a jump press is remembered before landing
const ENEMY_SPEED = 35;
const START_LIVES = 3;

export default class StageScene extends Phaser.Scene {
  constructor() {
    super('Stage');
  }

  init(data) {
    this.seed = data.seed;
    this.lives = START_LIVES;
    this.coinsCollected = 0;
    this.dying = false;
    this.finished = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
  }

  create() {
    const level = buildStage({ seed: this.seed, stage: 1 });
    this.level = level;
    const worldW = level.widthTiles * TILE;
    const worldH = level.heightTiles * TILE;
    console.log(`[8-Bit Roulette] seed ${this.seed} · cost ${level.cost}/${level.budget}\n  ${level.chunks.join(' → ')}`);

    this.cameras.main.setBackgroundColor(theme.palette.sky);

    // Ground: tile 1 where the block has open air above it, tile 0 otherwise, -1 = empty
    const data = level.solid.map((row, y) =>
      row.map((solid, x) => (solid ? (y > 0 && level.solid[y - 1][x] ? 0 : 1) : -1)),
    );
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage('tiles');
    this.layer = map.createLayer(0, tileset, 0, 0);
    this.layer.setCollision([0, 1]);

    // Hazards, pickups, exit
    this.spikes = this.physics.add.staticGroup();
    level.spikes.forEach(({ x, y }) => this.spikes.create(x * TILE + 8, y * TILE + 12, 'spike'));

    this.coins = this.physics.add.staticGroup();
    level.coins.forEach(({ x, y }) => this.coins.create(x * TILE + 8, y * TILE + 8, 'coin'));

    const f = level.flag;
    this.flag = this.physics.add.staticImage(f.x * TILE + 8, (f.y + 1) * TILE - 16, 'flag');

    // Enemies walk back and forth, turning at walls and ledges
    this.enemies = this.physics.add.group();
    level.enemies.forEach(({ x, y }) => {
      const e = this.enemies.create(x * TILE + 8, (y + 1) * TILE - 5, 'enemy');
      e.dir = -1;
    });

    // Player
    const s = level.playerStart;
    this.spawnPoint = { x: s.x * TILE + 8, y: (s.y + 1) * TILE - 7 };
    this.player = this.physics.add.sprite(this.spawnPoint.x, this.spawnPoint.y, 'player');
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
    this.physics.add.overlap(this.player, this.flag, () => this.finish(true));

    // Camera
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);

    // Input: arrows to move; Up, Space or Z to jump
    this.cursors = this.input.keyboard.createCursorKeys();
    this.jumpKeys = [this.cursors.up, this.cursors.space, this.input.keyboard.addKey('Z')];

    // HUD
    this.hud = this.add
      .text(4, 4, '', { fontFamily: 'monospace', fontSize: '8px', color: theme.palette.text })
      .setScrollFactor(0)
      .setDepth(10);
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
    p.setVelocityX(left === right ? 0 : left ? -RUN_SPEED : RUN_SPEED);
    if (left !== right) p.setFlipX(left);

    // Jump, with coyote time and a jump buffer so it feels fair
    const jumpPressed = this.jumpKeys.map((k) => Phaser.Input.Keyboard.JustDown(k)).some(Boolean);
    const jumpHeld = this.jumpKeys.some((k) => k.isDown);
    this.coyote = body.blocked.down ? COYOTE_TIME : this.coyote - dt;
    this.jumpBuffer = jumpPressed ? JUMP_BUFFER : this.jumpBuffer - dt;

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      p.setVelocityY(-JUMP_VELOCITY);
      this.jumpBuffer = 0;
      this.coyote = 0;
    }
    if (!jumpHeld && body.velocity.y < -JUMP_VELOCITY * SHORT_HOP) {
      p.setVelocityY(-JUMP_VELOCITY * SHORT_HOP);
    }

    // Fell into a pit
    if (p.y > this.level.heightTiles * TILE + 16) this.die();

    this.updateEnemies();
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
      e.setVelocityX(e.dir * ENEMY_SPEED);
      e.setFlipX(e.dir > 0);
    });
  }

  collectCoin(coin) {
    coin.disableBody(true, true);
    this.coinsCollected++;
    this.updateHud();
  }

  touchEnemy(enemy) {
    if (this.dying || this.finished) return;
    const p = this.player.body;
    const stomp = p.velocity.y > 0 && p.bottom <= enemy.body.top + 6;
    if (stomp) {
      enemy.disableBody(true, true);
      this.player.setVelocityY(-JUMP_VELOCITY * STOMP_BOUNCE);
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
      this.scene.start('Result', {
        cleared,
        seed: this.seed,
        coins: this.coinsCollected,
        totalCoins: this.level.coins.length,
        seconds,
      }),
    );
  }

  updateHud() {
    this.hud.setText(
      `LIVES ${this.lives}   SHARDS ${this.coinsCollected}/${this.level.coins.length}   SEED ${this.seed}`,
    );
  }
}
