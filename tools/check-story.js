// Checks the story: unlock order, unread logs, the hub changes, glitch spins
// and the save file's story fields.
// Run with: npm run check:story
//
// Ends with a rough "which run does each log unlock on" estimate, so you can
// tune the unlock numbers in story.json without playing forty runs first.

import { loadContent } from './load-content.js';
import { spin } from '../src/engine/spin.js';
import { whyIncompatible } from '../src/engine/content.js';
import { makeRun, afterStage, payout, bank, buy, nextCost, lengthOptions } from '../src/engine/run.js';
import { newSave, parseSave } from '../src/engine/save.js';
import {
  meets, unlockedBeats, unreadBeats, markRead, newlyUnlocked, hubState, glitchNext, withStoryUnlocked,
} from '../src/engine/story.js';
import { makeRng } from '../src/gen/rng.js';

const content = loadContent();
const { beats, glitch } = content.story;
const problems = [];
const expect = (ok, msg) => ok || problems.push(msg);
const ids = (list) => list.map((b) => b.id).join(',');
const withStats = (stats, save = newSave()) => ({ ...save, stats: { ...save.stats, ...stats } });

// ---------- Unlocks ----------
const fresh = newSave();
expect(ids(unlockedBeats(content, fresh)) === beats[0].id, 'a new save should have only the first log');
expect(ids(unreadBeats(content, fresh)) === beats[0].id, 'the first log should start unread');
const all = withStoryUnlocked(content, fresh, beats.length);
expect(unlockedBeats(content, all).length === beats.length, '?story with every beat should unlock every beat');
for (let n = 1; n <= beats.length; n++) {
  expect(unlockedBeats(content, withStoryUnlocked(content, fresh, n)).length === n, `?story=${n} should unlock exactly ${n} beat(s)`);
}
// Order: a later beat's rule alone never skips an earlier beat.
const last = beats[beats.length - 1];
expect(unlockedBeats(content, withStats(last.unlock)).length <= beats.length, 'unlocks should stop at the first unmet beat');
const onlyTokens = withStats({ tokensEarned: 99999 });
expect(unlockedBeats(content, onlyTokens).every((b) => meets(onlyTokens, b.unlock)), 'every unlocked beat should meet its own rule');
for (let i = 1; i < beats.length; i++) {
  const before = withStoryUnlocked(content, fresh, i);
  const save = withStats(beats[i].unlock, newSave()); // this beat's rule, nothing else
  const unlocked = unlockedBeats(content, save).map((b) => b.id);
  if (unlocked.includes(beats[i].id)) {
    expect(beats.slice(0, i).every((b) => unlocked.includes(b.id)), `${beats[i].id} unlocked without the beats before it`);
  }
  expect(newlyUnlocked(content, before, withStoryUnlocked(content, fresh, i + 1)).map((b) => b.id).join() === beats[i].id, `${beats[i].id} should be announced as new`);
}

// ---------- Reading ----------
const read = markRead(all, beats[0].id);
expect(!(all.story.read || []).includes(beats[0].id), 'markRead() must not change the save it was given');
expect(unreadBeats(content, read).length === beats.length - 1, 'a read log should not be unread');
expect(markRead(read, beats[0].id) === read, 'reading a log twice should change nothing');

// ---------- Hub ----------
const hubAt = (n) => hubState(content, withStoryUnlocked(content, fresh, n));
expect(!hubAt(1).scratches && !hubAt(1).stranger && !hubAt(1).watching, 'a new save should have a plain hub');
const full = hubAt(beats.length);
for (const b of beats.filter((x) => x.hub)) expect(full[b.hub], `the hub should show "${b.hub}" once ${b.id} is unlocked`);
const lastSays = [...beats].reverse().find((b) => b.says);
if (lastSays) expect(full.says === lastSays.says, 'the other player should say the latest beat\'s lines');

