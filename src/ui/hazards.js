// Theme hazards (theme level 2+): one kind of trouble per theme that shows up
// every few seconds, in every genre. The theme file picks the kind and the
// rate ("hazard" in themes/<id>.json); hazardTiming.js decides when they come.
// Hazards can't be beaten, only dodged, and they always glow in the dark.
//
// Kinds, in the side-on genres (platformer, brawler) / the shmup:
//   float   drifts toward you through walls, then fades / same, from the top
//   zap     a warning line, then a beam from the top of the screen down
//   roll    rolls along the floor toward you, hopping / crosses the screen sideways
//   fall    a warning mark, then it drops (breaks on the ground) / drops fast
//   bounce  bounces across the screen toward you / bounces off the side edges
//
// A boss at theme level 2+ calls the hazard in: while the fight is on they
// come much more often, and the boss flashes each time.
//
// addHazards(scene, opts) returns { update(dt, boss), clear() }:
//   theme   the run's theme at its level (themeAt); no hazard = does nothing
//   mode    'side' or 'shmup'
//   player  the player sprite
//   hurt    (hazard) => void, called when one touches you
//   ground  the tilemap layer (side mode: what rolls and falls land on)
//   groundY (x) => the ground's height at world x, or null over a pit. For a
//           track with no tilemap (the racer): rolls, bounces and falls land
//           on it instead of on `ground`.
//   lead    s: aim zaps where the player will be that long from now (the
//           racer, where you're always moving); 0 = where you are now

import Phaser from 'phaser';
import { GLOW_DEPTH } from '../engine/darkness.js';
import { hazardTimer, MAX_HAZARDS } from '../engine/hazardTiming.js';
import { tex } from '../art/placeholder.js';

// Feel knobs (px/s and seconds)
const FLOAT_SPEED = 38;     // you run at 90-110, so you can always get away
const FLOAT_TURN = 1.6;     // how quickly it turns toward you
const FLOAT_LIFE = 6;       // s before it fades
const ZAP_WARN = 1.0;       // s the warning line shows before the beam
const ZAP_ON = 0.45;        // s the beam is on
const ZAP_SPREAD = 56;      // px either side of you the beam can land
const ROLL_SPEED = 62;
const ROLL_HOP = 110;       // px/s up each time it lands (side mode)
const ROLL_WARN = 0.7;
const FALL_WARN = 0.9;
const FALL_SPREAD = 40;
const FALL_SPEED = 170;     // shmup only (side mode uses gravity)
const BOUNCE_SPEED = 64;
const BOUNCE_UP = 270;      // px/s up each time it lands (side mode)
const BOUNCE_LIFE = 9;
const FADE = 0.4;           // s it takes a hazard to fade away (harmless)

const toColor = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;

