import Phaser from 'phaser';
import { buildRace } from '../gen/buildRace.js';
import { content } from '../data/index.js';
import { twistSettings, objectiveOf } from '../engine/content.js';
import { stageSetup, runTheme } from '../engine/run.js';
import { describeRun } from '../engine/spin.js';
import { addDarkness, GLOW_DEPTH } from '../engine/darkness.js';
import { endStage } from '../engine/startRun.js';
import { enemyScale, windScale } from '../engine/speed.js';
import { RIDE, TILE, surface, newRider, stepRider, botInput, touchesSpikes, respawnColumn, timeLimit } from '../engine/raceRide.js';
import { addWind } from '../ui/wind.js';
import { addGravity } from '../ui/gravityArrow.js';
import { pixelText } from '../ui/font.js';
import { addGlitchFx } from '../ui/glitch.js';
import { addObjectiveHint } from '../ui/objective.js';
import { makePlaceholderTextures, tex } from '../art/placeholder.js';
import { makeRaceTextures } from '../art/racePlaceholder.js';
import { makeLevelTextures } from '../art/levelPlaceholder.js';
import { addBossBar, addPowerLabel, addSparkle, FLEE_FROM_STAGE, FLEE_RANGE } from '../ui/levelHud.js';
import { addHazards } from '../ui/hazards.js';
import { powerName, bossName, perkWords, speedPerk, slowPerk, magnetPerk, shieldPerk, lifePerk, pullCoins, themedKeys } from '../ui/perks.js';

// Racing: ride right to the finish flag before the clock runs out. The bike
// itself (speed, ramps, landings) is src/engine/raceRide.js; this scene draws
// it and runs everything around it: rivals, kicks, the clock, the boss loop.
//
// Controls: Right is gas, Left is brake. Up or Space jumps (a hop on flat
// ground; on a ramp, or just as you leave one, a big launch). In the air,
// Down leans forward and Left leans back: land matching the ground's angle.
// (Holding Right for gas through a jump is safe: the bike levels itself.)
// Z or X kicks both ways at once: knock rivals off the track.
//
// Crashing (a bad landing, spikes, a pit, a theme hazard, a rammer, the
// champion's kick) costs a life and puts you back a little way behind, on
// safe ground. A rival's kick only knocks your speed down. If the clock
// runs out you lose a life and get TIME_UP_REFILL more seconds.

// Feel knobs — tweak these while playtesting.
const CAM_AHEAD = 56;           // px the camera looks ahead of the bike
const KICK = { startup: 0.05, active: 0.14, recovery: 0.2, reach: 22 };
const KICKED_SPEED = 0.35;      // a rival's kick leaves you this share of your speed
const KICKED_WOBBLE = 0.45;     // s without control after a rival's kick
const HURT_INVULNERABLE = 0.9;  // s of flicker after a kick
const RESPAWN_INVULNERABLE = 2; // s of flicker after a crash
const WAKE_RANGE = 280;         // px ahead of you a waiting rival starts riding
const RIVAL_CAP = 0.85;         // rivals never ride faster than this share of your top speed
const ESCAPE_MARGIN = 40;       // px off the left of the screen a rival has got away
const TIME_UP_REFILL = 20;      // s added when the clock runs out (and you lose a life)
const READY_TIME = 0.9;         // s of "READY" before the start
const NITRO_TOP = 1.2;          // nitro (genre level 2+): top speed x this...
const NITRO_PADS = 2;           // ...boost pads last this much longer...
const NITRO_HIT = 2;            // ...and a kick hits the champion this hard
const DROP_FLEE = 0.6;          // stage 4+: a dropped nitro runs at this share of top speed
const BIG_AIR = 0.7;            // s in the air for a clean landing to say so

