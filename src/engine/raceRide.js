// The racer's bike: how it rides over a track, shared by the race scene
// (the player and every rival) and the Node check tool (npm run check:race),
// which rides a test bot through thousands of stages to prove each one can
// be finished. No Phaser in here.
//
// A track is a row of columns, each one flat ground, a ramp up ('/'), a ramp
// down ('\') or a pit (see src/gen/tracks.js). Only the top of each column
// matters, so the ground is one smooth line the bike follows.
//
// How the bike works:
//   - On the ground: gas (Right) speeds up, brake (Left) slows down, nothing
//     held coasts to a stop. It follows the ground up and down ramps.
//   - Riding off the top of a ramp launches you. Jump (Space/Up) hops.
//     Jumping on a ramp, or just after leaving its lip, launches higher.
//   - In the air, Down leans forward (nose down) and Left leans back (nose
//     up); with neither held the bike keeps the angle it left the ground at
//     (straight off a ramp: nose up 45 degrees). Land matching the
//     ground's angle: close is a clean landing (a little speed), a bit off is
//     rough (you lose speed and wobble), way off is a crash.
//   - Riding into a wall (ground more than a few pixels higher) stops you dead.
//   - Mud (~) halves your top speed; a boost pad (=) shoots you forward.

export const TILE = 16;

// Feel knobs. Speeds are px/s, accelerations px/s², angles degrees.
export const RIDE = {
  top: 150,          // full speed on flat ground (before twists, mud and pads)
  accel: 140,        // gas
  brake: 300,        // brake
  coast: 45,         // slowing down with nothing held
  overDrag: 160,     // how fast you drop back to top speed after a boost
  uphill: 60,        // lost riding up a ramp (gas still beats it)
  gravity: 650,
  hop: 230,          // jump strength (Low Gravity's jumpScale scales it)
  shortHop: 0.45,    // let go of jump early: the hop is cut to this share
  rampKick: 1.6,     // leaving a ramp: up speed = your speed x this
  lipWindow: 0.15,   // s after leaving a ramp when jump still adds to it
  lipBonus: 1.3,     // a jump on a ramp or at its lip launches this much harder
  lean: 240,         // °/s while leaning
  autoLevel: 0,      // °/s back toward level with nothing held (0 = it never levels itself)
  maxLean: 75,
  clean: 12,         // land within this many ° of the ground: clean
  rough: 30,         // within this: rough landing; more: crash
  roughSpeed: 0.5,   // a rough landing keeps this share of your speed
  wobble: 0.5,       // s with no control after a rough landing or a kick
  cleanBonus: 15,    // px/s for a clean landing after a real jump
  cleanAir: 0.35,    // s in the air that counts as a real jump
  step: 3,           // px of rise the wheels roll over; more is a wall
  bounceBack: 12,    // px a wall knocks you back, so there's room to hop it
  hopMin: 50,        // a hop always carries you forward at least this fast
  cliff: 4,          // px of drop the wheels stay down for; more and you fly
  mudTop: 0.5,
  boostTop: 1.4,
  boostAccel: 3,
  boostTime: 1.0,
};

const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

// The top of the ground at world x (px): { y, slope, kind } or null over a
// pit. slope: -1 up-ramp, 0 flat, 1 down-ramp. Past either end of the track
// the end columns carry on. `out` is reused to save garbage (pass {} once).
export function surface(cols, px, out = {}) {
  let c = Math.floor(px / TILE);
  if (c < 0) c = 0;
  else if (c >= cols.length) c = cols.length - 1;
  const col = cols[c];
  if (col.kind === 'pit') return null;
  const u = px - c * TILE;
  out.kind = col.kind;
  out.col = c;
  if (col.kind === 'flat') {
    out.y = col.row * TILE;
    out.slope = 0;
  } else if (col.kind === 'up') {
    out.y = (col.row + 1) * TILE - Math.min(TILE, Math.max(0, u));
    out.slope = -1;
  } else {
    out.y = col.row * TILE + Math.min(TILE, Math.max(0, u));
    out.slope = 1;
  }
  return out;
}