// Placeholder sprites for the hazard kinds, from the theme's palette.
function makeHazardTextures(scene, theme) {
  if (scene.textures.exists(tex(theme, 'hz-float'))) return;
  const p = theme.palette;
  const g = scene.add.graphics();
  // float (12x14): a sheet-ghost with a wavy hem
  g.fillStyle(toColor(p.text)).fillRoundedRect(0, 0, 12, 11, 5);
  g.fillRect(0, 6, 12, 5).fillRect(0, 11, 3, 3).fillRect(5, 11, 3, 3).fillRect(10, 11, 2, 3);
  g.fillStyle(toColor(p.sky)).fillRect(3, 4, 2, 3).fillRect(7, 4, 2, 3);
  g.generateTexture(tex(theme, 'hz-float'), 12, 14).clear();
  // zap beam (6x16, stretched to the screen's height)
  g.fillStyle(toColor(p.enemy)).fillRect(0, 0, 6, 16);
  g.fillStyle(toColor(p.text)).fillRect(2, 0, 2, 16);
  g.generateTexture(tex(theme, 'hz-zap'), 6, 16).clear();
  // zap warning line (2x16)
  g.fillStyle(toColor(p.enemy)).fillRect(0, 0, 2, 16);
  g.generateTexture(tex(theme, 'hz-line'), 2, 16).clear();
  // roll (12x12): a scribbly ball
  g.fillStyle(toColor(p.groundTop)).fillCircle(6, 6, 6);
  g.fillStyle(toColor(p.groundDark)).fillRect(2, 5, 8, 1).fillRect(5, 2, 1, 8).fillRect(3, 3, 1, 1).fillRect(8, 8, 1, 1).fillRect(8, 3, 1, 1).fillRect(3, 8, 1, 1);
  g.generateTexture(tex(theme, 'hz-roll'), 12, 12).clear();
  // fall (10x12): a jagged rock, point down
  g.fillStyle(toColor(p.groundDark)).fillTriangle(0, 0, 10, 0, 5, 12);
  g.fillStyle(toColor(p.ground)).fillTriangle(2, 1, 8, 1, 5, 8);
  g.generateTexture(tex(theme, 'hz-fall'), 10, 12).clear();
  // bounce (10x10): a shiny ball
  g.fillStyle(toColor(p.enemy)).fillCircle(5, 5, 5);
  g.fillStyle(toColor(p.text)).fillRect(2, 2, 2, 2);
  g.generateTexture(tex(theme, 'hz-bounce'), 10, 10).clear();
  // warning mark (6x10): "!"
  g.fillStyle(toColor(p.coin)).fillRect(2, 0, 2, 6).fillRect(2, 8, 2, 2);
  g.generateTexture(tex(theme, 'hz-warn'), 6, 10);
  g.destroy();
}

