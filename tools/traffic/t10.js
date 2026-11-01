// find drivers stalled for a long time and dump their state
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  await g.eval((n) => { window.__NODE = n; }, process.env.NODE || '');
  const r = await g.eval((S) => {
    const T = __game.debug.traffic.T; const out = []; const seen = new Set();
    if (window.__NODE) { const n = __game.roads.nodes.get(window.__NODE); __game.debug.teleport(n.x + 25, n.z + 25, 0); }
    const f = (x, n = 2) => (typeof x === 'number' ? +x.toFixed(n) : x);
    const nm = (l) => l.kind + ':' + (l.edge ? l.edge.name + '/' + l.dir + '/' + l.lane : l.conn.node.id + '/' + l.conn.move.type);
    for (let t = 0; t < S; t += 1) {
      __game.debug.step(1);
      for (const d of T.drivers) {
        if (Math.abs(d.veh.speed) < 0.15 && d.jn.state !== 'wait') d._st = (d._st || 0) + 1; else d._st = 0;
        if (d._st === 12 && !seen.has(d.id) && out.length < 8) {
          seen.add(d.id);
          const v = d.veh, c = v.controls;
          const nbs = T.neighbors(v.position.x, v.position.z, 9, []).filter(o => o !== v).map(o => ({ ty: o.type, dx: f(o.position.x - v.position.x, 1), dz: f(o.position.z - v.position.z, 1), v: f(o.speed), ai: o.ai ? nm(o.ai.legs[0]) + ' ' + o.ai.jn.state + ' ' + o.ai.waitReason : (o.parked ? 'parked' : 'none') }));
          out.push({ t, id: d.id, ty: v.type, pos: [f(v.position.x, 0), f(v.position.z, 0)], leg: nm(d.legs[0]), s: f(d.s, 1), len: f(d.legs[0].len, 0), jn: d.jn.state, why: d.waitReason, a: f(d.aCmd), thr: f(d.thr), ctl: [f(c.throttle), f(c.brake), f(c.steer), c.handbrake], hold: d.hold, gap: f(d.gapObs, 1), obs: d.obsVeh && (d.obsVeh.type || 'ped'), dStop: f(d.dStop, 1), stopDist: f(d.stopDist, 1), vProf: f(d.vProfile, 1), sleeping: v.sleeping, lod: v.ph.lod, blockedT: f(d.blockedT, 1), rev: f(d.reverseT, 1), nbs });
        }
      }
    }
    return out;
  }, Number(process.env.SECS || 240));
  for (const o of r) console.log(JSON.stringify(o));
  console.log(JSON.stringify(await g.eval(() => __game.debug.extra.traffic())));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
