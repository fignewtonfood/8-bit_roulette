// Genre levels: builds stages for every genre at levels 1, 2 and 3 (with every
// twist that genre supports) and checks what each level adds.
//   - pieces tagged { minLevel } never show up below that level, and every one
//     does show up at its level
//   - the level 2 enemies (hoppers, splitters, shield guards) never show up
//     at level 1
//   - level 2+ always places its power-up; level 1 never does
//   - level 3 puts a boss at the end of the run's last stage, and only there
//   - budgets, Collector / Killer minimums and seeds still hold
//   - level 1 stages are exactly what they were before genre levels existed
// Also checks the payouts and titles that genre levels change.
// Run with: npm run check:levels

import { buildStage } from '../src/gen/buildStage.js';
import { buildShmup } from '../src/gen/buildShmup.js';
import { buildBrawl } from '../src/gen/buildBrawl.js';
import { CHUNKS } from '../src/gen/chunks.js';
import { WAVES } from '../src/gen/waves.js';
import { ARENAS } from '../src/gen/arenas.js';
import { loadContent } from './load-content.js';
import { genreAt, genreMaxLevel, stageRules, SCREEN_CHARS } from '../src/engine/content.js';
import { makeRun, payout, stageSetup } from '../src/engine/run.js';
import { runTitle } from '../src/engine/spin.js';
import { safeSpot, awayFromPit, isPit } from '../src/engine/powerDrop.js';

const SEEDS = 120; // per twist, per level
const content = loadContent();
const problems = [];
const expect = (ok, msg) => ok || problems.push(msg);

// How to read each genre's stages the same way.
const GENRES = {
  platformer: {
    build: buildStage,
    pieces: CHUNKS,
    used: (lvl) => lvl.chunks,
    newKind: 'hopper',
    kinds: (lvl) => lvl.enemies.map((e) => e.kind),
    // One enemy carries it, in the first half of the stage.
    hasPower: (lvl) => !!lvl.powerUp && lvl.enemies[lvl.powerUp.carrier]?.x < Math.max(20, Math.floor(lvl.widthTiles / 2)),
    hasBoss: (lvl) => !!lvl.boss && !!lvl.bossRoom && lvl.bossRoom.x1 <= lvl.flag.x && lvl.boss.x >= lvl.bossRoom.x0 && lvl.boss.x < lvl.bossRoom.x1,
    coins: (lvl) => lvl.coins.length,
    foes: (lvl) => lvl.enemies.length,
  },
  shmup: {
    build: buildShmup,
    pieces: WAVES,
    used: (lvl) => lvl.waves,
    newKind: 'splitter',
    kinds: (lvl) => lvl.events.map((e) => e.kind),
    hasPower: (lvl) => {
      const carriers = lvl.events.filter((e) => e.carrier);
      return !!lvl.powerUp && carriers.length === 1 && carriers[0].kind !== 'coin' && carriers[0].time < lvl.duration / 2;
    },
    hasBoss: (lvl) => lvl.bossAt !== null && lvl.bossAt > lvl.duration,
    coins: (lvl) => lvl.coins,
    foes: (lvl) => lvl.events.filter((e) => e.kind !== 'coin').length,
  },
  brawler: {
    build: buildBrawl,
    pieces: ARENAS,
    used: (lvl) => lvl.names,
    newKind: 'shield',
    kinds: (lvl) => lvl.arenas.flatMap((r) => r.waves.flat().map((e) => e.kind)),
    hasPower: (lvl) => {
      const rooms = lvl.arenas.filter((r) => r.waves.flat().some((e) => e.carrier));
      const fights = lvl.arenas.filter((r) => r.fight && !r.boss);
      const i = lvl.arenas.indexOf(rooms[0]);
      return !!lvl.powerUp && rooms.length === 1 && rooms[0].waves.flat().filter((e) => e.carrier).length === 1
        && !rooms[0].boss && (i < lvl.arenas.length / 2 || rooms[0] === fights[0]);
    },
    hasBoss: (lvl) => {
      const i = lvl.arenas.findIndex((r) => r.boss);
      return i === lvl.arenas.length - 2 && lvl.arenas[i].fight && lvl.arenas[i].waves[0].some((e) => e.kind === 'boss');
    },
    coins: (lvl) => lvl.coins.length,
    foes: () => Infinity, // Killer isn't offered on the brawler
  },
};