// Rivals. reach: px either side a kick lands. windup: s it glows before
// striking (every hit can be seen coming, even in the dark).
const RIVAL = {
  rider: { texture: 'rival', reach: 16, windup: 0.5, cooldown: 1.8 },
  // Waits until you pass, revs (glows), then charges from behind faster
  // than you can ride for `charge` s. Touching it while it charges is a
  // crash, unless you're above it (jump it). Then it rides like a rider.
  rammer: { texture: 'rammer', reach: 16, windup: 0.7, cooldown: 1.8, charge: 1.6, chargePace: 1.3, after: 0.7 },
  // The champion (genre level 3), in the boss loop. Rides around with you,
  // drops cones behind it when it's ahead, kicks when it's beside you (a
  // crash), and is knocked down only by kicks.
  boss: { texture: 'rboss', hp: 10, reach: 20, windup: 0.6, cooldown: 1.4, dropEvery: 2.6, cone: 5 },
};
const BOSS_STAGE5_HP = 1.5;     // the champion at the end of a Long run is this much tougher
const BOSS_PACE = [0.85, 1.12]; // its speed swings between these shares of your top speed
const BOSS_DASH = 1.0;          // s it speeds off after you land a kick

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export default class RaceScene extends Phaser.Scene {
  constructor() {
    super('Race');
  }

  // data.run: see src/engine/run.js (reels, bet, stage number, lives left)
  init(data) {
    this.run = data.run;
    this.seed = data.run.seed;
    this.theme = runTheme(content, data.run); // at its level: a level 3 theme is its variant
    this.mods = twistSettings(content, data.run.twist, 'racer', data.run.levels?.twist);
    this.objective = objectiveOf(content, data.run.twist); // Collector / Killer, or null
    this.setup = stageSetup(content, data.run); // twist rules + genre level, power-up, boss
    this.lives = data.run.lives;
    this.coinsCollected = 0;
    this.dying = false;
    this.finished = false;
    this.ready = READY_TIME;
    this.invulnerable = 0;
    this.kick = null;
    this.power = null;
    this.shield = 0;
    this.slow = 1;
    this.loopLocked = false;
    this.bossDone = false;
    this.champion = null;
    this.cones = [];
    this.drop = null;
    this.hintCooldown = 0;
  }

  create() {
    const theme = this.theme;
    const mods = this.mods;
    const t = (name) => tex(theme, name);
    this.t = t;
    makePlaceholderTextures(this, theme);
    makeRaceTextures(this, theme);
    makeLevelTextures(this, theme);
    this.keys = themedKeys(this, theme); // theme level 2+: the power-up and boss in theme colours

    const level = buildRace(this.setup);
    this.level = level;
    this.worldW = level.widthTiles * TILE;
    this.worldH = level.heightTiles * TILE;
    this.finishX = level.flag.x * TILE + 8;
    console.log(`[8-Bit Roulette] ${describeRun(content, this.run)} · stage ${this.run.stage}/${this.run.stages} · seed ${this.seed} · cost ${level.cost}/${level.budget}\n  ${level.names.join(' → ')}`);

    this.cameras.main.setBackgroundColor(theme.palette.sky);
    addGlitchFx(this, this.run);
    // Hazards (theme level 2+) fall with the race's gravity. Set every time:
    // the physics world remembers its gravity between scenes.
    this.physics.world.gravity.y = RIDE.gravity * (mods.gravityScale ?? 1);

    // The track
    const frame = (ch, above) => (ch === '/' ? 2 : ch === '\\' ? 3 : ch === '#' ? ('#/\\'.includes(above) ? 0 : 1) : -1);
    const data = level.grid.map((row, y) => [...row].map((ch, x) => frame(ch, y > 0 ? level.grid[y - 1][x] : '.')));
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage('rtiles', t('rtiles'));
    map.createLayer(0, tileset, 0, 0);
    level.mud.forEach(({ x, y }) => this.add.image(x * TILE + 8, (y + 1) * TILE - 3, t('mud')));
    level.boosts.forEach(({ x, y }) => this.add.image(x * TILE + 8, (y + 1) * TILE - 2, t('boost')));
    this.spikeSprites = level.spikes.map(({ x, y }) => this.add.image(x * TILE + 8, y * TILE + 12, t('spike')));
    this.flag = this.add.image(this.finishX, level.flag.y * TILE + 16, t('finish'));

    this.coins = this.physics.add.staticGroup();
    level.coins.forEach(({ x, y }) => this.coins.create(x * TILE + 8, y * TILE + 8, t('coin')));

    // What the bike reads from the track every step.
    this.track = {
      cols: level.cols,
      mud: new Set(level.mud.map((p) => p.x)),
      boosts: new Set(level.boosts.map((p) => p.x)),
      spikes: new Set(level.spikes.map((p) => p.x)),
      heightPx: this.worldH,
      mods,
    };

    // The player: drawn from its rider state each frame; the physics body only
    // detects coins and hazards.
    const s = level.playerStart;
    this.rider = newRider(s.x * TILE + 8, (s.y + 1) * TILE);
    this.player = this.physics.add.sprite(this.rider.x, this.rider.y, t('bike')).setOrigin(0.5, 1);
    this.player.body.setAllowGravity(false);
    this.player.body.moves = false;
    this.player.body.setSize(12, 12).setOffset(4, 2);
    this.player.setDepth(4);
    this.kickFx = [this.add.image(0, 0, t('kick')).setVisible(false).setDepth(5), this.add.image(0, 0, t('kick')).setVisible(false).setFlipX(true).setDepth(5)];

    // Twist: Darkness. A light around the bike and a headlight ahead of it.
    this.darkness = null;
    this.glow = new Set();
    if (mods.lightRadius) {
      this.darkness = addDarkness(this, mods);
      this.glow = new Set(mods.glow || []);
      if (this.glow.has('coins')) this.coins.setDepth(GLOW_DEPTH);
      if (this.glow.has('flag')) this.flag.setDepth(GLOW_DEPTH);
    }

    // Rivals: all placed now, riding once you get close.
    this.sparkle = addSparkle(this, t('sparkle'));
    this.rivals = level.rivals.map((spot) => this.makeRival(spot));

    // Camera: follows the bike with room to see ahead. Never scrolls up or down.
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.startFollow(this.player, true, 0.2, 1, -CAM_AHEAD, 0);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.jumpKeys = [this.cursors.up, this.cursors.space];
    this.attackKeys = [this.input.keyboard.addKey('Z'), this.input.keyboard.addKey('X')];

    // HUD
    const color = theme.palette.text;
    this.hud = pixelText(this, 4, 4, '', { color }).setScrollFactor(0).setDepth(10);
    this.speedo = pixelText(this, 4, this.scale.height - 12, '', { color }).setScrollFactor(0).setDepth(10);
    this.wind = addWind(this, mods, color); // twist Windy, or null
    this.gravity = addGravity(this, mods, color, this.seed, ['down', 'up']); // twist Gravity, or null
    this.hint = addObjectiveHint(this, color);
    this.bossBar = addBossBar(this, color, bossName(theme));
    this.powerLabel = addPowerLabel(this, color, (power) => powerName(theme, power));
    this.banner = pixelText(this, this.scale.width / 2, 90, 'READY', { color, align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(10);

    // Theme level 2+: the theme's hazard (always lit, even in the dark).
    this.hazards = addHazards(this, {
      theme, seed: this.seed, stage: this.run.stage, mode: 'side', player: this.player,
      groundY: (x) => surface(level.cols, x)?.y ?? null,
      lead: 1,
      hurt: () => this.crash('HIT!'),
    });
    this.physics.add.overlap(this.player, this.coins, (_p, coin) => this.collectCoin(coin));

    this.timeLeft = timeLimit(level, mods.runScale ?? 1);
    this.startTime = this.time.now;
    this.lastHud = '';
    this.lastSpeedo = '';
    this.updateHud();
  }

  update(_time, delta) {
    if (this.finished) return;
    const dt = Math.min(delta / 1000, 0.05);
    this.wind?.update(dt);
    this.gravity?.update(dt);
    this.conditions();

    if (this.ready > 0) {
      this.ready -= dt;
      if (this.ready <= 0) {
        this.banner.setText('GO!');
        this.time.delayedCall(500, () => this.banner.setVisible(false));
      }
      this.drawPlayer();
      this.darkness?.update(this.player, this.rider.y - 7);
      return;
    }

    if (!this.dying) this.updatePlayer(dt);
    this.updateKick(dt);
    this.updateRivals(dt);
    this.updateChampion(dt);
    this.updateCones(dt);
    this.updateDrop(dt);
    this.sparkle.update(this.time.now);
    if (!this.dying) {
      pullCoins(this.coins, this.rider.x, this.rider.y - 7, magnetPerk(this.theme, !!this.power), dt);
      const boss = this.champion && !this.champion.out ? this.champion.sprite : null;
      this.hazards.update(dt, boss);
      this.checkObjective();
      this.checkFinish();
    }
    this.updateClock(dt);
    this.drawPlayer();
    this.darkness?.update(this.player, this.rider.y - 7);
    this.updateHud();
  }

  // ---------------------------------------------------------------- twists

  // Wind, gravity and the speed perk: what the bike feels this frame. Rivals
  // feel the same wind and gravity, but not Mud/Speedy's ground speed.
  conditions() {
    const mods = this.mods;
    const w = this.wind ? windScale(mods, this.wind.dir, 1) : 1;
    const gravityMul = this.gravity ? 1 + this.gravity.vector()[1] : 1;
    const holding = !!this.power;
    this.playerCtx = {
      ...this.track,
      groundMul: (mods.runScale ?? 1) * w * speedPerk(this.theme, holding),
      airMul: w,
      gravityMul,
      topMul: this.power === 'nitro' ? NITRO_TOP : 1,
      boostMul: this.power === 'nitro' ? NITRO_PADS : 1,
    };
    this.rivalCtx = { ...this.track, groundMul: w, airMul: w, gravityMul };
    // Your top speed on the ground, without the wind: rivals stay under it.
    this.yourTop = RIDE.top * (mods.runScale ?? 1) * speedPerk(this.theme, holding) * this.playerCtx.topMul;
  }

  // ---------------------------------------------------------------- player

  updatePlayer(dt) {
    const r = this.rider;
    if (this.invulnerable > 0) this.invulnerable -= dt;
    const left = this.cursors.left.isDown;
    const right = this.cursors.right.isDown;
    const down = this.cursors.down.isDown;
    // In the air, Down leans forward and Left leans back. (Not Right: you
    // hold that for gas, and it would tip every jump over.)
    const input = {
      gas: right,
      brake: left,
      jump: this.jumpKeys.map((k) => Phaser.Input.Keyboard.JustDown(k)).some(Boolean),
      jumpHeld: this.jumpKeys.some((k) => k.isDown),
      lean: down === left ? 0 : down ? 1 : -1,
    };
    const events = stepRider(r, input, dt, this.playerCtx);
    if (this.loopLocked) this.wrap(r);

    for (const ev of events) {
      if (ev === 'crash') return this.crash('WIPEOUT!');
      if (ev === 'fell') return this.crash('', true);
      if (ev === 'bonk') this.cameras.main.shake(80, 0.006);
      if (ev === 'rough') this.cameras.main.shake(60, 0.004);
      if (ev === 'boost') this.cameras.main.flash(80, 255, 255, 255, true);
      if (ev === 'clean' && r.lastAir >= BIG_AIR) this.showHint('NICE LANDING');
      if (ev === 'clean' || ev === 'rough') this.dust(r.x, r.y);
    }
    r.lastAir = r.air ? r.airT : r.lastAir;
    if (touchesSpikes(r, this.playerCtx)) return this.crash('OUCH!');

    // Attack: a kick both ways
    if (this.attackKeys.map((k) => Phaser.Input.Keyboard.JustDown(k)).some(Boolean) && !this.kick) {
      this.kick = { t: 0, hit: new Set() };
    }
  }

  drawPlayer() {
    const r = this.rider;
    if (this.dying) {
      // The crash tumble is a tween; leave the sprite to it.
      this.player.body.velocity.x = 0;
      return;
    }
    this.player.setPosition(r.x, r.y).setAngle(r.angle);
    this.player.body.velocity.x = r.speed * (r.air ? this.playerCtx.airMul : this.playerCtx.groundMul);
    const flicker = this.invulnerable > 0 && Math.floor(this.invulnerable * 10) % 2;
    this.player.setAlpha(flicker ? 0.35 : 1);
    this.player.setTint(r.wobble > 0 ? 0xffb0b0 : 0xffffff);
  }

  // In the boss loop the track joins up: off the right edge, back on the left.
  wrap(r) {
    const loop = this.level.bossLoop;
    const x0 = loop.x0 * TILE;
    const x1 = x0 + loop.w * TILE;
    if (r.x >= x1) r.x -= loop.w * TILE;
    else if (r.x < x0) r.x += loop.w * TILE;
  }

  // Signed distance from a to b inside the loop (shortest way round).
  loopDx(ax, bx) {
    const w = this.level.bossLoop.w * TILE;
    let d = bx - ax;
    while (d > w / 2) d -= w;
    while (d < -w / 2) d += w;
    return d;
  }

  dust(x, y) {
    for (const dir of [-1, 1]) {
      const d = this.add.image(x + dir * 6, y - 2, this.t('dust')).setDepth(5);
      this.tweens.add({ targets: d, x: d.x + dir * 10, y: d.y - 4, alpha: 0, duration: 260, onComplete: () => d.destroy() });
    }
  }

  // The player's box (for kicks and rivals).
  box() {
    const r = this.rider;
    return { x: r.x - 7, y: r.y - 13, w: 14, h: 13 };
  }

  updateKick(dt) {
    const k = this.kick;
    if (!k) return this.kickFx.forEach((f) => f.setVisible(false));
    k.t += dt;
    const active = k.t >= KICK.startup && k.t < KICK.startup + KICK.active && !this.dying;
    const r = this.rider;
    this.kickFx[0].setVisible(active).setPosition(r.x + 12, r.y - 6);
    this.kickFx[1].setVisible(active).setPosition(r.x - 12, r.y - 6);
    if (active) {
      const reach = { x: r.x - KICK.reach, y: r.y - 14, w: KICK.reach * 2, h: 14 };
      for (const rv of this.rivals) {
        if (rv.out || k.hit.has(rv) || !overlaps(reach, this.rivalBox(rv))) continue;
        k.hit.add(rv);
        this.knockOut(rv, Math.sign(rv.r.x - r.x) || 1);
      }
      const c = this.champion;
      if (c && !c.out && !k.hit.has(c) && c.hurtCool <= 0) {
        const dx = this.loopDx(r.x, c.r.x);
        if (Math.abs(dx) <= KICK.reach + 6 && Math.abs(c.r.y - r.y) < 16) {
          k.hit.add(c);
          this.hitChampion(c);
        }
      }
    }
    if (k.t >= KICK.startup + KICK.active + KICK.recovery) this.kick = null;
  }

  // Crashed: a life gone, and back on safe ground a little way behind.
  // fell: into a pit (a shield doesn't save you from those).
  crash(message, fell = false) {
    if (this.dying || this.finished || (!fell && this.invulnerable > 0)) return;
    if (this.shield > 0 && !fell) {
      // Themed shield perk: this crash costs nothing.
      this.shield--;
      this.invulnerable = HURT_INVULNERABLE;
      this.rider.wobble = KICKED_WOBBLE;
      this.showHint(this.shield ? `SHIELD: ${this.shield} LEFT` : 'SHIELD BROKEN', true);
      this.cameras.main.shake(100, 0.006);
      return;
    }
    this.lives--;
    if (this.power) {
      this.power = null;
      this.shield = 0;
      this.slow = 1;
      this.player.setTexture(this.t('bike'));
    }
    this.hazards.clear();
    this.dying = true;
    this.kick = null;
    if (message) this.showHint(message, true);
    this.cameras.main.shake(160, 0.012);
    this.tweens.add({ targets: this.player, angle: this.player.angle + 300, alpha: 0.4, duration: 600 });

    this.time.delayedCall(750, () => {
      if (this.finished) return;
      if (this.lives <= 0) return this.finish(false);
      const col = respawnColumn(this.level, this.rider.x, this.loopLocked);
      this.rider = newRider(col * TILE + 8, this.level.cols[col].row * TILE);
      // Back in the loop: no cones where you start or just ahead.
      this.cones.filter((c) => c.col >= col - 1 && c.col <= col + 6).forEach((c) => this.removeCone(c));
      this.tweens.killTweensOf(this.player);
      this.player.setAlpha(1);
      this.invulnerable = RESPAWN_INVULNERABLE;
      this.dying = false;
      this.updateHud(true);
    });
    this.updateHud(true);
  }

  // A life lost without a crash (the clock, Collector, Killer).
  loseLife(message) {
    if (this.finished || this.dying) return;
    this.lives--;
    this.showHint(message, true);
    this.cameras.main.flash(120, 255, 64, 64);
    if (this.lives <= 0) this.finish(false);
    this.updateHud(true);
  }

  showHint(message, force = false) {
    if (!force && this.time.now < this.hintCooldown) return;
    this.hint.show(message);
    this.hintCooldown = this.time.now + 1200;
  }

  collectCoin(coin) {
    if (this.dying) return;
    coin.disableBody(true, true);
    this.coinsCollected++;
    this.updateHud(true);
  }

  // Collector: a coin that scrolls off the left costs a life. Killer: so does
  // a rival you rode past without kicking off (see updateRivals).
  checkObjective() {
    if (this.objective !== 'collect') return;
    const left = this.cameras.main.worldView.left;
    this.coins.getChildren().forEach((c) => {
      if (!c.active || c.missed || c.x > left - 8) return;
      c.missed = true;
      c.disableBody(true, true);
      this.loseLife(`MISSED ${this.theme.names.hudCoin}: -1 LIFE`);
    });
  }

  checkFinish() {
    const r = this.rider;
    // The boss loop: riding in locks it until the champion is down.
    const loop = this.level.bossLoop;
    if (loop && !this.bossDone && !this.loopLocked && r.x >= (loop.x0 + 3) * TILE) this.lockLoop();
    if (!this.loopLocked && r.x >= this.finishX) {
      this.banner.setText('FINISH!').setVisible(true);
      this.finish(true);
    }
  }

  updateClock(dt) {
    if (this.loopLocked || this.dying) return; // the boss fight isn't on the clock
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft += TIME_UP_REFILL;
      this.loseLife('TIME UP: -1 LIFE');
    }
  }

  // ---------------------------------------------------------------- rivals

  makeRival({ x, y, kind, pace, carrier }) {
    const def = RIVAL[kind];
    const sprite = this.add.image(x * TILE + 8, (y + 1) * TILE, this.t(def.texture)).setOrigin(0.5, 1).setDepth(3);
    if (this.glow.has('enemies')) sprite.setDepth(GLOW_DEPTH);
    const rv = { kind, def, sprite, pace, carrier: !!carrier, out: false, state: 'wait', timer: 0, cool: 0.6, r: newRider(sprite.x, sprite.y) };
    if (carrier) this.sparkle.follow(sprite);
    return rv;
  }

  rivalBox(rv) {
    return { x: rv.r.x - 8, y: rv.r.y - 13, w: 16, h: 13 };
  }

  // How fast a rival wants to go (speed units, before the wind).
  rivalTarget(rv, share) {
    const fast = enemyScale(this.mods) * this.slow;
    return Math.min(share * RIDE.top * fast, RIVAL_CAP * this.yourTop);
  }

  updateRivals(dt) {
    const p = this.rider;
    const view = this.cameras.main.worldView;
    for (const rv of this.rivals) {
      if (rv.out) continue;
      const r = rv.r;
      const dx = p.x - r.x;
      rv.cool -= dt;

      if (rv.state === 'wait') {
        // Riders start when you're near; rammers wait for you to pass.
        if (rv.kind === 'rider' && r.x - p.x < WAKE_RANGE) rv.state = 'ride';
        if (rv.kind === 'rammer' && dx > 6 && !this.dying) {
          rv.state = 'rev';
          rv.timer = rv.def.windup;
        }
      }
      let target = this.rivalTarget(rv, rv.pace);
      if (rv.state === 'rev') {
        target = 0;
        rv.timer -= dt;
        if (rv.timer <= 0) {
          rv.state = 'charge';
          rv.timer = rv.def.charge;
        }
      } else if (rv.state === 'charge') {
        target = rv.def.chargePace * this.yourTop * this.slow;
        rv.timer -= dt;
        // A crash for you, unless you're above it.
        if (!this.dying && this.invulnerable <= 0 && overlaps(this.rivalBox(rv), this.box()) && p.y > r.y - 10) this.crash('RAMMED!');
        if (rv.timer <= 0) {
          rv.state = 'ride';
          rv.pace = rv.def.after;
        }
      } else if (rv.state === 'ride') {
        // Side by side on the ground: wind up a kick.
        if (Math.abs(dx) < rv.def.reach && !r.air && rv.cool <= 0 && !this.dying) {
          rv.state = 'windup';
          rv.timer = rv.def.windup;
        }
      } else if (rv.state === 'windup') {
        rv.timer -= dt;
        if (rv.timer <= 0) {
          if (Math.abs(dx) < rv.def.reach + 4 && !p.air && !this.dying) this.kicked(Math.sign(dx) || 1);
          rv.state = 'ride';
          rv.cool = rv.def.cooldown;
        }
      }

      if (rv.state !== 'wait') {
        const input = botInput(r, this.rivalCtx, { target });
        if (rv.state === 'rev' || target === 0) {
          input.gas = false;
          input.brake = true;
        }
        const ev = stepRider(r, input, dt, this.rivalCtx);
        // Rivals can wipe out on their own too.
        if (ev.includes('crash') || ev.includes('fell') || touchesSpikes(r, this.rivalCtx)) {
          this.knockOut(rv, 1, true);
          continue;
        }
      }
      rv.sprite.setPosition(r.x, r.y).setAngle(r.angle);
      const winding = rv.state === 'windup' || rv.state === 'rev' || rv.state === 'charge';
      if (winding) rv.sprite.setTint(Phaser.Display.Color.HexStringToColor(this.theme.palette.coin).color);
      else rv.sprite.clearTint();
      if (this.glow.has('windups')) rv.sprite.setDepth(winding || this.glow.has('enemies') ? GLOW_DEPTH : 3);

      // Got away: fell off the back of the screen, or crossed the finish first.
      if (r.x < view.left - ESCAPE_MARGIN && rv.state !== 'wait' || r.x >= this.finishX) {
        this.escape(rv);
      } else if (rv.state === 'wait' && r.x < view.left - ESCAPE_MARGIN) {
        this.escape(rv); // a rammer you never let charge
      }
    }
  }

  // A rival's kick: you lose most of your speed and wobble (no life lost).
  kicked(dir) {
    if (this.invulnerable > 0 || this.dying) return;
    if (this.shield > 0) {
      this.shield--;
      this.showHint(this.shield ? `SHIELD: ${this.shield} LEFT` : 'SHIELD BROKEN', true);
      this.invulnerable = HURT_INVULNERABLE;
      return;
    }
    this.rider.speed *= KICKED_SPEED;
    this.rider.wobble = KICKED_WOBBLE;
    this.invulnerable = HURT_INVULNERABLE;
    this.rider.x += dir * 2;
    this.cameras.main.shake(90, 0.006);
  }

  knockOut(rv, dir, own = false) {
    if (rv.out) return;
    rv.out = true;
    if (rv.carrier) this.dropPower(rv.r.x);
    const s = rv.sprite;
    s.setTint(0xff4040).setDepth(5);
    this.tweens.add({ targets: s, x: s.x + dir * 30, y: s.y - 30, angle: dir * 270, alpha: 0, duration: 650, ease: 'Quad.easeOut', onComplete: () => s.destroy() });
    if (!own) this.cameras.main.shake(50, 0.003);
    this.updateHud(true);
  }

  escape(rv) {
    if (rv.out) return;
    rv.out = true;
    if (rv.carrier) this.sparkle.stop();
    rv.sprite.destroy();
    if (this.objective === 'kill') this.loseLife('ONE GOT AWAY: -1 LIFE');
    this.updateHud(true);
  }

  // ---------------------------------------------------------------- boss loop

  lockLoop() {
    const loop = this.level.bossLoop;
    this.loopLocked = true;
    this.cameras.main.stopFollow();
    this.cameras.main.setScroll(loop.x0 * TILE, 0);
    // Rivals still out there leave the track: it's the champion's race now.
    for (const rv of this.rivals) {
      if (rv.out) continue;
      rv.out = true;
      if (rv.carrier) this.sparkle.stop();
      rv.sprite.destroy();
    }
    const b = this.level.boss;
    const def = RIVAL.boss;
    const sprite = this.add.image(b.x * TILE + 8, (b.y + 1) * TILE, this.keys.boss(def.texture)).setOrigin(0.5, 1).setDepth(GLOW_DEPTH);
    const hp = this.run.stage >= 5 ? Math.round(def.hp * BOSS_STAGE5_HP) : def.hp;
    this.champion = { sprite, def, hp, maxHp: hp, out: false, state: 'ride', timer: 0, cool: 1.5, drop: def.dropEvery, hurtCool: 0, dash: 0, t: 0, r: newRider(sprite.x, sprite.y) };
    this.champion.r.speed = this.yourTop * 0.9;
    this.bossBar.show(10, 10);
    this.showHint(`${bossName(this.theme)}!`, true);
    this.cameras.main.shake(200, 0.006);
    this.updateHud(true);
  }

  updateChampion(dt) {
    const c = this.champion;
    if (!c || c.out) return;
    const p = this.rider;
    const r = c.r;
    c.t += dt;
    c.cool -= dt;
    c.drop -= dt;
    c.hurtCool -= dt;
    c.dash -= dt;
    const dx = this.loopDx(r.x, p.x); // > 0: you're ahead of it
    const [lo, hi] = BOSS_PACE;
    let target = this.yourTop * this.slow * (lo + (hi - lo) * (0.5 + 0.5 * Math.sin(c.t * 1.6)));
    if (c.dash > 0) target = this.yourTop * 1.35;

    if (c.state === 'ride') {
      if (Math.abs(dx) < c.def.reach && !r.air && c.cool <= 0 && !this.dying) {
        c.state = 'windup';
        c.timer = c.def.windup;
      }
      // Ahead of you: drop a cone behind it.
      if (dx < -24 && c.drop <= 0 && !r.air) {
        this.dropCone(r.x - 14);
        c.drop = c.def.dropEvery / (this.run.stage >= 5 ? 1.3 : 1);
      }
    } else if (c.state === 'windup') {
      target *= 0.9;
      c.timer -= dt;
      if (c.timer <= 0) {
        if (Math.abs(this.loopDx(r.x, p.x)) < c.def.reach + 4 && !p.air) this.crash('KNOCKED OFF!');
        c.state = 'ride';
        c.cool = c.def.cooldown;
      }
    }
    // It hops its own cones on the next lap, like spikes.
    const ctx = this.cones.length ? { ...this.rivalCtx, spikes: this.coneSpikes() } : this.rivalCtx;
    const input = botInput(r, ctx, { target });
    stepRider(r, input, dt, this.rivalCtx);
    this.wrap(r);
    c.sprite.setPosition(r.x, r.y).setAngle(r.angle);
    if (c.flash > 0) {
      c.flash -= dt;
      c.sprite.setTintFill(0xffffff);
    } else if (c.state === 'windup') c.sprite.setTint(Phaser.Display.Color.HexStringToColor(this.theme.palette.coin).color);
    else c.sprite.clearTint();
  }

  hitChampion(c) {
    c.hp -= this.power === 'nitro' ? NITRO_HIT : 1;
    c.flash = 0.1;
    c.hurtCool = 0.5;
    c.dash = BOSS_DASH;
    c.state = 'ride';
    c.cool = Math.max(c.cool, 0.8);
    this.bossBar.show(Math.ceil((Math.max(0, c.hp) / c.maxHp) * 10), 10);
    this.cameras.main.shake(60, 0.004);
    if (c.hp > 0) return;
    c.out = true;
    this.bossDone = true;
    this.loopLocked = false;
    this.bossBar.hide();
    this.cones.forEach((cone) => cone.sprite.destroy());
    this.cones = [];
    this.cameras.main.flash(250, 255, 255, 255);
    this.cameras.main.shake(300, 0.012);
    const s = c.sprite;
    this.tweens.add({ targets: s, y: s.y - 40, angle: 360, alpha: 0, duration: 800, onComplete: () => s.destroy() });
    this.cameras.main.startFollow(this.player, true, 0.2, 1, -CAM_AHEAD, 0);
    this.showHint('THE WAY IS OPEN', true);
  }

  // A cone fills one column, like spikes (riders read it the same way).
  dropCone(x) {
    const loop = this.level.bossLoop;
    let cx = x;
    const w = loop.w * TILE;
    if (cx < loop.x0 * TILE) cx += w;
    const col = Math.floor(cx / TILE);
    const s = surface(this.level.cols, col * TILE + 8);
    if (!s || s.slope !== 0 || this.cones.some((c) => c.col === col)) return; // only on flat ground, one a column
    if (Math.abs(this.loopDx(col * TILE + 8, this.rider.x)) < TILE * 2) return; // never on top of you
    const sprite = this.add.image(col * TILE + 8, s.y, this.t('cone')).setOrigin(0.5, 1).setDepth(GLOW_DEPTH);
    this.cones.push({ col, x: col * TILE + 8, y: s.y, sprite, life: RIVAL.boss.cone });
  }

  // The track's spikes plus the columns with a cone in them. Cones near the
  // loop's start are also marked one lap on, so a rider about to wrap round
  // sees them coming.
  coneSpikes() {
    const set = new Set(this.track.spikes);
    const loop = this.level.bossLoop;
    this.cones.forEach((c) => {
      set.add(c.col);
      if (loop && c.col < loop.x0 + 8) set.add(c.col + loop.w);
    });
    return set;
  }

  updateCones(dt) {
    if (!this.cones.length) return;
    for (const cone of this.cones.slice()) {
      cone.life -= dt;
      cone.sprite.setAlpha(cone.life < 1 && Math.floor(cone.life * 8) % 2 ? 0.3 : 1);
      if (cone.life <= 0) this.removeCone(cone);
    }
    if (!this.dying && touchesSpikes(this.rider, { cols: this.track.cols, spikes: new Set(this.cones.map((c) => c.col)) })) this.crash('CRASHED!');
  }

  removeCone(cone) {
    cone.sprite.destroy();
    this.cones.splice(this.cones.indexOf(cone), 1);
  }

  // ---------------------------------------------------------------- nitro

  // The carrier was knocked off: the power-up lands on the nearest safe flat
  // ground at or ahead of it, on screen.
  dropPower(x) {
    this.sparkle.stop();
    const kind = this.level.powerUp?.kind;
    if (!kind) return;
    const view = this.cameras.main.worldView;
    const col0 = Math.max(Math.floor(x / TILE), Math.ceil(view.left / TILE));
    const ok = (c) => this.level.cols[c]?.kind === 'flat' && !this.track.spikes.has(c) && !this.track.mud.has(c)
      && this.level.cols[c - 1]?.kind !== 'pit' && this.level.cols[c + 1]?.kind !== 'pit';
    let col = -1;
    for (let c = col0; c < Math.floor(view.right / TILE); c++) if (ok(c)) { col = c; break; }
    if (col < 0) return;
    const y = this.level.cols[col].row * TILE;
    const sprite = this.add.image(col * TILE + 8, y, this.keys.power(`power-${kind}`)).setOrigin(0.5, 1).setDepth(GLOW_DEPTH);
    this.drop = { kind, sprite, x: col * TILE + 8, y, vy: -150, running: false };
  }

  // It pops up, lands, and from stage 4 runs off along the track when you
  // get close (it can fall in a pit and be lost).
  updateDrop(dt) {
    const d = this.drop;
    if (!d) return;
    const p = this.rider;
    if (!d.running && this.run.stage >= FLEE_FROM_STAGE && Math.abs(d.x - p.x) < FLEE_RANGE && d.vy === 0) d.running = true;
    if (d.running) d.x += DROP_FLEE * RIDE.top * this.slow * dt;
    d.vy += RIDE.gravity * dt;
    d.y += d.vy * dt;
    const g = surface(this.level.cols, d.x);
    if (g && d.y >= g.y && d.vy >= 0) {
      d.y = g.y;
      d.vy = 0;
    }
    if (d.y > this.worldH + 16) {
      d.sprite.destroy();
      this.drop = null;
      this.showHint(`${powerName(this.theme, d.kind)} LOST`, true);
      return;
    }
    d.sprite.setPosition(d.x, d.y);
    if (!this.dying && Math.abs(d.x - p.x) < 12 && Math.abs(d.y - 5 - (p.y - 7)) < 14) this.takePower(d);
  }

  takePower(d) {
    this.drop = null;
    d.sprite.destroy();
    this.power = d.kind;
    this.player.setTexture(this.keys.power(`bike-${this.power}`));
    // Theme level 2+: the perk on top.
    this.shield = shieldPerk(this.theme);
    this.lives += lifePerk(this.theme);
    this.slow = slowPerk(this.theme, true);
    const perk = perkWords(this.theme);
    this.showHint(`${powerName(this.theme, this.power)}!${perk ? ` ${perk}` : ''}`, true);
    this.cameras.main.flash(120, 255, 255, 255);
    this.updateHud(true);
  }

  // ---------------------------------------------------------------- end

  finish(cleared) {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    const seconds = Math.round((this.time.now - this.startTime) / 1000);
    this.time.delayedCall(cleared ? 700 : 300, () =>
      endStage(this, this.run, {
        cleared,
        coins: this.coinsCollected,
        totalCoins: this.level.coins.length,
        seconds,
        livesLeft: this.lives,
      }),
    );
  }

  updateHud(force = false) {
    const time = Math.max(0, Math.ceil(this.timeLeft));
    const middle = this.objective === 'kill'
      ? `FOES ${this.rivals.filter((rv) => !rv.out).length}`
      : `${this.theme.names.hudCoin} ${this.coinsCollected}/${this.level.coins.length}`;
    const text = `LIVES ${Math.max(0, this.lives)}  ${middle}  TIME ${this.loopLocked ? '--' : time}  STAGE ${this.run.stage}/${this.run.stages}`;
    if (force || text !== this.lastHud) {
      this.hud.setText(text);
      this.lastHud = text;
      this.powerLabel?.set(this.power, this.shield ? `SHIELD ${this.shield}` : '');
    }
    // Speedometer: a bar of 8, plus BOOST while a pad is on.
    const r = this.rider;
    const share = r.speed / (RIDE.top * (this.playerCtx?.topMul ?? 1));
    const bars = Math.max(0, Math.min(8, Math.round(share * 8)));
    const speedo = `SPEED ${'■'.repeat(bars)}${'□'.repeat(8 - bars)}${r.boostT > 0 ? ' BOOST' : ''}`;
    if (speedo !== this.lastSpeedo) this.speedo.setText(speedo);
    this.lastSpeedo = speedo;
  }
}
