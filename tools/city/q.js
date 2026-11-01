const H = require('../harness');
(async () => {
  const g = await H.launch({ width: 320, height: 180 });
  const [x0, z0, r] = process.argv.slice(2).map(Number);
  const out = await g.eval(([x, z, r]) => window.__game.collision.queryAABB(x - r, x + r, z - r, z + r).map((s) => ({ t: s.type, tag: s.data.tag, id: s.data.id, cx: +s.cx.toFixed(1), cz: +s.cz.toFixed(1), hw: s.hw, hd: s.hd, r: s.r, rot: +(s.rot || 0).toFixed(2) })), [x0, z0, r]);
  console.log(out.map((o) => JSON.stringify(o)).join('\n'));
  await g.close();
})();
