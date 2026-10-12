// Builds thousands of stages and reports problems + how often each chunk appears.
// Every twist that supports the platformer gets its own stages, so twist-only
// chunks are tested with their twist (and checked never to leak into others).
// Run with: npm run check

import { buildStage } from '../src/gen/buildStage.js';
import { CHUNKS, fitsTwist } from '../src/gen/chunks.js'; // importing also validates every chunk
import { loadContent } from './load-content.js';
import { stageMinimums } from '../src/engine/content.js';

const GENRE = 'platformer';
const SEEDS = 400; // per twist
const content = loadContent();
const twists = Object.keys(content.twists).filter((id) => content.twists[id].genres[GENRE]);
const usage = Object.fromEntries(CHUNKS.map((c) => [c.id, 0]));
const problems = [];
let stagesBuilt = 0;

// Twist tags must name real twists that this genre supports.
for (const c of CHUNKS) {
  for (const t of c.notTwists || []) {
    if (!content.twists[t]) problems.push(`chunk "${c.id}": unknown twist "${t}" in notTwists (options: ${Object.keys(content.twists).join(', ')})`);
  }
  for (const t of c.twists || []) {
    if (!content.twists[t]) problems.push(`chunk "${c.id}": unknown twist "${t}" (options: ${Object.keys(content.twists).join(', ')})`);
    else if (!twists.includes(t)) problems.push(`chunk "${c.id}": twist "${t}" doesn't support the ${GENRE}, so it can never show up`);
  }
}
// Every twist still needs untagged-or-matching start, exit and rest chunks.
for (const c of CHUNKS) {
  if (c.notTwists && twists.every((t) => c.notTwists.includes(t))) problems.push(`chunk "${c.id}": notTwists leaves out every twist, so it can never show up`);
}
for (const twist of twists) {
  for (const type of ['start', 'exit', 'rest']) {
    if (!CHUNKS.some((c) => c.type === type && fitsTwist(c, twist))) problems.push(`${twist}: no ${type} chunk it can use`);
  }
}

for (const twist of twists) for (let seed = 1; seed <= SEEDS; seed++) {
  for (let stage = 1; stage <= 5; stage++) {
    const lvl = buildStage({ seed, stage, twist, ...stageMinimums(content, twist) });
    stagesBuilt++;
    if (lvl.cost > lvl.budget) problems.push(`${twist} seed ${seed} stage ${stage}: cost ${lvl.cost} > budget ${lvl.budget}`);
    if (!lvl.playerStart) problems.push(`${twist} seed ${seed} stage ${stage}: no player start`);
    if (!lvl.flag) problems.push(`${twist} seed ${seed} stage ${stage}: no exit flag`);
    const min = stageMinimums(content, twist);
    if (lvl.coins.length < min.minCoins) problems.push(`${twist} seed ${seed} stage ${stage}: ${lvl.coins.length} coins, needs ${min.minCoins}`);
    if (lvl.enemies.length < min.minEnemies) problems.push(`${twist} seed ${seed} stage ${stage}: ${lvl.enemies.length} enemies, needs ${min.minEnemies}`);
    for (let i = 1; i < lvl.chunks.length; i++) {
      if (lvl.chunks[i].split(' ')[0] === lvl.chunks[i - 1].split(' ')[0] && !lvl.chunks[i].startsWith('rest')) {
        problems.push(`${twist} seed ${seed} stage ${stage}: ${lvl.chunks[i]} repeated back to back`);
      }
    }
    if (JSON.stringify(lvl) !== JSON.stringify(buildStage({ seed, stage, twist, ...stageMinimums(content, twist) }))) {
      problems.push(`${twist} seed ${seed} stage ${stage}: same seed built a different stage`);
    }
    for (const id of lvl.chunks) {
      const c = CHUNKS.find((x) => x.id === id.split(' ')[0]);
      if (c && !fitsTwist(c, twist)) problems.push(`${twist} seed ${seed} stage ${stage}: used ${c.id}, which its twist tags rule out for ${twist}`);
    }
    if (stage === 1) lvl.chunks.forEach((id) => usage[id.split(' ')[0]]++);
  }
}

console.log(`Built ${stagesBuilt} stages: ${SEEDS} seeds x 5 stages for each twist (${twists.join(', ')}).`);
console.log(problems.length ? `\n${problems.length} problem(s):\n  ${problems.slice(0, 20).join('\n  ')}` : 'No problems found.');

console.log('\nChunk usage in stage 1 (all twists together):');
for (const [id, n] of Object.entries(usage).sort((a, b) => b[1] - a[1])) {
  const piece = CHUNKS.find((c) => c.id === id);
  const only = piece?.twists;
  const never = piece?.notTwists;
  console.log(`  ${id.padEnd(16)} ${String(n).padStart(5)}${only ? `  only: ${only.join(', ')}` : ''}${never ? `  never with: ${never.join(', ')}` : ''}${n === 0 ? '  <- never used' : ''}`);
}

const example = buildStage({ seed: 12345, stage: 1, twist: twists[0] });
console.log(`\nExample, seed 12345 (cost ${example.cost}/${example.budget}):\n  ${example.chunks.join(' → ')}`);
console.log(example.solid.map((row, y) => row.map((s, x) => {
  if (example.spikes.some((p) => p.x === x && p.y === y)) return '^';
  if (example.enemies.some((p) => p.x === x && p.y === y)) return 'E';
  if (example.coins.some((p) => p.x === x && p.y === y)) return 'C';
  return s ? '#' : '.';
}).join('')).join('\n'));

process.exit(problems.length ? 1 : 0);
