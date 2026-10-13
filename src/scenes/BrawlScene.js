import Phaser from 'phaser';
import { buildBrawl } from '../gen/buildBrawl.js';
import { ARENA_W } from '../gen/arenas.js';
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
import { makeBrawlTextures } from '../art/brawlPlaceholder.js';
import { makeLevelTextures } from '../art/levelPlaceholder.js';
import { addBossBar, addPowerLabel, addSparkle, stepRunner, bounce, POWER_NAMES } from '../ui/levelHud.js';
import { safeSpot, awayFromPit } from '../engine/powerDrop.js';

// The brawler: walk right through a row of one-screen arenas. Reaching the
// middle of an arena with enemies locks the screen until they're all down.
//
// Controls: arrows move, Up or Space jumps, Z or X attacks.
// Three ground attacks chain into a combo (jab, jab, launcher); attacking in
// the air is a kick. Hitting an enemy that's already in the air pops it back
// up, so launcher → jump → kick juggles (much easier in Low Gravity).

const TILE = 16;
const ARENA_PX = ARENA_W * TILE;

// Feel knobs — tweak these while playtesting.
const GRAVITY = 800;            // px/s² (the Low Gravity twist scales this)
const RUN_SPEED = 90;           // px/s
const JUMP_VELOCITY = 300;      // px/s upward; ~3.5 tiles high with gravity 800 (same as the platformer)
const SHORT_HOP = 0.4;
const COYOTE_TIME = 0.1;
const JUMP_BUFFER = 0.1;
const HEARTS = 3;               // hits per life (a twist can set "hearts")
const HURT_INVULNERABLE = 1.0;  // s of flicker after a hit
const RESPAWN_INVULNERABLE = 2; // s of flicker after losing a life
const HURT_STAGGER = 0.25;      // s without control after a hit
const COMBO_WINDOW = 0.3;       // s after an attack to press again and keep the combo
const JUGGLE_POP = 150;         // px/s upward when you hit an enemy that's in the air
const KNOCKBACK_GRIP = 8;       // how fast a punched enemy stops sliding (Slippery lowers it)
const RESPAWN_WAVE_AT = 1;      // reinforcements arrive when this many enemies are left

// The combo. Times are in seconds; knock and lift are px/s.
const COMBO = [
  { startup: 0.04, active: 0.08, recovery: 0.14, damage: 1, reach: 14, knock: 50, lift: 0, stun: 0.35 },
  { startup: 0.04, active: 0.08, recovery: 0.14, damage: 1, reach: 14, knock: 60, lift: 0, stun: 0.35 },
  { startup: 0.08, active: 0.1, recovery: 0.3, damage: 2, reach: 16, knock: 170, lift: 230, stun: 0.6, finisher: true },
];
const AIR_KICK = { startup: 0.03, active: 0.22, recovery: 0.12, damage: 1, reach: 14, knock: 90, lift: 0, stun: 0.45, air: true };

// Enemies. heavy = shrugs off jabs (only the launcher staggers it) and barely moves when hit.
// guard = blocks hits from the front, except the launcher (genre level 2+);
// it's slow to turn around (turn, in seconds), so you can get behind it.
// boss = the genre level 3 boss: punches like a brute, and leaps to send
// shockwaves along the floor (jump over them).
const ENEMY = {
  grunt: { texture: 'grunt', hp: 3, speed: 40, reach: 14, windup: 0.45, strike: 0.12, cooldown: 1.0 },
  rusher: { texture: 'rusher', hp: 2, speed: 25, chargeSpeed: 150, windup: 0.5, charge: 1.1, cooldown: 1.4 },
  thrower: { texture: 'thrower', hp: 2, speed: 35, windup: 0.4, cooldown: 2.2, keepAway: [70, 120] },
  brute: { texture: 'brute', hp: 6, speed: 24, reach: 18, windup: 0.7, strike: 0.15, cooldown: 1.4, heavy: true },
  shield: { texture: 'shield', hp: 3, speed: 32, reach: 14, windup: 0.5, strike: 0.12, cooldown: 1.1, guard: true, turn: 0.6 },
  boss: { texture: 'bboss', hp: 18, speed: 30, reach: 20, windup: 0.6, strike: 0.15, cooldown: 1.1, heavy: true, boss: true, crouch: 0.55, leap: 300, stompEvery: 3 },
  // Stages 4-5 only (Long runs). Creeps toward you; get close and it crouches
  // (lights up), then hops at you. It only hops where it can land on floor.
  jumper: { texture: 'jumper', hp: 2, speed: 28, windup: 0.35, cooldown: 1.6, range: 100, hop: 260, maxHop: 80 },
};
const BOSS_STAGE5_HP = 1.5; // the boss on stage 5 (the end of a Long run) has this much more health
const FIGHTERS = ['grunt', 'brute', 'shield', 'boss']; // walk up and punch
const SHOCK_SPEED = 120;  // px/s the boss's shockwaves slide along the floor
const POWER_FISTS = 2;    // power-up Power Fists: damage multiplier
const DROP_POP = 200;     // px/s upward when the power-up drops
const DROP_FLEE_SPEED = 60; // px/s it runs from you on stage 4+ (you run at 90)
const APPEAR_TIME = 0.6;  // s enemies flicker in before they can act or be hit
const ROCK_LIFT = 170;    // px/s upward when a rock is thrown
const ROCK_MAX_SPEED = 150;
const CHARGE_RANGE = 150; // px: rushers only charge when you're this close

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const boxOf = (body) => ({ x: body.left, y: body.top, w: body.width, h: body.height });

