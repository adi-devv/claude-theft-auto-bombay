const H = require('../harness');
(async () => {
  const g = await H.launch({ width: 640, height: 360, out: __dirname + '/shots' });
  const r = await g.eval(() => {
    const G = __game; const out = [];
    for (const b of [0, -0.2, 0.2, -0.35]) {
      const dx = Math.sin(b), dz = Math.cos(b);
      const h = G.collision.raycast(-317, 330, dx, dz, 200, 0);
      out.push({ b, hit: h && { d: +h.dist.toFixed(1), nx: +h.nx.toFixed(2), nz: +h.nz.toFixed(2), type: h.shape.type, hw: h.shape.hw, hd: h.shape.hd, cx: h.shape.cx, cz: h.shape.cz, rot: h.shape.rot } });
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await g.close();
})();