export function newRider(x, y) {
  return { x, y, vy: 0, speed: 0, air: false, airT: 0, angle: 0, boostT: 0, wobble: 0, lipT: 0, lipped: false, hopping: false };
}

// One step of a rider. Returns a list of what happened this step:
//   'hop' 'launch' 'lip' 'boost' 'bonk' 'clean' 'rough' 'crash' 'fell'
// input: { gas, brake, jump (just pressed), jumpHeld, lean (-1 back, 1 forward, 0) }
// ctx:   { cols, mud: Set, boosts: Set (columns), heightPx,
//          mods (the twist's racer settings: gravityScale, jumpScale, grip),
//          groundMul (your ground speed: Mud/Speedy, wind, a speed perk),
//          airMul (wind only: jumps never change with Mud or Speedy),
//          gravityMul (the Gravity twist), topMul (nitro), boostMul (nitro) }
const s1 = {};
const s2 = {};
export function stepRider(r, input, dt, ctx) {
  const ev = [];
  const mods = ctx.mods || {};
  const g = RIDE.gravity * (mods.gravityScale ?? 1) * (ctx.gravityMul ?? 1);
  const grip = mods.grip ?? 1;
  const jumpScale = mods.jumpScale ?? 1;
  r.boostT = Math.max(0, r.boostT - dt);
  r.wobble = Math.max(0, r.wobble - dt);
  r.lipT -= dt;
  const control = r.wobble <= 0;

  if (!r.air) {
    const col = Math.floor(r.x / TILE);
    const here = surface(ctx.cols, r.x, s1);
    if (ctx.boosts.has(col)) {
      if (r.boostT <= 0) ev.push('boost');
      r.boostT = Math.max(r.boostT, RIDE.boostTime * (ctx.boostMul ?? 1));
    }
    const mud = ctx.mud.has(col);
    const boosting = r.boostT > 0;
    const cap = RIDE.top * (ctx.topMul ?? 1) * (boosting ? RIDE.boostTop : 1) * (mud ? RIDE.mudTop : 1);
    if (control && input.gas) {
      if (r.speed < cap) r.speed = Math.min(cap, r.speed + RIDE.accel * grip * (boosting ? RIDE.boostAccel : 1) * (mud ? 0.5 : 1) * dt);
    } else if (control && input.brake) {
      r.speed = Math.max(0, r.speed - RIDE.brake * grip * dt);
    } else {
      r.speed = Math.max(0, r.speed - RIDE.coast * dt);
    }
    if (r.speed > cap) r.speed = Math.max(cap, r.speed - RIDE.overDrag * (mud ? 2 : 1) * dt);
    if (here && here.slope < 0) r.speed = Math.max(0, r.speed - RIDE.uphill * dt);
    const vx = r.speed * (ctx.groundMul ?? 1);

    // Jump: a hop, or a big launch when you're on a ramp.
    if (control && input.jump) {
      r.air = true;
      r.airT = 0;
      if (here && here.slope < 0) {
        r.vy = -Math.max(RIDE.hop * jumpScale, vx * RIDE.rampKick * jumpScale) * RIDE.lipBonus;
        r.lipped = true;
        r.hopping = false;
        ev.push('lip');
      } else {
        r.vy = -RIDE.hop * jumpScale;
        r.speed = Math.max(r.speed, RIDE.hopMin);
        r.hopping = true;
        r.angle = Math.min(r.angle, -8);
        ev.push('hop');
      }
    } else {
      const nx = r.x + vx * dt;
      const next = surface(ctx.cols, nx, s2);
      if (next) {
        const climbing = next.slope < 0 || (here && here.slope < 0);
        const allowed = RIDE.step + (climbing ? vx * dt + 1 : 0);
        if (r.y - next.y > allowed) {
          // A wall: stopped dead, and knocked back a little (onto ground at
          // the same height or lower, never into a pit) so there's room to hop it.
          if (r.speed > 20) ev.push('bonk');
          r.speed = 0;
          const back = surface(ctx.cols, r.x - RIDE.bounceBack, s2);
          if (back && Math.abs(back.y - r.y) <= RIDE.step) r.x -= RIDE.bounceBack;
          return ev;
        }
      }
      if (here && here.kind === 'up' && (!next || next.kind !== 'up')) {
        // Over the lip of a ramp (onto anything, a pit included): launched.
        r.y = ctx.cols[here.col].row * TILE;
        r.x = nx;
        r.air = true;
        r.airT = 0;
        r.vy = -vx * RIDE.rampKick * jumpScale;
        r.angle = -45;
        r.lipT = RIDE.lipWindow;
        r.lipped = false;
        r.hopping = false;
        ev.push('launch');
      } else if (!next) {
        // The ground ends: ride off into the air.
        r.x = nx;
        r.air = true;
        r.airT = 0;
        r.vy = 0;
        r.hopping = false;
        ev.push('launch');
      } else if (next.y > r.y + RIDE.cliff + Math.max(0, next.slope) * vx * dt + 1) {
        // The ground drops away: ride off the edge.
        r.x = nx;
        r.air = true;
        r.airT = 0;
        r.vy = 0;
        r.hopping = false;
        ev.push('launch');
      } else {
        r.x = nx;
        r.y = next.y;
        r.angle = approach(r.angle, next.slope * 45, 400 * dt);
      }
      if (!r.air) return ev;
    }
  }

  // In the air
  r.airT += dt;
  if (control) {
    if (input.lean) r.angle = Math.max(-RIDE.maxLean, Math.min(RIDE.maxLean, r.angle + input.lean * RIDE.lean * dt));
    else if (RIDE.autoLevel) r.angle = approach(r.angle, 0, RIDE.autoLevel * dt);
  }
  if (r.hopping && !input.jumpHeld && r.vy < -RIDE.hop * jumpScale * RIDE.shortHop) r.vy = -RIDE.hop * jumpScale * RIDE.shortHop;
  if (control && input.jump && r.lipT > 0 && !r.lipped) {
    r.vy *= RIDE.lipBonus;
    r.lipped = true;
    ev.push('lip');
  }
  r.vy += g * dt;
  const vx = r.speed * (ctx.airMul ?? 1);
  let nx = r.x + vx * dt;
  const ny = r.y + r.vy * dt;
  let s = surface(ctx.cols, nx, s2);
  if (s && ny > s.y + RIDE.step && r.y > s.y + RIDE.step) {
    // Flew into the side of the ground: stopped, and you drop.
    if (r.speed > 20) ev.push('bonk');
    r.speed = 0;
    nx = r.x;
    s = surface(ctx.cols, nx, s2);
  }
  if (s && r.vy >= 0 && ny >= s.y) {
    const want = s.slope * 45;
    const off = Math.abs(r.angle - want);
    const real = r.airT >= RIDE.cleanAir;
    r.x = nx;
    r.y = s.y;
    r.air = false;
    r.vy = 0;
    r.hopping = false;
    r.angle = want;
    if (off > RIDE.rough) ev.push('crash');
    else if (off > RIDE.clean) {
      r.speed *= RIDE.roughSpeed;
      r.wobble = RIDE.wobble;
      ev.push('rough');
    } else {
      if (real) r.speed = Math.min(r.speed + RIDE.cleanBonus, RIDE.top * RIDE.boostTop);
      ev.push('clean');
    }
    return ev;
  }
  r.x = nx;
  r.y = ny;
  if (r.y > ctx.heightPx + 16) ev.push('fell');
  return ev;
}

