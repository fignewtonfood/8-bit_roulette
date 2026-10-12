// Builds thousands of brawler stages and reports problems + how often each arena appears.
// Every twist that supports the brawler gets its own stages, so twist-only
// arenas are tested with their twist (and checked never to leak into others).
// Run with: npm run check:brawl

import { buildBrawl } from '../src/gen/buildBrawl.js';
import { ARENAS, ARENA_W, ENEMY_KINDS } from '../src/gen/arenas.js'; // importing also validates every arena
import { fitsTwist } from '../src/gen/chunks.js';
import { loadContent } from './load-content.js';

const GENRE = 'brawler';
const GROUND_ROW = 12;
const MAX_CLIMB = 3; // tiles a normal jump climbs (Low Gravity reaches further)
const MAX_REACH = 3; // columns sideways you can cover while climbing that high
const SEEDS = 400; // per twist
const content = loadContent();
const twists = Object.keys(content.twists).filter((id) => content.twists[id].genres[GENRE]);
const usage = Object.fromEntries(ARENAS.map((a) => [a.id, 0]));
const problems = [];
let stagesBuilt = 0;

// Twist tags must name real twists that this genre supports.
for (const a of ARENAS) {
  for (const t of a.twists || []) {
    if (!content.twists[t]) problems.push(`arena "${a.id}": unknown twist "${t}" (options: ${Object.keys(content.twists).join(', ')})`);
    else if (!twists.includes(t)) problems.push(`arena "${a.id}": twist "${t}" doesn't support the ${GENRE}, so it can never show up`);
  }
}
for (const twist of twists) {
  for (const type of ['start', 'exit', 'rest', 'fight']) {
    if (!ARENAS.some((a) => a.type === type && fitsTwist(a, twist))) problems.push(`${twist}: no ${type} arena it can use`);
  }
}

// Layout rules for each arena on its own.
const solidAt = (a, x, y) => y >= 0 && a.rows[y]?.[x] === '#';
for (const a of ARENAS) {
  const where = `arena "${a.id}"`;
  [a.rows, a.reinforce].forEach((rows, wave) => {
    rows?.forEach((row, y) => [...row].forEach((ch, x) => {
      if (!ENEMY_KINDS[ch.toUpperCase()]) return;
      if (solidAt(a, x, y)) problems.push(`${where}: enemy "${ch}" (row ${y}, column ${x}) is inside solid ground`);
      else if (!solidAt(a, x, y + 1)) problems.push(`${where}: enemy "${ch}" (row ${y}, column ${x}${wave ? ', reinforcements' : ''}) has nothing to stand on`);
    }));
  });
  if (a.type === 'fight' && !a.rows.some((row) => [...row].some((ch) => ENEMY_KINDS[ch]))) {
    problems.push(`${where}: a fight arena needs at least one capital-letter enemy in its first wave`);
  }
  if (a.type !== 'fight' && (a.reinforce || a.rows.some((row) => [...row].some((ch) => ENEMY_KINDS[ch.toUpperCase()])))) {
    problems.push(`${where}: only "fight" arenas can have enemies (this one is "${a.type}")`);
  }
  // Every surface you can stand on must be reachable: no more than MAX_CLIMB
  // tiles above another reachable surface that's within MAX_REACH columns.
  const tops = [];
  a.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '#' && y > 0 && !solidAt(a, x, y - 1)) tops.push({ x, y });
  }));
  const reached = new Set(tops.filter((s) => s.y >= GROUND_ROW).map((s) => `${s.x},${s.y}`));
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of tops) {
      if (reached.has(`${s.x},${s.y}`)) continue;
      const ok = tops.some((o) => reached.has(`${o.x},${o.y}`)
        && Math.abs(o.x - s.x) <= MAX_REACH && o.y - s.y <= MAX_CLIMB && o.y - s.y >= -MAX_CLIMB);
      if (ok) {
        reached.add(`${s.x},${s.y}`);
        grew = true;
      }
    }
  }
  const stranded = tops.filter((s) => !reached.has(`${s.x},${s.y}`));
  if (stranded.length) {
    const rows = [...new Set(stranded.map((s) => s.y))].join(', ');
    problems.push(`${where}: a platform on row ${rows} is more than ${MAX_CLIMB} tiles above anything you can jump from`);
  }
  // Respawn spot: the player comes back at the arena's left edge after a fall
  // (column 1, or column 14 when the arena is mirrored).
  for (const x of [1, ARENA_W - 2]) {
    const y = a.rows.findIndex((row, yy) => row[x] === '#' && !solidAt(a, x, yy - 1));
    if (y < 1) problems.push(`${where}: no ground to respawn on in column ${x}`);
    else if (a.rows[y - 1][x] === '^') problems.push(`${where}: the respawn spot in column ${x} has spikes on it`);
  }
}

