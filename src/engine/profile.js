// The player's live save, kept in the browser's local storage, plus a few
// things that only last until the page is closed (the session).
// Every scene reads and changes progress through here, so a save is written
// the moment something is earned or bought; refreshing never loses or
// repeats a payout.

import { loadSave, storeSave, clearSave, newSave } from './save.js';

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

let current = null;

export function getSave() {
  if (!current) {
    const { save, note } = loadSave(storage);
    if (note) console.warn(`[8-Bit Roulette] ${note}`);
    current = save;
  }
  return current;
}

export function setSave(save) {
  current = save;
  if (!storeSave(storage, save)) console.warn('[8-Bit Roulette] Could not save progress (browser storage is blocked or full).');
}

export function resetSave() {
  clearSave(storage);
  current = newSave();
}

// Lasts until the page is closed.
export const session = {
  unlockAll: false,   // ?unlock: every length open, for playtesting
  respinsLeft: 0,     // refilled each time you walk into the hub
  lastLength: 'short',
  hubSpot: null,      // where to stand when you come back to the hub
  forceGlitch: false, // ?glitch: the next spin glitches
  saysIndex: 0,       // which line the other player says next
};
