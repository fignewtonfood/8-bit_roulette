// The Act I machine sprite (Phaser 3 ES module), as delivered by the art team
// in machine-act1 v1.1. Its PNGs live in public/assets/machine-act1/.
// The reel pictures are decoration only: they never show or decide a result.
export function preloadMachine(scene, base = '/assets/machine-act1') {
  for (const [name, frames, size] of [
    ['cabinet',1,[32,40]], ['marquee',1,[32,40]], ['face',5,[32,40]],
    ['lever',3,[32,40]], ['lights',2,[32,40]], ['reel',6,[8,8]],
    ['machine',7,[32,40]],
  ]) scene.load.spritesheet(`m1-${name}`, `${base}/${name}.png`, {
    frameWidth:size[0], frameHeight:size[1], endFrame:frames-1,
  });
}

export function createMachine(scene, x = 112, y = 154) {
  const root = scene.add.container(x,y);
  const part = (name, dx=0, dy=0) => {
    const image = scene.add.image(dx,dy,`m1-${name}`,0).setOrigin(0);
    root.add(image); return image;
  };
  const cabinet=part('cabinet'), marquee=part('marquee');
  const face=part('face');
  const reels=[6,12,18].map((dx,i)=>part('reel',dx,23).setFrame(i));
  const lever=part('lever'), lights=part('lights');
  let spinEvent, stopEvents=[];
  function cancelSpin() {
    spinEvent?.remove(); spinEvent=null;
    stopEvents.forEach(e=>e.remove()); stopEvents=[];
  }
  return {
    root, cabinet, marquee, face, reels, lever, lights,
    // Theme/genre/twist are opaque game data. Pictures are decorative only.
    spin(outcome, onComplete=()=>{}) {
      const results=[0,1,2];
      cancelSpin(); face.setFrame(2); lever.setFrame(1); lights.setFrame(1);
      const locked=[false,false,false]; let phase=0;
      spinEvent=scene.time.addEvent({delay:80,loop:true,callback:()=>{
        phase^=1; reels.forEach((r,i)=>{if(!locked[i])r.setFrame(4+phase);});
      }});
      stopEvents.push(scene.time.delayedCall(80,()=>lever.setFrame(2)));
      stopEvents.push(scene.time.delayedCall(240,()=>lever.setFrame(0)));
      results.forEach((value,i)=>stopEvents.push(scene.time.delayedCall(640+i*160,()=>{
        locked[i]=true; reels[i].setFrame(value);
        if(i===2){cancelSpin();face.setFrame(0);lights.setFrame(0);onComplete(outcome);}
      })));
    },
    expression(index=0) { face.setFrame(index); },
    destroy() { cancelSpin();root.destroy(); },
  };
}


