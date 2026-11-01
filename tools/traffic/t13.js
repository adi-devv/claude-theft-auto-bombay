// scan every lane piece and connector for static collisions with a car-sized box
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  const r = await g.eval(() => {
    const net = __game.debug.traffic.net, c = __game.collision; const out = []; const pieces = [];
    for (const e of __game.roads.edges) for (const dir of [1, -1]) for (let l = 0; l < e.lanes; l++) pieces.push(net.lanePiece(e, dir, l));
    const conns = [];
    for (const n of __game.roads.nodes.values()) { if (!n.ai || !n.ai.conns) continue; for (const cc of n.ai.conns) conns.push(cc.piece); }
    const seen = new Set();
    const HW = Number(window.__HW || 0.95), HD = Number(window.__HD || 2.3);
    const scan = (p, label) => {
      let hits = 0, first = null, tags = new Set();
      for (let k = 0; k < p.n - 1; k++) {
        const ax = p.pts[k * 2], az = p.pts[k * 2 + 1], bx = p.pts[k * 2 + 2], bz = p.pts[k * 2 + 3];
        if (k % 2 && p.n > 30) continue;
        const rot = Math.atan2(bx - ax, bz - az);
        const res = c.queryOBB(ax, az, HW, HD, rot);
        for (const h of res) { if (h.depth > 0.03) { hits++; tags.add(h.shape.data && h.shape.data.tag); if (!first) first = [+ax.toFixed(0), +az.toFixed(0), +h.depth.toFixed(2)]; } }
      }
      if (hits) out.push([label, hits, first, [...tags].join(',')]);
    };
    for (const p of pieces) scan(p, p.edge.name + '/' + p.dir + '/' + p.lane);
    for (const p of conns) scan(p, 'conn ' + p.conn.node.id + '/' + p.conn.move.type + ' in ' + p.conn.inEdge.name + ' out ' + p.conn.outEdge.name);
    return { n: pieces.length, nconn: conns.length, out };
  });
  console.log(r.n, r.nconn, r.out.length);
  for (const o of r.out) console.log(JSON.stringify(o));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