let built = 0;
const meets = {}; // genre -> [level 2 stages with the new enemy, level 2 stages]
for (const [genre, g] of Object.entries(GENRES)) {
  const twists = Object.keys(content.twists).filter((id) => content.twists[id].genres[genre]);
  const top = genreMaxLevel(content, genre);
  expect(top === 3, `${genre}: should have levels 2 and 3 in genres.json (has up to ${top})`);
  const seen = new Set();

  for (let level = 1; level <= top; level++) {
    for (const twist of twists) for (let seed = 1; seed <= SEEDS; seed++) {
      // A 3-stage run: the boss (level 3) only on stage 3.
      for (let stage = 1; stage <= 3; stage++) {
        const run = { seed, stage, stages: 3, genre, twist, levels: { genre: level, twist: 1 } };
        const setup = stageSetup(content, run);
        const lvl = g.build(setup);
        built++;
        const tag = `${genre} level ${level}, ${twist}, seed ${seed}, stage ${stage}`;
        const used = g.used(lvl).map((name) => name.split(' ')[0]);
        used.forEach((id) => seen.add(`${level}:${id}`));

        for (const id of used) {
          const piece = g.pieces.find((p) => p.id === id);
          if (piece?.minLevel > level) problems.push(`${tag}: used "${id}", which needs level ${piece.minLevel}`);
        }
        if (level === 2) {
          meets[genre] ||= [0, 0];
          meets[genre][0] += g.kinds(lvl).includes(g.newKind) ? 1 : 0;
          meets[genre][1]++;
        }
        if (level < 2) expect(!g.kinds(lvl).includes(g.newKind), `${tag}: a ${g.newKind} showed up below level 2`);
        expect(g.hasPower(lvl) === level >= 2, `${tag}: ${level >= 2 ? 'no power-up placed' : 'a power-up below level 2'}`);
        const wantBoss = level >= 3 && stage === 3;
        expect(!!g.hasBoss(lvl) === wantBoss, `${tag}: ${wantBoss ? 'no boss (or in the wrong place)' : 'a boss where there shouldn\'t be one'}`);
        if (lvl.cost > lvl.budget) problems.push(`${tag}: cost ${lvl.cost} > budget ${lvl.budget}`);
        const min = stageRules(content, twist);
        expect(g.coins(lvl) >= min.minCoins, `${tag}: ${g.coins(lvl)} coins, needs ${min.minCoins}`);
        expect(g.foes(lvl) >= min.minEnemies, `${tag}: ${g.foes(lvl)} enemies, needs ${min.minEnemies}`);
        if (seed <= 20) expect(JSON.stringify(lvl) === JSON.stringify(g.build(setup)), `${tag}: same seed built a different stage`);
        // Level 1 is untouched by genre levels: same as building with no level options at all.
        if (level === 1 && seed <= 20) {
          const plain = g.build({ seed, stage, twist, ...stageRules(content, twist) });
          expect(JSON.stringify(plain) === JSON.stringify(lvl), `${tag}: level 1 isn't the same stage as before genre levels`);
        }
      }
    }
  }
  for (const p of g.pieces.filter((x) => x.minLevel)) {
    expect(seen.has(`${p.minLevel}:${p.id}`), `${genre}: "${p.id}" (minLevel ${p.minLevel}) never showed up at level ${p.minLevel}`);
  }
}

