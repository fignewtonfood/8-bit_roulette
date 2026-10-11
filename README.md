# 8-Bit Roulette

Milestone 3 (the engine): a slot machine spins a theme, a base genre and a
twist, all loaded from data files, and starts the matching game.

## Run it

```
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173).

- The slot machine opens first: Space or Z pulls the lever, then plays
- Platformer: arrows move; Up, Space or Z jump. Shmup: arrows fly, hold Space or Z to fire
- `?seed=12345` replays a run exactly (same reels, same stage)
- `?genre=shmup`, `?theme=neon-space`, `?twist=darkness` force a reel; mix them freely
- Add `&spin` to see the machine with those reels locked; `?debug` shows hitboxes
- The browser console lists the reels and the chunks/waves used for every run

## Check everything

```
npm run check          # all three below
npm run check:chunks   # 5,000 platformer stages
npm run check:shmup    # 5,000 shmup stages
npm run check:engine   # data files + 10,000 spins
```

## Adding content (no code needed)

- **Theme:** copy `src/data/themes/neon-space.json`, change the id, colours and
  names, then add the id to the `themes` reel in `src/data/reels.json`.
- **Twist settings:** edit the numbers in `src/data/twists/*.json`.
- **Rarity:** give a reel entry a `"weight"` (0.5 = half as often).
- **Bad combos:** add a rule to `src/data/compatibility.json`.

A brand-new *kind* of twist (not just new numbers) needs a few lines in each
genre scene, like Low Gravity and Darkness have. A new genre needs a scene.

## Where things live

| File | What it does |
|---|---|
| `src/data/reels.json` | What can land on each reel |
| `src/data/themes/`, `src/data/twists/` | One JSON file per theme / twist |
| `src/data/genres.json` | Genre names and which scene plays them |
| `src/data/compatibility.json` | Combos the machine must never land on |
| `src/engine/spin.js` | Seed → theme, genre, twist (with re-rolls) |
| `src/engine/content.js` | Loads and checks the data files |
| `src/engine/darkness.js` | The Darkness effect, shared by both genres |
| `src/scenes/SpinScene.js` | The slot machine screen |
| `src/gen/chunks.js` | Hand-drawn level chunks (add new ones here) |
| `src/gen/waves.js` | Hand-drawn shmup waves |
| `src/gen/buildStage.js` | Seed → stage: pacing, difficulty budget, mirroring |
| `src/gen/rng.js` | Seeded random numbers |
| `src/art/placeholder.js` | Draws placeholder sprites from the palette |
| `src/scenes/StageScene.js` | Platformer: player, enemies, the feel knobs |
| `src/scenes/ShmupScene.js` | Shoot-'em-up: ship, enemies, the feel knobs |
| `src/scenes/ResultScene.js` | Clear / game-over screen |
