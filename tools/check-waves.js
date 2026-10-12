// Builds thousands of shmup stages and reports problems + how often each wave appears.
// Run with: node tools/check-waves.js   (or npm run check:shmup)

import { buildShmup } from '../src/gen/buildShmup.js';
import { WAVES } from '../src/gen/waves.js'; // importing also validates every wave
import { fitsTwist } from '../src/gen/chunks.js';
import { loadContent } from './load-content.js';
import { stageRules, twistMaxLevel, twistSettings } from '../src/engine/content.js';

const GENRE = 'shmup';
const SEEDS = 400; // per twist
const content = loadContent();
const twists = Object.keys(content.twists).filter((id) => content.twists[id].genres[GENRE]);
const usage = Object.fromEntries(WAVES.map((w) => [w.id, 0]));
const problems = [];
let stagesBuilt = 0;
let shortest = Infinity;
let longest = 0;

// Twist tags must name real twists that this genre supports.
for (const w of WAVES) {
  for (const t of w.notTwists || []) {
    if (!content.twists[t]) problems.push(`wave "${w.id}": unknown twist "${t}" in notTwists (options: ${Object.keys(content.twists).join(', ')})`);
  }
  for (const t of w.twists || []) {
    if (!content.twists[t]) problems.push(`wave "${w.id}": unknown twist "${t}" (options: ${Object.keys(content.twists).join(', ')})`);
    else if (!twists.includes(t)) problems.push(`wave "${w.id}": twist "${t}" doesn't support the ${GENRE}, so it can never show up`);
  }
}
for (const w of WAVES) {
  if (w.notTwists && twists.every((t) => w.notTwists.includes(t))) problems.push(`wave "${w.id}": notTwists leaves out every twist, so it can never show up`);
}
for (const twist of twists) {
  if (!WAVES.some((w) => w.type === 'rest' && fitsTwist(w, twist))) problems.push(`${twist}: no rest wave it can use`);
}

for (const twist of twists) for (let seed = 1; seed <= SEEDS; seed++) {
  for (let stage = 1; stage <= 5; stage++) {
    const lvl = buildShmup({ seed, stage, twist, ...stageRules(content, twist) });
    stagesBuilt++;
    if (lvl.cost > lvl.budget) problems.push(`${twist} seed ${seed} stage ${stage}: cost ${lvl.cost} > budget ${lvl.budget}`);
    if (!lvl.events.some((e) => e.kind !== 'coin')) problems.push(`${twist} seed ${seed} stage ${stage}: no enemies at all`);
    const min = stageRules(content, twist);
    const foes = lvl.events.filter((e) => e.kind !== 'coin').length;
    if (lvl.coins < min.minCoins) problems.push(`${twist} seed ${seed} stage ${stage}: ${lvl.coins} coins, needs ${min.minCoins}`);
    if (foes < min.minEnemies) problems.push(`${twist} seed ${seed} stage ${stage}: ${foes} enemies, needs ${min.minEnemies}`);
    for (let i = 1; i < lvl.waves.length; i++) {
      const id = lvl.waves[i].split(' ')[0];
      const isRest = WAVES.find((w) => w.id === id)?.type === 'rest'; // rest is the safe fallback
      if (id === lvl.waves[i - 1].split(' ')[0] && !isRest) {
        problems.push(`${twist} seed ${seed} stage ${stage}: ${lvl.waves[i]} repeated back to back`);
      }
    }
    if (JSON.stringify(lvl) !== JSON.stringify(buildShmup({ seed, stage, twist, ...stageRules(content, twist) }))) {
      problems.push(`${twist} seed ${seed} stage ${stage}: same seed built a different stage`);
    }
    for (const id of lvl.waves) {
      const w = WAVES.find((x) => x.id === id.split(' ')[0]);
      if (w && !fitsTwist(w, twist)) problems.push(`${twist} seed ${seed} stage ${stage}: used ${w.id}, which its twist tags rule out for ${twist}`);
    }
    if (stage === 1) {
      lvl.waves.forEach((id) => usage[id.split(' ')[0]]++);
      shortest = Math.min(shortest, lvl.duration);
      longest = Math.max(longest, lvl.duration);
    }
  }
}

// Collector / Killer at every level: each level's minimum must always be met.
let minimumStages = 0;
for (const twist of twists) {
  for (let level = 2; level <= twistMaxLevel(content, twist); level++) {
    const min = stageRules(content, twist, level);
    if (!min.minCoins && !min.minEnemies) continue;
    for (let seed = 1; seed <= 200; seed++) for (let stage = 1; stage <= 5; stage++) {
      const lvl = buildShmup({ seed, stage, twist, ...min });
      minimumStages++;
      if (lvl.coins < min.minCoins) problems.push(`${twist} level ${level} seed ${seed} stage ${stage}: ${lvl.coins} coins, needs ${min.minCoins}`);
      if (lvl.events.filter((e) => e.kind !== 'coin').length < min.minEnemies) problems.push(`${twist} level ${level} seed ${seed} stage ${stage}: ${lvl.events.filter((e) => e.kind !== 'coin').length} enemies, needs ${min.minEnemies}`);
    }
  }
}

