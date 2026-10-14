// Builds thousands of race stages and rides a test bot through them.
// Run with: npm run check:race
//
//  1. Twist tags name real twists that support racing.
//  2. Every piece on its own (start + piece + exit), with every twist it can
//     show up with, at every twist level, in the worst conditions that twist
//     brings (Windy: the wind in your face the whole time; Gravity: pulling
//     down the whole time). The bot must clear it without crashing. A piece
//     that fails is named with the twist and level, so you know what to fix
//     (or which twist to keep it away from with notTwists).
//  3. SEEDS stages x 5 stage numbers for every twist: budget, start, flag,
//     the same seed builds the same stage, twist tags respected, Collector /
//     Killer minimums met, and somewhere safe to come back after every crash.
//  4. RIDES whole stages per twist at every level, with the wind and gravity
//     swapping like the game: the bot must finish every one inside the time
//     limit without getting stuck (crashing over and over in one place).

import { buildRace, RACE_PACING } from '../src/gen/buildRace.js';
import { TRACKS, BOSS_TRACKS } from '../src/gen/tracks.js'; // importing also validates every piece
import { fitsTwist } from '../src/gen/chunks.js';
import { pacingFor } from '../src/gen/pacing.js';
import { loadContent } from './load-content.js';
import { stageRules, twistMaxLevel, twistSettings } from '../src/engine/content.js';
import { windScale } from '../src/engine/speed.js';
import { RIDE, TILE, newRider, stepRider, botInput, touchesSpikes, respawnColumn, timeLimit } from '../src/engine/raceRide.js';

const GENRE = 'racer';
const SEEDS = 400;  // per twist, structure checks
const RIDES = 12;   // per twist per level, full stages ridden (x 5 stage numbers)
const DT = 1 / 60;
const content = loadContent();
const twists = Object.keys(content.twists).filter((id) => content.twists[id].genres[GENRE]);
const problems = [];
const usage = Object.fromEntries(TRACKS.map((t) => [t.id, 0]));

// ---------- 1. Tags ----------
for (const t of TRACKS) {
  for (const id of [...(t.twists || []), ...(t.notTwists || [])]) {
    if (!content.twists[id]) problems.push(`track "${t.id}": unknown twist "${id}" (options: ${Object.keys(content.twists).join(', ')})`);
    else if (!twists.includes(id)) problems.push(`track "${t.id}": twist "${id}" doesn't support racing, so the tag does nothing`);
  }
  if (t.notTwists && twists.every((id) => t.notTwists.includes(id))) problems.push(`track "${t.id}": notTwists leaves out every twist, so it can never show up`);
}
for (const twist of twists) {
  for (const type of ['start', 'exit', 'rest', 'jump', 'race']) {
    if (!TRACKS.some((t) => t.type === type && fitsTwist(t, twist))) problems.push(`${twist}: no ${type} piece it can use`);
  }
}

// ---------- The test rider ----------
// Twist settings as the scene uses them: ground speed (Mud, Speedy, wind),
// air speed (wind only), and gravity (the Gravity twist's arrow).
function conditions(mods, t, worst) {
  let wind = 0;
  if (mods.wind) wind = worst ? -1 : (Math.floor(t / mods.windEvery) % 2 ? 1 : -1); // starts blowing left: in your face
  let pull = 0;
  if (mods.pull) pull = worst || !mods.shiftEvery ? 1 : (Math.floor(t / mods.shiftEvery) % 2 ? -1 : 1);
  const w = wind ? windScale(mods, wind, 1) : 1;
  return { groundMul: (mods.runScale ?? 1) * w, airMul: w, gravityMul: 1 + pull * (mods.pull ?? 0) };
}

function ctxFor(level, mods) {
  return {
    cols: level.cols,
    mud: new Set(level.mud.map((p) => p.x)),
    boosts: new Set(level.boosts.map((p) => p.x)),
    spikes: new Set(level.spikes.map((p) => p.x)),
    heightPx: level.heightTiles * TILE,
    mods,
  };
}

