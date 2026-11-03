// The Machine's sprites (machine art v3 from the art team). Four versions:
// the hub cabinet and the full-screen spin console, for Act I and Act II.
// The PNGs live in public/assets/machine-v3/<variant>/ and src/data/machineArt.json
// says how big every sheet is, where the reel windows are, and so on.
//
// This only draws. The game decides results and timing (spin.js, SpinScene);
// the pictured cherries and stars never mean anything.
//
// Layers, back to front: reel bed, game-owned reel content, cabinet, face,
// bulbs, broken bulb, lever. The broken bulb never lights, not even in a
// celebration, and nothing here repairs the wear.

import Phaser from 'phaser';
import manifest from '../data/machineArt.json';
import { session } from '../engine/profile.js';

export const FACE = { smile: 0, blink: 1, eager: 2, concern: 3, wink: 4 };
export const LEVER = { up: 0, mid: 1, down: 2 };
const BULBS = { dim: 0, on: 1 };
const SPIN_FRAMES = [4, 5]; // hub symbols: the two blur patterns

// Which act's machine to show. Act II arrives with the first machine upgrade
// (Milestone 12); until then it's Act I, and ?act=2 in the URL previews Act II.
export const machineAct = () => (session.act === 2 ? 2 : 1);

export function preloadMachineArt(scene, base = `${import.meta.env.BASE_URL}assets/machine-v3`) {
  for (const [id, v] of Object.entries(manifest.variants)) {
    for (const [name, s] of Object.entries(v.sheets)) {
      scene.load.spritesheet(`machine-v3/${id}/${name}`, `${base}/${id}/${s.file}`, {
        frameWidth: s.frameWidth,
        frameHeight: s.frameHeight,
        endFrame: s.frames - 1,
      });
    }
  }
}

// kind: 'hub' (stands on the floor at centerX) or 'spin' (fills the screen).
export function createMachineArt(scene, kind, { centerX = 128, floorY = 192 } = {}) {
  const id = `${kind}-act${machineAct()}`;
  const v = manifest.variants[id];
  const hub = kind === 'hub';
  const scale = v.recommendedScale;
  const x = hub ? centerX - (v.frame.width * scale) / 2 : 0;
  const y = hub ? floorY - v.floorContactY * scale : 0;
  const root = scene.add.container(x, y).setScale(scale);
  const layer = (name, frame = 0) => {
    const img = scene.add.image(0, 0, `machine-v3/${id}/${name}`, frame).setOrigin(0);
    root.add(img);
    return img;
  };

  layer('reel-bed');
  const reelContent = scene.add.container(0, 0);
  root.add(reelContent);
  // The reel windows in screen pixels, for game text: [x, y, w, h].
  const windows = v.reelWindows.map(([rx, ry, w, h]) => [x + rx * scale, y + ry * scale, w * scale, h * scale]);
  const symbols = hub
    ? v.reelWindows.map(([rx, ry], i) => {
        const img = scene.add.image(rx, ry, `machine-v3/${id}/symbols`, i).setOrigin(0);
        reelContent.add(img);
        return img;
      })
    : [];
  const cabinet = layer('cabinet');
  const face = layer('face', FACE.smile);
  const bulbs = layer('bulbs', BULBS.on);
  layer('broken-bulb');
  const lever = layer('lever', LEVER.up);

  // Text that scrolls or clunks inside a window stays inside it.
  const masks = [];
  const clip = (obj, i) => {
    const [wx, wy, w, h] = windows[i];
    const shape = scene.make.graphics({ add: false }).fillRect(wx, wy, w, h);
    const mask = shape.createGeometryMask();
    masks.push({ shape, mask });
    obj.setMask(mask);
    return obj;
  };

  let timers = [];
  const later = (ms, fn) => timers.push(scene.time.delayedCall(ms, fn));
  let blinkOk = () => true;
  let flashing = null;

  const machine = {
    id, act: machineAct(), root, reelContent, windows, symbols, cabinet, face, bulbs, lever,
    faceRegion: v.faceRegion.map((n, i) => (i === 0 ? x + n * scale : i === 1 ? y + n * scale : n * scale)),
    textRegions: v.textRegions,
    prompt: v.hubPlacement?.prompt,
    clip,
    expression(frame = FACE.smile) {
      face.setFrame(frame);
    },
    lights(on) {
      flashing?.remove();
      flashing = null;
      bulbs.setFrame(on ? BULBS.on : BULBS.dim);
    },
    // Bulbs blink on and off (while the reels spin).
    flashLights(ms = 120) {
      machine.lights(true);
      flashing = scene.time.addEvent({ delay: ms, loop: true, callback: () => bulbs.setFrame(bulbs.frame.name === BULBS.on ? BULBS.dim : BULBS.on) });
    },
    // Up, middle, down; back up after `upAfter` ms (or stays down if null).
    pullLever(upAfter = 240) {
      lever.setFrame(LEVER.mid);
      later(80, () => lever.setFrame(LEVER.down));
      if (upAfter != null) later(upAfter, () => lever.setFrame(LEVER.up));
    },
    // Hub only: the little symbols blur, as if spinning.
    blurSymbols() {
      let phase = 0;
      timers.push(scene.time.addEvent({ delay: 80, loop: true, callback: () => {
        phase ^= 1;
        symbols.forEach((s) => s.setFrame(SPIN_FRAMES[phase]));
      } }));
    },
    // Idle: blink for 100 ms every 3-5 seconds, whenever canBlink() says so.
    startBlinking(canBlink = () => true) {
      blinkOk = canBlink;
      const next = () => later(Phaser.Math.Between(3000, 5000), () => {
        if (!blinkOk() || face.frame.name !== FACE.smile) return next();
        face.setFrame(FACE.blink);
        later(100, () => {
          if (face.frame.name === FACE.blink) face.setFrame(FACE.smile);
          next();
        });
      });
      next();
    },
    destroy() {
      timers.forEach((t) => t.remove());
      timers = [];
      flashing?.remove();
      masks.forEach(({ shape }) => shape.destroy());
      root.destroy();
    },
  };
  scene.events.once('shutdown', () => {
    timers.forEach((t) => t.remove());
    masks.forEach(({ shape }) => shape.destroy());
  });
  return machine;
}