// Long runs at genre level 3: bosses on stages 3 and 5, nowhere else.
for (const genre of Object.keys(GENRES)) {
  for (let stage = 1; stage <= 5; stage++) {
    const run = { seed: 1, stage, stages: 5, genre, twist: 'classic', levels: { genre: 3, twist: 1 } };
    const want = stage === 3 || stage === 5;
    expect(stageSetup(content, run).boss === want, `${genre} Long run stage ${stage}: boss should be ${want}`);
    for (let seed = 1; seed <= 40; seed++) {
      const lvl = GENRES[genre].build(stageSetup(content, { ...run, seed }));
      expect(!!GENRES[genre].hasBoss(lvl) === want, `${genre} Long run seed ${seed} stage ${stage}: ${want ? 'no boss' : 'an unexpected boss'}`);
    }
  }
  const lvl1 = stageSetup(content, { seed: 1, stage: 3, stages: 5, genre, twist: 'classic', levels: { genre: 2, twist: 1 } });
  expect(!lvl1.boss, `${genre}: no boss below genre level 3, even on a Long run`);
}

// Jumpers: brawler stages 4 and 5 only (the end of a Long run), at every
// genre level, never earlier.
for (let seed = 1; seed <= 300; seed++) for (let stage = 1; stage <= 5; stage++) {
  for (const genreLevel of [1, 3]) {
    const lvl = buildBrawl({ seed, stage, twist: 'classic', genreLevel, boss: genreLevel === 3 && stage === 5 });
    const jumpers = lvl.arenas.flatMap((r) => r.waves.flat()).filter((e) => e.kind === 'jumper').length;
    const want = { 4: 2, 5: 3 }[stage] || 0;
    if (want) expect(jumpers >= want, `brawler seed ${seed} stage ${stage}: ${jumpers} jumpers, wants ${want}`);
    else expect(jumpers === 0, `brawler seed ${seed} stage ${stage}: a jumper before stage 4`);
    expect(!lvl.arenas.some((r) => r.boss && r.waves.flat().some((e) => e.kind === 'jumper')), `brawler seed ${seed} stage ${stage}: a jumper in the boss arena`);
  }
}

// Dropped power-ups: wherever the carrier went down, the drop lands on safe
// floor (ground under it, no spikes on or beside it, no pit beside it), and a
// running one starts away from the nearest pit.
{
  const safe = (solid, spikes, p) => !!p && !solid[p.y][p.x] && solid[p.y + 1][p.x] && !spikes.has(`${p.x},${p.y}`)
    && !spikes.has(`${p.x - 1},${p.y}`) && !spikes.has(`${p.x + 1},${p.y}`) && !isPit(solid, p.x - 1, p.y + 1) && !isPit(solid, p.x + 1, p.y + 1);
  const rows = [
    '..........',
    '..........',
    '....^.....',
    '###.###..#',
    '###.###..#',
  ];
  const solid = rows.map((r) => [...r].map((c) => c === '#'));
  const spikes = new Set(rows.flatMap((r, y) => [...r].flatMap((c, x) => (c === '^' ? [`${x},${y}`] : []))));
  expect(safe(solid, spikes, safeSpot(solid, spikes, 3, 4)), 'a carrier beaten over a pit should drop the power-up on safe floor');
  expect(safe(solid, spikes, safeSpot(solid, spikes, 4, 2)), 'a carrier beaten on spikes should drop the power-up on safe floor');
  expect(safeSpot(solid, spikes, 1, 0)?.x === 1 && safe(solid, spikes, safeSpot(solid, spikes, 1, 0)), 'a carrier beaten in mid-air over safe floor drops it straight down');
  expect(awayFromPit(solid, 1, 2) === -1, 'next to a pit on the right, it should start running left');
  expect(awayFromPit(solid, 4, 2) === 1, 'nearer the pit on the left, it should start running right');
  expect(awayFromPit(solid, 5, 2) === 0, 'halfway between two pits, it falls back to running away from you');
  // Real stages: from anywhere in any arena or chunk, there's safe floor to drop on.
  for (let seed = 1; seed <= 200; seed++) {
    const b = buildBrawl({ seed, stage: 4, twist: 'classic', genreLevel: 2, powerUp: 'power-fists' });
    const bs = new Set(b.spikes.map((p) => `${p.x},${p.y}`));
    for (const r of b.arenas) {
      expect(safe(b.solid, bs, safeSpot(b.solid, bs, r.x0 + 8, 13, r.x0, r.x0 + 15)), `brawler seed ${seed}: no safe floor in arena ${r.id}`);
    }
    const p = buildStage({ seed, stage: 4, twist: 'classic', genreLevel: 2, powerUp: 'double-jump' });
    const ps = new Set(p.spikes.map((q) => `${q.x},${q.y}`));
    for (const e of p.enemies) expect(safe(p.solid, ps, safeSpot(p.solid, ps, e.x, e.y)), `platformer seed ${seed}: no safe floor near the enemy at ${e.x},${e.y}`);
  }
}

