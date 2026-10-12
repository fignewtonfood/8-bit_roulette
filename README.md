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
- **Terminal:** Left/Right flips through the logs you've found and your
  records; Up finishes a log that's still typing, then closes
- **Machine:** Left/Right picks the bet, Space pulls. Whatever lands, you play;
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