// Where an airborne rider will come down if nothing changes: the ground it
// lands on ({ y, slope, kind, col, x }) or null (a pit, or off the track).
const sp = {};
export function predictLanding(r, ctx, maxT = 3) {
  const g = RIDE.gravity * (ctx.mods?.gravityScale ?? 1) * (ctx.gravityMul ?? 1);
  const vx = r.speed * (ctx.airMul ?? 1);
  const dt = 1 / 60;
  let { x, y, vy } = r;
  let spiked = false; // brushes spikes on the way (only checked when ctx.spikes is given)
  const probe = { x, y };
  for (let t = 0; t < maxT; t += dt) {
    vy += g * dt;
    x += vx * dt;
    y += vy * dt;
    const s = surface(ctx.cols, x, sp);
    if (s && y > s.y + RIDE.step && y - vy * dt > s.y + RIDE.step) return { ...s, x, wall: true, spiked }; // into the side of a wall
    if (ctx.spikes && !spiked) {
      probe.x = x;
      probe.y = Math.min(y, s ? s.y : y);
      spiked = touchesSpikes(probe, ctx);
    }
    if (s && vy >= 0 && y >= s.y) return { ...s, x, spiked };
    if (y > ctx.heightPx + 16) return null;
  }
  return null;
}

// Spikes sit in the bottom of the tile above the ground. Does the bike touch
// any? (Its wheels span x ± HALF_W; spikes are SPIKE_H px tall.)
export const HALF_W = 6;
export const SPIKE_H = 7;
export function touchesSpikes(r, ctx) {
  const c0 = Math.floor((r.x - HALF_W) / TILE);
  const c1 = Math.floor((r.x + HALF_W) / TILE);
  for (let c = c0; c <= c1; c++) {
    if (!ctx.spikes.has(c)) continue;
    const top = ctx.cols[c].row * TILE;
    if (r.y > top - SPIKE_H) return true;
  }
  return false;
}

