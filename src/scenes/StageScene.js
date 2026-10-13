import Phaser from 'phaser';
import { buildStage } from '../gen/buildStage.js';
import { content } from '../data/index.js';
import { twistSettings, objectiveOf } from '../engine/content.js';
import { stageSetup } from '../engine/run.js';
import { describeRun } from '../engine/spin.js';
import { addDarkness, GLOW_DEPTH } from '../engine/darkness.js';
import { endStage } from '../engine/startRun.js';
import { runSpeed, enemyScale, windScale } from '../engine/speed.js';
import { addWind } from '../ui/wind.js';
import { pixelText } from '../ui/font.js';
import { addGlitchFx } from '../ui/glitch.js';
import { addObjectiveHint, leftMessage, LOCKED_ALPHA } from '../ui/objective.js';
import { makePlaceholderTextures, tex } from '../art/placeholder.js';
import { makeLevelTextures } from '../art/levelPlaceholder.js';
import { addBossBar, addPowerLabel, addSparkle, stepRunner, bounce, POWER_NAMES } from '../ui/levelHud.js';
import { safeSpot, awayFromPit } from '../engine/powerDrop.js';

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
// Hoppers (genre level 2+): creep along and hop every so often.
const HOPPER_SPEED = 22;
const HOPPER_HOP = 240;       // px/s upward (~2 tiles)
const HOPPER_EVERY = 1.3;     // s between hops
// The boss (genre level 3): walks at you, crouches, then leaps at you.
// Stomp it BOSS_HP times. Each stomp makes it a bit faster.
const BOSS_HP = 3;
const BOSS_SPEED = 30;        // px/s, +BOSS_ANGER per stomp taken
const BOSS_ANGER = 0.35;
const BOSS_CROUCH = 0.55;     // s it crouches (and lights up) before a leap
const BOSS_LEAP = [330, 95];  // px/s up, px/s toward you
const BOSS_LEAP_EVERY = 2.2;  // s between leaps
const BOSS_HURT_TIME = 0.9;   // s it can't be stomped again after a stomp
// A dropped power-up hops out of its carrier; from stage 4 it runs from you.
const DROP_POP = 200;         // px/s upward when it drops
const DROP_FLEE_SPEED = 70;   // px/s (you run at 110)
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
    this.setup = stageSetup(content, data.run); // twist rules + genre level, power-up, boss
    this.power = null;    // the power-up you're holding (genre level 2+)
    this.airJumps = 0;
    this.boss = null;
  }

  create() {
    const theme = this.theme;
    const mods = this.mods;
    const t = (name) => tex(theme, name);
    makePlaceholderTextures(this, theme);
    makeLevelTextures(this, theme);

    const level = buildStage(this.setup);
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
    level.enemies.forEach(({ x, y, kind }, i) => {
      const key = t(kind === 'hopper' ? 'hopper' : 'enemy');
      const h = this.textures.getFrame(key).height;
      const e = this.enemies.create(x * TILE + 8, (y + 1) * TILE - h / 2, key);
      e.kind = kind;
      e.dir = -1;
      e.hopTimer = HOPPER_EVERY * (0.4 + 0.6 * ((x * 7 + y) % 5) / 4); // not all in step
      e.carrier = level.powerUp?.carrier === i; // drops the power-up when stomped
    });

    // Power-up (genre level 2+): carried by one enemy (a sparkle marks it),
    // dropped when you stomp it.
    this.powerUp = null;
    this.sparkle = addSparkle(this, t('sparkle'));
    const carrier = this.enemies.getChildren().find((e) => e.carrier);
    if (carrier) this.sparkle.follow(carrier);

    // Boss (genre level 3, the run's last stage): waits in its room.
    this.bossGroup = this.physics.add.group();
    if (level.boss) {
      const key = t('pboss');
      const b = this.bossGroup.create(level.boss.x * TILE + 8, (level.boss.y + 1) * TILE - 12, key);
      b.setDepth(GLOW_DEPTH); // always lit, even in the dark
      b.hp = BOSS_HP;
      b.state = 'wait';
      b.timer = 0;
      b.hurt = 0;
      b.home = { x: b.x, y: b.y };
      this.boss = b;
    }

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
    this.physics.add.collider(this.bossGroup, this.layer);
    this.physics.add.overlap(this.player, this.bossGroup, (_p, b) => this.touchBoss(b));

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
    this.wind = addWind(this, mods, theme.palette.text); // twist Windy, or null
    this.hud = pixelText(this, 4, 4, '', { color: theme.palette.text })
      .setScrollFactor(0)
      .setDepth(10);
    this.powerLabel = addPowerLabel(this, theme.palette.text);
    this.hint = addObjectiveHint(this, theme.palette.text);
    this.bossBar = addBossBar(this, theme.palette.text);
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
    let runTarget = left === right ? 0 : left ? -speed : speed;
    // Twist Windy: faster with the wind, slower against it, in the air too.
    if (this.wind) runTarget *= windScale(this.mods, this.wind.dir, Math.sign(runTarget));
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

    if (body.blocked.down) this.airJumps = this.power === 'double-jump' ? 1 : 0;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      p.setVelocityY(-this.jumpVelocity);
      this.jumpBuffer = 0;
      this.coyote = 0;
    } else if (jumpPressed && this.airJumps > 0 && !body.blocked.down) {
      // Power-up Double Jump: one more jump in the air, exactly as strong.
      p.setVelocityY(-this.jumpVelocity);
      this.airJumps--;
      this.jumpBuffer = 0;
      this.puff(p.x, p.body.bottom);
    }
    if (!jumpHeld && body.velocity.y < -this.jumpVelocity * SHORT_HOP) {
      p.setVelocityY(-this.jumpVelocity * SHORT_HOP);
    }

    // Fell into a pit
    if (p.y > this.level.heightTiles * TILE + 16) this.die();

    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateDrop();
    this.sparkle.update(this.time.now);
    this.darkness?.update(p);
    this.wind?.update(dt);
  }

  updateEnemies(dt) {
    this.enemies.children.each((e) => {
      if (!e.active) return;
      const b = e.body;
      if (b.blocked.left) e.dir = 1;
      else if (b.blocked.right) e.dir = -1;
      else if (b.blocked.down) {
        const aheadX = e.dir > 0 ? b.right + 1 : b.left - 1;
        if (!this.layer.getTileAtWorldXY(aheadX, b.bottom + 1)) e.dir *= -1; // ledge ahead
      }
      const fast = enemyScale(this.mods); // Speedy speeds them up
      if (e.kind === 'hopper') {
        // Creeps along, and hops straight up every so often (never off a ledge:
        // it only moves sideways while it's on the ground).
        e.hopTimer -= dt * fast;
        if (b.blocked.down && e.hopTimer <= 0) {
          e.setVelocityY(-HOPPER_HOP);
          e.hopTimer = HOPPER_EVERY;
        }
        e.setVelocityX(b.blocked.down ? e.dir * HOPPER_SPEED * fast : 0);
      } else {
        e.setVelocityX(e.dir * ENEMY_SPEED * fast);
      }
      e.setFlipX(e.dir > 0);
    });
  }

  // ---------- Power-up ----------

  // The carrier was beaten: the power-up appears on the nearest safe floor
  // (not mid-air, not on spikes, not over a pit) and pops up out of it.
  dropPower(x, y) {
    const kind = this.level.powerUp.kind;
    const spikes = new Set(this.level.spikes.map((p) => `${p.x},${p.y}`));
    const spot = safeSpot(this.level.solid, spikes, Math.floor(x / TILE), Math.floor(y / TILE));
    this.sparkle.stop();
    if (!spot) return;
    const d = this.physics.add.sprite(spot.x * TILE + 8, (spot.y + 1) * TILE - 6, tex(this.theme, `power-${kind}`)).setDepth(GLOW_DEPTH);
    d.kind = kind;
    d.setVelocityY(-DROP_POP);
    d.setCollideWorldBounds(true); // the world has no floor, so pits still take it
    this.physics.add.collider(d, this.layer);
    this.physics.add.overlap(this.player, d, () => this.takePower());
    this.physics.add.overlap(d, this.enemies, (_d, e) => bounce(d, e.x));
    this.physics.add.overlap(d, this.bossGroup, (_d, e) => bounce(d, e.x));
    this.spikeSet = spikes;
    this.powerUp = d;
  }

  // From stage 4 a dropped power-up runs: away from the nearest pit first,
  // then bouncing off walls, spikes and enemies. It can fall into a pit.
  updateDrop() {
    const d = this.powerUp;
    if (!d?.active) return;
    if (d.y > this.level.heightTiles * TILE + 16) {
      d.destroy();
      this.powerUp = null;
      this.hint.show(`${POWER_NAMES[d.kind]} LOST`);
      return;
    }
    const col = Math.floor(d.x / TILE);
    const row = Math.floor((d.body.bottom - 1) / TILE);
    stepRunner(d, {
      stage: this.run.stage,
      playerX: this.player.x,
      speed: DROP_FLEE_SPEED * enemyScale(this.mods),
      startDir: () => awayFromPit(this.level.solid, col, row),
      spikeAhead: (dir) => {
        const ax = Math.floor((dir > 0 ? d.body.right + 2 : d.body.left - 2) / TILE);
        return this.spikeSet.has(`${ax},${row}`);
      },
    });
  }

  takePower() {
    if (!this.powerUp?.active || this.dying) return;
    this.power = this.powerUp.kind;
    this.powerUp.destroy();
    this.powerUp = null;
    this.player.setTexture(tex(this.theme, `player-${this.power}`));
    this.hint.show(`${POWER_NAMES[this.power]}!`);
    this.cameras.main.flash(120, 255, 255, 255);
    this.updateHud();
  }

  // Losing a life loses the power-up.
  losePower() {
    if (!this.power) return;
    this.power = null;
    this.airJumps = 0;
    this.player.setTexture(tex(this.theme, 'player'));
    this.updateHud();
  }

  // A little dust cloud where a double jump happened.
  puff(x, y) {
    const c = this.add.circle(x, y, 4, Phaser.Display.Color.HexStringToColor(this.theme.palette.text).color, 0.8);
    this.tweens.add({ targets: c, scale: 2, alpha: 0, duration: 250, onComplete: () => c.destroy() });
  }

  // ---------- Boss ----------

  bossAlive() {
    return !!this.boss?.active;
  }

  updateBoss(dt) {
    const b = this.boss;
    if (!b?.active) return;
    const room = this.level.bossRoom;
    const p = this.player;
    const inRoom = p.x >= room.x0 * TILE;

    if (b.state === 'wait') {
      b.setVelocityX(0);
      if (!inRoom) return;
      // The fight starts: from now on a lost life puts you back at the room's left edge.
      b.state = 'walk';
      b.timer = BOSS_LEAP_EVERY;
      this.spawnPoint = { x: room.x0 * TILE + 24, y: this.spawnPoint.y };
      const floor = this.level.solid.findIndex((row) => row[room.x0 + 1]);
      if (floor > 0) this.spawnPoint.y = floor * TILE - 7;
      this.bossBar.show(b.hp, BOSS_HP);
      this.refreshObjective();
      this.cameras.main.shake(200, 0.006);
    }

    const fast = enemyScale(this.mods) * (1 + BOSS_ANGER * (BOSS_HP - b.hp));
    const toward = Math.sign(p.x - b.x) || 1;
    const grounded = b.body.blocked.down;
    b.hurt -= dt;
    b.setAlpha(b.hurt > 0 && Math.floor(b.hurt * 12) % 2 ? 0.4 : 1);

    if (b.state === 'walk') {
      b.setVelocityX(toward * BOSS_SPEED * fast);
      b.setFlipX(toward < 0);
      b.timer -= dt * fast;
      if (b.timer <= 0 && grounded) {
        b.state = 'crouch';
        b.timer = BOSS_CROUCH;
        b.setVelocityX(0);
        b.setTint(Phaser.Display.Color.HexStringToColor(this.theme.palette.coin).color);
      }
    } else if (b.state === 'crouch') {
      b.setVelocityX(0);
      b.timer -= dt;
      if (b.timer <= 0) {
        b.clearTint();
        b.state = 'leap';
        b.setVelocity(toward * BOSS_LEAP[1] * fast, -BOSS_LEAP[0]);
        b.setFlipX(toward < 0);
      }
    } else if (b.state === 'leap' && grounded && b.body.velocity.y >= 0) {
      this.cameras.main.shake(120, 0.006);
      b.state = 'walk';
      b.timer = BOSS_LEAP_EVERY;
    }

    // Keep it in its room.
    const left = room.x0 * TILE + 14;
    const right = room.x1 * TILE - 14;
    if (b.x < left) b.setX(left).setVelocityX(Math.max(0, b.body.velocity.x));
    if (b.x > right) b.setX(right).setVelocityX(Math.min(0, b.body.velocity.x));
  }

  touchBoss(b) {
    if (this.dying || this.finished || !b.active || b.state === 'wait') return;
    const p = this.player.body;
    const stomp = p.velocity.y > 0 && p.bottom <= b.body.top + 8;
    if (!stomp) {
      if (b.hurt <= 0) this.die();
      return;
    }
    this.player.setVelocityY(-this.jumpVelocity * STOMP_BOUNCE);
    if (b.hurt > 0) return; // still flashing from the last stomp: just bounce
    b.hp--;
    b.hurt = BOSS_HURT_TIME;
    this.bossBar.show(b.hp, BOSS_HP);
    this.cameras.main.shake(100, 0.008);
    if (b.hp > 0) return;
    // Down it goes.
    b.disableBody(true, false);
    b.setTint(0xff4040);
    this.tweens.add({ targets: b, alpha: 0, y: b.y + 8, duration: 700, onComplete: () => b.destroy() });
    this.bossBar.hide();
    this.cameras.main.flash(200, 255, 255, 255);
    this.hint.show('THE WAY IS OPEN');
    this.refreshObjective();
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

  // The flag fades while the objective isn't done (or the boss is still up).
  refreshObjective() {
    this.flag.setAlpha(this.objectiveLeft() > 0 || this.bossAlive() ? LOCKED_ALPHA : 1);
  }

  reachFlag() {
    if (this.bossAlive()) {
      if (this.time.now > this.hintCooldown) {
        this.hint.show('DEFEAT THE BOSS');
        this.hintCooldown = this.time.now + 1000;
      }
      return;
    }
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
      if (enemy.carrier) this.dropPower(enemy.x, enemy.y);
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
    this.losePower();
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
      // The boss steps back to where it started, so you don't land on it.
      if (this.bossAlive() && this.boss.state !== 'wait') {
        this.boss.setPosition(this.boss.home.x, this.boss.home.y).setVelocity(0, 0).clearTint();
        this.boss.state = 'walk';
        this.boss.timer = BOSS_LEAP_EVERY;
      }
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
    this.powerLabel?.set(this.power);
  }
}
