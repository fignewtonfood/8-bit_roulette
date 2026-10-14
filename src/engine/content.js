// Gathers the data files into one "content" object and checks them.
// No Phaser and no file loading in here: the game (src/data/index.js) and the
// Node check tool (tools/load-content.js) each load the files their own way
// and hand them to assembleContent().
//
// Any mistake in the data (a typo'd id, a missing palette colour) throws an
// error that names the file to fix, so it shows up the moment the game loads.

export const PALETTE_KEYS = [
  'sky', 'ground', 'groundDark', 'groundTop', 'player',
  'enemy', 'spike', 'coin', 'flag', 'text',
];
export const NAME_KEYS = ['enemy', 'coin', 'hudCoin'];
const RULE_KEYS = ['theme', 'genre', 'twist'];

const EFFECTS = ['lives', 'respins', 'consolation'];
// The pixel font is 6px a letter on a 256px screen.
export const SCREEN_CHARS = 42;
// The story terminal's window is narrower than the screen.
export const LOG_CHARS = 31;
export const LOG_LINES = 9;
const STORY_HUB = ['scratches', 'stranger', 'watching'];
const UNLOCK_KEYS = ['runs', 'wins', 'tokensEarned', 'glitches', 'upgrade'];
const ON_FAIL = ['consolation', 'partial'];
// Objective twists change how a stage is won (see twists/collector.json).
export const OBJECTIVES = ['collect', 'kill'];
// The power-ups each genre's scene knows how to play (genres.json "powerUp").
export const GENRE_POWER_UPS = { platformer: ['double-jump'], shmup: ['spread-shot'], brawler: ['power-fists'], racer: ['nitro'] };
// Theme levels (themes/<id>.json "levels"). Every genre plays every hazard
// kind (src/ui/hazards.js) and every perk (src/ui/perks.js).
//   float   drifts toward you through walls, then fades
//   zap     a warning line, then a beam straight down
//   roll    rolls along the floor (crosses the screen in the shmup)
//   fall    a warning mark, then it drops from above
//   bounce  bounces across the screen
export const HAZARD_KINDS = ['float', 'zap', 'roll', 'fall', 'bounce'];
//   slow    enemies move slower (amount = speed, 0.8 = 80%)
//   magnet  coins fly to you (amount = reach in px)
//   speed   you run / fly faster (amount = speed, 1.2 = 120%)
//   shield  the next hits cost nothing (amount = hits)
//   life    extra lives when you pick it up (amount = lives)
export const PERKS = {
  slow: (n) => n > 0 && n < 1,
  magnet: (n) => n >= 16 && n <= 200,
  speed: (n) => n > 1 && n <= 1.6,
  shield: (n) => Number.isInteger(n) && n >= 1 && n <= 3,
  life: (n) => Number.isInteger(n) && n >= 1 && n <= 3,
};
// The longest power-up or boss name, so it fits its HUD line.
export const POWER_NAME_CHARS = 16;
export const BOSS_NAME_CHARS = 14;

