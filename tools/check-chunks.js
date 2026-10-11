// Builds thousands of stages and reports problems + how often each chunk appears.
// Run with: npm run check

import { buildStage } from '../src/gen/buildStage.js';
import { CHUNKS } from '../src/gen/chunks.js'; // importing also validates every chunk

const SEEDS = 1000;
const usage = Object.fromEntries(CHUNKS.map((c) => [c.id, 0]));
const problems = [];
let stagesBuilt = 0;

for (let seed = 1; seed <= SEEDS; seed++) {
  for (let stage = 1; stage <= 5; stage++) {
    const lvl = buildStage({ seed, stage });
    stagesBuilt++;
    if (lvl.cost > lvl.budget) problems.push(`seed ${seed} stage ${stage}: cost ${lvl.cost} > budget ${lvl.budget}`);
    if (!lvl.playerStart) problems.push(`seed ${seed} stage ${stage}: no player start`);
    if (!lvl.flag) problems.push(`seed ${seed} stage ${stage}: no exit flag`);
    for (let i = 1; i < lvl.chunks.length; i++) {
      if (lvl.chunks[i].split(' ')[0] === lvl.chunks[i - 1].split(' ')[0] && !lvl.chunks[i].startsWith('rest')) {
        problems.push(`seed ${seed} stage ${stage}: ${lvl.chunks[i]} repeated back to back`);
      }
    }
    if (JSON.stringify(lvl) !== JSON.stringify(buildStage({ seed, stage }))) {
      problems.push(`seed ${seed} stage ${stage}: same seed built a different stage`);
    }
    if (stage === 1) lvl.chunks.forEach((id) => usage[id.split(' ')[0]]++);
  }
}

console.log(`Built ${stagesBuilt} stages from ${SEEDS} seeds.`);
console.log(problems.length ? `\n${problems.length} problem(s):\n  ${problems.slice(0, 20).join('\n  ')}` : 'No problems found.');

console.log('\nChunk usage in stage 1:');
for (const [id, n] of Object.entries(usage).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${id.padEnd(16)} ${String(n).padStart(5)} ${n === 0 ? '  <- never used' : ''}`);
}

const example = buildStage({ seed: 12345, stage: 1 });
console.log(`\nExample, seed 12345 (cost ${example.cost}/${example.budget}):\n  ${example.chunks.join(' → ')}`);
console.log(example.solid.map((row, y) => row.map((s, x) => {
  if (example.spikes.some((p) => p.x === x && p.y === y)) return '^';
  if (example.enemies.some((p) => p.x === x && p.y === y)) return 'E';
  if (example.coins.some((p) => p.x === x && p.y === y)) return 'C';
  return s ? '#' : '.';
}).join('')).join('\n'));

process.exit(problems.length ? 1 : 0);
