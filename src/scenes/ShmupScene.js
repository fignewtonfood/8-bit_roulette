import Phaser from 'phaser';
import { buildShmup, stagePace } from '../gen/buildShmup.js';
import { content } from '../data/index.js';
import { twistSettings, objectiveOf } from '../engine/content.js';
import { stageSetup } from '../engine/run.js';
import { describeRun } from '../engine/spin.js';
import { addDarkness, GLOW_DEPTH } from '../engine/darkness.js';
import { endStage } from '../engine/startRun.js';
import { enemyScale } from '../engine/speed.js';
import { addGravity } from '../ui/gravityArrow.js';
import { pixelText } from '../ui/font.js';
import { addGlitchFx } from '../ui/glitch.js';
import { addObjectiveHint } from '../ui/objective.js';
import { makePlaceholderTextures, tex } from '../art/placeholder.js';
import { makeShmupTextures } from '../art/shmupPlaceholder.js';
import { makeLevelTextures } from '../art/levelPlaceholder.js';
import { addBossBar, addPowerLabel, addSparkle, POWER_NAMES, FLEE_FROM_STAGE } from '../ui/levelHud.js';

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
  splitter: { texture: 'splitter', hp: 2, speed: 42 },   // genre level 2+
  half: { texture: 'shard', hp: 1, speed: 60 },          // what a splitter breaks into
};
const HALF_SPREAD = 70;        // px/s sideways the halves fly apart
// Power-up Spread Shot: two extra shots angled out to the sides.
const SPREAD_SIDEWAYS = 70;    // px/s
const POWER_FALL = 35;         // px/s the dropped power-up drifts down
// From stage 4 a dropped power-up shoots off away from you and bounces off
// the edges of the screen POWER_BOUNCES times, then leaves. Faster on stage 5.
const POWER_RUN = { 4: 70, 5: 100 }; // px/s by stage (you fly at 120)
const POWER_BOUNCES = 3;
// The boss (genre level 3): slides side to side near the top, firing aimed
// three-shot spreads, and every few volleys a ring. Faster when it's hurt.
const BOSS_HP = 40;
// Stage 5 (the end of a Long run): a tougher boss with one more attack, a
// spiral: a stream of shots that turns as it fires, every SPIRAL_EVERY volleys.
const BOSS_HP_STAGE5 = 60;
const SPIRAL_EVERY = 3;
const SPIRAL_SHOTS = 14;       // shots in one spiral
const SPIRAL_TIME = 1.4;       // s it takes to fire them
const SPIRAL_TURN = 0.55;      // radians between shots
// Bosses fought on stage 3 or 5 are tougher still: hp multiplies the boss's
// health (stage 5's on top of BOSS_HP_STAGE5), speed makes it move and
// shoot that much faster.
const BOSS_BOOST = { 3: { hp: 2, speed: 1 }, 5: { hp: 2, speed: 1.25 } };
const bossBoost = (stage) => BOSS_BOOST[stage] || { hp: 1, speed: 1 };
const BOSS_Y = 48;             // where it stops coming down (clear of the HUD)
const BOSS_SWAY = [80, 0.8];   // px side to side, how fast
const BOSS_VOLLEY = [1.4, 1.0]; // s between volleys: healthy, under half
const BOSS_RING_EVERY = 4;     // every Nth volley is a ring
const BOSS_RING = 10;          // shots in a ring
const BOSS_SHOT_SPEED = 70;

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
    this.mods = twistSettings(content, data.run.twist, 'shmup', data.run.levels?.twist); // the twist's settings
    this.objective = objectiveOf(content, data.run.twist); // Collector / Killer, or null
    this.lives = data.run.lives;
    this.coinsCollected = 0;
    this.elapsed = 0;
    this.nextEvent = 0;
    this.fireCooldown = 0;
    this.invulnerable = 0;
    this.finished = false;
    this.setup = stageSetup(content, data.run); // twist rules + genre level, power-up, boss
    // Enemies fly, dive and shoot faster on later stages (SHMUP_PACE in
    // buildShmup.js), and faster again with Speedy.
    this.pace = enemyScale(this.mods) * stagePace(data.run.stage);
    this.power = null;
    this.boss = null;
    this.bossDown = false;
  }

  create() {
    const theme = this.theme;
    const mods = this.mods;
    makePlaceholderTextures(this, theme); // bats and shards come from the platformer set
    makeShmupTextures(this, theme);
    makeLevelTextures(this, theme);
    this.t = (name) => tex(theme, name);

    const level = buildShmup(this.setup);
    this.level = level;
    console.log(`[8-Bit Roulette] ${describeRun(content, this.run)} · stage ${this.run.stage}/${this.run.stages} · seed ${this.seed} · cost ${level.cost}/${level.budget} · ${level.duration}s\n  ${level.waves.join(' → ')}`);

    const W = this.scale.width;
    const H = this.scale.height;
    this.cameras.main.setBackgroundColor(theme.palette.sky);
    addGlitchFx(this, this.run);

    // Scrolling starfield (cosmetic, so it doesn't need the seed)
    const starColor = Phaser.Display.Color.HexStringToColor(theme.palette.groundTop).color;
    this.stars = Array.from({ length: 40 }, () => {
      const s = this.add.rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), 1, 1, starColor);
      s.speed = Phaser.Math.Between(10, 40);
      return s;
    });

    // Player ship with a small, forgiving hitbox
    this.player = this.physics.add.sprite(W / 2, H - 24, this.t('ship'));
    this.sparkle = addSparkle(this, this.t('sparkle'));
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(6, 6);

    this.shots = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.enemyShots = this.physics.add.group();
    this.coins = this.physics.add.group();
    this.powerUps = this.physics.add.group();
    this.bosses = this.physics.add.group();

    this.physics.add.overlap(this.shots, this.enemies, (shot, enemy) => this.hitEnemy(shot, enemy));
    this.physics.add.overlap(this.player, this.enemies, () => this.hurt());
    this.physics.add.overlap(this.player, this.enemyShots, (_p, shot) => {
      shot.destroy();
      this.hurt();
    });
    this.physics.add.overlap(this.shots, this.bosses, (shot, boss) => this.hitBoss(shot, boss));
    this.physics.add.overlap(this.player, this.bosses, () => this.hurt());
    this.physics.add.overlap(this.player, this.powerUps, (_p, power) => this.takePower(power));
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

    // Input: arrows to fly, hold Z or X to fire (the attack keys in every genre).
    // There's no jump here, so Space fires too.
    this.cursors = this.input.keyboard.createCursorKeys();
    this.fireKeys = [this.input.keyboard.addKey('Z'), this.input.keyboard.addKey('X'), this.cursors.space];

    this.gravity = addGravity(this, mods, theme.palette.text, this.seed); // twist Gravity, or null
    this.hud = pixelText(this, 4, 4, '', { color: theme.palette.text })
      .setScrollFactor(0)
      .setDepth(10);
    this.hint = addObjectiveHint(this, theme.palette.text);
    this.bossBar = addBossBar(this, theme.palette.text);
    this.powerLabel = addPowerLabel(this, theme.palette.text);
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
    const shipSpeed = SHIP_SPEED * (this.mods.shipScale ?? 1); // twists Speedy and Mud
    // Twist Gravity: the pull is added to where you steer. It's weaker than
    // the ship, so you can always fly against it.
    const [gx, gy] = this.gravity ? this.gravity.vector() : [0, 0];
    const vx = (dx / len) * shipSpeed + gx;
    const vy = (dy / len) * shipSpeed + gy;
    if (this.mods.shipGrip !== undefined) {
      // Twist: Slippery. Steering bites quickly, but let go and the ship
      // keeps sliding.
      const steering = dx !== 0 || dy !== 0;
      const k = Math.min(1, (steering ? this.mods.shipGrip : this.mods.shipStop ?? this.mods.shipGrip) * dt);
      const b = this.player.body.velocity;
      this.player.setVelocity(b.x + (vx - b.x) * k, b.y + (vy - b.y) * k);
    } else if (this.mods.shipResponse !== undefined) {
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
      // Spread Shot adds two angled shots to the straight one.
      const sideways = this.power === 'spread-shot' ? [0, -SPREAD_SIDEWAYS, SPREAD_SIDEWAYS] : [0];
      for (const vx of sideways) {
        const shot = this.shots.create(this.player.x, this.player.y - 8, this.t('shot'));
        shot.setVelocity(vx, -SHOT_SPEED);
      }
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
    this.updateBoss(dt);
    this.updateDrop();
    this.sparkle.update(this.time.now);
    this.darkness?.update(this.player);
    this.gravity?.update(dt);

    // Clean up anything that left the screen. Twists Collector and Killer:
    // a coin or an enemy that gets away costs a life.
    const missable = { collect: this.coins, kill: this.enemies }[this.objective];
    // (A splitter's halves don't count: they fly apart, you can't catch both.)
    [this.shots, this.enemyShots, this.coins, this.enemies, this.powerUps].forEach((group) => {
      group.getChildren().slice().forEach((o) => {
        if (o.y < -24 || o.y > H + 24 || o.x < -24 || o.x > W + 24) {
          o.destroy();
          if (group === missable && o.kind !== 'half') this.missedObjective();
        }
      });
    });
    if (this.finished) return;

    // Cleared: every wave has spawned, nothing hostile is left, and the boss
    // (genre level 3) is down.
    const bossDone = this.level.bossAt === null || this.bossDown;
    if (this.nextEvent >= events.length && this.elapsed > this.level.duration && this.enemies.countActive() === 0 && bossDone) {
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
    enemy.carrier = !!ev.carrier; // drops the power-up when shot down
    if (enemy.carrier) this.sparkle.follow(enemy);
    enemy.hp = def.hp;
    enemy.age = 0;
    enemy.state = 'enter';
    enemy.setVelocityY(def.speed * this.pace); // Speedy speeds enemies up
  }

  updateEnemies(dt) {
    this.enemies.getChildren().forEach((e) => {
      e.age += dt;

      if (e.kind === 'weave') {
        const f = this.pace;
        e.setVelocityX(Math.cos(e.age * 3 * f) * 60 * f); // ~20px side to side (Speedy: same width, quicker)
      } else if (e.kind === 'dive' && e.state === 'enter' && e.y > 40) {
        e.state = 'dive';
        this.physics.moveToObject(e, this.player, DIVE_SPEED * this.pace);
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
            this.physics.moveToObject(shot, this.player, ENEMY_SHOT_SPEED * this.pace);
            e.fireTimer = TURRET_FIRE_RATE / this.pace;
          }
          if (e.holdTime > TURRET_HOLD_TIME) {
            e.state = 'leave';
            e.setVelocityY(ENEMY.turret.speed * this.pace);
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
      if (enemy.carrier) this.dropPower(enemy.x, enemy.y);
      if (enemy.kind === 'splitter') this.split(enemy);
      enemy.destroy();
      return;
    }
    enemy.setTintFill(0xffffff); // flash white when hit
    this.time.delayedCall(60, () => enemy.active && enemy.clearTint());
  }

  // A splitter breaks into two halves that fly apart and down.
  split(e) {
    const fast = this.pace;
    for (const dir of [-1, 1]) {
      const half = this.enemies.create(e.x + dir * 4, e.y, this.t(ENEMY.half.texture));
      this.glowIf('enemies', half);
      half.kind = 'half';
      half.hp = ENEMY.half.hp;
      half.age = 0;
      half.state = 'enter';
      half.setVelocity(dir * HALF_SPREAD * fast, ENEMY.half.speed * fast);
    }
  }

  // ---------- Power-up ----------

  // The carrier was shot down: the power-up drifts down from where it was.
  // From stage 4 it shoots off away from you instead (see updateDrop).
  dropPower(x, y) {
    const p = this.powerUps.create(x, y, this.t(`power-${this.level.powerUp.kind}`)).setDepth(GLOW_DEPTH);
    p.power = this.level.powerUp.kind;
    this.sparkle.stop();
    const run = POWER_RUN[Math.min(this.run.stage, 5)];
    if (this.run.stage < FLEE_FROM_STAGE || !run) {
      p.setVelocityY(POWER_FALL);
      return;
    }
    // Away from the ship, never straight up or sideways (so it isn't stuck
    // skimming an edge).
    let angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, x, y);
    const tilt = Math.PI / 6;
    angle = Phaser.Math.Angle.Wrap(angle);
    for (const flat of [0, Math.PI, -Math.PI, Math.PI / 2, -Math.PI / 2]) {
      if (Math.abs(Phaser.Math.Angle.Wrap(angle - flat)) < tilt) angle = flat + (Phaser.Math.Angle.Wrap(angle - flat) < 0 ? -tilt : tilt);
    }
    const speed = run * enemyScale(this.mods); // Speedy makes it quicker too
    p.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    p.bounces = 0;
  }

  // A running power-up bounces off the screen's edges POWER_BOUNCES times;
  // after that it flies off the next edge it reaches and is gone.
  updateDrop() {
    const W = this.scale.width;
    const H = this.scale.height;
    const half = 5;
    this.powerUps.getChildren().forEach((p) => {
      if (p.bounces === undefined || p.bounces >= POWER_BOUNCES) return;
      const v = p.body.velocity;
      let hit = false;
      if ((p.x < half && v.x < 0) || (p.x > W - half && v.x > 0)) {
        p.setVelocityX(-v.x);
        hit = true;
      }
      if ((p.y < half && v.y < 0) || (p.y > H - half && v.y > 0)) {
        p.setVelocityY(-v.y);
        hit = true;
      }
      if (hit) {
        p.bounces++;
        p.setTintFill(0xffffff);
        this.time.delayedCall(60, () => p.active && p.clearTint());
      }
    });
  }

  takePower(p) {
    if (!p.active) return;
    this.power = p.power;
    p.destroy();
    this.player.setTexture(this.t(`ship-${this.power}`));
    this.hint.show(`${POWER_NAMES[this.power]}!`);
    this.cameras.main.flash(120, 255, 255, 255);
    this.updateHud();
  }

  // ---------- Boss ----------

  updateBoss(dt) {
    const at = this.level.bossAt;
    if (at === null || this.bossDown) return;
    if (!this.boss) {
      if (this.elapsed < at) return;
      const b = this.bosses.create(this.scale.width / 2, -14, this.t('sboss')).setDepth(GLOW_DEPTH); // always lit
      b.boost = bossBoost(this.run.stage); // tougher on stages 3 and 5
      b.maxHp = (this.run.stage >= 5 ? BOSS_HP_STAGE5 : BOSS_HP) * b.boost.hp;
      b.hp = b.maxHp;
      b.spiral = null;
      b.age = 0;
      b.volley = 0;
      b.timer = 1.5;
      b.setVelocityY(30);
      this.boss = b;
      this.bossBar.show(Math.ceil((b.hp / b.maxHp) * 10), 10);
      this.cameras.main.shake(200, 0.006);
      return;
    }
    const b = this.boss;
    const fast = this.pace * b.boost.speed;
    b.age += dt;
    if (b.y < BOSS_Y) return; // still coming in
    if (b.body.velocity.y) {
      b.setVelocityY(0);
      b.age = 0;
    }
    // Sway side to side around the middle of the screen.
    b.setX(this.scale.width / 2 + Math.sin(b.age * BOSS_SWAY[1] * fast) * BOSS_SWAY[0]);

    // Stage 5's extra attack: a spiral, fired a shot at a time.
    if (b.spiral) {
      b.spiral.wait -= dt * fast;
      if (b.spiral.wait <= 0) {
        this.bossShot(b, b.spiral.angle, BOSS_SHOT_SPEED * fast * 0.85);
        b.spiral.angle += SPIRAL_TURN * b.spiral.dir;
        b.spiral.wait = SPIRAL_TIME / SPIRAL_SHOTS;
        if (--b.spiral.left <= 0) b.spiral = null;
      }
      return; // nothing else while it spirals
    }

    b.timer -= dt * fast;
    if (b.timer > 0) return;
    b.volley++;
    b.timer = b.hp > b.maxHp / 2 ? BOSS_VOLLEY[0] : BOSS_VOLLEY[1];
    const speed = BOSS_SHOT_SPEED * fast;
    if (this.run.stage >= 5 && b.volley % SPIRAL_EVERY === 0 && b.volley % BOSS_RING_EVERY !== 0) {
      b.spiral = { left: SPIRAL_SHOTS, wait: 0, angle: Math.PI / 2 - 1.2, dir: b.volley % 2 ? 1 : -1 };
    } else if (b.volley % BOSS_RING_EVERY === 0) {
      for (let i = 0; i < BOSS_RING; i++) this.bossShot(b, (i / BOSS_RING) * Math.PI * 2 + b.age, speed * 0.8);
    } else {
      const aim = Phaser.Math.Angle.Between(b.x, b.y + 10, this.player.x, this.player.y);
      for (const da of [-0.26, 0, 0.26]) this.bossShot(b, aim + da, speed);
    }
  }

  bossShot(b, angle, speed) {
    const shot = this.enemyShots.create(b.x, b.y + 10, this.t('eshot'));
    this.glowIf('enemyShots', shot);
    shot.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  hitBoss(shot, b) {
    if (!shot.active || !b.active || b.y < BOSS_Y - 10) return; // can't be hit until it's in place
    shot.destroy();
    b.hp--;
    this.bossBar.show(Math.ceil((b.hp / b.maxHp) * 10), 10);
    b.setTintFill(0xffffff);
    this.time.delayedCall(50, () => b.active && b.clearTint());
    if (b.hp > 0) return;
    this.bossDown = true;
    b.destroy();
    this.bossBar.hide();
    this.enemyShots.clear(true, true); // its shots vanish with it
    this.cameras.main.flash(250, 255, 255, 255);
    this.cameras.main.shake(300, 0.012);
  }

  hurt() {
    if (this.invulnerable > 0 || this.finished) return;
    this.lives--;
    // Every hit costs the ship a life, and losing a life loses the power-up.
    if (this.power) {
      this.power = null;
      this.player.setTexture(this.t('ship'));
    }
    this.updateHud();
    this.cameras.main.shake(150, 0.01);
    if (this.lives <= 0) {
      this.player.setVisible(false);
      this.finish(false);
      return;
    }
    this.invulnerable = INVULNERABLE_TIME;
  }

  missedObjective() {
    if (this.finished) return;
    this.lives--;
    this.updateHud();
    this.cameras.main.shake(150, 0.01);
    this.hint.show(this.objective === 'collect' ? `MISSED ${this.theme.names.hudCoin}: -1 LIFE` : 'ONE GOT AWAY: -1 LIFE');
    if (this.lives <= 0) {
      this.player.setVisible(false);
      this.finish(false);
    }
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
    this.powerLabel?.set(this.power);
  }
}
