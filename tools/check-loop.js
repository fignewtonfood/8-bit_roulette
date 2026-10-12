// Checks the loop: bets, stage chaining, payouts, the shop and the save file.
// Run with: npm run check:loop
//
// Prints a payout table and a rough "how many runs until I can afford X"
// estimate, so you can tune economy.json and shop.json without playing
// fifty runs first.

import { loadContent } from './load-content.js';
import { spin } from '../src/engine/spin.js';
import {
  makeRun, afterStage, payout, bank, buy, nextCost, lengthOptions, startLives, respinsPerVisit, stat,
} from '../src/engine/run.js';
import { newSave, parseSave, loadSave, storeSave, SAVE_KEY } from '../src/engine/save.js';
import { makeRng } from '../src/gen/rng.js';

const content = loadContent();
const problems = [];
const expect = (ok, msg) => ok || problems.push(msg);
const eco = content.economy;
const upgrades = content.shop.upgrades;

// ---------- Bets ----------
const fresh = newSave();
const open = lengthOptions(content, fresh).filter((l) => !l.locked).map((l) => l.id);
expect(open.length >= 1 && open[0] === eco.lengths[0].id, 'a new save should have the first length open');
expect(lengthOptions(content, fresh, true).every((l) => !l.locked), '?unlock should open every length');
for (const len of eco.lengths.filter((l) => l.requires)) {
  const { upgrade, level } = len.requires;
  const before = { ...fresh, upgrades: { [upgrade]: level - 1 } };
  const after = { ...fresh, upgrades: { [upgrade]: level } };
  expect(lengthOptions(content, before).find((l) => l.id === len.id).locked, `${len.id} should be locked below ${upgrade} ${level}`);
  expect(!lengthOptions(content, after).find((l) => l.id === len.id).locked, `${len.id} should unlock at ${upgrade} ${level}`);
}

// ---------- Stage chaining ----------
const combo = spin(content, 42);
for (const len of eco.lengths) {
  let run = makeRun(content, fresh, combo, len.id);
  expect(run.stages === len.stages && run.stage === 1, `${len.id}: run should start at stage 1 of ${len.stages}`);
  let steps = 0;
  for (;;) {
    const r = afterStage(run, { cleared: true, coins: 5, livesLeft: run.lives - (steps % 2) });
    steps++;
    run = r.run;
    if (r.done) break;
    expect(run.stage === steps + 1, `${len.id}: stage ${steps + 1} should follow stage ${steps}`);
    if (steps > 20) break;
  }
  expect(steps === len.stages && run.cleared === len.stages, `${len.id}: should take ${len.stages} cleared stages to finish (took ${steps})`);
  expect(run.coins === 5 * len.stages, `${len.id}: coins should add up across stages`);

  const lost = afterStage(makeRun(content, fresh, combo, len.id), { cleared: false, coins: 3, livesLeft: 0 });
  expect(lost.done && lost.run.cleared === 0, `${len.id}: losing a stage should end the run`);
}
const lives = afterStage({ ...makeRun(content, fresh, combo, 'medium'), lives: 3 }, { cleared: true, livesLeft: 1 });
expect(lives.run.lives === 1, 'lives lost in stage 1 should stay lost in stage 2');

// ---------- Payouts ----------
const finished = (lengthId, cleared, coins, save = fresh, practice = false) => {
  const run = { ...makeRun(content, save, combo, lengthId, { practice }), cleared, coins };
  return payout(content, save, run);
};
for (const len of eco.lengths) {
  const win = finished(len.id, len.stages, 0);
  expect(win.won && win.total === Math.floor(len.stages * eco.stageTokens * len.multiplier), `${len.id}: a clean win should pay stages x multiplier`);
  const fail = finished(len.id, len.stages - 1, 0);
  const want = len.onFail === 'partial' ? (len.stages - 1) * eco.stageTokens : eco.consolation;
  expect(!fail.won && fail.total === want, `${len.id}: a loss should pay ${want} (paid ${fail.total})`);
}
expect(finished('short', 1, 0, fresh, true).total === 0, 'practice runs should pay nothing');
const charmed = { ...fresh, upgrades: { 'lucky-charm': 2 } };
expect(finished('short', 0, 0, charmed).total === eco.consolation + stat(content, charmed, 'consolation'), 'Lucky Charm should add to losses');
expect(finished('short', 1, 0, charmed).total === finished('short', 1, 0).total, 'Lucky Charm should not change wins');

const banked = bank(fresh, { ...makeRun(content, fresh, combo, 'short'), cleared: 1, coins: 4 }, finished('short', 1, 4));
expect(banked.tokens === finished('short', 1, 4).total && banked.stats.runs === 1 && banked.stats.wins === 1, 'bank() should add tokens and stats');
expect(fresh.tokens === 0, 'bank() must not change the save it was given');

// Twists that change lives or pay (Sudden Death)
for (const tw of Object.values(content.twists)) {
  const c = { ...combo, twist: tw.id };
  const lifeUp = { ...fresh, upgrades: { 'extra-life': 2 } };
  if (tw.lives !== undefined) {
    expect(makeRun(content, lifeUp, c, 'short').lives === tw.lives, `${tw.id}: should start with exactly ${tw.lives} li${tw.lives === 1 ? 'fe' : 'ves'}, Extra Life or not`);
  }
  const won = payout(content, fresh, { ...makeRun(content, fresh, c, 'short'), cleared: 1, coins: 0 });
  const base = eco.stageTokens * eco.lengths[0].multiplier;
  expect(won.total === Math.floor(base * (tw.payout ?? 1)), `${tw.id}: a win should pay ${Math.floor(base * (tw.payout ?? 1))} (paid ${won.total})`);
  const lost = payout(content, fresh, { ...makeRun(content, fresh, c, 'short'), cleared: 0, coins: 0 });
  expect(lost.total === eco.consolation, `${tw.id}: a loss should pay the normal consolation`);
}

