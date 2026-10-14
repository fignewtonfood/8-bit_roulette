// Themed power-ups (theme level 2+). The genre still decides which power-up
// a stage has (genre level 2+: double jump, spread shot, power fists); the
// theme renames it, recolours it and adds a perk on top (themes/<id>.json
// "power"). Level 3 makes the perk bigger. The perks:
//   slow    while you hold it, enemies move slower (amount = their speed)
//   magnet  while you hold it, coins within amount px fly to you
//   speed   while you hold it, you run / fly faster (amount = your speed)
//   shield  the next amount hits cost nothing (a pit still does)
//   life    amount extra lives the moment you pick it up (yours to keep)
// Each scene asks this file what to do and applies it in its own way.

import { POWER_NAMES } from './levelHud.js';
import { makeLevelTextures } from '../art/levelPlaceholder.js';
import { tex } from '../art/placeholder.js';

// The power-up's name in this theme ("SCATTERGUN"), or the genre's own.
export const powerName = (theme, kind) => theme.power?.names?.[kind] || POWER_NAMES[kind] || '';

// The boss's name in this theme ("THE OUTLAW"), or just BOSS.
export const bossName = (theme) => theme.boss?.name || 'BOSS';

// The theme's perk: { perk, amount }, or null below theme level 2.
export const perkOf = (theme) => (theme.power?.perk ? { perk: theme.power.perk, amount: theme.power.amount } : null);

// What the pickup message adds, e.g. "SPEED UP" or "+2 LIVES".
export function perkWords(theme) {
  const p = perkOf(theme);
  if (!p) return '';
  if (p.perk === 'slow') return 'FOES SLOWED';
  if (p.perk === 'magnet') return 'COIN MAGNET';
  if (p.perk === 'speed') return 'SPEED UP';
  if (p.perk === 'shield') return `SHIELD x${p.amount}`;
  if (p.perk === 'life') return `+${p.amount} ${p.amount === 1 ? 'LIFE' : 'LIVES'}`;
  return '';
}

// Multipliers for what a held perk changes (1 = no change).
export const speedPerk = (theme, holding) => (holding && perkOf(theme)?.perk === 'speed' ? perkOf(theme).amount : 1);
export const slowPerk = (theme, holding) => (holding && perkOf(theme)?.perk === 'slow' ? perkOf(theme).amount : 1);
export const magnetPerk = (theme, holding) => (holding && perkOf(theme)?.perk === 'magnet' ? perkOf(theme).amount : 0);
export const shieldPerk = (theme) => (perkOf(theme)?.perk === 'shield' ? perkOf(theme).amount : 0);
export const lifePerk = (theme) => (perkOf(theme)?.perk === 'life' ? perkOf(theme).amount : 0);

const MAGNET_PULL = 150; // px/s a coin flies toward you

// Magnet: pulls coins in range toward (x, y). Works on static coins (the
// platformer and brawler: moved by hand) and moving ones (shmup: steered).
export function pullCoins(coins, x, y, reach, dt) {
  if (!reach) return;
  coins.getChildren().forEach((c) => {
    if (!c.active || !c.body?.enable) return;
    const dx = x - c.x;
    const dy = y - c.y;
    const d = Math.hypot(dx, dy);
    if (d > reach || d < 1) return;
    if (c.body.moves === false || c.body.physicsType === 1) {
      // Static body: move it, then tell the physics where it is now.
      const s = Math.min(d, MAGNET_PULL * dt);
      c.setPosition(c.x + (dx / d) * s, c.y + (dy / d) * s);
      c.refreshBody?.();
    } else {
      c.body.setVelocity((dx / d) * MAGNET_PULL, (dy / d) * MAGNET_PULL);
    }
  });
}

// Texture keys for the themed power-up and boss: the genre's sprites,
// drawn again in the theme's power and boss colours (theme level 2+).
// Returns { power(name), boss(name) }, e.g. power('power-spread-shot').
export function themedKeys(scene, theme) {
  const out = { power: (name) => tex(theme, name), boss: (name) => tex(theme, name) };
  if (theme.power?.color) {
    const pt = { id: `${theme.id}+power`, palette: { ...theme.palette, coin: theme.power.color } };
    makeLevelTextures(scene, pt);
    out.power = (name) => tex(pt, name);
  }
  if (theme.boss?.color) {
    const bt = { id: `${theme.id}+boss`, palette: { ...theme.palette, enemy: theme.boss.color, coin: theme.boss.accent || theme.palette.coin } };
    makeLevelTextures(scene, bt);
    out.boss = (name) => tex(bt, name);
  }
  return out;
}