export default class BrawlScene extends Phaser.Scene {
  constructor() {
    super('Brawl');
  }

  // data.run: see src/engine/run.js (reels, bet, stage number, lives left)
  init(data) {
    this.run = data.run;
    this.seed = data.run.seed;
    this.theme = content.themes[data.run.theme];
    this.mods = twistSettings(content, data.run.twist, 'brawler', data.run.levels?.twist); // the twist's settings
    // Collector (Killer isn't offered here: beating every enemy is already the rule)
    this.objective = objectiveOf(content, data.run.twist);
    this.lives = data.run.lives;
    this.maxHp = this.mods.hearts ?? HEARTS;
    this.hp = this.maxHp;
    this.coinsCollected = 0;
    this.dying = false;
    this.finished = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.facing = 1;
    this.invulnerable = 0;
    this.stagger = 0;
    this.atk = null;
    this.atkQueued = false;
    this.comboStep = 0;
    this.comboTimer = 0;
    this.locked = null;   // the arena you're locked in, if any
    this.goTimer = 0;
    this.setup = stageSetup(content, data.run); // twist rules + genre level, power-up, boss
    this.power = null;
  }

  create() {
    const theme = this.theme;
    const mods = this.mods;
    const t = (name) => tex(theme, name);
    this.t = t;
    makePlaceholderTextures(this, theme);
    makeBrawlTextures(this, theme);
    makeLevelTextures(this, theme);

    const level = buildBrawl(this.setup);
    this.level = level;
    this.worldW = level.widthTiles * TILE;
    this.worldH = level.heightTiles * TILE;
    console.log(`[8-Bit Roulette] ${describeRun(content, this.run)} · stage ${this.run.stage}/${this.run.stages} · seed ${this.seed} · cost ${level.cost}/${level.budget}\n  ${level.names.join(' → ')}`);

    this.cameras.main.setBackgroundColor(theme.palette.sky);
    addGlitchFx(this, this.run);

    // Twist: Low Gravity. Set every time, because the physics world remembers
    // its gravity between runs.
    this.physics.world.gravity.y = GRAVITY * (mods.gravityScale ?? 1);
    this.jumpVelocity = JUMP_VELOCITY * (mods.jumpScale ?? 1);

    // Ground (same tiles as the platformer)
    const data = level.solid.map((row, y) =>
      row.map((solid, x) => (solid ? (y > 0 && level.solid[y - 1][x] ? 0 : 1) : -1)),
    );
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage('tiles', t('tiles'));
    this.layer = map.createLayer(0, tileset, 0, 0);
    this.layer.setCollision([0, 1]);

    this.spikes = this.physics.add.staticGroup();
    this.spikeTiles = new Set(level.spikes.map(({ x, y }) => `${x},${y}`));
    level.spikes.forEach(({ x, y }) => this.spikes.create(x * TILE + 8, y * TILE + 12, t('spike')));

    this.coins = this.physics.add.staticGroup();
    level.coins.forEach(({ x, y }) => this.coins.create(x * TILE + 8, y * TILE + 8, t('coin')));

    const f = level.flag;
    this.flag = this.physics.add.staticImage(f.x * TILE + 8, (f.y + 1) * TILE - 16, t('flag'));

    this.enemies = this.physics.add.group();
    this.rocks = this.physics.add.group();
    this.shocks = this.physics.add.group({ allowGravity: false });

    // Power-up (genre level 2+): one enemy carries it (a sparkle marks it)
    // and drops it when beaten.
    this.powerUp = null;
    this.sparkle = addSparkle(this, t('sparkle'));

    // Player
    const s = level.playerStart;
    this.respawn = { x: s.x * TILE + 8, y: (s.y + 1) * TILE - 7 };
    this.player = this.physics.add.sprite(this.respawn.x, this.respawn.y, t('player'));
    this.player.setCollideWorldBounds(true);
    this.swing = this.add.image(0, 0, t('swing')).setVisible(false).setDepth(5);

    // World edges: walls left and right (they close in while you're locked
    // in an arena), no floor, so pits are deadly.
    this.setLane(0, this.worldW);

    // Collisions
    this.physics.add.collider(this.player, this.layer);
    this.physics.add.collider(this.enemies, this.layer, null, (e) => e.state !== 'dead');
    this.physics.add.collider(this.rocks, this.layer, (rock) => rock.destroy());
    this.physics.add.overlap(this.player, this.spikes, () => this.touchSpikes());
    this.physics.add.overlap(this.player, this.coins, (_p, coin) => this.collectCoin(coin));
    this.physics.add.overlap(this.player, this.flag, () => !this.locked && this.reachFlag());
    this.physics.add.overlap(this.player, this.rocks, (_p, rock) => {
      if (this.invulnerable > 0 || this.dying) return;
      const dir = Math.sign(rock.body.velocity.x) || -this.facing;
      rock.destroy();
      this.hurt(1, dir);
    });
    this.physics.add.overlap(this.enemies, this.spikes, (e) => {
      if (e.state !== 'dead' && e.state !== 'appear' && !e.def.boss) this.kill(e, Math.sign(e.body.velocity.x) || 1);
    });
    this.physics.add.overlap(this.player, this.shocks, (_p, wave) => {
      if (this.invulnerable > 0 || this.dying) return;
      this.hurt(1, Math.sign(wave.body.velocity.x) || -this.facing);
    });


    // Twist: Darkness. Anything listed under "glow" stays visible in the dark.
    this.darkness = null; // the scene object is reused between runs, so reset these
    this.glow = new Set();
    if (mods.lightRadius) {
      this.darkness = addDarkness(this, mods);
      this.glow = new Set(mods.glow || []);
      if (this.glow.has('coins')) this.coins.setDepth(GLOW_DEPTH);
      if (this.glow.has('flag')) this.flag.setDepth(GLOW_DEPTH);
    }

    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.jumpKeys = [this.cursors.up, this.cursors.space];
    this.attackKeys = [this.input.keyboard.addKey('Z'), this.input.keyboard.addKey('X')];

    // HUD
    this.hud = pixelText(this, 4, 4, '', { color: theme.palette.text }).setScrollFactor(0).setDepth(10);
    this.wind = addWind(this, mods, theme.palette.text); // twist Windy, or null
    this.goSign = pixelText(this, this.scale.width - 26, 100, 'GO>', { color: theme.palette.text })
      .setScrollFactor(0)
      .setDepth(10)
      .setVisible(false);
    this.hint = addObjectiveHint(this, theme.palette.text);
    this.bossBar = addBossBar(this, theme.palette.text);
    this.powerLabel = addPowerLabel(this, theme.palette.text);
    this.hintCooldown = 0;
    this.refreshObjective();
    this.updateHud();
    this.startTime = this.time.now;
  }

