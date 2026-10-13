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
    hasPower: (lvl) => !!lvl.powerUp,
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
    hasPower: (lvl) => lvl.events.filter((e) => e.kind === 'power').length === 1,
    hasBoss: (lvl) => lvl.bossAt !== null && lvl.bossAt > lvl.duration,
    coins: (lvl) => lvl.coins,
    foes: (lvl) => lvl.events.filter((e) => e.kind !== 'coin' && e.kind !== 'power').length,
  },
  brawler: {
    build: buildBrawl,
    pieces: ARENAS,
    used: (lvl) => lvl.names,
    newKind: 'shield',
    kinds: (lvl) => lvl.arenas.flatMap((r) => r.waves.flat().map((e) => e.kind)),
    hasPower: (lvl) => !!lvl.powerUp,
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
