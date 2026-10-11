// The Darkness twist: a black layer over the whole screen with a soft hole of
// light around the player. Written once, used by every genre.
//
// Settings come from src/data/twists/darkness.json:
//   lightRadius  size of the light in pixels
//   darkness     how black the rest is (1 = pitch black)
// Anything a scene puts at GLOW_DEPTH is drawn above the dark and stays visible.

export const DARK_DEPTH = 8;
export const GLOW_DEPTH = 9; // HUD sits at 10

export function addDarkness(scene, { lightRadius = 56, darkness = 0.94 } = {}) {
  const R = Math.round(lightRadius);
  const brush = `darkness-brush-${R}`;

  // Soft-edged light: stacked circles, more see-through toward the edge.
  if (!scene.textures.exists(brush)) {
    const g = scene.add.graphics();
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      g.fillStyle(0xffffff, 0.35).fillCircle(R, R, R * (1 - i / (steps + 2)));
    }
    g.generateTexture(brush, R * 2, R * 2);
    g.destroy();
  }

  const { width, height } = scene.scale;
  const layer = scene.add
    .renderTexture(0, 0, width, height)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(DARK_DEPTH);

  return {
    // Call every frame with whatever should carry the light (usually the player).
    update(target) {
      const cam = scene.cameras.main;
      layer.clear();
      layer.fill(0x000000, darkness);
      if (target?.visible !== false) {
        layer.erase(brush, target.x - cam.scrollX - R, target.y - cam.scrollY - R);
      }
    },
  };
}