  // Walls at left and right, open at the bottom. The camera keeps to the same lane.
  setLane(left, width) {
    this.physics.world.setBounds(left, -64, width, this.worldH + 64, true, true, true, false);
    this.cameras.main.setBounds(left, 0, width, this.worldH);
  }

  update(_time, delta) {
    if (this.finished) return;
    const dt = Math.min(delta / 1000, 0.05);

    if (!this.dying) {
      this.updatePlayer(dt);
      this.updateAttack(dt);
      if (this.player.y > this.worldH + 16) this.fall();
    }
    this.updateEnemies(dt);
    this.updateArena(dt);
    this.updateDrop();
    this.sparkle.update(this.time.now);

    this.rocks.getChildren().slice().forEach((r) => r.y > this.worldH + 32 && r.destroy());
    // Shockwaves die at the arena's walls.
    const lane = this.physics.world.bounds;
    this.shocks.getChildren().slice().forEach((w) => (w.x < lane.left + 4 || w.x > lane.right - 4) && w.destroy());
    this.darkness?.update(this.player);
    this.wind?.update(dt);
  }

  // ---------------------------------------------------------------- player

  updatePlayer(dt) {
    const p = this.player;
    const body = p.body;
    const grounded = body.blocked.down;

    if (this.invulnerable > 0) {
      this.invulnerable -= dt;
      p.setAlpha(this.invulnerable > 0 && Math.floor(this.invulnerable * 10) % 2 ? 0.3 : 1);
    }
    if (this.stagger > 0) {
      this.stagger -= dt;
      return; // knocked back: no control for a moment
    }

    // Run (you can't turn or walk mid-punch on the ground)
    const left = this.cursors.left.isDown;
    const right = this.cursors.right.isDown;
    // Twists Speedy and Mud change your ground speed only, never your jumps.
    const speed = runSpeed(RUN_SPEED, this.mods, grounded);
    let runTarget = left === right ? 0 : left ? -speed : speed;
    const punching = this.atk && !this.atk.def.air && grounded;
    if (punching) runTarget = 0;
    // Twist Windy: faster with the wind, slower against it, in the air too.
    if (this.wind) runTarget *= windScale(this.mods, this.wind.dir, Math.sign(runTarget));
    if (left !== right) this.facing = left ? -1 : 1; // (was skipped under Windy: you got stuck facing right)
    p.setFlipX(this.facing < 0);
    this.steer(p, runTarget, grounded ? this.mods.groundGrip : this.mods.airGrip ?? this.mods.groundGrip, dt);

    // Jump, with coyote time and a jump buffer
    const jumpPressed = this.jumpKeys.map((k) => Phaser.Input.Keyboard.JustDown(k)).some(Boolean);
    const jumpHeld = this.jumpKeys.some((k) => k.isDown);
    this.coyote = grounded ? COYOTE_TIME : this.coyote - dt;
    this.jumpBuffer = jumpPressed ? JUMP_BUFFER : this.jumpBuffer - dt;
    if (this.jumpBuffer > 0 && this.coyote > 0 && !punching) {
      p.setVelocityY(-this.jumpVelocity);
      this.jumpBuffer = 0;
      this.coyote = 0;
    }
    if (!jumpHeld && body.velocity.y < -this.jumpVelocity * SHORT_HOP) {
      p.setVelocityY(-this.jumpVelocity * SHORT_HOP);
    }

    // Attack
    if (this.attackKeys.map((k) => Phaser.Input.Keyboard.JustDown(k)).some(Boolean)) {
      if (!this.atk) this.startAttack();
      else if (!this.atk.def.air && !this.atk.def.finisher) this.atkQueued = true;
    }
  }

