# 8-Bit Roulette

Walk around the hub, bet on a game length, pull the slot machine, clear the stages, get paid in tokens, and spend them in
the shop. As you keep playing, story logs turn up at the terminal, the hub
changes, and every so often the machine glitches. Progress is saved in the
browser. Four genres so far: platformer, shoot-'em-up, brawler and racing.

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
  Left/Right picks the genre's or twist's level if you've reached one (Up/Down
  switches between them when both can level). Whatever lands, you play;
  S re-spins only if you own Re-spin (once per trip to the hub). X goes back
- **Every genre:** Up or Space jumps, Z or X attacks
- **Platformer:** arrows move, Up or Space jumps. **Shmup:** arrows fly, hold Z or X to fire (Space fires too, since there's no jump)
- **Brawler:** arrows move, Up or Space jumps, Z or X attacks. Three ground
  hits make a combo (the third launches); attacking in the air is a kick, and
  hitting an enemy that's in the air pops it back up. Each life has 3 hearts.
  Walking into an arena with enemies locks the screen until they're all down
- **Racing:** Right is gas, Left brakes, Up or Space jumps, Z or X kicks
  (both sides at once). Riding off the top of a ramp launches you; jumping on
  a ramp or right at its lip launches you higher. In the air, Down leans
  forward and Left leans back (Right is only gas, so you can hold it). The
  bike keeps the angle it left the ground at: straight off a ramp it's nose
  up 45 degrees, so you have to lean forward to land on flat ground. Land
  within 12 degrees of the ground's angle for a clean landing (a little
  speed), within 30 for a rough one (half your speed, and a wobble), more
  is a crash. Crashes (bad landings, spikes, pits, theme hazards, a rammer,
  the champion's kick, ram or cones) cost a life and put you back on safe
  ground a little way behind, already moving at 80% of top speed (so the
  next jump never needs a run-up). A rival's kick only knocks your speed down. Mud (~)
  halves your top speed, boost pads (=) shoot you forward. Beat the clock to
  the chequered flag: if it runs out you lose a life and get 20 more seconds
- The browser console lists the reels and the chunks/waves used for every stage

### Testing shortcuts (add to the URL)

Practice runs pay no tokens and don't touch your save:

- `?seed=12345` replays a run exactly (same reels, same stages)
- `?genre=shmup` (or `brawler`, `racer`), `?theme=neon-space`, `?twist=darkness` force a reel; mix them freely
- `?length=medium` plays more stages (`short`, `medium`, `long`)
- `?genrelevel=3` plays the genre at level 2 or 3, e.g. `?genre=brawler&genrelevel=3`
  for the boss (also `?twistlevel=2` and `?themelevel=3`)
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
npm run check          # all eight below
npm run check:chunks   # 10,000 platformer stages (every twist)
npm run check:shmup    # 10,000 shmup stages (every twist)
npm run check:brawl    # 10,000 brawler stages (every twist) + arena layout rules
npm run check:race     # 22,000 race stages + a test rider through every piece and stage
npm run check:engine   # data files + 10,000 spins
npm run check:loop     # bets, payouts, shop, save file + a progression estimate
npm run check:story    # story unlocks, glitches, hub changes + which run each log arrives on
npm run check:levels   # every genre and theme at levels 1-3: new pieces, power-ups, bosses, hazards, payouts
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
- **Race tracks:** draw pieces in `src/gen/tracks.js`, 20 tiles wide. Ground
  is one solid shape (`#`), with `/` and `\` for ramps (45 degrees, one tile
  per column). `^` spikes, `~` mud, `=` boost pad, `C` coin, `R` rival (`r`
  optional), `M` rammer (level 2 pieces only). The first and last 4 columns
  stay flat on row 12 so pieces always join, and a jump at the end of one
  piece never lands in a pit at the start of the next. Types: `rest` (no
  rivals, nothing to jump), `jump`, `race` (needs a rival). The file's notes
  say how far a hop and a ramp throw you. `npm run check:race` rides a test
  bot through every piece with every twist at every level (worst wind and
  gravity) and names any piece it can't clear, with the twist and level, so
  you know what to change (or which twist to keep away with `notTwists`). It
  also checks every coin can be collected at some speed and hop (under
  Collector a missed coin costs a life), then builds and rides whole stages.
- **Twist-only chunks, waves and arenas:** add `{ twists: ['slippery'] }` after a
  chunk's, wave's, arena's or track piece's art (in `src/gen/chunks.js` / `waves.js` / `arenas.js` / `tracks.js`) and it only
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
- **Theme levels:** picked at the machine like the others (Up/Down
  switches between theme, genre and twist when more than one can level),
  from `levels` in each theme file. Level 2 brings the theme's hazard, a
  perk on the genre's power-up and a themed boss, and pays x1.25. Level 3
  plays as the theme's variant (Haunted Crypt, Neon Nebula, Gold Rush, Ice
  Age, Candy Clouds: own palette and names), brings the hazard more often,
  makes the perk stronger, renames the power-up and boss again, and pays
  x1.5. The genre still decides whether a stage has a power-up (genre
  level 2) or a boss (genre level 3); the theme decides what they're called,
  what colour they are and what extra they do. The glitch theme has no
  levels.
  - Hazards (`src/ui/hazards.js`, timing in `src/engine/hazardTiming.js`):
    one kind per theme, in every genre, never beatable, always lit in the
    dark. `float` (ghosts drift at you through walls), `zap` (a warning
    line, then a beam), `roll` (rolls in from the side you're facing),
    `fall` (a warning mark, then it drops; platforms stop it), `bounce`
    (bounces toward you). `every` is the average seconds between them;
    they come a bit quicker each stage, never in the first 4 seconds,
    never more than 3 at once, and a themed boss calls them in about twice
    as often (it flashes when it does). A lost life clears them.
  - Perks (`src/ui/perks.js`): `slow` (enemies slower), `magnet` (coins fly
    to you), `speed` (faster on the ground / ship), `shield` (the next hits
    cost nothing; not pits), `life` (extra lives on pickup). All but
    `life` end when the power-up does.
- **Genre levels:** picked at the machine like twist levels, from
  `levels` in `genres.json`. Each level keeps what the one below gave.
  Level 2 brings the genre's new enemy (platformer hoppers, shmup splitters,
  brawler shield guards, racing rammers), its power-up (double jump, spread shot, power
  fists, nitro; spread shot is 3 streams at twice the normal bullets per
  second; nitro is a higher top speed, boost pads that last twice as long and
  kicks that hit the champion twice as hard) and pays x1.25. One enemy in the first half of each stage carries
  the power-up (a sparkle bobs over it) and drops it when beaten. It always
  appears on the nearest safe floor, even if the carrier went down mid-air,
  on spikes or in a pit (`src/engine/powerDrop.js`). From stage 4 it starts
  running when you get close: first away from the nearest pit, then it
  keeps going, turns around at walls, spikes and enemies, and can fall into
  a pit (lost for that stage). Taking damage keeps it, losing a life loses
  it, and your sprite shows it while you have it. Speeds and the range are
  in `src/ui/levelHud.js` and at the top of each scene. Level 3
  adds a boss at the end of the run's last stage and pays x1.5. A Long
  run also gets the same boss at the end of stage 3 (`MIDWAY_BOSS_STAGE` in
  `run.js`); its stage 5 boss is the tougher one. The new
  enemies only come from pieces tagged `{ minLevel: 2 }` (the letters H, P
  and S are only allowed in those), plus some of the extra enemies later
  stages add. Boss rooms are `BOSS_ROOMS` in `chunks.js` and `BOSS_ARENAS`
  in `arenas.js`; the bosses' feel knobs are at the top of each scene.
  `npm run check:levels` builds every genre at every level and checks it.
- **Racing levels:** rammers (`M`) wait until you pass, rev up (they glow),
  then charge from behind faster than you can ride: jump over them or kick
  them. The nitro is carried by a rival (a sparkle bobs over it) and drops on
  the track ahead when you kick it off; from stage 4 it runs off along the
  track and can fall in a pit. Level 3's boss is the champion, raced on a
  boss loop: 3 or 4 track pieces (5 on stage 5) before the exit, starting
  with one of `BOSS_TRACKS` in `tracks.js` and then jump and rest pieces of
  difficulty 2 or less. Riding in locks the loop: ride off its end and
  you're back at its start, lap after lap, until the champion is knocked
  off. Its pattern (`BOSS` at the top of `RaceScene.js`): it pulls up beside
  you, glows and kicks (a crash: jump or brake away), surges ahead and drops
  a strip of cones behind it (a crash: hop the strip). Stage 5's also drops
  back behind you, glows and rams (a crash unless you jump it; a blinking
  "!" shows at the left edge if it's off screen) after every second kick.
  It can only be hurt while it glows: kick it then (6 hits, 8 on stage 5;
  nitro hits count double); other kicks clank off. It never leaves the race
  (a fall puts it back round the loop). The clock keeps running, with 30 s
  plus 10 s a loop piece added when the loop locks. Riders still out there
  leave the track when the loop locks.
- **Racing rivals and the clock:** rivals start riding when you get close,
  never faster than 85% of your top speed (so you always catch them, even
  in Mud), jump what's in their way like you would, and kick when they're
  side by side (they glow first). Slow ones sometimes wipe out on their own.
  The clock (`timeLimit` in `raceRide.js`) is the track's length at 60% of
  top speed plus 12 s, longer in Mud. The feel knobs are `RIDE` at the top
  of `src/engine/raceRide.js` and the top of `RaceScene.js`.
- **Shmup difficulty by stage:** every stage is harder than the one before,
  and stage 5 is about twice stage 1. Later stages bring more waves (the
  budget), squeeze them closer together (`SHMUP_TEMPO` in `buildShmup.js`)
  and make enemies fly and shoot faster (`SHMUP_PACE`). `npm run check:shmup`
  prints the curve and fails if a stage stops getting harder.
- **Shmup, stage 4+ power-ups:** shot down, the power-up shoots off away
  from you and bounces off the screen's edges 3 times, then leaves
  (`POWER_RUN`: 70 px/s on stage 4, 100 on stage 5).
- **Shmup bosses on stages 3 and 5:** double health (80 on stage 3, 120 on
  stage 5; `BOSS_BOOST`). The stage 5 boss also moves and shoots 25% faster
  and has a third attack: a spiral stream of shots every third volley
  (`BOSS_HP_STAGE5`, `SPIRAL_*`). A Short run's stage 1 boss has 40.
- **Brawler, stages 4 and 5 (Long runs):** some grunts, rushers and throwers
  become jumpers (2 on stage 4, 3 on stage 5; `JUMPERS` in `buildBrawl.js`).
  A jumper crouches when you get close, then hops at you, but only to a spot
  it can land on. The stage 5 boss has 1.5x health (`BOSS_STAGE5_HP`).
  No brawler enemy ever walks, charges or backs into a pit or onto spikes,
  even on ice; knocking them in still works.
- **Speed twists:** Speedy (`runScale`/`shipScale` and `enemyScale` above 1)
  and Mud (`runScale`/`shipScale` below 1, enemies unchanged). They change
  ground speed only: in the air you move at normal speed and jumps are
  untouched, so jumps keep their height and length (`src/engine/speed.js`).
  `npm run check:shmup` measures what every slowed shmup stage asks of the
  ship (dodging aimed shots, crossing between gaps in bat walls) and fails
  if it's more than 60% of the ship's speed.
- **Windy** (platformer, brawler, racer): `wind` makes you that much faster with the
  wind and slower against it, on the ground and in the air (so jumps go
  further or shorter; never higher or lower). Racing always rides right,
  so the wind is behind you or in your face; rivals feel it too. It swaps every `windEvery`
  seconds; the HUD shows the direction and blinks before a swap.
- **Gravity** (shmup, racer): `pull` drags the ship toward the on-screen arrow at
  the same strength every level, always weaker than the ship.
  `shiftEvery` is how often it changes direction (0 = never, level 1).
  Racing: `pull` is a share of gravity and the arrow only points down
  (heavier: lower, shorter jumps; always down at level 1) or up (floatier).
- **Racing and the other twists:** Low Gravity makes hops and ramp launches
  higher, longer and floatier; Slippery's `grip` slows how fast you speed
  up and brake; Speedy and Mud's `runScale` is your ground speed only (in the
  air you keep normal speed, so jumps don't change); Darkness adds a
  headlight (`beam`) ahead of the light around you; Collector: a coin you
  ride past costs a life; Killer: a rival that falls off the back of the
  screen, or crosses the finish before you, costs a life.
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
| `src/data/genres.json` | Genre names, which scene plays them, and their levels |
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
| `src/gen/tracks.js` | Hand-drawn race track pieces and boss loops (add new ones here) |
| `src/gen/buildRace.js` | Seed → race stage: pieces, budget, rivals, safe respawn spots |
| `src/engine/raceRide.js` | The bike: speed, ramps, jumps, landings; the rivals' riding; the clock |
| `src/gen/buildStage.js` | Seed → stage: pacing, difficulty budget, mirroring |
| `src/gen/rng.js` | Seeded random numbers |
| `src/art/placeholder.js` | Draws placeholder sprites from the palette |
| `src/art/levelPlaceholder.js` | Sprites for genre levels: new enemies, power-ups, bosses |
| `src/ui/levelHud.js` | The boss health bar and power-up label |
| `src/ui/hazards.js` | Theme hazards in every genre (theme level 2+) |
| `src/ui/perks.js` | Themed power-up names, perks and boss looks |
| `src/engine/hazardTiming.js` | When theme hazards come |
| `src/scenes/StageScene.js` | Platformer: player, enemies, the feel knobs |
| `src/scenes/ShmupScene.js` | Shoot-'em-up: ship, enemies, the feel knobs |
| `src/scenes/BrawlScene.js` | Brawler: combo, enemy behaviour, arena locks, the feel knobs |
| `src/scenes/RaceScene.js` | Racing: rivals, kicks, the clock, the boss loop, the feel knobs |
| `src/art/racePlaceholder.js` | Racing sprites: track tiles, bikes, mud, boost pads, the finish flag |
| `src/scenes/ResultScene.js` | Between-stage and payout screens |
