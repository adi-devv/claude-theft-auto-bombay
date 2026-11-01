// hits near a given node
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  const id = process.env.NODE || 'FLORA';
  const r = await g.eval((id) => {
    const N = __game.roads.nodes.get(id); const T = __game.debug.traffic.T; T.debugHits = true;
    __game.debug.teleport(N.x + 60, N.z, 0); __game.debug.step(5);
    T.hitInfo = [];
    __game.debug.step(150);
    return T.hitInfo.slice(0, 14);
  }, id);
  for (const h of r) console.log(h.t, h.x, h.z, '\n   A', h.A, '\n   B', h.B);
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