  // Ease a sprite's speed toward a target. grip = undefined snaps (normal
  // footing); a number eases (Slippery: low = icy).
  steer(sprite, target, grip, dt) {
    const v = sprite.body.velocity.x;
    if (grip === undefined) sprite.setVelocityX(target);
    else sprite.setVelocityX(v + (target - v) * Math.min(1, grip * dt));
  }

  startAttack() {
    let def;
    if (!this.player.body.blocked.down) {
      def = AIR_KICK;
    } else {
      const step = this.comboTimer > 0 ? this.comboStep : 0;
      def = COMBO[step];
      this.comboStep = (step + 1) % COMBO.length;
    }
    this.atk = { def, t: 0, hit: new Set() };
    this.atkQueued = false;
  }

  updateAttack(dt) {
    if (!this.atk) {
      this.comboTimer -= dt;
      this.swing.setVisible(false);
      return;
    }
    const a = this.atk;
    const d = a.def;
    a.t += dt;
    const active = a.t >= d.startup && a.t < d.startup + d.active;

    if (active) {
      const box = this.attackBox(d);
      this.swing.setVisible(true).setFlipX(this.facing < 0)
        .setPosition(box.x + box.w / 2, box.y + box.h / 2);
      this.enemies.getChildren().forEach((e) => {
        if (e.state === 'dead' || e.state === 'appear' || a.hit.has(e)) return;
        if (overlaps(box, boxOf(e.body))) {
          a.hit.add(e);
          this.hitEnemy(e, d);
        }
      });
    } else {
      this.swing.setVisible(false);
    }

    if (a.t >= d.startup + d.active + d.recovery) {
      this.atk = null;
      this.swing.setVisible(false);
      this.comboTimer = COMBO_WINDOW;
      if (this.atkQueued && this.player.body.blocked.down) this.startAttack();
    }
  }

  // Where the current punch or kick lands, in world pixels.
  attackBox(def) {
    const b = this.player.body;
    const x = this.facing > 0 ? b.right : b.left - def.reach;
    return def.air
      ? { x, y: b.top + b.height / 2 - 2, w: def.reach, h: b.height / 2 + 6 }
      : { x, y: b.top + 1, w: def.reach, h: b.height - 4 };
  }

  hurt(damage, fromDir) {
    if (this.invulnerable > 0 || this.dying || this.finished) return;
    this.hp -= damage;
    this.atk = null;
    this.atkQueued = false;
    this.swing.setVisible(false);
    this.cameras.main.shake(100, 0.008);
    this.player.setVelocity(fromDir * 110, -140);
    this.stagger = HURT_STAGGER;
    this.invulnerable = HURT_INVULNERABLE;
    if (this.hp <= 0) this.loseLife(false);
    this.updateHud();
  }

  touchSpikes() {
    if (this.invulnerable > 0 || this.dying) return;
    this.hurt(1, -this.facing);
    this.player.setVelocityY(-220);
  }

  // Fell in a pit: lose a life and come back at the arena's left edge.
  fall() {
    if (this.dying) return;
    this.loseLife(true);
  }

  loseLife(fell) {
    this.lives--;
    this.hp = this.maxHp;
    // Losing a life loses the power-up (a hit that only costs a heart doesn't).
    if (this.power) {
      this.power = null;
      this.player.setTexture(this.t('player'));
    }
    this.updateHud();
    this.dying = true;
    this.atk = null;
    this.swing.setVisible(false);
    this.player.setTint(0xff4040);
    this.player.disableBody(false, false);
    this.cameras.main.shake(150, 0.01);

    this.time.delayedCall(700, () => {
      if (this.finished) return;
      if (this.lives <= 0) {
        this.finish(false);
        return;
      }
      this.player.clearTint();
      const at = fell ? this.respawn : { x: this.player.x, y: this.player.y };
      this.player.enableBody(true, at.x, at.y, true, true);
      this.player.setVelocity(0, 0);
      this.invulnerable = RESPAWN_INVULNERABLE;
      this.stagger = 0;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.dying = false;
    });
  }

  // The carrier was beaten: the power-up appears on the nearest safe floor
  // in the current lane (not mid-air, not on spikes, not over a pit, even if
  // that's where the carrier went down) and pops up out of it.
  dropPower(x, y) {
    const kind = this.level.powerUp.kind;
    const lane = this.physics.world.bounds;
    const lo = Math.ceil(lane.left / TILE);
    const hi = Math.floor(lane.right / TILE) - 1;
    const col = Phaser.Math.Clamp(Math.floor(x / TILE), lo, hi);
    const row = Phaser.Math.Clamp(Math.floor(y / TILE), 0, this.level.heightTiles - 1);
    const spot = safeSpot(this.level.solid, this.spikeTiles, col, row, lo, hi);
    this.sparkle.stop();
    if (!spot) return;
    const d = this.physics.add.sprite(spot.x * TILE + 8, (spot.y + 1) * TILE - 6, this.t(`power-${kind}`)).setDepth(GLOW_DEPTH);
    d.kind = kind;
    d.setCollideWorldBounds(true); // the arena walls; there's no floor, so pits still take it
    d.setVelocityY(-DROP_POP);
    this.physics.add.collider(d, this.layer);
    this.physics.add.overlap(this.player, d, () => this.takePower());
    this.physics.add.overlap(d, this.enemies, (_d, e) => e.state !== 'dead' && bounce(d, e.x));
    this.powerUp = d;
  }

