const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  await g.wait(1);
  await g.eval(() => __game.player.damage(500, 'test')); await g.wait(1.8); await g.shot('v3-wasted');
  await g.wait(5.5);
  await g.eval(() => __game.player.bust()); await g.wait(1.3); await g.shot('v3-busted');
  await g.wait(6.5);
  await g.tap('KeyM'); await g.wait(0.4); await g.shot('v3-bigmap'); await g.tap('KeyM');
  await g.eval(() => __game.hud.showTitle()); await g.wait(2); await g.shot('v3-title');
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
