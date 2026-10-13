const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots' });
  await g.wait(1);
  console.log(JSON.stringify((await g.state()).errors));
  await g.eval(() => { __game.debug.teleport(-401, 250, Math.PI); __game.debug.spawnCar('sedan'); });
  await g.wait(0.5);
  await g.shot('first-sedan');
  await g.hold(['KeyW'], 3);
  console.log(JSON.stringify(await g.state()));
  await g.shot('first-drive');
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
