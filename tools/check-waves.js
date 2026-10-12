// Builds thousands of shmup stages and reports problems + how often each wave appears.
// Run with: node tools/check-waves.js   (or npm run check:shmup)

import { buildShmup } from '../src/gen/buildShmup.js';
import { WAVES } from '../src/gen/waves.js'; // importing also validates every wave
import { fitsTwist } from '../src/gen/chunks.js';
import { loadContent } from './load-content.js';

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
  for (const t of w.twists || []) {
    if (!content.twists[t]) problems.push(`wave "${w.id}": unknown twist "${t}" (options: ${Object.keys(content.twists).join(', ')})`);
    else if (!twists.includes(t)) problems.push(`wave "${w.id}": twist "${t}" doesn't support the ${GENRE}, so it can never show up`);
  }
}
for (const twist of twists) {
  if (!WAVES.some((w) => w.type === 'rest' && fitsTwist(w, twist))) problems.push(`${twist}: no rest wave it can use`);
}

for (const twist of twists) for (let seed = 1; seed <= SEEDS; seed++) {
  for (let stage = 1; stage <= 5; stage++) {
    const lvl = buildShmup({ seed, stage, twist });
    stagesBuilt++;
    if (lvl.cost > lvl.budget) problems.push(`${twist} seed ${seed} stage ${stage}: cost ${lvl.cost} > budget ${lvl.budget}`);
    if (!lvl.events.some((e) => e.kind !== 'coin')) problems.push(`${twist} seed ${seed} stage ${stage}: no enemies at all`);
    for (let i = 1; i < lvl.waves.length; i++) {
      const id = lvl.waves[i].split(' ')[0];
      const isRest = WAVES.find((w) => w.id === id)?.type === 'rest'; // rest is the safe fallback
      if (id === lvl.waves[i - 1].split(' ')[0] && !isRest) {
        problems.push(`${twist} seed ${seed} stage ${stage}: ${lvl.waves[i]} repeated back to back`);
      }
    }
    if (JSON.stringify(lvl) !== JSON.stringify(buildShmup({ seed, stage, twist }))) {
      problems.push(`${twist} seed ${seed} stage ${stage}: same seed built a different stage`);
    }
    for (const id of lvl.waves) {
      const w = WAVES.find((x) => x.id === id.split(' ')[0]);
      if (w && !fitsTwist(w, twist)) problems.push(`${twist} seed ${seed} stage ${stage}: used ${w.id}, which is only for ${w.twists.join('/')}`);
    }
    if (stage === 1) {
      lvl.waves.forEach((id) => usage[id.split(' ')[0]]++);
      shortest = Math.min(shortest, lvl.duration);
      longest = Math.max(longest, lvl.duration);
    }
  }
}

console.log(`Built ${stagesBuilt} shmup stages: ${SEEDS} seeds x 5 stages for each twist (${twists.join(', ')}).`);
console.log(problems.length ? `\n${problems.length} problem(s):\n  ${problems.slice(0, 20).join('\n  ')}` : 'No problems found.');
console.log(`Stage 1 length: ${shortest.toFixed(0)}–${longest.toFixed(0)} seconds`);

console.log('\nWave usage in stage 1 (all twists together):');
for (const [id, n] of Object.entries(usage).sort((a, b) => b[1] - a[1])) {
  const only = WAVES.find((w) => w.id === id)?.twists;
  console.log(`  ${id.padEnd(16)} ${String(n).padStart(5)}${only ? `  only: ${only.join(', ')}` : ''}${n === 0 ? '  <- never used' : ''}`);
}

const example = buildShmup({ seed: 12345, stage: 1, twist: twists[0] });
console.log(`\nExample, seed 12345 (cost ${example.cost}/${example.budget}, ${example.duration}s):\n  ${example.waves.join(' → ')}`);

process.exit(problems.length ? 1 : 0);