// What's ahead of a rider on the ground that it has to jump: the nearest
// pit, spikes or wall within `look` px of its front wheel, unless a ramp up
// comes first (riding off it is the jump). { at (px from the front), kind,
// height (walls: px) } or null.
export const FRONT = 8; // px from the bike's middle to its front wheel
export function nextThreat(r, ctx, look = 96) {
  const front = r.x + FRONT;
  const c0 = Math.floor(front / TILE);
  let prevY = surface(ctx.cols, front, sp)?.y ?? r.y;
  for (let c = c0; c <= c0 + Math.ceil(look / TILE) && c < ctx.cols.length; c++) {
    const col = ctx.cols[c];
    const at = Math.max(0, c * TILE - front);
    if (c > c0 && col.kind === 'up') return null;
    if (col.kind === 'pit') return { at, kind: 'pit', col: c };
    if (ctx.spikes.has(c)) return { at, kind: 'spikes', col: c };
    const top = col.kind === 'down' ? col.row * TILE : col.kind === 'up' ? (col.row + 1) * TILE : col.row * TILE;
    if (c > c0 && prevY - top > RIDE.step) return { at, kind: 'wall', col: c, height: prevY - top };
    prevY = col.kind === 'down' ? (col.row + 1) * TILE : col.row * TILE;
  }
  return null;
}

// Would landing here (from predictLanding) hurt? Spikes under or next to the
// wheels.
function badLanding(land, ctx) {
  if (land.wall) return true;
  const c0 = Math.floor((land.x - HALF_W) / TILE);
  const c1 = Math.floor((land.x + HALF_W) / TILE);
  for (let c = c0; c <= c1 + 1; c++) if (ctx.spikes.has(c) || ctx.cols[c]?.kind === 'pit') return true;
  return false;
}

// Riding on up the ramp a rider is on and off its top, with no jump: does
// it come down somewhere safe?
function plainLaunchLands(r, ctx) {
  let c = Math.floor(r.x / TILE);
  while (ctx.cols[c + 1]?.kind === 'up') c++;
  const vx = r.speed * (ctx.groundMul ?? 1);
  const launched = { ...r, x: (c + 1) * TILE, y: ctx.cols[c].row * TILE, vy: -vx * RIDE.rampKick * (ctx.mods?.jumpScale ?? 1), air: true };
  const land = predictLanding(launched, ctx);
  return !!land && !land.spiked && !badLanding(land, ctx);
}

