const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  await g.wait(1.5);
  const s0 = await g.state(); console.log('start', JSON.stringify(s0.player), JSON.stringify(s0.player_ ?? s0.extra ?? s0['player']));
  console.log(JSON.stringify((await g.eval(() => __game.debug.extra.pl()))));
  // walk forward (away from camera)
  const cam0 = await g.eval(() => __game.player.footCam.yaw);
  await g.hold(['KeyW'], 1.5);
  let s = await g.state(); console.log('after W', s.player.x, s.player.z, 'camYaw', cam0, 'heading', s.player.heading);
  await g.hold(['KeyQ'], 0.7);
  const cam1 = await g.eval(() => __game.player.footCam.yaw);
  const p0 = await g.eval(() => [__game.player.position.x, __game.player.position.z]);
  await g.hold(['KeyW'], 1.0);
  const p1 = await g.eval(() => [__game.player.position.x, __game.player.position.z]);
  const dir = Math.atan2(p1[0]-p0[0], p1[1]-p0[1]);
  console.log('camYaw after Q', cam1, 'move dir', dir);
  await g.hold(['KeyW','ShiftLeft'], 1.0);
  console.log(JSON.stringify(await g.eval(() => __game.debug.extra.pl())));
  await g.shot('t1-walk');
  console.log('errors', JSON.stringify((await g.state()).errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