export function addHazards(scene, { theme, seed, stage, mode, player, hurt, ground, groundY = null, lead = 0 }) {
  const hz = theme.hazard;
  if (!hz) return { update() {}, clear() {}, on: false };
  makeHazardTextures(scene, theme);
  const t = (name) => tex(theme, name);
  const side = mode === 'side';
  const timer = hazardTimer(hz, seed, stage);
  let wait = timer.first;
  const group = scene.physics.add.group({ allowGravity: false });
  const marks = []; // warnings and their timers

  scene.physics.add.overlap(player, group, (_p, h) => {
    if (h.harmful && h.active) hurt(h);
  });
  if (side && ground) {
    scene.physics.add.collider(group, ground, (h) => land(h), (h) => h.kind === 'roll' || h.kind === 'bounce' || h.kind === 'fall');
  }

  // What the player can see, in world coordinates.
  const view = () => scene.cameras.main.worldView;

  const add = (kind, x, y) => {
    const h = group.create(x, y, t(`hz-${kind}`));
    h.kind = kind;
    h.harmful = true;
    h.age = 0;
    h.setDepth(GLOW_DEPTH);
    return h;
  };
  const fade = (h) => {
    if (!h.active || h.fading) return;
    h.fading = true;
    h.harmful = false;
    scene.tweens.add({ targets: h, alpha: 0, duration: FADE * 1000, onComplete: () => h.destroy() });
  };
  const warn = (x, y, seconds, then, key = 'hz-warn') => {
    const m = scene.add.image(x, y, t(key)).setDepth(GLOW_DEPTH);
    if (!side) m.setScrollFactor(0);
    scene.tweens.add({ targets: m, alpha: 0.2, duration: 120, yoyo: true, repeat: -1 });
    marks.push({ m, left: seconds, then });
    return m;
  };

  // Side mode: something that rolls or bounces hit the ground or a wall.
  function land(h) {
    const b = h.body;
    if (h.kind === 'fall') {
      // Breaks on the ground (platforms keep you safe).
      h.harmful = false;
      h.disableBody(true, false);
      scene.tweens.add({ targets: h, alpha: 0, scaleX: 1.6, scaleY: 0.4, duration: 180, onComplete: () => h.destroy() });
      return;
    }
    if (b.blocked.left || b.blocked.right) h.dir = -h.dir;
    if (b.blocked.down) h.setVelocityY(-(h.kind === 'bounce' ? BOUNCE_UP : ROLL_HOP));
  }

  // One hazard, by kind. r() gives numbers from 0 to 1 (seeded).
  function spawn(r) {
    const v = view();
    const px = player.x;
    const py = player.y;
    const facing = player.flipX ? -1 : 1;
    const kind = hz.kind;

    if (kind === 'float') {
      // From an edge you can see, a little above you.
      const fromRight = side ? (r() < 0.7 ? facing > 0 : facing < 0) : r() < 0.5;
      const x = side ? (fromRight ? v.right - 6 : v.left + 6) : 12 + r() * (scene.scale.width - 24);
      const y = side ? Phaser.Math.Clamp(py - 24 - r() * 24, v.top + 10, v.bottom - 10) : -8;
      const h = add('float', x, y);
      h.setAlpha(0.85);
      h.heading = Phaser.Math.Angle.Between(x, y, px, py);
      return;
    }
    if (kind === 'zap') {
      const top = side ? v.top : 0;
      const height = side ? v.height : scene.scale.height;
      const ahead = side ? (player.body?.velocity.x || 0) * lead : 0;
      const x = Phaser.Math.Clamp(px + ahead + (r() * 2 - 1) * ZAP_SPREAD, (side ? v.left : 0) + 8, (side ? v.right : scene.scale.width) - 8);
      const line = warn(x, top + height / 2, ZAP_WARN, () => {
        const h = add('zap', x, top + height / 2);
        h.setScale(1, height / 16);
        if (!side) h.setScrollFactor(0);
        h.life = ZAP_ON;
        scene.cameras.main.shake(60, 0.002);
      }, 'hz-line');
      line.setScale(1, height / 16).setAlpha(0.6);
      return;
    }
    if (kind === 'roll') {
      if (side) {
        // From the edge you're facing, so you always see it coming.
        const dir = facing > 0 ? -1 : 1;
        // It drops in from the top corner (open sky) and rolls on from there.
        const x = dir < 0 ? v.right - 6 : v.left + 6;
        const y = v.top + 8;
        warn(x, y + 8, ROLL_WARN, () => {
          const h = add('roll', x, y);
          h.body.setAllowGravity(true);
          h.dir = dir;
        });
      } else {
        const dir = r() < 0.5 ? 1 : -1;
        const y = scene.scale.height * (0.3 + r() * 0.5);
        const x = dir > 0 ? 6 : scene.scale.width - 6;
        warn(x, y, ROLL_WARN, () => {
          const h = add('roll', dir > 0 ? -6 : scene.scale.width + 6, y);
          h.setScrollFactor(0);
          h.dir = dir;
        });
      }
      return;
    }
    if (kind === 'fall') {
      const lead = side ? player.body.velocity.x * 0.4 : 0;
      const lo = (side ? v.left : 0) + 8;
      const hi = (side ? v.right : scene.scale.width) - 8;
      const x = Phaser.Math.Clamp(px + lead + (r() * 2 - 1) * FALL_SPREAD, lo, hi);
      const top = side ? v.top : 0;
      warn(x, top + 7, FALL_WARN, () => {
        const h = add('fall', x, top - 6);
        if (side) h.body.setAllowGravity(true);
        else h.setScrollFactor(0).setVelocityY(FALL_SPEED);
      });
      return;
    }
    if (kind === 'bounce') {
      if (side) {
        const dir = facing > 0 ? -1 : 1;
        const x = dir < 0 ? v.right - 6 : v.left + 6;
        warn(x, v.top + 16, ROLL_WARN, () => {
          const h = add('bounce', x, v.top + 6);
          h.body.setAllowGravity(true);
          h.dir = dir;
        });
      } else {
        const x = 16 + r() * (scene.scale.width - 32);
        const h = add('bounce', x, -6);
        h.setScrollFactor(0);
        h.dir = r() < 0.5 ? 1 : -1;
        h.setVelocity(h.dir * BOUNCE_SPEED, BOUNCE_SPEED * 0.8);
      }
    }
  }

  // A track with no tilemap: land on groundY instead (and turn at walls).
  function landOnTrack(h) {
    if (!groundY || !h.active || !h.body?.enable || !h.body.allowGravity || h.fading) return;
    const half = h.displayHeight / 2;
    const gy = groundY(h.x);
    if (h.dir) {
      const ahead = groundY(h.x + h.dir * (h.displayWidth / 2 + 1));
      if (ahead !== null && gy !== null && gy - ahead > 9) h.dir = -h.dir; // a wall ahead (ramps are fine)
    }
    if (gy === null || h.body.velocity.y < 0 || h.y + half < gy) return;
    h.y = gy - half;
    if (h.kind === 'fall') return land(h);
    h.setVelocityY(-(h.kind === 'bounce' ? BOUNCE_UP : ROLL_HOP));
  }

  // Move what's out there, every frame.
  function step(h, dt) {
    h.age += dt;
    landOnTrack(h);
    if (!h.active) return;
    const v = view();
    const W = scene.scale.width;
    const H = scene.scale.height;
    const off = side
      ? h.x < v.left - 48 || h.x > v.right + 48 || h.y > v.bottom + 64 || h.y > scene.physics.world.bounds.bottom
      : h.x < -24 || h.x > W + 24 || h.y > H + 24;
    if (off) {
      h.destroy();
      return;
    }
    if (h.kind === 'float') {
      if (h.age > FLOAT_LIFE) return fade(h);
      const want = Phaser.Math.Angle.Between(h.x, h.y, player.x, player.y);
      h.heading = Phaser.Math.Angle.RotateTo(h.heading, want, FLOAT_TURN * dt);
      h.setVelocity(Math.cos(h.heading) * FLOAT_SPEED, Math.sin(h.heading) * FLOAT_SPEED);
      h.setFlipX(Math.cos(h.heading) < 0);
      h.setAlpha(h.fading ? h.alpha : 0.65 + 0.25 * Math.sin(h.age * 6));
    } else if (h.kind === 'zap') {
      h.life -= dt;
      if (h.life <= 0) h.destroy();
    } else if (h.kind === 'roll') {
      h.setVelocityX(h.dir * ROLL_SPEED);
      h.rotation += (h.dir * ROLL_SPEED * dt) / 6;
    } else if (h.kind === 'bounce') {
      if (side) {
        if (h.age > BOUNCE_LIFE) return fade(h);
        h.setVelocityX(h.dir * BOUNCE_SPEED);
      } else if ((h.x < 5 && h.body.velocity.x < 0) || (h.x > W - 5 && h.body.velocity.x > 0)) {
        h.setVelocityX(-h.body.velocity.x);
      }
    }
  }

  return {
    on: true,
    // boss: the boss sprite while a boss fight is on (it calls them in), or null.
    update(dt, boss = null) {
      for (const mark of marks.slice()) {
        mark.left -= dt;
        if (mark.left > 0) continue;
        marks.splice(marks.indexOf(mark), 1);
        mark.m.destroy();
        mark.then();
      }
      group.getChildren().slice().forEach((h) => step(h, dt));
      wait -= dt;
      if (wait > 0) return;
      const fighting = !!boss?.active;
      wait = timer.next(fighting);
      if (group.countActive() + marks.length >= MAX_HAZARDS) return;
      spawn(timer.roll);
      if (fighting && boss.setTintFill) {
        // The boss calls it in.
        boss.setTintFill(toColor(theme.boss?.accent || theme.palette.coin));
        scene.time.delayedCall(90, () => boss.active && boss.clearTint());
      }
    },
    // Gone at once (a lost life: you come back to a clear screen).
    clear() {
      marks.forEach((mark) => mark.m.destroy());
      marks.length = 0;
      group.clear(true, true);
      wait = Math.max(wait, 1.5);
    },
  };
}