// ---------- Glitches ----------
if (glitch) {
  const never = () => 0.999;
  const always = () => 0;
  expect(!glitchNext(content, fresh, always), 'a new save should not glitch');
  const due = withStats(glitch.first);
  expect(glitchNext(content, due, never), 'the first glitch should be forced once "first" is met');
  expect(!glitchNext(content, due, always, { practice: true }), 'practice spins should never glitch');
  const after = withStats({ ...glitch.first, glitches: 1 });
  expect(!glitchNext(content, after, never) && glitchNext(content, after, always) === glitch.chance > 0, 'later glitches should be a chance');

  for (let seed = 1; seed <= 2000; seed++) {
    const r = spin(content, seed, {}, { glitch: true });
    if (r.theme !== glitch.theme || !r.glitch) { problems.push(`seed ${seed}: a glitch spin should land on ${glitch.theme}`); break; }
    const why = whyIncompatible(content, r);
    if (why) { problems.push(`seed ${seed}: glitch spin landed on a blocked combo (${why})`); break; }
    if (JSON.stringify(r) !== JSON.stringify(spin(content, seed, {}, { glitch: true }))) { problems.push(`seed ${seed}: glitch spin not repeatable`); break; }
  }
  expect(!spin(content, 5).glitch, 'a normal spin should not be a glitch');
  expect(spin(content, 5, { theme: 'neon-space' }, { glitch: true }).theme === 'neon-space', 'a URL-locked theme should beat a glitch');

  const g = spin(content, 9, {}, { glitch: true });
  const run = { ...makeRun(content, fresh, g, 'short'), cleared: 1 };
  expect(run.glitch, 'a glitch spin should make a glitch run');
  const banked = bank(fresh, run, payout(content, fresh, run));
  expect(banked.stats.glitches === 1 && banked.stats.runs === 1, 'banking a glitch run should count it');
  const practice = { ...makeRun(content, fresh, g, 'short', { practice: true }), cleared: 1 };
  expect(bank(fresh, practice, payout(content, fresh, practice)).stats.glitches === 0, 'practice glitch runs should not count');
}

// ---------- Save file ----------
const old = parseSave(JSON.stringify({ tokens: 12, upgrades: {}, stats: { runs: 3, wins: 1, tokensEarned: 40, bestPayout: 20 } })).save;
expect(old.stats.glitches === 0 && Array.isArray(old.story.read) && old.tokens === 12, 'a save from before the story should load');
const messy = parseSave(JSON.stringify({ story: { read: ['arrival', 'arrival', 7, null, 'static'] } })).save;
expect(messy.story.read.join() === 'arrival,static', 'a messy read list should be repaired');
expect(parseSave(JSON.stringify({ story: 'oops' })).save.story.read.length === 0, 'a broken story field should be repaired');

// ---------- Report ----------
console.log(`Story: ${beats.length} beats. Glitch theme: ${glitch?.theme ?? 'none'}, first after ${JSON.stringify(glitch?.first ?? {})}, then ${(glitch?.chance ?? 0) * 100}% a spin.`);
console.log(problems.length ? `\n${problems.length} problem(s):\n  ${problems.join('\n  ')}` : 'No problems found.');

// Rough pacing: the same pretend player as check:loop (clears each stage with
// this chance, ~8 coins a stage, bets the longest length owned, buys the
// cheapest upgrade it can afford), plus glitch spins.
function simulate(clearChance, seed) {
  const rng = makeRng(seed);
  let save = newSave();
  const at = {};
  for (let runNo = 1; runNo <= 150; runNo++) {
    const g = glitchNext(content, save, rng.next);
    const len = lengthOptions(content, save).filter((l) => !l.locked).pop();
    let run = makeRun(content, save, spin(content, seed * 1000 + runNo, {}, { glitch: g }), len.id);
    for (;;) {
      const r = afterStage(run, { cleared: rng.chance(clearChance), coins: 8, livesLeft: run.lives });
      run = r.run;
      if (r.done) break;
    }
    const before = save;
    save = bank(save, run, payout(content, save, run));
    for (const b of newlyUnlocked(content, before, save)) at[b.id] ??= runNo;
    for (;;) {
      const affordable = Object.values(content.shop.upgrades)
        .map((u) => ({ u, cost: nextCost(content, save, u.id) }))
        .filter((x) => x.cost !== null && x.cost <= save.tokens)
        .sort((a, b) => a.cost - b.cost);
      if (!affordable.length) break;
      save = buy(content, save, affordable[0].u.id).save;
    }
  }
  return at;
}
for (const chance of [0.5, 0.75]) {
  const runs = {};
  for (let s = 1; s <= 200; s++) for (const [k, v] of Object.entries(simulate(chance, s))) (runs[k] ||= []).push(v);
  console.log(`\nLog unlocked after run (clears ${chance * 100}% of stages, median of 200 players):`);
  console.log(`  ${beats[0].id.padEnd(12)} start`);
  const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const b of beats.slice(1)) {
    const v = runs[b.id] || [];
    console.log(`  ${b.id.padEnd(12)} ${v.length ? `run ${median(v)}` : 'never'}${v.length && v.length < 200 ? ` (only ${v.length} of 200 players within 150 runs)` : ''}`);
  }
}

process.exit(problems.length ? 1 : 0);
