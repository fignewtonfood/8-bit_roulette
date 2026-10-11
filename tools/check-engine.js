// Checks the data files and the slot machine.
// Run with: npm run check:engine
//
//  1. Loads every data file (any typo'd id or missing colour stops here).
//  2. Spins 10,000 seeds: every result must be playable, and the same seed
//     must always land the same way.
//  3. Tests the compatibility rules with a made-up block, so you can see a
//     re-roll happen even while compatibility.json is empty.
//  4. Prints how often each reel entry and each full combo comes up.

import { loadContent } from './load-content.js';
import { spin, describeRun } from '../src/engine/spin.js';
import { whyIncompatible } from '../src/engine/content.js';

const SPINS = 10_000;
const content = loadContent();
const problems = [];

const count = { theme: {}, genre: {}, twist: {} };
const combos = {};
for (let seed = 1; seed <= SPINS; seed++) {
  const r = spin(content, seed);
  const why = whyIncompatible(content, r);
  if (why) problems.push(`seed ${seed}: landed on a blocked combo (${why})`);
  if (JSON.stringify(r) !== JSON.stringify(spin(content, seed))) problems.push(`seed ${seed}: same seed spun differently`);
  for (const reel of ['theme', 'genre', 'twist']) count[reel][r[reel]] = (count[reel][r[reel]] || 0) + 1;
  const key = describeRun(content, r);
  combos[key] = (combos[key] || 0) + 1;
}

// Locks: a locked reel must always be honoured.
for (let seed = 1; seed <= 500; seed++) {
  const r = spin(content, seed, { genre: 'shmup' });
  if (r.genre !== 'shmup') problems.push(`seed ${seed}: ignored a locked genre`);
}

// Pretend shmup + darkness is blocked and make sure it never lands.
const strict = { ...content, blocked: [...content.blocked, { genre: 'shmup', twist: 'darkness', reason: 'test rule' }] };
let rerolls = 0;
for (let seed = 1; seed <= 2000; seed++) {
  const r = spin(strict, seed);
  if (r.genre === 'shmup' && r.twist === 'darkness') problems.push(`seed ${seed}: test rule ignored`);
  if (r.rerolled.length) rerolls++;
}
const lockedBad = spin(strict, 1, { genre: 'shmup', twist: 'darkness' });
if (!lockedBad.problem) problems.push('a locked blocked combo was not flagged');

const pct = (n, total) => `${((100 * n) / total).toFixed(1)}%`.padStart(6);

console.log(`Content: ${Object.keys(content.themes).length} themes, ${Object.keys(content.genres).length} genres, ${Object.keys(content.twists).length} twists, ${content.blocked.length} blocked rule(s).`);
console.log(`Spun ${SPINS} seeds.`);
console.log(problems.length ? `\n${problems.length} problem(s):\n  ${problems.slice(0, 20).join('\n  ')}` : 'No problems found.');
console.log(`Test rule (shmup + darkness blocked): ${rerolls} of 2000 spins re-rolled a reel, none landed on it.`);

for (const reel of ['theme', 'genre', 'twist']) {
  console.log(`\n${reel.toUpperCase()} reel:`);
  for (const e of content.reels[reel]) {
    const n = count[reel][e.id] || 0;
    console.log(`  ${e.id.padEnd(16)} ${pct(n, SPINS)}  (weight ${e.weight})${n === 0 ? '  <- never lands' : ''}`);
  }
}

console.log('\nEvery combo:');
for (const [key, n] of Object.entries(combos).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pct(n, SPINS)}  ${key}`);
}

const ex = spin(content, 12345);
console.log(`\nExample, seed 12345: ${describeRun(content, ex)}`);

process.exit(problems.length ? 1 : 0);
