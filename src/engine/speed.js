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
