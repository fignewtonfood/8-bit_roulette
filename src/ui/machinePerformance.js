// The Act III machine's choreography (art team's performance.mjs, theatrical
// revision v2). The cue tables are theirs, unchanged; the code is reformatted.
//
// Presentation only. It never sees a result, never uses the game's RNG and
// never delays input. The scene calls play(cue) when something really happens
// (lever accepted, reels start, reel stops, result shown) and update(delta)
// from its own game clock, so pausing the scene pauses the performance.

// Each row: [ms, face, lights, lever, bodyY, spectacle]. A cue holds its last
// row until the next play(). 'spin' loops every 640 ms.
// face:      0 ready, 1 delight, 2 anticipation, 3 proud reveal, 4 pride,
//            5 quiet, 6 blink, 7 vulnerable
// lights:    0 dim, 1-5 travelling, 6 full performance, 7 quiet (bulbs and stage lights)
// lever:     0 up, 1 midway, 2 down
// spectacle: 0 none, 1-6 sparse stars
export const CUES = {
  idle: [[0, 0, 0, 0, 0, 0]],
  welcome: [[0, 0, 0, 0, 0, 0], [300, 4, 2, 0, -1, 1], [700, 0, 0, 0, 0, 0]],
  pull: [[0, 2, 2, 1, 0, 0], [80, 2, 3, 2, 1, 0], [240, 2, 0, 0, 0, 0]],
  spin: [[0, 2, 1, 0, 0, 1], [160, 1, 2, 0, 0, 2], [320, 2, 3, 0, 0, 3], [480, 1, 4, 0, 0, 4]],
  settle: [[0, 4, 6, 0, 0, 1], [120, 0, 0, 0, 0, 0]],
  celebrate: [[0, 2, 2, 0, 1, 1], [160, 1, 3, 0, -1, 2], [320, 3, 6, 0, -2, 4], [640, 3, 6, 0, -1, 5], [880, 4, 3, 0, 0, 1], [1200, 5, 7, 0, 0, 0]],
  doubt: [[0, 7, 0, 0, 0, 0], [600, 5, 0, 0, 0, 0]],
  overwhelm: [[0, 2, 6, 0, 0, 1], [400, 7, 0, 0, 0, 0], [1400, 5, 7, 0, 0, 0]],
  quiet: [[0, 5, 7, 0, 0, 0]],
  blink: [[0, 6, 0, 0, 0, 0], [100, 0, 0, 0, 0, 0]],
};
const SPIN_LOOP = 640;
const GLITCH_MS = 50;

// render(pose) gets { face, bulbs, stageLights, lever, reelFinish, spectacle, glitch, bodyY }.
// Reduced motion keeps faces and the lever; no lights, stars, glitches or lift.
export function createPerformance(render, { reducedMotion = false } = {}) {
  let cue = 'idle';
  let elapsed = 0;
  let then = null; // a cue to play once this one has reached its last row
  let glitch = 0;
  let glitchLeft = 0;
  let dead = false;

  const emit = () => {
    const rows = CUES[cue];
    const t = cue === 'spin' ? elapsed % SPIN_LOOP : elapsed;
    let row = rows[0];
    for (const r of rows) if (r[0] <= t) row = r;
    const [, face, lights, lever, bodyY, spectacle] = row;
    const still = reducedMotion;
    render({
      face,
      lever,
      bulbs: still ? 0 : lights,
      stageLights: still ? 0 : lights,
      bodyY: still ? 0 : bodyY,
      spectacle: still ? 0 : spectacle,
      // 1 = the steady row frame; 2-5 = a reflection sweeping across while spinning
      reelFinish: still || cue !== 'spin' ? 1 : 2 + (Math.floor(elapsed / 160) % 4),
      glitch: still ? 0 : glitch,
    });
  };

  const perf = {
    get cue() {
      return cue;
    },
    play(name, next = null) {
      if (dead) return;
      if (!CUES[name]) throw Error(`Unknown cue ${name}`);
      cue = name;
      then = next;
      elapsed = 0;
      glitch = 0;
      glitchLeft = 0;
      emit();
    },
    update(delta) {
      if (dead) return;
      if (!Number.isFinite(delta) || delta < 0) throw Error('Expected nonnegative delta');
      elapsed += delta;
      if (glitchLeft > 0) {
        glitchLeft -= delta;
        if (glitchLeft <= 0) glitch = 0;
      }
      const rows = CUES[cue];
      if (then && elapsed >= rows[rows.length - 1][0]) return perf.play(then);
      emit();
    },
    // A 50 ms flicker on the face screen (frame 1 or 2), only while idle or
    // quiet. The caller decides when it's allowed (the art team's policy:
    // 8+ spins in, 180 s apart, at most once per visit and three per session).
    foreshadow(frame = 1) {
      if (dead || reducedMotion || !['idle', 'quiet'].includes(cue)) return false;
      if (![1, 2].includes(frame)) throw Error('Unknown glitch');
      glitch = frame;
      glitchLeft = GLITCH_MS;
      emit();
      return true;
    },
    destroy() {
      if (dead) return;
      cue = 'idle';
      then = null;
      elapsed = 0;
      glitch = 0;
      emit();
      dead = true;
    },
  };
  return perf;
}
