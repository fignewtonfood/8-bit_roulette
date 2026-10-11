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

export function assembleContent({ reels, genres, themes, twists, compatibility }) {
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

  if (errors.length) {
    throw new Error(`Content problems:\n  - ${errors.join('\n  - ')}`);
  }

  return {
    reels: { theme: themeStrip, genre: genreStrip, twist: twistStrip },
    themes,
    genres: genreMap,
    twists,
    blocked,
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

// The settings a twist gives one genre, e.g. { gravityScale: 0.5, jumpScale: 0.75 }.
export function twistSettings(content, twistId, genreId) {
  return { ...(content.twists[twistId]?.genres?.[genreId] || {}) };
}
