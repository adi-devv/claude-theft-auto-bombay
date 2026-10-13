const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  await g.wait(0.5);
  await g.eval(() => __game.debug.teleport(318, 411.6, Math.PI));
  await g.wait(1.2);
  console.log('cam', await g.eval(() => [__game.camera.position.x.toFixed(2), __game.camera.position.z.toFixed(2), __game.camera.position.y.toFixed(2), __game.player.footCam.curDist.toFixed(2)]));
  await g.shot('t5-wall');
  await g.tap('KeyM'); await g.wait(0.3); await g.shot('t5-bigmap'); await g.tap('KeyM');
  console.log('errors', JSON.stringify((await g.state()).errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