  // Is there no floor (or spikes) just ahead of this body, going dir, within
  // `look` pixels? Used for enemies and the fleeing power-up.
  edgeAhead(body, dir, look = 2) {
    const aheadX = dir > 0 ? body.right + look : body.left - look;
    const floor = this.layer.getTileAtWorldXY(aheadX, body.bottom + 2);
    const spike = this.spikeTiles.has(`${Math.floor(aheadX / TILE)},${Math.floor((body.bottom - 1) / TILE)}`);
    return !floor || spike;
  }

  // From stage 4 a dropped power-up runs: away from the nearest pit first,
  // then bouncing off walls, spikes and enemies. It can fall into a pit.
  updateDrop() {
    const d = this.powerUp;
    if (!d?.active) return;
    if (d.y > this.worldH + 16) {
      d.destroy();
      this.powerUp = null;
      this.hint.show(`${POWER_NAMES[d.kind]} LOST`);
      return;
    }
    const lane = this.physics.world.bounds;
    const col = Math.floor(d.x / TILE);
    const row = Math.floor((d.body.bottom - 1) / TILE);
    stepRunner(d, {
      stage: this.run.stage,
      playerX: this.player.x,
      speed: DROP_FLEE_SPEED * enemyScale(this.mods),
      startDir: () => awayFromPit(this.level.solid, col, row, Math.ceil(lane.left / TILE), Math.floor(lane.right / TILE) - 1),
      spikeAhead: (dir) => this.spikeTiles.has(`${Math.floor((dir > 0 ? d.body.right + 2 : d.body.left - 2) / TILE)},${row}`),
    });
  }

  takePower() {
    if (!this.powerUp?.active || this.dying) return;
    this.power = this.powerUp.kind;
    this.powerUp.destroy();
    this.powerUp = null;
    this.player.setTexture(this.t(`player-${this.power}`));
    this.hint.show(`${POWER_NAMES[this.power]}!`);
    this.cameras.main.flash(120, 255, 255, 255);
    this.updateHud();
  }

  collectCoin(coin) {
    coin.disableBody(true, true);
    this.coinsCollected++;
    this.refreshObjective();
    this.updateHud();
  }

  // Twist Collector: the flag stays faded and locked until every coin is picked up.
  coinsLeft() {
    return this.objective === 'collect' ? this.level.coins.length - this.coinsCollected : 0;
  }

  refreshObjective() {
    this.flag.setAlpha(this.coinsLeft() > 0 ? LOCKED_ALPHA : 1);
  }

  reachFlag() {
    const left = this.coinsLeft();
    if (!left) {
      this.finish(true);
      return;
    }
    if (this.time.now > this.hintCooldown) {
      this.hint.show(leftMessage(this.objective, this.theme, left));
      this.hintCooldown = this.time.now + 1000;
    }
  }

  // ---------------------------------------------------------------- arenas

  updateArena(dt) {
    if (this.goTimer > 0) {
      this.goTimer -= dt;
      this.goSign.setVisible(this.goTimer > 0 && Math.floor(this.goTimer * 4) % 2 === 0);
    }

    const arenas = this.level.arenas;
    if (!this.locked) {
      // The next arena with a fight in it, ahead of you.
      const next = arenas.find((a) => a.fight && !a.done);
      if (next && !this.dying && this.player.x >= next.x0 * TILE + ARENA_PX / 2) this.lockArena(next);
      return;
    }

    const a = this.locked;
    const alive = this.enemies.getChildren().filter((e) => e.active && e.state !== 'dead').length;
    if (a.wave + 1 < a.waves.length && alive <= RESPAWN_WAVE_AT) {
      a.wave++;
      a.waves[a.wave].forEach((spot) => this.spawnEnemy(spot));
    } else if (alive === 0 && a.wave + 1 >= a.waves.length) {
      this.unlockArena(a);
    }
  }

  lockArena(a) {
    this.locked = a;
    a.wave = 0;
    a.waves[0].forEach((spot) => this.spawnEnemy(spot));
    this.setLane(a.x0 * TILE, ARENA_PX);
    this.respawn = this.respawnSpot(a.x0 + 1);
    this.goTimer = 0;
    this.goSign.setVisible(false);
  }

  unlockArena(a) {
    a.done = true;
    this.locked = null;
    // No going back: the left wall stays where this arena started. With
    // Collector you may need to fetch a coin you skipped, so the way back opens.
    const left = this.objective === 'collect' ? 0 : a.x0 * TILE;
    this.setLane(left, this.worldW - left);
    if (this.level.arenas.some((x) => x.x0 > a.x0)) this.goTimer = 2;
  }

  // The highest piece of ground in this column to stand on.
  respawnSpot(col) {
    const solid = this.level.solid;
    const y = solid.findIndex((row, yy) => row[col] && !(yy > 0 && solid[yy - 1][col]));
    return { x: col * TILE + 8, y: y * TILE - 7 };
  }