export function assembleContent({ reels, genres, themes, twists, compatibility, economy, shop, story }) {
  const errors = [];
  const fail = (msg) => errors.push(msg);

  // Genres: strip the _help note, keep the rest.
  const genreMap = {};
  const tooLongLater = [];
  const maxLevels = (economy?.levels || []).length;
  for (const [id, g] of Object.entries(genres)) {
    if (id.startsWith('_')) continue;
    const where = `genres.json: "${id}"`;
    if (!g.scene) fail(`${where} needs a "scene".`);
    if (!g.description) fail(`${where} needs a "description" (shown at the machine).`);
    tooLongLater.push([`${where} description`, g.description || '']);
    // Levels 2 and up add to the genre (each level keeps what the ones below it gave).
    if (g.levels !== undefined) {
      if (!Array.isArray(g.levels) || !g.levels.length) fail(`${where}: "levels" should be a list, one entry per level from level 2.`);
      else if (g.levels.length > maxLevels) fail(`${where}: "levels" has ${g.levels.length} entries but economy.json only has ${maxLevels} level(s) above 1.`);
      (g.levels || []).forEach((lv, i) => {
        const at = `${where} level ${i + 2}`;
        if (!(typeof lv.payout === 'number' && lv.payout > 0)) fail(`${at}: "payout" should be a number above 0.`);
        if (!lv.description) fail(`${at} needs a "description" (shown at the machine).`);
        if (lv.powerUp !== undefined && !GENRE_POWER_UPS[id]?.includes(lv.powerUp)) fail(`${at}: unknown powerUp "${lv.powerUp}" (options: ${(GENRE_POWER_UPS[id] || []).join(', ') || 'none for this genre'}).`);
        if (lv.boss !== undefined && typeof lv.boss !== 'boolean') fail(`${at}: "boss" should be true or false.`);
        tooLongLater.push([`${at} description`, lv.description || '']);
      });
    }
    genreMap[id] = { id, short: g.short || g.name || id, ...g };
  }

  // Reel strips: accept "id" strings or { id, weight } objects.
  const strip = (reel, kind, known, file) =>
    (reels[reel] || []).map((entry) => {
      const item = typeof entry === 'string' ? { id: entry } : { ...entry };
      item.weight = item.weight ?? 1;
      if (!known[item.id]) fail(`reels.json: ${kind} "${item.id}" has no ${file}.`);
      return item;
    });

  const themeStrip = strip('themes', 'theme', themes, 'themes/<id>.json file');
  const genreStrip = strip('genres', 'genre', genreMap, 'entry in genres.json');
  const twistStrip = strip('twists', 'twist', twists, 'twists/<id>.json file');
  if (!themeStrip.length || !genreStrip.length || !twistStrip.length) {
    fail('reels.json: every reel needs at least one entry.');
  }

  // Themes
  const variantIds = new Set();
  const variantShorts = [];
  for (const [id, t] of Object.entries(themes)) {
    const file = `themes/${id}.json`;
    if (t.id !== id) fail(`${file}: "id" should be "${id}" (it's "${t.id}").`);
    for (const k of PALETTE_KEYS) {
      if (!/^#[0-9a-f]{6}$/i.test(t.palette?.[k] || '')) fail(`${file}: palette.${k} should be a colour like "#a0b0c0".`);
    }
    for (const k of NAME_KEYS) if (!t.names?.[k]) fail(`${file}: names.${k} is missing.`);
    for (const g of t.genres || []) if (!genreMap[g]) fail(`${file}: unknown genre "${g}" in "genres".`);
    if (t.levels !== undefined) checkThemeLevels(t, file);
  }

  // Theme levels. Level 2 brings the theme's hazard, power-up perk and boss;
  // level 3 is the variant (its own palette and names). Each level keeps what
  // the one below gave, so the hazard, perk and boss come from level 2 and
  // level 3 only changes numbers and names.
  function checkThemeLevels(t, file) {
    const levels = t.levels;
    if (!Array.isArray(levels) || !levels.length) return fail(`${file}: "levels" should be a list, one entry per level from level 2.`);
    if (levels.length > maxLevels) fail(`${file}: "levels" has ${levels.length} entries but economy.json only has ${maxLevels} level(s) above 1.`);
    levels.forEach((lv, i) => {
      const at = `${file}: level ${i + 2}`;
      const first = i === 0;
      if (!(typeof lv.payout === 'number' && lv.payout > 0)) fail(`${at}: "payout" should be a number above 0.`);
      if (!lv.description) fail(`${at} needs a "description" (shown at the machine).`);
      tooLongLater.push([`${at} description`, lv.description || '']);
      const hz = lv.hazard;
      if (first && !hz) fail(`${at} needs a "hazard".`);
      if (hz) {
        if ((first || hz.kind !== undefined) && !HAZARD_KINDS.includes(hz.kind)) fail(`${at}: hazard "kind" should be one of ${HAZARD_KINDS.join(', ')}.`);
        if (!hz.name && first) fail(`${at}: hazard needs a "name".`);
        if (hz.every !== undefined && !(typeof hz.every === 'number' && hz.every >= 2)) fail(`${at}: hazard "every" should be at least 2 (seconds between hazards).`);
        if (first && hz.every === undefined) fail(`${at}: hazard needs "every" (seconds between hazards).`);
      }
      const pw = lv.power;
      if (first && !pw) fail(`${at} needs a "power".`);
      if (pw) {
        const perk = pw.perk ?? levels[0].power?.perk;
        if ((first || pw.perk !== undefined) && !PERKS[pw.perk]) fail(`${at}: power "perk" should be one of ${Object.keys(PERKS).join(', ')}.`);
        else if (pw.amount !== undefined && PERKS[perk] && !PERKS[perk](pw.amount)) fail(`${at}: power "amount" ${pw.amount} doesn't fit the ${perk} perk (see PERKS in content.js).`);
        if (first && pw.amount === undefined) fail(`${at}: power needs an "amount".`);
        if (pw.color !== undefined && !/^#[0-9a-f]{6}$/i.test(pw.color)) fail(`${at}: power "color" should be a colour like "#a0b0c0".`);
        for (const [kind, name] of Object.entries(pw.names || {})) {
          if (!Object.values(GENRE_POWER_UPS).flat().includes(kind)) fail(`${at}: power names has unknown power-up "${kind}".`);
          if (String(name).length > POWER_NAME_CHARS) fail(`${at}: power name "${name}" is longer than ${POWER_NAME_CHARS} characters.`);
        }
        if (first) for (const kind of Object.values(GENRE_POWER_UPS).flat()) if (!pw.names?.[kind]) fail(`${at}: power names needs "${kind}".`);
      }
      const boss = lv.boss;
      if (first && !boss) fail(`${at} needs a "boss".`);
      if (boss) {
        if (first && !boss.name) fail(`${at}: boss needs a "name".`);
        if (boss.name && String(boss.name).length > BOSS_NAME_CHARS) fail(`${at}: boss name "${boss.name}" is longer than ${BOSS_NAME_CHARS} characters.`);
        for (const k of ['color', 'accent']) if (boss[k] !== undefined && !/^#[0-9a-f]{6}$/i.test(boss[k])) fail(`${at}: boss "${k}" should be a colour like "#a0b0c0".`);
      }
      const v = lv.variant;
      if (v) {
        if (!v.id || themes[v.id] || variantIds.has(v.id)) fail(`${at}: variant needs an "id" no other theme or variant uses.`);
        variantIds.add(v.id);
        if (!v.name || !v.short) fail(`${at}: variant needs a "name" and a "short".`);
        variantShorts.push(v.short || v.name || '');
        for (const k of PALETTE_KEYS) if (!/^#[0-9a-f]{6}$/i.test(v.palette?.[k] || '')) fail(`${at}: variant palette.${k} should be a colour like "#a0b0c0".`);
        for (const k of NAME_KEYS) if (!v.names?.[k]) fail(`${at}: variant names.${k} is missing.`);
      }
    });
  }

  // Twists
  for (const [id, tw] of Object.entries(twists)) {
    const file = `twists/${id}.json`;
    if (tw.id !== id) fail(`${file}: "id" should be "${id}" (it's "${tw.id}").`);
    if (!tw.genres || !Object.keys(tw.genres).length) fail(`${file}: list at least one genre under "genres".`);
    if (tw.lives !== undefined && !(Number.isInteger(tw.lives) && tw.lives >= 1)) fail(`${file}: "lives" should be a whole number, 1 or more.`);
    if (tw.payout !== undefined && !(typeof tw.payout === 'number' && tw.payout > 0)) fail(`${file}: "payout" should be a number above 0.`);
    if (tw.objective !== undefined && !OBJECTIVES.includes(tw.objective)) fail(`${file}: unknown objective "${tw.objective}" (options: ${OBJECTIVES.join(', ')}).`);
    if (tw.minimum !== undefined && !tw.objective) fail(`${file}: "minimum" only works with an "objective".`);
    if (tw.budgetScale !== undefined && !(typeof tw.budgetScale === 'number' && tw.budgetScale > 0 && tw.budgetScale <= 3)) fail(`${file}: "budgetScale" should be a number above 0 (1 = normal difficulty budget).`);
    if (tw.minimum !== undefined && !(Number.isInteger(tw.minimum) && tw.minimum >= 1)) fail(`${file}: "minimum" should be a whole number, 1 or more.`);
    for (const g of Object.keys(tw.genres || {})) {
      if (!genreMap[g]) fail(`${file}: unknown genre "${g}".`);
    }
    // Levels 2 and up: each entry overrides settings for that level.
    if (tw.levels !== undefined) {
      if (!Array.isArray(tw.levels) || !tw.levels.length) fail(`${file}: "levels" should be a list, one entry per level from level 2.`);
      else if (tw.levels.length > maxLevels) fail(`${file}: "levels" has ${tw.levels.length} entries but economy.json only has ${maxLevels} level(s) above 1.`);
      (tw.levels || []).forEach((lv, i) => {
        const where = `${file}: level ${i + 2}`;
        for (const g of Object.keys(lv.genres || {})) if (!tw.genres?.[g]) fail(`${where} sets genre "${g}", which this twist doesn't support.`);
        if (lv.payout !== undefined && !(typeof lv.payout === 'number' && lv.payout > 0)) fail(`${where}: "payout" should be a number above 0.`);
        if (lv.minimum !== undefined && !(Number.isInteger(lv.minimum) && lv.minimum >= 1 && tw.objective)) fail(`${where}: "minimum" should be a whole number, on a twist with an "objective".`);
        if (lv.lives !== undefined && !(Number.isInteger(lv.lives) && lv.lives >= 1)) fail(`${where}: "lives" should be a whole number, 1 or more.`);
        if (lv.budgetScale !== undefined && !(typeof lv.budgetScale === 'number' && lv.budgetScale > 0 && lv.budgetScale <= 3)) fail(`${where}: "budgetScale" should be a number above 0 (1 = normal difficulty budget).`);
        if (!lv.description) fail(`${where} needs a "description" (shown at the machine).`);
        tooLongLater.push([`${where}: description`, lv.description || '']);
      });
    }
  }

  // Compatibility rules
  const known = { theme: themes, genre: genreMap, twist: twists };
  const blocked = (compatibility.blocked || []).map((rule, i) => {
    const keys = RULE_KEYS.filter((k) => rule[k]);
    if (!keys.length) fail(`compatibility.json: rule ${i + 1} needs a theme, genre or twist.`);
    for (const k of keys) if (!known[k][rule[k]]) fail(`compatibility.json: rule ${i + 1} has unknown ${k} "${rule[k]}".`);
    return rule;
  });

  // Text that has to fit on one line of the screen
  const tooLong = (where, s) => String(s).length > SCREEN_CHARS && fail(`${where} is ${String(s).length} characters; one screen line fits ${SCREEN_CHARS}: "${s}"`);
  for (const [id, tw] of Object.entries(twists)) tooLong(`twists/${id}.json: description`, tw.description || '');
  for (const [where, s] of tooLongLater) tooLong(where, s);
  const longest = (map) => Math.max(...Object.values(map).map((x) => (x.short || x.name || '').length));
  // + 6 for the separators, + 4 each for a theme, a genre and a twist level
  // (" LV3"). The title uses the theme's name, or its short name when that's
  // too long (see runTitle in spin.js), so the short name must always fit.
  // A level 3 theme shows its variant's short name.
  const themeShort = Math.max(...Object.values(themes).map((t) => (t.short || t.name).length), ...variantShorts.map((s) => s.length));
  const titleLen = themeShort + longest(genreMap) + longest(twists) + 18;
  if (titleLen > SCREEN_CHARS) fail(`The longest theme short + genre short + twist short, with all three levels, is ${titleLen} characters; it must fit in ${SCREEN_CHARS}. Shorten a "short".`);

  // Shop upgrades
  const upgrades = {};
  for (const [i, u] of (shop?.upgrades || []).entries()) {
    const where = `shop.json: upgrade ${i + 1}${u.id ? ` ("${u.id}")` : ''}`;
    if (!u.id) fail(`${where} needs an "id".`);
    if (upgrades[u.id]) fail(`${where}: the id is used twice.`);
    if (!u.name) fail(`${where} needs a "name".`);
    if (!Array.isArray(u.costs) || !u.costs.length || u.costs.some((c) => !Number.isInteger(c) || c < 0)) {
      fail(`${where}: "costs" should be a list of whole numbers, one per level.`);
    }
    for (const k of Object.keys(u.perLevel || {})) {
      if (!EFFECTS.includes(k)) fail(`${where}: unknown perLevel "${k}" (options: ${EFFECTS.join(', ')}).`);
    }
    for (const line of u.description || []) tooLong(`${where}: description`, line);
    upgrades[u.id] = { short: u.name.toUpperCase(), description: [], perLevel: {}, ...u };
  }

  // Economy: lengths and payouts
  const eco = economy || {};
  for (const k of ['startLives', 'stageTokens', 'coinTokens', 'consolation']) {
    if (typeof eco[k] !== 'number' || eco[k] < 0) fail(`economy.json: "${k}" should be a number.`);
  }
  if (eco.levels !== undefined) {
    const lv = eco.levels;
    if (!Array.isArray(lv) || lv.some((n, i) => !Number.isInteger(n) || n < 1 || (i && n <= lv[i - 1]))) {
      fail('economy.json: "levels" should be rising whole numbers of plays, like [10, 50].');
    }
  }
  const lengths = (eco.lengths || []).map((len, i) => {
    const where = `economy.json: length ${i + 1}${len.id ? ` ("${len.id}")` : ''}`;
    if (!len.id || !len.name) fail(`${where} needs an "id" and a "name".`);
    if (!Number.isInteger(len.stages) || len.stages < 1) fail(`${where}: "stages" should be 1 or more.`);
    if (typeof len.multiplier !== 'number' || len.multiplier <= 0) fail(`${where}: "multiplier" should be a number above 0.`);
    if (!ON_FAIL.includes(len.onFail)) fail(`${where}: "onFail" should be one of ${ON_FAIL.join(', ')}.`);
    const req = len.requires;
    if (req) {
      const u = upgrades[req.upgrade];
      if (!u) fail(`${where} requires unknown upgrade "${req.upgrade}" (not in shop.json).`);
      else if (!(req.level >= 1 && req.level <= u.costs.length)) fail(`${where} requires ${req.upgrade} level ${req.level}, but it only has ${u.costs.length} level(s).`);
    }
    return len;
  });
  if (economy && !lengths.length) fail('economy.json: list at least one length under "lengths".');
  if (economy && lengths.length && lengths[0].requires) fail('economy.json: the first length must be unlocked from the start (no "requires").');

  // Story
  const beats = [];
  const glitch = story?.glitch || null;
  if (story) {
    const ids = new Set();
    const checkUnlock = (where, rule) => {
      for (const [k, v] of Object.entries(rule || {})) {
        if (!UNLOCK_KEYS.includes(k)) fail(`${where}: unknown unlock "${k}" (options: ${UNLOCK_KEYS.join(', ')}).`);
        else if (k === 'upgrade') {
          if (!upgrades[v?.id]) fail(`${where}: unlock upgrade "${v?.id}" is not in shop.json.`);
        } else if (!Number.isInteger(v) || v < 0) fail(`${where}: unlock "${k}" should be a whole number.`);
      }
    };
    for (const [i, b] of (story.beats || []).entries()) {
      const where = `story.json: beat ${i + 1}${b.id ? ` ("${b.id}")` : ''}`;
      if (!b.id) fail(`${where} needs an "id".`);
      if (ids.has(b.id)) fail(`${where}: the id is used twice.`);
      ids.add(b.id);
      if (!b.title) fail(`${where} needs a "title".`);
      checkUnlock(where, b.unlock);
      if (!Array.isArray(b.log) || !b.log.length) fail(`${where} needs a "log" (a list of lines).`);
      if ((b.log || []).length > LOG_LINES) fail(`${where}: "log" has ${b.log.length} lines; the terminal fits ${LOG_LINES}.`);
      for (const line of b.log || []) {
        if (String(line).length > LOG_CHARS) fail(`${where}: log line is ${String(line).length} characters; the terminal fits ${LOG_CHARS}: "${line}"`);
      }
      if (b.hub && !STORY_HUB.includes(b.hub)) fail(`${where}: unknown hub "${b.hub}" (options: ${STORY_HUB.join(', ')}).`);
      for (const line of b.wall || []) {
        if (String(line).length > LOG_CHARS) fail(`${where}: wall line is ${String(line).length} characters; the panel fits ${LOG_CHARS}: "${line}"`);
      }
      if (b.wall && b.wall.length > LOG_LINES) fail(`${where}: "wall" fits ${LOG_LINES} lines.`);
      // Speech is shown in quotes, so two characters fewer than a screen line.
      for (const line of b.says || []) {
        if (String(line).length > SCREEN_CHARS - 2) fail(`${where}: says line is ${String(line).length} characters; speech fits ${SCREEN_CHARS - 2}: "${line}"`);
      }
      beats.push({ unlock: {}, ...b });
    }
    if (beats.length && Object.keys(beats[0].unlock).length) fail('story.json: the first beat must be unlocked from the start ("unlock": {}).');
    if (glitch) {
      if (!themes[glitch.theme]) fail(`story.json: glitch theme "${glitch.theme}" has no themes/<id>.json file.`);
      if (!(glitch.chance >= 0 && glitch.chance <= 1)) fail('story.json: glitch "chance" should be between 0 and 1.');
      checkUnlock('story.json: glitch "first"', glitch.first);
    }
  }

  if (errors.length) {
    throw new Error(`Content problems:\n  - ${errors.join('\n  - ')}`);
  }

  return {
    reels: { theme: themeStrip, genre: genreStrip, twist: twistStrip },
    themes,
    genres: genreMap,
    twists,
    blocked,
    economy: { ...eco, lengths },
    shop: { upgrades },
    story: { beats, glitch },
  };
}

// Can these three parts be played together? Returns null if yes, or the reason if not.
export function whyIncompatible(content, { theme, genre, twist }) {
  const tw = content.twists[twist];
  if (tw && genre && !tw.genres[genre]) return `${tw.name} doesn't support ${content.genres[genre].name}`;
  const th = content.themes[theme];
  if (th?.genres && genre && !th.genres.includes(genre)) return `${th.name} doesn't support ${content.genres[genre].name}`;
  for (const rule of content.blocked) {
    const matches = RULE_KEYS.every((k) => !rule[k] || rule[k] === { theme, genre, twist }[k]);
    if (matches) return rule.reason || 'blocked in compatibility.json';
  }
  return null;
}

// A twist as played at a level (1 = as written; 2+ apply that entry in "levels").
export function twistAt(content, twistId, level = 1) {
  const tw = content.twists[twistId];
  const lv = level > 1 ? tw?.levels?.[level - 2] : null;
  if (!tw || !lv) return tw;
  const genres = {};
  for (const g of Object.keys(tw.genres)) genres[g] = { ...tw.genres[g], ...(lv.genres?.[g] || {}) };
  return { ...tw, ...lv, genres, level };
}

// A genre as played at a level: level 1 as written, and each level above adds
// its entry in "levels" on top (so level 3 keeps level 2's power-up).
// { ...genre, payout, powerUp, boss, level }
export function genreAt(content, genreId, level = 1) {
  const g = content.genres[genreId];
  if (!g) return g;
  const out = { ...g, payout: 1, powerUp: null, boss: false, level: 1 };
  (g.levels || []).slice(0, Math.max(0, level - 1)).forEach((lv, i) => Object.assign(out, lv, { level: i + 2 }));
  return out;
}

// A theme as played at a level. Level 1 is the theme as written. Level 2 adds
// its hazard, power-up perk and boss; level 3 adds its entry on top (more
// hazards, a bigger perk) and plays as the variant: the variant's id, name,
// short, palette and names replace the theme's. baseId is always the theme
// on the reel (plays count toward it).
// { ...theme, level, payout, hazard, power, boss, baseId }
export function themeAt(content, themeId, level = 1) {
  const t = content.themes[themeId];
  if (!t) return t;
  const out = { ...t, level: 1, payout: 1, hazard: null, power: null, boss: null, baseId: themeId };
  (t.levels || []).slice(0, Math.max(0, level - 1)).forEach((lv, i) => {
    out.level = i + 2;
    out.payout = lv.payout;
    if (lv.hazard) out.hazard = { ...out.hazard, ...lv.hazard };
    if (lv.power) out.power = { ...out.power, ...lv.power, names: { ...out.power?.names, ...lv.power.names } };
    if (lv.boss) out.boss = { ...out.boss, ...lv.boss };
    if (lv.variant) Object.assign(out, lv.variant);
  });
  return out;
}

// The highest level a theme has settings for (1 if it has no "levels").
export const themeMaxLevel = (content, themeId) => 1 + (content.themes[themeId]?.levels?.length || 0);

// The highest level a genre has settings for (1 if it has no "levels").
export const genreMaxLevel = (content, genreId) => 1 + (content.genres[genreId]?.levels?.length || 0);

// The highest level a twist has settings for (1 if it has no "levels").
export const twistMaxLevel = (content, twistId) => 1 + (content.twists[twistId]?.levels?.length || 0);

// The run's objective twist ('collect', 'kill'), or null for a normal stage.
export function objectiveOf(content, twistId) {
  return content.twists[twistId]?.objective ?? null;
}

// What a stage generator needs from the run's twist at its level:
// { minCoins, minEnemies } (Collector and Killer's "minimum"; zero for every
// other twist) and budgetScale (the twist's "budgetScale", 1 if it has none).
export function stageRules(content, twistId, level = 1) {
  const tw = twistAt(content, twistId, level);
  const n = tw?.minimum ?? 0;
  return {
    minCoins: tw?.objective === 'collect' ? n : 0,
    minEnemies: tw?.objective === 'kill' ? n : 0,
    budgetScale: tw?.budgetScale ?? 1,
  };
}

// The settings a twist gives one genre, e.g. { gravityScale: 0.5, jumpScale: 0.75 }.
export function twistSettings(content, twistId, genreId, level = 1) {
  return { ...(twistAt(content, twistId, level)?.genres?.[genreId] || {}) };
}
