// lateral error at connector exit, by move type
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  const r = await g.eval((S) => {
    const T = __game.debug.traffic.T; const stats = {};
    for (let t = 0; t < S; t += 0.1) {
      __game.debug.step(0.1);
      for (const d of T.drivers) {
        const l = d.legs[0];
        if (l.kind === 'conn') { d._lastConn = l; d._maxLat = Math.max(d._maxLat && d._lastConn === l ? d._maxLat : 0, Math.abs(d.lat)); d._cv = Math.abs(d.veh.speed); }
        else if (d._lastConn && d.s < 2.5 && d.s > 0.3) {
          const k = d._lastConn.conn.move.type + (d._lastConn.conn.node.ai.kind === 'roundabout' ? '(rb)' : '');
          const st = (stats[k] = stats[k] || { n: 0, sumLat: 0, maxLat: 0, sumMax: 0, sumV: 0 });
          st.n++; st.sumLat += Math.abs(d.lat); st.maxLat = Math.max(st.maxLat, Math.abs(d.lat)); st.sumMax += d._maxLat || 0; st.sumV += d._cv;
          d._lastConn = null; d._maxLat = 0;
        }
      }
    }
    const out = {};
    for (const k in stats) { const s = stats[k]; out[k] = { n: s.n, meanLatAtExit: +(s.sumLat / s.n).toFixed(2), maxLatAtExit: +s.maxLat.toFixed(2), meanMaxInConn: +(s.sumMax / s.n).toFixed(2), meanV: +(s.sumV / s.n).toFixed(1) }; }
    return out;
  }, Number(process.env.SECS || 200));
  console.log(JSON.stringify(r, null, 1));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
