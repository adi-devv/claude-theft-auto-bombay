const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  const r = await g.eval((S) => {
    const T = __game.debug.traffic.T; const hist = new Map(); let out = null;
    const f = (x, n = 2) => (typeof x === 'number' ? +x.toFixed(n) : x);
    for (let t = 0; t < S && !out; t += 0.2) {
      __game.debug.step(0.2);
      for (const d of T.drivers) {
        const v = d.veh; const l = d.legs[0];
        let h = hist.get(d.id); if (!h) hist.set(d.id, (h = []));
        h.push([f(t, 1), l.kind + ':' + (l.edge ? l.edge.dir + '/' + l.lane : l.conn.node.id), f(d.s, 1), f(d.lat), f(v.speed), f(d.steerCmd), f(v.ph.steerAngle, 3), v.ph.lod ? 'LOD' : 'full', f(d.vProfile, 1), f(d.aCmd), f(d.thr), f(v.position.x,0), f(v.position.z,0)].join(' '));
        if (Math.abs(d.lat) > 2 && !out) out = h.slice(-30);
      }
    }
    return out;
  }, Number(process.env.SECS || 8));
  for (const o of r || []) console.log(o);
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
