// snapshot of slow drivers
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  const secs = Number(process.env.SECS || 20);
  await g.eval((s) => { __game.debug.step(s); }, secs);
  const r = await g.eval(() => {
    const T = __game.debug.traffic.T; const out = [];
    for (const d of T.drivers) {
      if (Math.abs(d.veh.speed) > 1.5) continue;
      const l = d.legs[0];
      out.push({ id: d.id, ty: d.veh.type, pos: [+d.veh.position.x.toFixed(0), +d.veh.position.z.toFixed(0)], v: +d.veh.speed.toFixed(2),
        leg: l.kind + ':' + (l.edge ? l.edge.name + '/' + l.dir + '/' + l.lane : l.node && l.node.id), s: +d.s.toFixed(1), len: +l.len.toFixed(0), lat: +d.lat.toFixed(1),
        jn: d.jn.state, dStop: d.dStop && +d.dStop.toFixed(1), stopDist: +d.stopDist.toFixed(1), vProf: +d.vProfile.toFixed(1), a: +d.aCmd.toFixed(2), why: d.waitReason, gap: +d.gapObs.toFixed(1), hold: d.hold, thr: +d.thr.toFixed(2), age: +d.age.toFixed(0), obs: d.obsVeh && d.obsVeh.type, stopT: +d.stoppedT.toFixed(1) });
    }
    return out;
  }, null);
  for (const o of r) console.log(JSON.stringify(o));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
