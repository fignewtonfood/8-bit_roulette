// Speed twists (Speedy, Mud): how fast things move on the ground.
// No Phaser here, so it's tested with plain Node (npm run check:loop).
//
// Settings, per genre, in the twist files:
//   runScale    player speed on the ground (platformer, brawler)
//   shipScale   ship speed (shmup)
//   enemyScale  enemy speed (every genre)
//
// Jumps never change: in the air you move at the normal speed, and jump
// strength isn't touched, so every jump is exactly as high and as long as
// usual and every chunk and arena stays clearable.

export function runSpeed(base, mods, grounded) {
  return grounded ? base * (mods.runScale ?? 1) : base;
}

export const enemyScale = (mods) => mods.enemyScale ?? 1;

// Twist Windy (platformer, brawler): the wind blows one way and swaps every
// "windEvery" seconds. Moving with it is "wind" faster (0.3 = 30%), against it
// that much slower, on the ground AND in the air, so jumps go further with
// the wind and shorter against it. Jump height never changes (only sideways
// speed is touched). Standing still, you don't drift.
// windDir: -1 blowing left, 1 blowing right. moveDir: the way you're moving.
export function windScale(mods, windDir, moveDir) {
  if (!mods.wind || !moveDir) return 1;
  return moveDir === windDir ? 1 + mods.wind : 1 - mods.wind;
}

// Twist Gravity (shmup): the ship is pulled "pull" px/s one way. It must
// always be able to fly against it, so pull stays below the ship's speed
// (checked when the game loads).
export const GRAVITY_DIRS = { down: [0, 1], left: [-1, 0], up: [0, -1], right: [1, 0] };
