const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 1280, height: 720 });
  await g.wait(1);
  await g.eval(() => { __game.debug.spawnCar('police'); __game.debug.setWanted(2); });
  await g.hold(['KeyW'], 2.5);
  await g.shot('v6-1280');
  await g.tap('KeyM'); await g.wait(0.4); await g.shot('v6-1280-map'); await g.tap('KeyM');
  console.log('errors', JSON.stringify((await g.state()).errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