// genreAt: each level keeps what the ones below gave.
for (const genre of Object.keys(content.genres)) {
  const l1 = genreAt(content, genre, 1);
  const l2 = genreAt(content, genre, 2);
  const l3 = genreAt(content, genre, 3);
  expect(l1.payout === 1 && !l1.powerUp && !l1.boss, `${genre}: level 1 should have no payout bonus, power-up or boss`);
  expect(l2.powerUp && !l2.boss && l2.payout > 1, `${genre}: level 2 should have a power-up and a payout bonus, no boss`);
  expect(l3.powerUp === l2.powerUp && l3.boss && l3.payout > l2.payout, `${genre}: level 3 should keep level 2's power-up, add a boss and pay more`);
  expect(genreAt(content, genre, 9).level === 3, `${genre}: asking for a level above 3 should give level 3`);
}

// Payouts: a genre level adds its own line on a win, and nothing on a loss.
const save = { tokens: 0, upgrades: {}, stats: { runs: 0, wins: 0, tokensEarned: 0, bestPayout: 0, glitches: 0 }, plays: {} };
const reels = { seed: 1, theme: 'haunted-castle', genre: 'platformer', twist: 'classic' };
const won = (lv) => ({ ...makeRun(content, save, { ...reels, levels: { genre: lv } }, 'short'), cleared: 1 });
const p1 = payout(content, save, won(1));
const p3 = payout(content, save, won(3));
expect(!p1.lines.some(([label]) => label.includes('LV')), 'a level 1 genre should add no payout line');
expect(p3.lines.some(([label]) => label === 'PLATFORM LV3 x1.5') && p3.total > p1.total, 'a level 3 genre should add a "PLATFORM LV3 x1.5" line and pay more');
const lost = { ...makeRun(content, save, { ...reels, levels: { genre: 3 } }, 'short'), cleared: 0, lives: 0 };
expect(!payout(content, save, lost).lines.some(([label]) => label.includes('LV')), 'a lost run should get no genre level bonus');
expect(makeRun(content, save, reels, 'short').levels.genre === 1, 'a run without picked levels should play the genre at level 1');

// Titles: every combo, with both levels at 3, fits one screen line.
for (const theme of Object.keys(content.themes)) for (const genre of Object.keys(content.genres)) for (const twist of Object.keys(content.twists)) {
  const title = runTitle(content, { theme, genre, twist, levels: { genre: 3, twist: 3 } });
  expect(title.length <= SCREEN_CHARS, `title too long (${title.length}): "${title}"`);
}

console.log(`Built ${built} stages: every genre at levels 1-3, every twist it supports, ${SEEDS} seeds, 3-stage runs.`);
console.log('\nAt level 2, how many stages have the new enemy in them (more level 2 pieces raise this):');
for (const [genre, [n, of]] of Object.entries(meets)) console.log(`  ${genre.padEnd(11)} ${GENRES[genre].newKind.padEnd(9)} ${Math.round((100 * n) / of)}%`);
console.log(problems.length ? `\n${problems.length} problem(s):\n  ${[...new Set(problems)].slice(0, 25).join('\n  ')}` : 'No problems found.');
process.exit(problems.length ? 1 : 0);
