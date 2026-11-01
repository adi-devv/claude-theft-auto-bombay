// tour; dump state of drivers pushing throttle but not moving
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  const r = await g.eval((S) => {
    const T = __game.debug.traffic.T; const out = []; const seen = new Set();
    const f = (x, n = 2) => (typeof x === 'number' ? +x.toFixed(n) : x);
    const nm = (l) => l.kind + ':' + (l.edge ? l.edge.name + '/' + l.dir + '/' + l.lane : l.conn.node.id + '/' + l.conn.move.type);
    const N = __game.roads.nodes; const ids = ['MD_VN', 'FLORA', 'MK_VN', 'KBP_VN', 'HORN'];
    for (const id of ids) {
      const n = N.get(id); __game.debug.teleport(n.x + 25, n.z + 25, 0);
      for (let t = 0; t < S; t += 1) {
        __game.debug.step(1);
        for (const d of T.drivers) {
          const v = d.veh;
          if (d.thr > 0.9 && Math.abs(v.speed) < 0.1 && d.legs[0].kind === 'conn') d._pt = (d._pt || 0) + 1; else d._pt = 0;
          if (d._pt === 6 && !seen.has(d.id) && out.length < 4) {
            seen.add(d.id);
            const sh = Math.sin(v.heading), ch = Math.cos(v.heading);
            const nbs = T.neighbors(v.position.x, v.position.z, 14, []).filter(o => o !== v).map(o => { const dx = o.position.x - v.position.x, dz = o.position.z - v.position.z; return { ty: o.type, fwd: f(dx * sh + dz * ch, 1), left: f(dx * ch - dz * sh, 1), hd: f(o.spec.length / 2, 1), hw: f(o.spec.width / 2, 1), hdg: f(o.heading - v.heading), v: f(o.speed), ai: o.ai ? 'id' + o.ai.id + ' ' + nm(o.ai.legs[0]) + ' ' + o.ai.jn.state + ' ' + o.ai.waitReason : (o.parked ? 'parked' : 'none') }; });
            out.push({ at: id, t, id: d.id, ty: v.type, pos: [f(v.position.x, 1), f(v.position.z, 1)], leg: nm(d.legs[0]), s: f(d.s, 1), hdgErr: f(d.lat), nbs });
          }
        }
      }
    }
    return out;
  }, Number(process.env.SECS || 60));
  for (const o of r) console.log(JSON.stringify(o));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