// Rides from the start to the flag. Returns { finished, time, crashes, stuckAt }.
// A crash puts the bot back on a safe column like the game does; crashing
// STUCK times without getting past the same spot means it's stuck.
const STUCK = 4;
function ride(level, mods, { worst = false, maxTime = 400 } = {}) {
  const ctx = ctxFor(level, mods);
  const s = level.playerStart;
  let r = newRider(s.x * TILE + 8, (s.y + 1) * TILE);
  const finishX = level.flag.x * TILE;
  let t = 0;
  let crashes = 0;
  let furthest = 0;
  let sinceProgress = 0;
  const crashAt = [];
  while (t < maxTime) {
    Object.assign(ctx, conditions(mods, t, worst));
    const input = botInput(r, ctx, { target: RIDE.top * 2 });
    const ev = stepRider(r, input, DT, ctx);
    t += DT;
    if (r.x >= finishX) return { finished: true, time: t, crashes };
    if (ev.includes('crash') || ev.includes('fell') || touchesSpikes(r, ctx)) {
      crashes++;
      crashAt.push(Math.floor(r.x / TILE));
      if (r.x <= furthest + 2 * TILE) sinceProgress++;
      else sinceProgress = 1;
      furthest = Math.max(furthest, r.x);
      if (sinceProgress >= STUCK) return { finished: false, time: t, crashes, stuckAt: Math.floor(r.x / TILE), crashAt };
      const col = respawnColumn(level, r.x);
      r = newRider(col * TILE + 8, level.cols[col].row * TILE);
    }
  }
  return { finished: false, time: t, crashes, stuckAt: Math.floor(r.x / TILE), timedOut: true, crashAt };
}

// A stage of just start + piece + exit (no rivals), for testing one piece.
function soloLevel(piece) {
  const start = TRACKS.find((t) => t.id === 'start');
  const exit = TRACKS.find((t) => t.id === 'exit');
  const fake = { ...piece, type: piece.type === 'boss' ? 'jump' : piece.type };
  const seq = [start, fake, exit];
  const level = { cols: [], mud: [], boosts: [], spikes: [], heightTiles: 14, safe: [], playerStart: null, flag: null };
  let x0 = 0;
  for (const p of seq) {
    p.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const pos = { x: x0 + x, y };
      if (ch === '^') level.spikes.push(pos);
      else if (ch === '~') level.mud.push(pos);
      else if (ch === '=') level.boosts.push(pos);
      else if (ch === 'P') level.playerStart = pos;
      else if (ch === 'F') level.flag = pos;
    }));
    level.cols.push(...p.cols);
    x0 += p.width;
  }
  // Respawn on the start piece only: the piece must be cleared in one go.
  level.safe = [level.playerStart.x];
  return level;
}

// ---------- 2. Every piece, every twist, every level ----------
let soloRides = 0;
const soloFails = [];
for (const piece of [...TRACKS.filter((t) => t.type !== 'start' && t.type !== 'exit'), ...BOSS_TRACKS]) {
  const level = soloLevel(piece);
  for (const twist of twists) {
    if (!fitsTwist(piece, twist)) continue;
    for (let lv = 1; lv <= twistMaxLevel(content, twist); lv++) {
      const mods = twistSettings(content, twist, GENRE, lv);
      const res = ride(level, mods, { worst: true, maxTime: 60 });
      soloRides++;
      if (!res.finished || res.crashes) {
        soloFails.push(`piece "${piece.id}" with ${twist} level ${lv}: the test rider ${res.finished ? `crashed ${res.crashes} time(s)` : 'could not get past it'} (column ${(res.crashAt?.[0] ?? res.stuckAt) - TRACKS.find((t) => t.id === 'start').width} of the piece)`);
      }
    }
  }
}
problems.push(...soloFails);

