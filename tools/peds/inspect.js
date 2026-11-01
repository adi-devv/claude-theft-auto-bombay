const H = require('../harness');
const path = require('path');
(async () => {
  const g = await H.launch({ width: 960, height: 540, out: path.join(__dirname, 'shots') });
  try {
    await g.wait(2);
    console.log('initial', JSON.stringify(await g.state()));
    await g.shot('01-player');
    for (const v of [
      ['02-promenade', -419, 170, -409, 4, 190, -424, 1.2, 169],
      ['03-seats', -419, 170, -414, 2.2, 164, -424, 1.1, 159],
      ['04-churchgate', -233, 55, -222, 5, 92, -239, 1, 50],
      ['05-fort', 82, -130, 72, 3, -70, 81, 1, -140],
      ['06-cricket', -165, 245, -154, 4, 263, -161, 1, 244],
    ]) {
      await g.eval(v => { const game = __game; game.paused = true; game.player.updateCamera = () => {}; game.debug.teleport(v[1], v[2]); game.debug.step(2); game.camera.position.set(v[3], v[4], v[5]); game.camera.lookAt(v[6], v[7], v[8]); if (v[0] === '06-cricket') { const bat = game.peds.filter(p => p.role === 'batsman' && p.activity === 'cricket').sort((a,b) => a.position.distanceTo(game.player.position)-b.position.distanceTo(game.player.position))[0]; if (bat) { const m=bat.match; game.debug.step((7.65-m.phase-game.time%14+14)%14); game.camera.position.set(m.x+10,2.8,m.z-1); game.camera.lookAt(m.x,1,m.z-8); } } game.pedSystem.frameUpdate(0); }, v);
      await g.wait(.2); await g.shot(v[0]);
      console.log(v[0], JSON.stringify(await g.eval(() => __game.debug.extra.peds())));
    }
    console.log('errors', await g.eval(() => __game.errors));
  } finally { await g.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

