// The save file: tokens, owned upgrades and a few stats.
// No Phaser and no window in here, so it can be tested with plain Node
// (npm run check:loop). The game hands it the browser's localStorage;
// the check tool hands it a fake one.
//
// A save is plain JSON. Anything missing or broken in a stored save is
// repaired with defaults instead of crashing the game, and a save that can't
// be read at all starts fresh (the old text is kept under a backup key).

export const SAVE_KEY = '8bit-roulette/save';
export const SAVE_VERSION = 1;

export function newSave() {
  return {
    version: SAVE_VERSION,
    tokens: 0,
    upgrades: {}, // upgrade id -> level owned
    stats: { runs: 0, wins: 0, tokensEarned: 0, bestPayout: 0 },
  };
}

const wholeNumber = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

// Turns whatever was stored into a valid save. Returns { save, note }.
export function parseSave(text) {
  if (text == null || text === '') return { save: newSave(), note: null };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { save: newSave(), note: 'Save file could not be read, so a new one was started.' };
  }
  if (!raw || typeof raw !== 'object') return { save: newSave(), note: 'Save file was empty, so a new one was started.' };

  const save = newSave();
  save.tokens = wholeNumber(raw.tokens);
  for (const [id, level] of Object.entries(raw.upgrades || {})) {
    const lv = wholeNumber(level);
    if (lv) save.upgrades[id] = lv;
  }
  for (const k of Object.keys(save.stats)) save.stats[k] = wholeNumber(raw.stats?.[k]);
  return { save, note: null };
}

export function loadSave(storage) {
  let text = null;
  try {
    text = storage?.getItem(SAVE_KEY) ?? null;
  } catch {
    return { save: newSave(), note: 'Browser storage is blocked, so progress will not be kept.' };
  }
  const result = parseSave(text);
  if (result.note && text) {
    try {
      storage.setItem(`${SAVE_KEY}/broken-${Date.now()}`, text);
    } catch {
      /* nothing else to try */
    }
  }
  return result;
}

// Returns true if it was written.
export function storeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage) {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to clear */
  }
}