  // ---------------------------------------------------------------- enemies

  spawnEnemy({ x, y, kind, carrier }) {
    // Twist Speedy: enemies walk, charge and recover faster. Wind-ups stay
    // the same length, so every attack can still be seen coming.
    const fast = enemyScale(this.mods);
    const base = ENEMY[kind];
    const def = { ...base, speed: base.speed * fast, chargeSpeed: base.chargeSpeed && base.chargeSpeed * fast, cooldown: base.cooldown / fast };
    const key = this.t(def.texture);
    const h = this.textures.getFrame(key).height;
    const e = this.enemies.create(x * TILE + 8, (y + 1) * TILE - h / 2, key); // feet on the tile below
    e.setCollideWorldBounds(true);
    e.kind = kind;
    e.def = def;
    // The boss at the end of a Long run (stage 5) is tougher.
    e.maxHp = def.boss && this.run.stage >= 5 ? Math.round(def.hp * BOSS_STAGE5_HP) : def.hp;
    e.hp = e.maxHp;
    e.carrier = !!carrier; // drops the power-up when beaten
    if (carrier) this.sparkle.follow(e);
    e.state = 'appear';
    e.timer = APPEAR_TIME;
    e.cool = 0.4;
    e.stun = 0;
    e.flash = 0;
    e.face = this.player.x < e.x ? -1 : 1;
    e.turn = 0;
    e.moves = 0;
    if (this.glow.has('enemies')) e.setDepth(GLOW_DEPTH);
    if (def.boss) {
      e.setDepth(GLOW_DEPTH); // always lit, even in the dark
      this.bossBar.show(10, 10);
      this.cameras.main.shake(200, 0.006);
    }
  }

  updateEnemies(dt) {
    const p = this.player;
    this.enemies.getChildren().slice().forEach((e) => {
      if (!e.active || e.state === 'dead') return;
      if (e.y > this.worldH + 16) {
        if (e.carrier && e.state !== 'dead') this.dropPower(e.x, this.worldH - TILE); // knocked into a pit
        e.destroy();
        return;
      }
      const b = e.body;
      const grounded = b.blocked.down;
      const dx = p.x - e.x;
      const adx = Math.abs(dx);
      const dy = p.body.bottom - b.bottom;
      e.cool -= dt;
      e.flash -= dt;

      if (e.state === 'appear') {
        e.timer -= dt;
        e.setAlpha(Math.floor(e.timer * 12) % 2 ? 0.3 : 1);
        if (e.timer <= 0) {
          e.state = 'idle';
          e.setAlpha(1);
        }
      } else if (e.state === 'stun') {
        e.stun -= dt;
        // Knocked back: slide to a stop (Slippery: slide a long way)
        if (grounded) this.steer(e, 0, this.mods.knockbackGrip ?? KNOCKBACK_GRIP, dt);
        if (e.stun <= 0 && grounded) {
          e.state = 'idle';
          e.cool = Math.max(e.cool, 0.4);
        }
      } else if (!this.dying) {
        this.think(e, dt, { dx, adx, dy, grounded });
      } else {
        this.walk(e, 0, dt);
      }

      // No enemy ever walks (or charges, or backs) into a pit or onto
      // spikes. Being knocked there is another matter: stun, a leap and a
      // hop aren't walking.
      if (grounded && !['stun', 'leap', 'hop', 'appear'].includes(e.state)) {
        const vx = e.body.velocity.x;
        if (vx && this.edgeAhead(e.body, Math.sign(vx), Math.abs(vx) * dt + 2)) {
          e.setVelocityX(0);
          if (e.state === 'charge') {
            e.state = 'idle';
            e.cool = e.def.cooldown;
          }
        }
      }

      e.setFlipX(e.face < 0);
      this.paintEnemy(e);
    });
  }

