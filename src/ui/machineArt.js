// The Machine's sprites (machine art v3 from the art team). Six versions:
// the hub cabinet and the full-screen spin console, for Acts I, II and III.
// The PNGs live in public/assets/machine-v3/<variant>/ and src/data/machineArt.json
// says how big every sheet is, where the reel windows are, and so on.
//
// This only draws. The game decides results and timing (spin.js, SpinScene)
// and tells the machine what just happened with react(); the pictured
// cherries and stars never mean anything.
//
// Layers, back to front, come from each variant's layerOrder in the manifest.
// Acts I and II: reel bed, game-owned reel content, cabinet, face, bulbs,
// broken bulb, lever. Act III adds reveal rays (behind everything), reel
// reflections (behind the reel text), the reel finish, a crown sweep, stage
// lights, stars and the face-screen glitch. The broken bulb never lights, not
// even in a celebration, and nothing here repairs the wear.

import Phaser from 'phaser';
import manifest from '../data/machineArt.json';
import { session } from '../engine/profile.js';
import { createPerformance } from './machinePerformance.js';

// Acts I and II: face, lever and bulb frames.
const FACE = { smile: 0, blink: 1, eager: 2, concern: 3, wink: 4 };
const LEVER = { up: 0, mid: 1, down: 2 };
const BULBS = { dim: 0, on: 1 };
const SPIN_FRAMES = [4, 5]; // hub symbols: the two blur patterns

// Which act's machine to show. Act II arrives with the first machine upgrade
// (Milestone 12); until then it's Act I. ?act=2 or ?act=3 in the URL previews the others.
export const machineAct = () => ([2, 3].includes(session.act) ? session.act : 1);

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

// What the game can tell the machine (react(event)):
//   pull      the lever's pulled at the slot machine; the reels start
//   hubPull   the lever's pulled in the hub; the slot machine screen opens next
//   reroll    a reel landed on a combo that can't happen and will spin again
//   glitch    the theme reel glitched
//   spinAgain the reels are going again after a reroll or glitch
//   stop      the last reel stopped
//   reveal    the result is on screen
export const MACHINE_EVENTS = ['pull', 'hubPull', 'reroll', 'glitch', 'spinAgain', 'stop', 'reveal'];

