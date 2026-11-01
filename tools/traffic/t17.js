// drive the player's car through traffic; screenshots of density
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  await g.eval(() => { __game.debug.teleport(-404, 40, 0); __game.debug.step(20); __game.debug.spawnCar('sedan'); });
  await g.hold(['KeyW'], 14);
  console.log(JSON.stringify(await g.eval(() => ({ st: __game.debug.state().vehicle, tr: __game.debug.extra.traffic(), err: __game.errors.slice(0, 2) }))));
  console.log(await g.shot('drive_md'));
  await g.eval(() => { __game.debug.teleport(75, 20, 1.6); __game.debug.step(25); });
  console.log(await g.shot('fort_flora'));
  await g.eval(() => { __game.debug.teleport(-230, 150, 0); __game.debug.step(25); });
  console.log(await g.shot('fort_mk'));
  console.log(JSON.stringify(await g.eval(() => ({ tr: __game.debug.extra.traffic(), err: __game.errors.slice(0, 2) }))));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