  // What an enemy does when it's free to act.
  think(e, dt, { dx, adx, dy, grounded }) {
    const def = e.def;
    const toward = Math.sign(dx) || e.face;

    if (FIGHTERS.includes(e.kind)) {
      if (e.state === 'idle') {
        // Shield guards are slow to turn round: that's your way in.
        if (def.turn && toward !== e.face) {
          e.turn += dt;
          if (e.turn >= def.turn) {
            e.face = toward;
            e.turn = 0;
          }
        } else {
          e.face = toward;
          e.turn = 0;
        }
        // The boss: every few moves (or when you keep away) it leaps instead.
        if (def.boss && e.cool <= 0 && grounded && (adx > 56 || e.moves % def.stompEvery === def.stompEvery - 1)) {
          e.state = 'crouch';
          e.timer = def.crouch;
          e.moves++;
          this.walk(e, 0, dt);
          return;
        }
        // Only one enemy per side gets up close; the rest wait their turn.
        const want = this.crowded(e, toward) ? 34 : def.reach;
        if (adx > want + 2) this.walk(e, toward * def.speed, dt);
        else this.walk(e, 0, dt);
        if (adx <= def.reach + 4 && Math.abs(dy) < 14 && e.cool <= 0 && grounded && e.face === toward) {
          e.state = 'windup';
          e.timer = def.windup;
          e.moves++;
        }
      } else if (e.state === 'windup') {
        this.walk(e, 0, dt);
        e.timer -= dt;
        if (e.timer <= 0) {
          e.state = 'strike';
          e.timer = def.strike;
        }
      } else if (e.state === 'strike') {
        this.walk(e, 0, dt);
        e.timer -= dt;
        const b = e.body;
        const box = { x: e.face > 0 ? b.right : b.left - def.reach, y: b.top + 2, w: def.reach, h: b.height - 4 };
        if (overlaps(box, boxOf(this.player.body))) this.hurt(1, e.face);
        if (e.timer <= 0) {
          e.state = 'idle';
          e.cool = def.cooldown;
        }
      } else if (e.state === 'crouch') {
        this.walk(e, 0, dt);
        e.timer -= dt;
        if (e.timer <= 0) {
          e.state = 'leap';
          e.setVelocity(toward * 40, -def.leap);
        }
      } else if (e.state === 'leap' && grounded && e.body.velocity.y >= 0) {
        // Landed: shockwaves both ways along the floor.
        this.cameras.main.shake(150, 0.008);
        for (const dir of [-1, 1]) {
          const w = this.shocks.create(e.x + dir * 12, e.body.bottom - 4, this.t('shock'));
          w.setVelocityX(dir * SHOCK_SPEED * enemyScale(this.mods));
          w.setDepth(GLOW_DEPTH);
        }
        e.state = 'idle';
        e.cool = def.cooldown;
      }
    } else if (e.kind === 'jumper') {
      if (e.state === 'idle') {
        e.face = toward;
        this.walk(e, adx > 40 ? toward * def.speed : 0, dt);
        if (e.cool <= 0 && grounded && adx < def.range && Math.abs(dy) < 48) {
          e.state = 'windup';
          e.timer = def.windup;
        }
      } else if (e.state === 'windup') {
        this.walk(e, 0, dt);
        e.timer -= dt;
        if (e.timer <= 0) this.hop(e, dx);
      } else if (e.state === 'hop') {
        if (overlaps(boxOf(e.body), boxOf(this.player.body))) this.hurt(1, Math.sign(e.body.velocity.x) || e.face);
        if (grounded && e.body.velocity.y >= 0) {
          e.state = 'idle';
          e.setVelocityX(0);
          e.cool = def.cooldown * (0.8 + 0.4 * Math.random()); // "occasionally"
        }
      }
    } else if (e.kind === 'rusher') {
      if (e.state === 'idle') {
        e.face = toward;
        this.walk(e, adx > 60 ? toward * def.speed : 0, dt);
        if (e.cool <= 0 && Math.abs(dy) < 16 && adx < CHARGE_RANGE && grounded) {
          e.state = 'windup';
          e.timer = def.windup;
        }
      } else if (e.state === 'windup') {
        this.walk(e, 0, dt);
        e.timer -= dt;
        if (e.timer <= 0) {
          e.state = 'charge';
          e.timer = def.charge;
        }
      } else if (e.state === 'charge') {
        e.timer -= dt;
        const blocked = e.face > 0 ? e.body.blocked.right : e.body.blocked.left;
        const stopped = this.walk(e, e.face * def.chargeSpeed, dt);
        if (overlaps(boxOf(e.body), boxOf(this.player.body))) this.hurt(1, e.face);
        if (e.timer <= 0 || blocked || stopped) {
          e.state = 'idle';
          e.cool = def.cooldown;
        }
      }
    } else if (e.kind === 'thrower') {
      if (e.state === 'idle') {
        e.face = toward;
        const [near, far] = def.keepAway;
        // Backs away from you, but still faces you.
        if (adx < near) this.walk(e, -toward * def.speed, dt);
        else if (adx > far) this.walk(e, toward * def.speed, dt);
        else this.walk(e, 0, dt);
        if (e.cool <= 0 && adx < 200 && grounded) {
          e.state = 'windup';
          e.timer = def.windup;
        }
      } else if (e.state === 'windup') {
        this.walk(e, 0, dt);
        e.timer -= dt;
        if (e.timer <= 0) {
          this.throwRock(e);
          e.state = 'idle';
          e.cool = def.cooldown;
        }
      }
    }
  }

  // Is another fighter already up close on this side of the player?
  crowded(e, toward) {
    const p = this.player;
    return this.enemies.getChildren().some((o) => o !== e && o.active && o.state !== 'dead' && o.state !== 'appear'
      && (o.kind === 'grunt' || o.kind === 'brute')
      && Math.sign(p.x - o.x) === toward && Math.abs(p.x - o.x) < Math.abs(p.x - e.x));
  }

  // Walk toward a speed, but never off a ledge or onto spikes.
  // Returns true if the edge stopped it. (On ice, momentum can still slide it off.)
  walk(e, target, dt) {
    let stopped = false;
    if (target !== 0 && e.body.blocked.down) {
      const b = e.body;
      const aheadX = target > 0 ? b.right + 2 : b.left - 2;
      const floor = this.layer.getTileAtWorldXY(aheadX, b.bottom + 2);
      const spike = this.spikeTiles.has(`${Math.floor(aheadX / TILE)},${Math.floor((b.bottom - 1) / TILE)}`);
      if (!floor || spike) {
        target = 0;
        stopped = true;
      }
    }
    this.steer(e, target, e.body.blocked.down ? this.mods.enemyGrip : undefined, dt);
    return stopped;
  }

