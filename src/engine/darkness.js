// The Darkness twist: a black layer over the whole screen with a soft hole of
// light around the player. Written once, used by every genre.
//
// Settings come from src/data/twists/darkness.json:
//   lightRadius  size of the light in pixels
//   darkness     how black the rest is (1 = pitch black)
//   beam         a headlight: how far (px) a cone of light reaches ahead of
//                the target, on top of the light around it (the racer)
// Anything a scene puts at GLOW_DEPTH is drawn above the dark and stays visible.

export const DARK_DEPTH = 8;
export const GLOW_DEPTH = 9; // HUD sits at 10

export function addDarkness(scene, { lightRadius = 56, darkness = 0.94, beam = 0 } = {}) {
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

  // Headlight: a soft cone, widest at its far end, pointing right.
  const B = Math.round(beam);
  const beamKey = `darkness-beam-${B}`;
  const BH = Math.round(B * 0.7);
  if (B && !scene.textures.exists(beamKey)) {
    const g = scene.add.graphics();
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const k = 1 - i / (steps + 1);
      g.fillStyle(0xffffff, 0.3).fillTriangle(0, BH / 2, B * k, BH / 2 - (BH / 2) * k, B * k, BH / 2 + (BH / 2) * k);
    }
    g.generateTexture(beamKey, B, BH);
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
    // beamY: where the headlight comes from (default: the target's middle).
    update(target, beamY = target?.y) {
      const cam = scene.cameras.main;
      layer.clear();
      layer.fill(0x000000, darkness);
      if (target?.visible !== false) {
        layer.erase(brush, target.x - cam.scrollX - R, target.y - cam.scrollY - R);
        if (B) layer.erase(beamKey, target.x - cam.scrollX + 2, beamY - cam.scrollY - BH / 2);
      }
    },
  };
}
