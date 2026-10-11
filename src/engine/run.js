// The loop's rules: what a run is, how stages chain together, what it pays,
// and what the shop sells. No Phaser in here, so it can be tested with plain
// Node (npm run check:loop). The numbers live in economy.json and shop.json.
//
// A run is everything needed to rebuild and continue a game:
//   { seed, theme, genre, twist,       from the slot machine
//     length, stages, multiplier,      from the bet
//     stage, lives, coins, cleared,    progress so far
//     practice }                       true for URL test runs (pays nothing)
// Every stage reuses the run's seed with its own stage number, so stage 2 of
// seed 7 is always the same layout, and harder than stage 1.

// ---------- Upgrades ----------

export const levelOf = (save, upgradeId) => save.upgrades[upgradeId] || 0;

// Total of one perLevel effect across everything owned, e.g. stat(..., 'lives').
export function stat(content, save, key) {
  let total = 0;
  for (const u of Object.values(content.shop.upgrades)) {
    total += (u.perLevel[key] || 0) * Math.min(levelOf(save, u.id), u.costs.length);
  }
  return total;
}

export const startLives = (content, save) => content.economy.startLives + stat(content, save, 'lives');
export const respinsPerVisit = (content, save) => stat(content, save, 'respins');

// What buying the next level of an upgrade would cost (null if maxed).
export function nextCost(content, save, upgradeId) {
  const u = content.shop.upgrades[upgradeId];
  const lv = levelOf(save, upgradeId);
  return lv < u.costs.length ? u.costs[lv] : null;
}

// Returns { ok: true, save } with the purchase applied, or { ok: false, reason }.
// Never changes the save it was given.
export function buy(content, save, upgradeId) {
  const u = content.shop.upgrades[upgradeId];
  if (!u) return { ok: false, reason: `No upgrade called "${upgradeId}".` };
  const cost = nextCost(content, save, upgradeId);
  if (cost === null) return { ok: false, reason: 'MAXED OUT' };
  if (save.tokens < cost) return { ok: false, reason: `NEED ${cost - save.tokens} MORE TOKENS` };
  return {
    ok: true,
    save: {
      ...save,
      tokens: save.tokens - cost,
      upgrades: { ...save.upgrades, [upgradeId]: levelOf(save, upgradeId) + 1 },
    },
  };
}

// ---------- Bets ----------

// Every length, each marked locked or not. unlockAll is for playtesting (?unlock).
export function lengthOptions(content, save, unlockAll = false) {
  return content.economy.lengths.map((len) => {
    const req = len.requires;
    const locked = !unlockAll && !!req && levelOf(save, req.upgrade) < req.level;
    const why = locked ? `${content.shop.upgrades[req.upgrade].short} ${'I'.repeat(req.level)}` : null;
    return { ...len, locked, unlockedBy: why };
  });
}

// ---------- Runs ----------

export function makeRun(content, save, spinResult, lengthId, { practice = false } = {}) {
  const len = content.economy.lengths.find((l) => l.id === lengthId) || content.economy.lengths[0];
  return {
    seed: spinResult.seed,
    theme: spinResult.theme,
    genre: spinResult.genre,
    twist: spinResult.twist,
    length: len.id,
    stages: len.stages,
    multiplier: len.multiplier,
    stage: 1,
    lives: startLives(content, save),
    coins: 0,
    cleared: 0,
    practice,
  };
}

// A stage just ended. stageResult = { cleared, coins, livesLeft }.
// Returns { run, done } where run is the updated run; when not done,
// run.stage is the next stage to play.
export function afterStage(run, { cleared, coins = 0, livesLeft = 0 }) {
  const next = { ...run, coins: run.coins + coins, lives: Math.max(0, livesLeft) };
  if (!cleared) return { run: { ...next, lives: 0 }, done: true };
  next.cleared = run.cleared + 1;
  if (next.cleared >= run.stages) return { run: next, done: true };
  return { run: { ...next, stage: run.stage + 1 }, done: false };
}

export const runWon = (run) => run.cleared >= run.stages;

// What a finished run pays. Returns { total, won, lines: [[label, amount], ...] }.
export function payout(content, save, run) {
  const eco = content.economy;
  const len = eco.lengths.find((l) => l.id === run.length) || { onFail: 'consolation', multiplier: 1 };
  const won = runWon(run);
  const lines = [];

  if (won) {
    const base = run.cleared * eco.stageTokens;
    lines.push([`${run.cleared} STAGE${run.cleared === 1 ? '' : 'S'} x${run.multiplier}`, Math.floor(base * run.multiplier)]);
  } else if (len.onFail === 'partial') {
    lines.push([`${run.cleared} STAGE${run.cleared === 1 ? '' : 'S'} x1`, run.cleared * eco.stageTokens]);
  } else {
    lines.push(['CONSOLATION', eco.consolation]);
  }

  lines.push([`COINS x${eco.coinTokens}`, Math.floor(run.coins * eco.coinTokens)]);

  const lucky = stat(content, save, 'consolation');
  if (!won && lucky) lines.push(['LUCKY CHARM', lucky]);

  if (run.practice) return { total: 0, won, lines, practice: true };
  return { total: lines.reduce((sum, [, n]) => sum + n, 0), won, lines };
}

// Adds a finished run to the save. Never changes the save it was given.
export function bank(save, run, pay) {
  if (run.practice) return save;
  return {
    ...save,
    tokens: save.tokens + pay.total,
    stats: {
      runs: save.stats.runs + 1,
      wins: save.stats.wins + (pay.won ? 1 : 0),
      tokensEarned: save.stats.tokensEarned + pay.total,
      bestPayout: Math.max(save.stats.bestPayout, pay.total),
    },
  };
}
