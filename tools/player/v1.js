// visual pass 1: title, on-foot HUD, in-car HUD, big map, pause
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540, query: 'title=1' });
  await g.wait(3);
  await g.eval(() => __game.hud.showTitle()); await g.wait(3);
  console.log('started', await g.eval(() => [__game.started, __game.hud.titleVisible]));
  await g.shot('v1-title');
  await g.tap('Enter'); await g.wait(2.5);
  await g.shot('v1-foot');
  await g.eval(() => { const p = __game.player; p.update; __game.debug.spawnCar('sedan'); });
  await g.wait(0.5);
  await g.hold(['KeyW'], 3.5);
  await g.shot('v1-car');
  await g.eval(() => __game.debug.setWanted?.(3));
  await g.wait(1.2);
  await g.shot('v1-wanted');
  await g.tap('KeyM'); await g.wait(0.4); await g.shot('v1-bigmap'); await g.tap('KeyM'); await g.wait(0.2);
  await g.tap('KeyP'); await g.wait(0.4); await g.shot('v1-pause'); await g.tap('KeyP');
  console.log('errors', JSON.stringify((await g.state()).errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
