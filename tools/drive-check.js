const H = require('./harness');
(async () => {
  const g = await H.launch({ out: process.argv[2] || '/tmp/ctab-smoke', width: 960, height: 540 });
  await g.eval(() => { __game.debug.teleport(-401, 250, Math.PI); __game.debug.spawnCar('sedan'); });
  await g.wait(0.5);
  const acc = await g.record(['KeyW'], 6, 1, (s) => s.vehicle && s.vehicle.kmh);
  const turn = await g.record(['KeyW', 'KeyA'], 1.5, 0.5, (s) => s.vehicle && s.vehicle.heading);
  await g.shot('drive');
  console.log('kmh/s:', acc.join(' '), '| heading while steering left:', turn.join(' '));
  console.log(JSON.stringify((await g.state()).errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