// How a rider the game controls rides: rivals, and the check tool's test
// rider. It settles at `target` speed, jumps pits, spikes and walls at the
// last moment, and leans to match the ground it's about to land on.
export function botInput(r, ctx, { target = RIDE.top } = {}) {
  const input = { gas: r.speed < target, brake: r.speed > target * 1.2, jump: false, jumpHeld: true, lean: 0 };
  if (!r.air) {
    const threat = nextThreat(r, ctx);
    if (threat) {
      const vx = Math.max(1, r.speed * (ctx.groundMul ?? 1));
      const g = RIDE.gravity * (ctx.mods?.gravityScale ?? 1) * (ctx.gravityMul ?? 1);
      const vy = RIDE.hop * (ctx.mods?.jumpScale ?? 1);
      let trigger = 3 + vx * (1 / 30);
      if (threat.kind === 'wall') {
        const h = threat.height + 2;
        const disc = vy * vy - 2 * g * h;
        const t = disc > 0 ? (vy - Math.sqrt(disc)) / g : vy / g;
        trigger = vx * t + 8;
      }
      if (threat.at <= trigger) input.jump = true;
      // On a ramp, only jump (a lip launch, much bigger) if riding off the
      // top would come down short: a big launch can overshoot the landing.
      if (input.jump && surface(ctx.cols, r.x, sp)?.slope < 0 && plainLaunchLands(r, ctx)) input.jump = false;
      if (r.speed < 40) input.gas = true; // never stall in front of a jump
    }
  } else {
    let land = predictLanding(r, ctx);
    // A hop that would land somewhere bad (a pit, spikes) when a shorter one
    // wouldn't: let go of jump to cut it short.
    if (r.hopping && r.vy < 0) {
      const cut = { ...r, vy: Math.max(r.vy, -RIDE.hop * (ctx.mods?.jumpScale ?? 1) * RIDE.shortHop) };
      const short = predictLanding(cut, ctx);
      if (short && !short.spiked && !badLanding(short, ctx) && (!land || land.spiked || badLanding(land, ctx))) {
        input.jumpHeld = false;
        land = short;
      }
    }
    const want = land ? land.slope * 45 : 0;
    const d = want - r.angle;
    input.lean = Math.abs(d) < 4 ? 0 : Math.sign(d);
  }
  return input;
}

// How long a stage gives you, in seconds: generous for a clean ride at
// about 60% of top speed (slower twists get longer), plus a buffer.
// groundMul: the twist's ground speed (Mud below 1, Speedy above).
export const TIME_SHARE = 0.6;
export const TIME_BUFFER = 12;
export function timeLimit(level, groundMul = 1) {
  const px = (level.flag.x - level.playerStart.x) * TILE - (level.bossLoop ? level.bossLoop.w * TILE : 0);
  return Math.ceil(px / (RIDE.top * TIME_SHARE * Math.min(1, groundMul)) + TIME_BUFFER);
}

// A crashed rider comes back already moving (at this share of top speed),
// so the run-up to the next jump never depends on how quickly the twist
// lets you speed up (Slippery, Mud).
export const RESPAWN_SPEED = 0.8;
export function respawnRider(level, px, inLoop = false) {
  const col = respawnColumn(level, px, inLoop);
  const r = newRider(col * TILE + 8, level.cols[col].row * TILE);
  r.speed = RIDE.top * RESPAWN_SPEED;
  return r;
}

// Where a crashed rider comes back: the last safe column at least `back`
// tiles behind where the crash happened (level.safe is sorted). Safe
// columns have a clear run-up ahead (see buildRace.js), so you always get
// back up to speed before the next jump. Locked in the boss loop, it's the
// loop's own safe column.
export const RESPAWN_BACK = 3;
export function respawnColumn(level, px, inLoop = false, back = RESPAWN_BACK) {
  const col = Math.floor(px / TILE);
  if (inLoop && level.bossLoop) {
    // Behind you in the loop, or (near its start) round the back of it.
    const safe = level.bossLoop.safe;
    return [...safe].reverse().find((c) => c <= col - back) ?? safe[safe.length - 1];
  }
  let best = level.safe[0];
  for (const c of level.safe) {
    if (c <= col - back) best = c;
    else break;
  }
  return best;
}
