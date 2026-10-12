# 8-Bit Roulette

Walk around the hub, bet on a game length, pull the slot machine, clear the stages, get paid in tokens, and spend them in
the shop. As you keep playing, story logs turn up at the terminal, the hub
changes, and every so often the machine glitches. Progress is saved in the
browser. Three genres so far: platformer, shoot-'em-up and brawler.

## Run it

```
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173).

- **Hub:** arrows walk, Space jumps, Up uses whatever you're standing at
  (the shop, the slot machine, the terminal, and later the wall and the
  other player)
- **Terminal:** Left/Right flips through the logs you've found, your
  records, and your progress (levels reached and upgrades owned, never
  what's left); Up finishes a log that's still typing, then closes
- **Machine:** Left/Right picks the bet, Space pulls. After it lands,
  Left/Right picks the twist's level if you've reached one. Whatever lands, you play;
  S re-spins only if you own Re-spin (once per trip to the hub). X goes back
- **Every genre:** Up or Space jumps, Z or X attacks
- **Platformer:** arrows move, Up or Space jumps. **Shmup:** arrows fly, hold Z or X to fire (Space fires too, since there's no jump)
- **Brawler:** arrows move, Up or Space jumps, Z or X attacks. Three ground
  hits make a combo (the third launches); attacking in the air is a kick, and
  hitting an enemy that's in the air pops it back up. Each life has 3 hearts.
  Walking into an arena with enemies locks the screen until they're all down
- The browser console lists the reels and the chunks/waves used for every stage

### Testing shortcuts (add to the URL)

Practice runs pay no tokens and don't touch your save:

- `?seed=12345` replays a run exactly (same reels, same stages)
- `?genre=shmup` (or `brawler`), `?theme=neon-space`, `?twist=darkness` force a reel; mix them freely
- `?length=medium` plays more stages (`short`, `medium`, `long`)
- `?spin` opens a practice machine: every length open, free re-spins, forced reels stay locked
- `?debug` shows hitboxes
- `?zoom=3` forces the size: each game pixel becomes 3x3 screen pixels (normally it picks the biggest whole number that fits the window)

Save tools:

- `?unlock` opens every length in the real game (until you close the tab)
- `?tokens=500` adds 500 tokens to your save (take it off the URL afterwards, or every refresh adds more)
- `?reset` wipes your save
- `?story=3` unlocks the first 3 story beats (it raises your lifetime stats to
  what they need, so it sticks; combine with `?reset` to start over)
- `?glitch` makes your next spin a glitch (this visit only)
- `?plays=50` sets every theme, genre and twist to 50 plays, to see levels on
  the terminal's progress page (`?plays=0` clears them; take it off the URL
  afterwards)
- `?theme=corrupted` plays the glitch theme as a practice run

## Check everything

```
npm run check          # all six below
npm run check:chunks   # 10,000 platformer stages (every twist)
npm run check:shmup    # 10,000 shmup stages (every twist)
npm run check:brawl    # 10,000 brawler stages (every twist) + arena layout rules
npm run check:engine   # data files + 10,000 spins
npm run check:loop     # bets, payouts, shop, save file + a progression estimate
npm run check:story    # story unlocks, glitches, hub changes + which run each log arrives on
```

## Adding content (no code needed)

- **Theme:** copy `src/data/themes/neon-space.json`, change the id, colours and
  names, then add the id to the `themes` reel in `src/data/reels.json`.
- **Twist settings:** edit the numbers in `src/data/twists/*.json`. A twist can
  also set `lives` (every game starts with exactly that many) and `payout`
  (multiplies the stage tokens of a won run), like Sudden Death.
- **Objective twists:** `"objective": "collect"` (Collector) or `"kill"`
  (Killer) changes how a stage is won. In the platformer and brawler the flag
  stays faded and locked until every coin / enemy is done; in the shmup a coin
  or enemy that leaves the screen costs a life. Killer isn't on the brawler,
  where beating every enemy is already the rule.
  `"minimum"` (5 for both) guarantees every stage has at least that many
  coins / enemies: unused optional enemies fill in first, then extras go on
  safe floor. Normal stages are never changed by this.
- **On-screen text:** one line fits 42 characters. `npm run check:engine` flags
  twist descriptions, shop descriptions and names that won't fit.
- **Brawler arenas:** draw them in `src/gen/arenas.js` like chunks, but one
  screen wide (16 tiles). Enemy letters: G grunt, R rusher, T thrower,
  B brute (lowercase = optional). `{ reinforce: `...` }` adds a second wave
  that arrives when one enemy from the first is left. `npm run check:brawl`
  flags enemies with nothing to stand on and arenas with no safe respawn spot.
- **Twist-only chunks, waves and arenas:** add `{ twists: ['slippery'] }` after a
  chunk's, wave's or arena's art (in `src/gen/chunks.js` / `waves.js` / `arenas.js`) and it only
  shows up when that twist lands, twice as often as a normal one.
  `{ notTwists: ['darkness'] }` is the opposite: it shows up with every twist
  except those, at its normal rate. A piece can have one or the other.
  `npm run check:chunks` and `check:shmup` build stages for every twist and
  flag a typo'd twist id.
- **Rarity:** give a reel entry a `"weight"` (0.5 = half as often).
- **Bad combos:** add a rule to `src/data/compatibility.json`.
- **Levels:** every finished run (win or lose, not practice) counts as one
  play of its theme, its genre and its twist. `levels` in `economy.json`
  (`[10, 50]`) is how many plays reach level 2 and 3. Level-ups are
  announced on the result screen.
- **Twist levels:** what lands isn't a choice, but the level you play it at
  is. Once the landed twist has reached level 2 or 3, Left/Right at the
  machine picks the level (practice offers every level). A twist file's
  `levels` list holds level 2 and 3: each can change any genre setting plus
  `description`, `payout`, `budgetScale` and (Collector/Killer) `minimum`.
  Classic has none. `budgetScale` multiplies each stage's difficulty budget:
  Sudden Death is 0.85 at level 1, 1.15 at level 2 and 1.4 at level 3.
  Theme and genre levels are tracked but don't change play yet.
- **Speed twists:** Speedy (`runScale`/`shipScale` and `enemyScale` above 1)
  and Mud (`runScale`/`shipScale` below 1, enemies unchanged). They change
  ground speed only: in the air you move at normal speed and jumps are
  untouched, so jumps keep their height and length (`src/engine/speed.js`).
  `npm run check:shmup` measures what every slowed shmup stage asks of the
  ship (dodging aimed shots, crossing between gaps in bat walls) and fails
  if it's more than 60% of the ship's speed.
- **Windy** (platformer, brawler): `wind` makes you that much faster with the
  wind and slower against it, on the ground and in the air (so jumps go
  further or shorter; never higher or lower). It swaps every `windEvery`
  seconds; the HUD shows the direction and blinks before a swap.
- **Gravity** (shmup): `pull` drags the ship toward the on-screen arrow at
  the same strength every level, always weaker than the ship.
  `shiftEvery` is how often it changes direction (0 = never, level 1).
- **Stage difficulty:** each stage has a difficulty budget (in the
  generators: `STAGE_BUDGETS`, `SHMUP_BUDGETS`, `BRAWL_BUDGETS`). Later
  stages get more pieces (`src/gen/pacing.js`: stage 5 has four more than
  stage 1), and any budget the pieces can't use becomes extra enemies at 2
  points each, so every stage spends close to its whole budget.
  Pieces are difficulty 0–4 (4 is the top tier; it only fits the "hard"
  slots, so it's rare on stage 1 and common by stage 5).
- **Payouts, lives, lengths:** `src/data/economy.json`. A length with
  `requires` stays locked until the player owns that upgrade level.
- **Shop prices and upgrades:** `src/data/shop.json`. One price per level;
  `perLevel` can add `lives`, `respins` or `consolation`.

Run `npm run check:loop` after changing prices: it estimates how many runs a
player needs before each purchase.

A brand-new *kind* of twist (not just new numbers) needs a few lines in each
genre scene, like Low Gravity and Darkness have. A new genre needs a scene.

## Writing the story (no code needed)

Everything is in `src/data/story.json`:

- **Beats** unlock in order. Each has an `unlock` rule (lifetime `runs`,
  `wins`, `tokensEarned`, `glitches`, or `upgrade` to sell it in the shop)
  and a `log` of up to 9 lines, 31 characters each.
- **Hub changes:** a beat's `hub` adds `scratches` (marks on the wall; their
  text is `wall`), `stranger` (another player; their lines are `says`) or
  `watching` (the machine's lights turn red). A later beat's `says` replaces
  the earlier lines.
- **Glitches:** `first` is when the first glitch is forced; after that each
  spin has `chance` of glitching. The glitch theme is an ordinary theme file
  that isn't on the reels (`themes/corrupted.json`).

`npm run check:story` flags lines that won't fit and estimates which run each
log arrives on.

## Where things live

| File | What it does |
|---|---|
| `src/data/reels.json` | What can land on each reel |
| `src/data/themes/`, `src/data/twists/` | One JSON file per theme / twist |
| `src/data/genres.json` | Genre names and which scene plays them |
| `src/data/compatibility.json` | Combos the machine must never land on |
| `src/data/economy.json` | Lengths, multipliers, tokens per stage and coin, base lives |
| `src/data/shop.json` | Upgrades, prices and what each level adds |
| `src/data/story.json` | Story beats, logs, hub changes and glitch timing |
| `src/engine/story.js` | Which logs are unlocked/unread, hub state, when to glitch |
| `src/ui/glitch.js` | The jolt-and-flicker look of a glitch run |
| `src/engine/spin.js` | Seed → theme, genre, twist (with re-rolls) |
| `src/engine/content.js` | Loads and checks the data files |
| `src/engine/darkness.js` | The Darkness effect, shared by every genre |
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
| `src/gen/arenas.js` | Hand-drawn brawler arenas (one screen each) |
| `src/gen/buildBrawl.js` | Seed → brawler stage: arenas, budget, reinforcements |
| `src/gen/buildStage.js` | Seed → stage: pacing, difficulty budget, mirroring |
| `src/gen/rng.js` | Seeded random numbers |
| `src/art/placeholder.js` | Draws placeholder sprites from the palette |
| `src/scenes/StageScene.js` | Platformer: player, enemies, the feel knobs |
| `src/scenes/ShmupScene.js` | Shoot-'em-up: ship, enemies, the feel knobs |
| `src/scenes/BrawlScene.js` | Brawler: combo, enemy behaviour, arena locks, the feel knobs |
| `src/scenes/ResultScene.js` | Between-stage and payout screens |