// ---------- 2b. Every coin can be collected ----------
// Under Collector a coin you ride past costs a life, so every coin in every
// piece must be reachable with normal physics (Collector's own): riding at
// some speed from half to full, with a hop timed somewhere before it, or
// none. The bike's body is 12x12 above its wheels; a coin is 8x8.
const unreachable = [];
let coinRides = 0;
function canReach(level, coin) {
  const cx = coin.x * TILE + 4;
  const cy = coin.y * TILE + 4;
  const ctx = ctxFor(level, {});
  for (let share = 0.5; share <= 1.001; share += 0.05) {
    for (let hopAt = -160; hopAt <= 8; hopAt += 4) {
      for (const hold of [true, false]) {
        const s = level.playerStart;
        const r = newRider(s.x * TILE + 8, (s.y + 1) * TILE);
        let hopped = hopAt > 8;
        coinRides++;
        for (let t = 0; t < 20 && r.x < cx + 60; t += DT) {
          const input = botInput(r, ctx, { target: RIDE.top * share });
          if (!hopped && !r.air && r.x >= cx + hopAt) {
            input.jump = true;
            hopped = true;
          }
          if (r.hopping) input.jumpHeld = hold;
          const ev = stepRider(r, input, DT, ctx);
          if (ev.includes('crash') || ev.includes('fell') || touchesSpikes(r, ctx)) break;
          if (r.x - 6 < cx + 8 && r.x + 6 > cx && r.y - 12 < cy + 8 && r.y > cy) return true;
        }
        if (hopAt > 8) break;
      }
    }
  }
  return false;
}
for (const piece of TRACKS.filter((t) => t.type !== 'start' && t.type !== 'exit')) {
  const level = soloLevel(piece);
  const x0 = TRACKS.find((t) => t.id === 'start').width;
  piece.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === 'C' && !canReach(level, { x: x0 + x, y })) unreachable.push(`piece "${piece.id}": the coin in column ${x}, row ${y} can't be collected at any speed or hop (move it onto a jump's path)`);
  }));
}
problems.push(...unreachable);

// ---------- 3. Stage structure ----------
let stagesBuilt = 0;
const riders = { 1: [], 5: [] };
for (const twist of twists) for (let seed = 1; seed <= SEEDS; seed++) {
  for (let stage = 1; stage <= 5; stage++) {
    const rules = stageRules(content, twist);
    const lvl = buildRace({ seed, stage, twist, ...rules });
    stagesBuilt++;
    const tag = `${twist} seed ${seed} stage ${stage}`;
    if (lvl.cost > lvl.budget) problems.push(`${tag}: cost ${lvl.cost} > budget ${lvl.budget}`);
    if (!lvl.playerStart || !lvl.flag) problems.push(`${tag}: no start or no flag`);
    if (lvl.coins.length < rules.minCoins) problems.push(`${tag}: ${lvl.coins.length} coins, needs ${rules.minCoins}`);
    if (lvl.rivals.length < rules.minEnemies) problems.push(`${tag}: ${lvl.rivals.length} rivals, needs ${rules.minEnemies}`);
    if (lvl.names.length !== pacingFor(RACE_PACING, stage).length + 2) problems.push(`${tag}: ${lvl.names.length} pieces, expected ${pacingFor(RACE_PACING, stage).length + 2}`);
    for (let i = 1; i < lvl.names.length; i++) {
      const piece = TRACKS.find((t) => t.id === lvl.names[i]);
      if (lvl.names[i] === lvl.names[i - 1] && piece?.type !== 'rest') problems.push(`${tag}: ${lvl.names[i]} twice in a row`);
      if (piece && !fitsTwist(piece, twist)) problems.push(`${tag}: used ${piece.id}, which its twist tags rule out for ${twist}`);
    }
    if (lvl.rivals.some((r) => r.kind === 'rammer')) problems.push(`${tag}: a rammer at genre level 1`);
    for (const r of lvl.rivals) {
      const col = lvl.cols[r.x];
      if (col.kind !== 'flat' || col.row !== r.y + 1) problems.push(`${tag}: a rival at column ${r.x} isn't on flat ground`);
    }
    if (lvl.grid.some((row) => row.length !== lvl.widthTiles)) problems.push(`${tag}: the stitched art isn't ${lvl.widthTiles} wide`);
    // A safe column behind every hazard, so a crash always has somewhere to go back to.
    const hazards = lvl.cols.map((c, x) => (c.kind === 'pit' || lvl.spikes.some((s) => s.x === x) ? x : -1)).filter((x) => x >= 0);
    for (const x of hazards) if (!lvl.safe.some((c) => c < x)) problems.push(`${tag}: nowhere safe to come back to before column ${x}`);
    if (seed <= 50 && JSON.stringify(lvl) !== JSON.stringify(buildRace({ seed, stage, twist, ...rules }))) problems.push(`${tag}: same seed built a different stage`);
    if (riders[stage]) riders[stage].push(lvl.rivals.length);
    if (stage === 1) lvl.names.forEach((n) => { if (n in usage) usage[n]++; });
  }
}

