# 8-Bit Roulette

Milestone 4 (the loop): walk around the hub, bet on a game length, pull the
slot machine, clear the stages, get paid in tokens, and spend them in the shop.
Progress is saved in the browser.

## Run it

```
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173).

- **Hub:** arrows walk, Z jumps, Up uses whatever you're standing at
  (the shop, the slot machine, or the terminal, which shows your records)
- **Machine:** Left/Right picks the bet, Space pulls. Whatever lands, you play;
  S re-spins only if you own Re-spin (once per trip to the hub). X goes back
- **Platformer:** arrows move; Up, Space or Z jump. **Shmup:** arrows fly, hold Space or Z to fire
- The browser console lists the reels and the chunks/waves used for every stage

### Testing shortcuts (add to the URL)

Practice runs pay no tokens and don't touch your save:

- `?seed=12345` replays a run exactly (same reels, same stages)
- `?genre=shmup`, `?theme=neon-space`, `?twist=darkness` force a reel; mix them freely
- `?length=medium` plays more stages (`short`, `medium`, `long`)
- `?spin` opens a practice machine: every length open, free re-spins, forced reels stay locked
- `?debug` shows hitboxes
- `?zoom=3` forces the size: each game pixel becomes 3x3 screen pixels (normally it picks the biggest whole number that fits the window)

Save tools:

- `?unlock` opens every length in the real game (until you close the tab)
- `?tokens=500` adds 500 tokens to your save (take it off the URL afterwards, or every refresh adds more)
- `?reset` wipes your save

## Check everything

```
npm run check          # all four below
npm run check:chunks   # 5,000 platformer stages
npm run check:shmup    # 5,000 shmup stages
npm run check:engine   # data files + 10,000 spins
npm run check:loop     # bets, payouts, shop, save file + a progression estimate
```

## Adding content (no code needed)

- **Theme:** copy `src/data/themes/neon-space.json`, change the id, colours and
  names, then add the id to the `themes` reel in `src/data/reels.json`.
- **Twist settings:** edit the numbers in `src/data/twists/*.json`.
- **On-screen text:** one line fits 42 characters. `npm run check:engine` flags
  twist descriptions, shop descriptions and names that won't fit.
- **Rarity:** give a reel entry a `"weight"` (0.5 = half as often).
- **Bad combos:** add a rule to `src/data/compatibility.json`.
- **Payouts, lives, lengths:** `src/data/economy.json`. A length with
  `requires` stays locked until the player owns that upgrade level.
- **Shop prices and upgrades:** `src/data/shop.json`. One price per level;
  `perLevel` can add `lives`, `respins` or `consolation`.

Run `npm run check:loop` after changing prices: it estimates how many runs a
player needs before each purchase.

A brand-new *kind* of twist (not just new numbers) needs a few lines in each
genre scene, like Low Gravity and Darkness have. A new genre needs a scene.

## Where things live

| File | What it does |
|---|---|
| `src/data/reels.json` | What can land on each reel |
| `src/data/themes/`, `src/data/twists/` | One JSON file per theme / twist |
| `src/data/genres.json` | Genre names and which scene plays them |
| `src/data/compatibility.json` | Combos the machine must never land on |
| `src/data/economy.json` | Lengths, multipliers, tokens per stage and coin, base lives |
| `src/data/shop.json` | Upgrades, prices and what each level adds |
| `src/engine/spin.js` | Seed → theme, genre, twist (with re-rolls) |
| `src/engine/content.js` | Loads and checks the data files |
| `src/engine/darkness.js` | The Darkness effect, shared by both genres |
| `src/engine/run.js` | The loop's rules: runs, stage chaining, payouts, buying |
| `src/engine/save.js` | Reading and repairing the save file |
| `src/engine/profile.js` | The live save in the browser, plus this-visit settings |
| `src/engine/startRun.js` | Starts a stage; decides next stage or payout when one ends |
| `src/ui/font.js` | The pixel font (drawn in code; add a letter by drawing it) |
| `src/ui/machine.js` | The machine's colours and text, shared by hub, machine and shop |
| `src/scenes/HubScene.js` | The hub room |
| `src/scenes/ShopScene.js` | The shop |
| `src/scenes/SpinScene.js` | The slot machine screen and the bet |
| `src/gen/chunks.js` | Hand-drawn level chunks (add new ones here) |
| `src/gen/waves.js` | Hand-drawn shmup waves |
| `src/gen/buildStage.js` | Seed → stage: pacing, difficulty budget, mirroring |
| `src/gen/rng.js` | Seeded random numbers |
| `src/art/placeholder.js` | Draws placeholder sprites from the palette |
| `src/scenes/StageScene.js` | Platformer: player, enemies, the feel knobs |
| `src/scenes/ShmupScene.js` | Shoot-'em-up: ship, enemies, the feel knobs |
| `src/scenes/ResultScene.js` | Between-stage and payout screens |
