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

export function assembleContent({ reels, genres, themes, twists, compatibility, economy, shop, story }) {
  const errors = [];
  const fail = (msg) => errors.push(msg);

  // Genres: strip the _help note, keep the rest.
  const genreMap = {};
  for (const [id, g] of Object.entries(genres)) {
    if (id.startsWith('_')) continue;
    if (!g.scene) fail(`genres.json: "${id}" needs a "scene".`);
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
  for (const [id, t] of Object.entries(themes)) {
    const file = `themes/${id}.json`;
    if (t.id !== id) fail(`${file}: "id" should be "${id}" (it's "${t.id}").`);
    for (const k of PALETTE_KEYS) {
      if (!/^#[0-9a-f]{6}$/i.test(t.palette?.[k] || '')) fail(`${file}: palette.${k} should be a colour like "#a0b0c0".`);
    }
    for (const k of NAME_KEYS) if (!t.names?.[k]) fail(`${file}: names.${k} is missing.`);
    for (const g of t.genres || []) if (!genreMap[g]) fail(`${file}: unknown genre "${g}" in "genres".`);
  }

  // Twists
  for (const [id, tw] of Object.entries(twists)) {
    const file = `twists/${id}.json`;
    if (tw.id !== id) fail(`${file}: "id" should be "${id}" (it's "${tw.id}").`);
    if (!tw.genres || !Object.keys(tw.genres).length) fail(`${file}: list at least one genre under "genres".`);
    if (tw.lives !== undefined && !(Number.isInteger(tw.lives) && tw.lives >= 1)) fail(`${file}: "lives" should be a whole number, 1 or more.`);
    if (tw.payout !== undefined && !(typeof tw.payout === 'number' && tw.payout > 0)) fail(`${file}: "payout" should be a number above 0.`);
    if (tw.objective !== undefined && !OBJECTIVES.includes(tw.objective)) fail(`${file}: unknown objective "${tw.objective}" (options: ${OBJECTIVES.join(', ')}).`);
    for (const g of Object.keys(tw.genres || {})) {
      if (!genreMap[g]) fail(`${file}: unknown genre "${g}".`);
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
  const longest = (map) => Math.max(...Object.values(map).map((x) => (x.short || x.name || '').length));
  const titleLen = Math.max(...Object.values(themes).map((t) => t.name.length)) + longest(genreMap) + longest(twists) + 6;
  if (titleLen > SCREEN_CHARS) fail(`The longest theme name + genre short + twist short is ${titleLen} characters; it must fit in ${SCREEN_CHARS}. Shorten a "name" or "short".`);

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

// The run's objective twist ('collect', 'kill'), or null for a normal stage.
export function objectiveOf(content, twistId) {
  return content.twists[twistId]?.objective ?? null;
}

// The settings a twist gives one genre, e.g. { gravityScale: 0.5, jumpScale: 0.75 }.
export function twistSettings(content, twistId, genreId) {
  return { ...(content.twists[twistId]?.genres?.[genreId] || {}) };
}
