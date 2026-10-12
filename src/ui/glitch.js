// The look of a glitch run (story.json): every few seconds the picture
// jolts and flickers. Kept small and short so it never hides a hazard.
// Used by every genre scene; does nothing on a normal run.

import { content } from '../data/index.js';

export function addGlitchFx(scene, run) {
  const glitchTheme = content.story.glitch?.theme;
  if (!run.glitch && run.theme !== glitchTheme) return;
  const cam = scene.cameras.main;
  const next = () => {
    scene.time.delayedCall(1500 + Math.random() * 2500, () => {
      cam.shake(70, 0.006);
      if (Math.random() < 0.5) cam.flash(60, 90, 255, 220, true);
      next();
    });
  };
  next();
}
