const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  const secs = Number(process.env.SECS || 25);
  const r = await g.eval((S) => {
    const T = __game.debug.traffic.T; const seen = new Map(); const out = [];
    const f = (x, n = 1) => (typeof x === 'number' ? +x.toFixed(n) : x);
    const nm = (l) => l.kind + ':' + (l.edge ? l.edge.name + '/' + l.dir + '/' + l.lane : (l.conn ? l.conn.node.id + '/' + l.conn.move.type : '?'));
    for (let t = 0; t < S; t += 0.1) {
      __game.debug.step(0.1);
      for (const d of T.drivers) {
        const l = d.legs[0], v = d.veh;
        if (Math.abs(d.lat) > 2 && !seen.has(d.id)) {
          seen.set(d.id, 1);
          const P = l.pts[0], Q = l.pts[l.pts.length - 1];
          out.push({ t: f(t,1), id: d.id, ty: v.type, pos: [f(v.position.x,1), f(v.position.z,1)], h: f(v.heading,2), leg: nm(l), s: f(d.s,1), len: f(l.len,0), lat: f(d.lat,1), p0: [f(P.x,1), f(P.z,1)], pE: [f(Q.x,1), f(Q.z,1)], age: f(d.age,1), v: f(v.speed,2), prev: d._prevName });
        }
        d._prevName = nm(l);
      }
    }
    return out;
  }, secs);
  for (const o of r) console.log(JSON.stringify(o));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