  // A jumper hops at you, but only to somewhere it can land: it tries the
  // full hop, then shorter ones, and stays put if none lands on floor.
  hop(e, dx) {
    const def = e.def;
    const g = this.physics.world.gravity.y;
    const flight = (2 * def.hop) / g;
    const reach = Phaser.Math.Clamp(dx, -def.maxHop, def.maxHop);
    const b = e.body;
    for (const part of [1, 0.66, 0.33]) {
      const landX = e.x + reach * part;
      const col = Math.floor(landX / TILE);
      const row = Math.floor((b.bottom + 2) / TILE);
      const lane = this.physics.world.bounds;
      const inLane = landX > lane.left + 8 && landX < lane.right - 8;
      const floor = [-b.width / 2 + 1, b.width / 2 - 1].every((ox) => this.layer.getTileAtWorldXY(landX + ox, b.bottom + 2));
      if (inLane && floor && !this.spikeTiles.has(`${col},${row - 1}`)) {
        e.state = 'hop';
        e.setVelocity((reach * part) / flight, -def.hop);
        return;
      }
    }
    e.state = 'idle';
    e.cool = def.cooldown;
  }

  throwRock(e) {
    const g = this.physics.world.gravity.y;
    const flight = (2 * ROCK_LIFT) / g; // seconds until it comes back to throwing height
    const vx = Phaser.Math.Clamp((this.player.x - e.x) / flight, -ROCK_MAX_SPEED, ROCK_MAX_SPEED);
    const rock = this.rocks.create(e.x + e.face * 6, e.y - 6, this.t('rock'));
    rock.setVelocity(vx, -ROCK_LIFT);
    if (this.glow.has('rocks')) rock.setDepth(GLOW_DEPTH);
  }

  hitEnemy(e, atk) {
    const heavy = e.def.heavy;
    const airborne = !e.body.blocked.down;
    // Shield guards block from the front, unless it's the launcher, or
    // they're already reeling.
    const fromFront = Math.sign(this.player.x - e.x) === e.face;
    if (e.def.guard && fromFront && !atk.finisher && e.state !== 'stun' && !airborne) {
      e.setVelocityX(this.facing * 30);
      e.blocked = 0.12;
      this.cameras.main.shake(40, 0.002);
      return;
    }
    e.hp -= atk.damage * (this.power === 'power-fists' ? POWER_FISTS : 1);
    e.flash = 0.08;
    if (e.def.boss) this.bossBar.show(Math.ceil((Math.max(0, e.hp) / e.maxHp) * 10), 10);

    const knock = atk.knock * (heavy ? 0.35 : 1);
    const lift = (atk.lift || (airborne ? JUGGLE_POP : 0)) * (heavy ? 0.5 : 1);
    e.setVelocityX(this.facing * knock);
    if (lift) e.setVelocityY(-lift);
    if (atk.finisher) this.cameras.main.shake(60, 0.004);

    if (e.hp <= 0) {
      this.kill(e, this.facing);
      return;
    }
    // Heavies keep coming through jabs; only the launcher staggers them.
    if (!heavy || atk.finisher) {
      e.state = 'stun';
      e.stun = atk.stun;
    }
  }

  kill(e, dir) {
    if (e.carrier) this.dropPower(e.x, e.y);
    if (e.def.boss) {
      this.bossBar.hide();
      this.shocks.clear(true, true);
      this.cameras.main.flash(250, 255, 255, 255);
      this.cameras.main.shake(300, 0.012);
    }
    e.state = 'dead';
    e.setCollideWorldBounds(false);
    e.setVelocity(dir * 80, -180);
    e.setAlpha(0.6);
    e.setTint(0xff4040);
    this.time.delayedCall(1200, () => e.active && e.destroy());
  }

  // Tint and depth: white flash when hit, lit up while winding up an attack.
  paintEnemy(e) {
    const winding = e.state === 'windup' || e.state === 'crouch';
    e.blocked = (e.blocked || 0) - this.game.loop.delta / 1000;
    if (e.blocked > 0) e.setTintFill(Phaser.Display.Color.HexStringToColor(this.theme.palette.groundTop).color); // clank
    else if (e.flash > 0) e.setTintFill(0xffffff);
    else if (winding) e.setTint(Phaser.Display.Color.HexStringToColor(this.theme.palette.coin).color);
    else e.clearTint();
    if (this.glow.size) {
      const lit = this.glow.has('enemies') || (this.glow.has('windups') && (winding || e.state === 'charge' || e.flash > 0));
      e.setDepth(lit ? GLOW_DEPTH : 0);
    }
  }

  // ---------------------------------------------------------------- end

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
    const hearts = '■'.repeat(Math.max(0, this.hp)) + '□'.repeat(Math.max(0, this.maxHp - this.hp));
    this.hud.setText(
      `LIVES ${this.lives}  HP ${hearts}  ${this.theme.names.hudCoin} ${this.coinsCollected}/${this.level.coins.length}  STAGE ${this.run.stage}/${this.run.stages}`,
    );
    this.powerLabel?.set(this.power);
  }
}