// ---------- Shop ----------
for (const u of Object.values(upgrades)) {
  let save = { ...newSave(), tokens: 0 };
  expect(!buy(content, save, u.id).ok, `${u.id}: should not be buyable with 0 tokens`);
  save.tokens = u.costs.reduce((a, b) => a + b, 0);
  for (let lv = 1; lv <= u.costs.length; lv++) {
    const r = buy(content, save, u.id);
    expect(r.ok && r.save.upgrades[u.id] === lv, `${u.id}: level ${lv} should be buyable`);
    save = r.save;
  }
  expect(save.tokens === 0, `${u.id}: buying every level should cost exactly the listed prices`);
  expect(nextCost(content, save, u.id) === null && !buy(content, { ...save, tokens: 9999 }, u.id).ok, `${u.id}: should stop at max level`);
}
const maxed = { ...newSave(), upgrades: Object.fromEntries(Object.values(upgrades).map((u) => [u.id, u.costs.length])) };
expect(startLives(content, fresh) === eco.startLives, 'a new save should start with the base lives');

// ---------- Save file ----------
const memory = () => {
  const store = {};
  return { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k], store };
};
const disk = memory();
expect(storeSave(disk, maxed) && JSON.stringify(loadSave(disk).save) === JSON.stringify(maxed), 'a save should load back exactly');
for (const junk of ['{not json', 'null', '42', '"text"']) {
  const r = parseSave(junk);
  expect(r.save.tokens === 0 && r.note, `a broken save (${junk}) should start fresh with a note`);
}
const repaired = parseSave(JSON.stringify({ tokens: -5.5, upgrades: { 'extra-life': 'x', respin: 1 }, stats: { runs: 3 } })).save;
expect(repaired.tokens === 0 && repaired.upgrades.respin === 1 && !('extra-life' in repaired.upgrades) && repaired.stats.runs === 3 && repaired.stats.wins === 0, 'bad fields in a save should be repaired');
const broken = memory();
broken.setItem(SAVE_KEY, '{oops');
loadSave(broken);
expect(Object.keys(broken.store).some((k) => k.startsWith(`${SAVE_KEY}/broken-`)), 'an unreadable save should be backed up, not lost');
const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
expect(loadSave(blocked).note && !storeSave(blocked, fresh), 'blocked storage should not crash');

// ---------- Report ----------
console.log(`Economy: ${eco.lengths.length} lengths, ${Object.keys(upgrades).length} upgrades. Base lives ${eco.startLives}, ${eco.stageTokens} tokens a stage, ${eco.coinTokens} a coin.`);
console.log(problems.length ? `\n${problems.length} problem(s):\n  ${problems.join('\n  ')}` : 'No problems found.');

console.log('\nPayouts (12 coins a stage, no upgrades):');
console.log('  length   win          lose after 0  lose after half');
for (const len of eco.lengths) {
  const half = Math.floor(len.stages / 2);
  const w = finished(len.id, len.stages, 12 * len.stages).total;
  const l0 = finished(len.id, 0, 6).total;
  const lh = finished(len.id, half, 12 * half + 6).total;
  console.log(`  ${len.id.padEnd(8)} ${String(w).padStart(4)}         ${String(l0).padStart(4)}          ${String(lh).padStart(4)}`);
}

// Rough progression: a player who clears each stage with this chance and
// grabs ~8 coins a stage, always betting the longest length they own and
// buying upgrades cheapest-first. Just a guide for tuning prices.
function simulate(clearChance, seed) {
  const rng = makeRng(seed);
  let save = newSave();
  const firstBuy = {};
  for (let runNo = 1; runNo <= 200; runNo++) {
    const len = lengthOptions(content, save).filter((l) => !l.locked).pop();
    let run = makeRun(content, save, combo, len.id);
    for (;;) {
      const { run: next, done } = afterStage(run, { cleared: rng.chance(clearChance), coins: 8, livesLeft: run.lives });
      run = next;
      if (done) break;
    }
    save = bank(save, run, payout(content, save, run));
    for (;;) {
      const affordable = Object.values(upgrades)
        .map((u) => ({ u, cost: nextCost(content, save, u.id) }))
        .filter((x) => x.cost !== null && x.cost <= save.tokens)
        .sort((a, b) => a.cost - b.cost);
      if (!affordable.length) break;
      const { u } = affordable[0];
      save = buy(content, save, u.id).save;
      firstBuy[`${u.short} ${save.upgrades[u.id]}`] ??= runNo;
    }
  }
  return firstBuy;
}
for (const chance of [0.5, 0.75]) {
  const runs = {};
  for (let s = 1; s <= 200; s++) {
    for (const [k, v] of Object.entries(simulate(chance, s))) (runs[k] ||= []).push(v);
  }
  console.log(`\nRuns until bought (clears ${chance * 100}% of stages, median of 200 players):`);
  const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const [k, v] of Object.entries(runs).sort((a, b) => median(a[1]) - median(b[1]))) {
    console.log(`  ${k.padEnd(16)} run ${median(v)}`);
  }
}
console.log(`\nWith everything bought: ${startLives(content, maxed)} lives, ${respinsPerVisit(content, maxed)} re-spin(s) a visit.`);

process.exit(problems.length ? 1 : 0);