// kind: 'hub' (stands on the floor at centerX) or 'spin' (fills the screen).
export function createMachineArt(scene, kind, { centerX = 128, floorY = 192 } = {}) {
  const act = machineAct();
  const id = `${kind}-act${act}`;
  const v = manifest.variants[id];
  const hub = kind === 'hub';
  const theatre = act === 3;
  const scale = v.recommendedScale;
  const x = hub ? centerX - (v.frame.width * scale) / 2 : 0;
  const y = hub ? floorY - v.floorContactY * scale : 0;
  const root = scene.add.container(x, y).setScale(scale);
  const layer = (name, frame = 0) => {
    const img = scene.add.image(0, 0, `machine-v3/${id}/${name}`, frame).setOrigin(0);
    root.add(img);
    return img;
  };

  // Build the stack in the art team's order. 'game reel contents' is ours;
  // 'game text' is the scene's, drawn on top of the whole machine.
  const FIRST_FRAME = { bulbs: theatre ? 0 : BULBS.on, 'reel-finish': 1, lever: LEVER.up };
  const layers = {};
  let reelContent = null;
  for (const name of v.layerOrder) {
    if (name === 'game text') continue;
    if (name === 'game reel contents') {
      reelContent = scene.add.container(0, 0);
      root.add(reelContent);
    } else layers[name] = layer(name, FIRST_FRAME[name] ?? 0);
  }
  const { face, bulbs, lever } = layers;

  // The reel windows in screen pixels, for game text: [x, y, w, h].
  const windows = v.reelWindows.map(([rx, ry, w, h]) => [x + rx * scale, y + ry * scale, w * scale, h * scale]);
  const symbols = hub
    ? v.reelWindows.map(([rx, ry], i) => {
        const img = scene.add.image(rx, ry, `machine-v3/${id}/symbols`, i).setOrigin(0);
        reelContent.add(img);
        return img;
      })
    : [];

  // Text that scrolls or clunks inside a window stays inside it.
  // (Masks are in screen space; only the hub ever lifts, and its symbols aren't masked.)
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
  let flashing = null;
  let reaction = 0; // bumps on every react(), so a stale wink sequence stops

  const blurSymbols = () => {
    let phase = 0;
    timers.push(scene.time.addEvent({ delay: 80, loop: true, callback: () => {
      phase ^= 1;
      symbols.forEach((s) => s.setFrame(SPIN_FRAMES[phase]));
    } }));
  };

  // ---------- Acts I and II: a few frames, swapped on timers ----------

  const lights = (on) => {
    flashing?.remove();
    flashing = null;
    bulbs.setFrame(on ? BULBS.on : BULBS.dim);
  };
  const flashLights = (ms = 120) => {
    lights(true);
    flashing = scene.time.addEvent({ delay: ms, loop: true, callback: () => bulbs.setFrame(bulbs.frame.name === BULBS.on ? BULBS.dim : BULBS.on) });
  };
  // Up, middle, down; back up after `upAfter` ms (or stays down if null).
  const pullLever = (upAfter = 240) => {
    lever.setFrame(LEVER.mid);
    later(80, () => lever.setFrame(LEVER.down));
    if (upAfter != null) later(upAfter, () => lever.setFrame(LEVER.up));
  };
  const classic = {
    pull() {
      face.setFrame(FACE.eager);
      flashLights();
      pullLever();
    },
    hubPull() {
      face.setFrame(FACE.eager);
      pullLever(null);
      blurSymbols();
    },
    reroll() {
      face.setFrame(FACE.concern);
      lights(false);
    },
    glitch() {
      face.setFrame(FACE.concern);
    },
    spinAgain() {
      face.setFrame(FACE.eager);
      flashLights();
    },
    stop() {},
    // Bulbs steady, a wink, twice, then back to a smile.
    reveal() {
      lights(true);
      const mine = reaction;
      [[0, FACE.wink], [160, FACE.smile], [400, FACE.wink], [560, FACE.smile]].forEach(([at, f]) =>
        later(at, () => mine === reaction && face.setFrame(f)));
    },
  };

  // ---------- Act III: the art team's choreography ----------

  let perf = null;
  if (theatre) {
    const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Which pose field sets which layer's frame (reflections follow the reel finish).
    const DRIVEN_BY = {
      face: 'face', bulbs: 'bulbs', 'stage-lights': 'stageLights', 'crown-sweep': 'crownSweep',
      'reveal-rays': 'revealRays', lever: 'lever', 'reel-finish': 'reelFinish',
      'reel-reflection': 'reelFinish', spectacle: 'spectacle', glitch: 'glitch',
    };
    perf = createPerformance((pose) => {
      for (const [name, field] of Object.entries(DRIVEN_BY)) layers[name]?.setFrame(pose[field]);
      // The hub machine hops a pixel or two; collision and prompts don't move.
      // The slot machine screen stays put so the reel text lines up.
      if (hub) root.y = y + pose.bodyY * scale;
    }, { reducedMotion });
    perf.play('welcome', 'idle');
  }
  const theatrical = {
    pull: () => perf.play('pull', 'spin'),
    hubPull() {
      perf.play('pull');
      blurSymbols();
    },
    reroll: () => perf.play('doubt'),
    glitch: () => perf.play('doubt'),
    spinAgain: () => perf.play('spin'),
    stop: () => perf.play('settle'),
    reveal: () => perf.play('celebrate'), // ends quiet, eyes closed, and holds
  };
  const onUpdate = (_time, delta) => perf.update(delta);
  if (perf) scene.events.on('update', onUpdate);

  const cleanUp = () => {
    timers.forEach((t) => t.remove());
    timers = [];
    flashing?.remove();
    flashing = null;
    if (perf) {
      scene.events.off('update', onUpdate);
      perf.destroy();
    }
    masks.forEach(({ shape }) => shape.destroy());
    masks.length = 0;
  };

  const machine = {
    id, act, root, reelContent, windows, symbols, face,
    faceRegion: v.faceRegion.map((n, i) => (i === 0 ? x + n * scale : i === 1 ? y + n * scale : n * scale)),
    textRegions: v.textRegions,
    prompt: v.hubPlacement?.prompt,
    clip,
    react(event) {
      if (!MACHINE_EVENTS.includes(event)) throw Error(`Unknown machine event ${event}`);
      reaction++;
      (theatre ? theatrical : classic)[event]();
    },
    // Idle: a 100 ms blink, whenever canBlink() says so. Acts I and II blink
    // every 3-5 seconds; Act III after 4 seconds at rest, and never while quiet.
    startBlinking(canBlink = () => true) {
      const next = () => later(theatre ? 4000 : Phaser.Math.Between(3000, 5000), () => {
        const resting = theatre ? perf.cue === 'idle' : face.frame.name === FACE.smile;
        if (!canBlink() || !resting) return next();
        if (theatre) perf.play('blink', 'idle');
        else {
          face.setFrame(FACE.blink);
          later(100, () => face.frame.name === FACE.blink && face.setFrame(FACE.smile));
        }
        later(100, next);
      });
      next();
    },
    destroy() {
      cleanUp();
      root.destroy();
    },
  };
  scene.events.once('shutdown', cleanUp);
  return machine;
}