// Collector / Killer at every level: each level's minimum must always be met.
for (const twist of twists) {
  for (let lv = 2; lv <= twistMaxLevel(content, twist); lv++) {
    const min = stageRules(content, twist, lv);
    if (!min.minCoins && !min.minEnemies) continue;
    for (let seed = 1; seed <= 200; seed++) for (let stage = 1; stage <= 5; stage++) {
      const lvl = buildRace({ seed, stage, twist, ...min });
      if (lvl.coins.length < min.minCoins) problems.push(`${twist} level ${lv} seed ${seed} stage ${stage}: ${lvl.coins.length} coins, needs ${min.minCoins}`);
      if (lvl.rivals.length < min.minEnemies) problems.push(`${twist} level ${lv} seed ${seed} stage ${stage}: ${lvl.rivals.length} rivals, needs ${min.minEnemies}`);
    }
  }
}

// ---------- 4. Whole stages, ridden ----------
let stageRides = 0;
const rideRows = [];
for (const twist of twists) {
  for (let lv = 1; lv <= twistMaxLevel(content, twist); lv++) {
    const mods = twistSettings(content, twist, GENRE, lv);
    const rules = stageRules(content, twist, lv);
    let crashes = 0;
    let spare = Infinity;
    for (let seed = 1; seed <= RIDES; seed++) for (let stage = 1; stage <= 5; stage++) {
      for (const genreLevel of [1, 3]) {
        const lvl = buildRace({ seed, stage, twist, ...rules, genreLevel, boss: genreLevel === 3 && stage === 5, powerUp: genreLevel >= 2 ? 'nitro' : null });
        const limit = timeLimit(lvl, mods.runScale ?? 1);
        const res = ride(lvl, mods);
        stageRides++;
        crashes += res.crashes;
        const tag = `${twist} level ${lv}, genre level ${genreLevel}, seed ${seed} stage ${stage}`;
        if (!res.finished) problems.push(`${tag}: the test rider got stuck at column ${res.stuckAt} (${lvl.pieces.find((p) => res.stuckAt >= p.x0 && res.stuckAt < p.x0 + p.width)?.id})`);
        else {
          spare = Math.min(spare, limit - res.time);
          if (res.time > limit) problems.push(`${tag}: the test rider took ${res.time.toFixed(0)} s, over the ${limit} s limit`);
        }
      }
    }
    rideRows.push({ twist, lv, crashes: crashes / (RIDES * 10), spare });
  }
}

// ---------- Report ----------
const avg = (xs) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
console.log(`Rode every piece alone with every twist at every level (${soloRides} rides, worst wind and gravity).`);
console.log(`Checked every coin can be collected (${coinRides} test rides).`);
console.log(`Built ${stagesBuilt} race stages: ${SEEDS} seeds x 5 stages for each twist (${twists.join(', ')}).`);
console.log(`Rode ${stageRides} whole stages (${RIDES} seeds x 5 stages x genre levels 1 and 3, every twist level).`);
console.log(problems.length ? `\n${problems.length} problem(s):\n  ${[...new Set(problems)].slice(0, 30).join('\n  ')}` : 'No problems found.');
console.log(`Rivals per stage: about ${avg(riders[1])} on stage 1, ${avg(riders[5])} on stage 5.`);
console.log('\nThe test rider (crashes per stage; seconds to spare on the closest finish):');
for (const r of rideRows) console.log(`  ${`${r.twist} ${r.lv}`.padEnd(16)} ${r.crashes.toFixed(2).padStart(5)} crashes   ${Number.isFinite(r.spare) ? r.spare.toFixed(0).padStart(4) : '   -'} s spare`);
console.log('\nPiece usage in stage 1 (all twists together):');
for (const [id, n] of Object.entries(usage).sort((a, b) => b[1] - a[1])) {
  const piece = TRACKS.find((t) => t.id === id);
  const tags = [piece.twists && `only: ${piece.twists.join(', ')}`, piece.notTwists && `never with: ${piece.notTwists.join(', ')}`, piece.minLevel && `level ${piece.minLevel}+`].filter(Boolean).join('  ');
  console.log(`  ${id.padEnd(14)} ${String(n).padStart(5)}  ${tags}${n === 0 && !piece.minLevel && piece.type !== 'start' && piece.type !== 'exit' ? '  <- never used' : ''}`);
}
const example = buildRace({ seed: 12345, stage: 1, twist: 'classic' });
console.log(`\nExample, seed 12345 (cost ${example.cost}/${example.budget}, ${example.widthTiles} tiles, ${timeLimit(example)} s):\n  ${example.names.join(' → ')}`);
process.exit(problems.length ? 1 : 0);