// ---------- Slow ships (Mud): every stage must stay dodgeable ----------
// Mirrors ShmupScene.js: keep these in step with its feel knobs.
const SHIP_SPEED = 120;   // px/s at normal speed
const LANE = 16;          // px
const BAT_SPEED = 55;     // straight-flying bats, the ones that form walls
const DIVE_SPEED = 120;
const SHOT_SPEED = 75;
const THREAT_RUN = 156;   // px an aimed diver/shot travels to reach the ship's row
const SIDESTEP = 11;      // px the ship moves to slip an aimed diver or shot
const SAFETY = 0.6;       // the ship must manage this with 40% speed to spare
const WALL = 4;           // bats spawning together that count as a wall

// What a stage asks of the ship, in px/s: the hardest of
//  - slipping an aimed diver or turret shot (sidestep before it arrives), and
//  - getting from a gap in one bat wall to a gap in the next before it arrives.
function speedNeeded(lvl) {
  let need = Math.max(SIDESTEP / (THREAT_RUN / DIVE_SPEED), SIDESTEP / (THREAT_RUN / SHOT_SPEED));
  const rows = new Map();
  for (const e of lvl.events) if (e.kind === 'straight') rows.set(e.time, [...(rows.get(e.time) || []), e.lane]);
  const walls = [...rows].filter(([, lanes]) => lanes.length >= WALL).sort((a, b) => a[0] - b[0]);
  let prevGaps = null;
  let prevTime = 0;
  let blocked = false;
  for (const [time, lanes] of walls) {
    const gaps = Array.from({ length: 16 }, (_, l) => l).filter((l) => !lanes.includes(l));
    if (!gaps.length) blocked = true;
    if (prevGaps && gaps.length && time - prevTime < 4) {
      const dist = Math.min(...prevGaps.flatMap((a) => gaps.map((b) => Math.abs(a - b) * LANE)));
      need = Math.max(need, dist / (time - prevTime));
    }
    prevGaps = gaps;
    prevTime = time;
  }
  return { need, blocked };
}

const slowShips = twists.flatMap((t) =>
  Array.from({ length: twistMaxLevel(content, t) }, (_, i) => ({ twist: t, level: i + 1, scale: twistSettings(content, t, GENRE, i + 1).shipScale ?? 1 })),
).filter((x) => x.scale < 1);
const slowReport = [];
for (const { twist, level, scale } of slowShips) {
  const ship = SHIP_SPEED * scale;
  let worst = 0;
  for (let seed = 1; seed <= 200; seed++) for (let stage = 1; stage <= 5; stage++) {
    const lvl = buildShmup({ seed, stage, twist, ...stageRules(content, twist, level) });
    const { need, blocked } = speedNeeded(lvl);
    worst = Math.max(worst, need);
    if (blocked) problems.push(`${twist} level ${level} seed ${seed} stage ${stage}: a bat wall with no gap at all`);
    if (need > ship * SAFETY) problems.push(`${twist} level ${level} seed ${seed} stage ${stage}: needs ${need.toFixed(0)} px/s, the ship only has ${ship.toFixed(0)}`);
  }
  slowReport.push(`  ${twist} level ${level}: ship ${ship.toFixed(0)} px/s, hardest stage needs ${worst.toFixed(0)} px/s`);
}
if (slowReport.length) console.log(`\nSlow ships (must stay under ${Math.round(SAFETY * 100)}% of the ship's speed):\n${slowReport.join('\n')}`);

console.log(`Built ${stagesBuilt} shmup stages: ${SEEDS} seeds x 5 stages for each twist (${twists.join(', ')}).`);
console.log(problems.length ? `\n${problems.length} problem(s):\n  ${problems.slice(0, 20).join('\n  ')}` : 'No problems found.');
console.log(`Stage 1 length: ${shortest.toFixed(0)}–${longest.toFixed(0)} seconds`);

console.log('\nWave usage in stage 1 (all twists together):');
for (const [id, n] of Object.entries(usage).sort((a, b) => b[1] - a[1])) {
  const piece = WAVES.find((w) => w.id === id);
  const only = piece?.twists;
  const never = piece?.notTwists;
  console.log(`  ${id.padEnd(16)} ${String(n).padStart(5)}${only ? `  only: ${only.join(', ')}` : ''}${never ? `  never with: ${never.join(', ')}` : ''}${n === 0 ? '  <- never used' : ''}`);
}

const example = buildShmup({ seed: 12345, stage: 1, twist: twists[0] });
console.log(`\nExample, seed 12345 (cost ${example.cost}/${example.budget}, ${example.duration}s):\n  ${example.waves.join(' → ')}`);

process.exit(problems.length ? 1 : 0);
