const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  await g.wait(1);
  await g.eval(() => __game.player.damage(500, 'test')); await g.wait(2.2);
  await g.eval(() => { __game.hud.bigText(null); }); await g.wait(0.6); await g.shot('v4-wasted');
  console.log(await g.eval(() => ({ cam: __game.camera.position.toArray().map(x=>+x.toFixed(2)), p: __game.player.position.toArray(), pitch: __game.player.footCam.pitch, d: __game.player.footCam.curDist })));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
