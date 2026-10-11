# 8-Bit Roulette — vertical slice

Milestone 1: one platformer stage, one theme (Haunted Castle), placeholder art.

## Run it

```
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173).

- Arrows move; Up, Space or Z jump (tap for a short hop, hold for a full jump)
- Stomp bats from above; spikes, pits and bat sides cost a life
- `?seed=12345` replays an exact stage, `?debug` shows hitboxes
- The browser console lists the chunks used for every stage

## Check the generator

```
npm run check
```

Builds 5,000 stages and reports budget overruns, missing exits, repeats and
chunk usage, then prints one stage as text.

## Where things live

| File | What it does |
|---|---|
| `src/gen/chunks.js` | Hand-drawn level chunks (add new ones here) |
| `src/gen/buildStage.js` | Seed → stage: pacing, difficulty budget, mirroring |
| `src/gen/rng.js` | Seeded random numbers |
| `src/data/themes/haunted-castle.json` | Palette and names for the theme |
| `src/art/placeholder.js` | Draws placeholder sprites from the palette |
| `src/scenes/StageScene.js` | Player, enemies, collisions, the feel knobs |
| `src/scenes/ResultScene.js` | Clear / game-over screen |
