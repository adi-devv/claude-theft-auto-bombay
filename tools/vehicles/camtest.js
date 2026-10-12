const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots' });
  await g.wait(0.8);
  await g.eval(() => { const G = __game; G.debug.teleport(-401, 250, Math.PI); const v = G.debug.spawnCar('sedan'); G.collision.addBox(v.position.x, v.position.z + 6.5, 6, 1, 0, { h: 20 }); 
    const m = new (G.scene.children.find((o) => o.isMesh).constructor)(new (G.scene.children.find((o) => o.isMesh).geometry.constructor)(), G.scene.children.find((o) => o.isMesh).material); });
  await g.wait(1.2);
  const r1 = await g.eval(() => { const G = __game, v = G.player.vehicle, c = G.camera; return { camBehind: +(c.position.z - v.position.z).toFixed(2), camY: +c.position.y.toFixed(2), wallFace: 5.5 }; });
  console.log('wall behind', JSON.stringify(r1));
  // modes
  const modes = await g.eval(() => { const out = []; return out; });
  for (let i = 0; i < 3; i++) { await g.tap('KeyC'); await g.wait(0.8); const m = await g.eval(() => { const G = __game, v = G.player.vehicle, c = G.camera; return { d: +Math.hypot(c.position.x - v.position.x, c.position.z - v.position.z).toFixed(2), y: +c.position.y.toFixed(2) }; }); console.log('after C', i, JSON.stringify(m)); }
  // teleport snap
  await g.eval(() => __game.debug.teleport(-380, 0, 0)); await g.wait(0.1);
  console.log('teleport', JSON.stringify(await g.eval(() => { const G = __game, v = G.player.vehicle, c = G.camera; return { d: +Math.hypot(c.position.x - v.position.x, c.position.z - v.position.z).toFixed(2) }; })));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
