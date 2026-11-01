const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  await g.wait(1);
  await g.eval(() => { const v = __game.vehicles[0]; const r = v.right; __game.debug.teleport(v.position.x + r.x * 3.5, v.position.z + r.z * 3.5, 0); });
  await g.wait(1.2); await g.shot('v2-prompt');
  await g.tap('KeyF'); await g.wait(0.45); await g.shot('v2-entering');
  await g.wait(1.0); await g.shot('v2-incar');
  await g.eval(() => { __game.debug.teleport(120, 180, 0.5); __game.hud.help('test <span class="cta-key">F</span> hint', 3); });
  await g.hold(['KeyW'], 1.2); await g.wait(0.5); await g.shot('v2-area');
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