const enemyTotals = { 1: [], 5: [] };
for (const twist of twists) for (let seed = 1; seed <= SEEDS; seed++) {
  for (let stage = 1; stage <= 5; stage++) {
    const lvl = buildBrawl({ seed, stage, twist });
    stagesBuilt++;
    const tag = `${twist} seed ${seed} stage ${stage}`;
    if (lvl.cost > lvl.budget) problems.push(`${tag}: cost ${lvl.cost} > budget ${lvl.budget}`);
    if (!lvl.playerStart) problems.push(`${tag}: no player start`);
    if (!lvl.flag) problems.push(`${tag}: no exit flag`);
    if (content.twists[twist].objective === 'collect' && !lvl.coins.length) problems.push(`${tag}: Collector stage with no coins`);
    if (!lvl.arenas.some((r) => r.fight)) problems.push(`${tag}: no fights at all`);
    for (let i = 1; i < lvl.names.length; i++) {
      const id = lvl.names[i].split(' ')[0];
      const isRest = ARENAS.find((a) => a.id === id)?.type === 'rest'; // rest is the safe fallback
      if (id === lvl.names[i - 1].split(' ')[0] && !isRest) problems.push(`${tag}: ${lvl.names[i]} repeated back to back`);
    }
    if (JSON.stringify(lvl) !== JSON.stringify(buildBrawl({ seed, stage, twist }))) {
      problems.push(`${tag}: same seed built a different stage`);
    }
    for (const name of lvl.names) {
      const a = ARENAS.find((x) => x.id === name.split(' ')[0]);
      if (a && !fitsTwist(a, twist)) problems.push(`${tag}: used ${a.id}, which is only for ${a.twists.join('/')}`);
    }
    if (enemyTotals[stage]) enemyTotals[stage].push(lvl.arenas.reduce((n, r) => n + r.waves.flat().length, 0));
    if (stage === 1) lvl.names.forEach((name) => usage[name.split(' ')[0]]++);
  }
}

const avg = (xs) => (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1);
console.log(`Built ${stagesBuilt} brawler stages: ${SEEDS} seeds x 5 stages for each twist (${twists.join(', ')}).`);
console.log(problems.length ? `\n${problems.length} problem(s):\n  ${problems.slice(0, 20).join('\n  ')}` : 'No problems found.');
console.log(`Enemies per stage: about ${avg(enemyTotals[1])} on stage 1, ${avg(enemyTotals[5])} on stage 5.`);

console.log('\nArena usage in stage 1 (all twists together):');
for (const [id, n] of Object.entries(usage).sort((a, b) => b[1] - a[1])) {
  const only = ARENAS.find((a) => a.id === id)?.twists;
  console.log(`  ${id.padEnd(16)} ${String(n).padStart(5)}${only ? `  only: ${only.join(', ')}` : ''}${n === 0 ? '  <- never used' : ''}`);
}

const example = buildBrawl({ seed: 12345, stage: 1, twist: twists[0] });
console.log(`\nExample, seed 12345 (cost ${example.cost}/${example.budget}):\n  ${example.names.join(' → ')}`);
for (const r of example.arenas.filter((x) => x.fight)) {
  console.log(`  ${r.id}: ${r.waves.map((w, i) => `${i ? 'then ' : ''}${w.map((e) => e.kind).join(', ')}`).join('; ')}`);
}

process.exit(problems.length ? 1 : 0);
