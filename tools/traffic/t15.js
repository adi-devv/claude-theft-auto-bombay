const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  const r = await g.eval(([id, QQ]) => {
    const n = __game.roads.nodes.get(id); const net = __game.debug.traffic.net; const c = __game.collision;
    const f = (x) => +x.toFixed(1);
    const conns = n.ai.conns.map(cc => ({ type: cc.move.type, inE: cc.inEdge.name + '/' + cc.inDir + '/' + cc.inLane, outE: cc.outEdge.name + '/' + cc.outDir + '/' + cc.outLane, len: f(cc.piece.len), p0: [f(cc.piece.pts[0]), f(cc.piece.pts[1])], pE: [f(cc.piece.pts[cc.piece.pts.length - 2]), f(cc.piece.pts[cc.piece.pts.length - 1])], maxKap: f(Math.max(...cc.piece.kap) * 100) / 100 }));
    const pos = c.queryOBB((QQ.x ?? n.x), (QQ.z ?? n.z), (QQ.r ?? 20), (QQ.r ?? 20), 0).slice(0, 10).map(q => ({ px: f(q.px), pz: f(q.pz), t: q.shape.type, h: q.shape.h, c: [f(q.shape.cx), f(q.shape.cz), f(q.shape.hw || q.shape.r), f(q.shape.hd || 0), f(q.shape.rot || 0)], tag: q.shape.data && q.shape.data.tag }));
    return { id, kind: n.ai.kind, x: f(n.x), z: f(n.z), radius: n.radius, trim: n.ai.trim, deg: n.edges ? n.edges.length : null, statics: pos };
  }, [process.env.NODE || 'X1', { x: process.env.QX ? Number(process.env.QX) : undefined, z: process.env.QZ ? Number(process.env.QZ) : undefined, r: process.env.QR ? Number(process.env.QR) : undefined }]);
  console.log(JSON.stringify(r, null, 1).slice(0, 4000));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
