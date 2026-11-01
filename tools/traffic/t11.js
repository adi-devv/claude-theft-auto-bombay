// tour: teleport the player around the city, log AI-AI hits
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  const r = await g.eval((S) => {
    const T = __game.debug.traffic.T; T.debugHits = true; T.hitInfo = [];
    const N = __game.roads.nodes; const ids = ['MD_VN', 'FLORA', 'MK_VN', 'KBP_VN', 'HORN', 'MD_ML', 'REGAL', 'CST', 'GATE', 'KG', 'SBS1', 'MK_S', 'DN2', 'AZW'];
    for (const id of ids) { const n = N.get(id); __game.debug.teleport(n.x + 25, n.z + 25, 0); __game.debug.step(S); }
    const nm = (l) => l.kind + ':' + (l.edge ? l.edge.name + '/' + l.dir + '/' + l.lane : l.conn.node.id + '/' + l.conn.move.type);
    const slow = T.drivers.filter(d => d.stoppedT > 15).map(d => ({ id: d.id, ty: d.veh.type, leg: nm(d.legs[0]), s: +d.s.toFixed(0), len: +d.legs[0].len.toFixed(0), jn: d.jn.state, wait: +d.jn.wait.toFixed(0), why: d.waitReason, stT: d.stoppedT, blk: d.blockedT, a: +d.aCmd.toFixed(2), thr: +d.thr.toFixed(2), hold: d.hold, ctl: [d.veh.controls.throttle, d.veh.controls.brake, d.veh.controls.handbrake], slp: d.veh.sleeping, stat: (() => { const v = d.veh, sp = v.spec; const r = __game.collision.queryOBB(v.position.x + Math.sin(v.heading) * sp.bodyOffset, v.position.z + Math.cos(v.heading) * sp.bodyOffset, sp.width / 2 + 0.3, sp.length / 2 + 0.3, v.heading); return r.map(q => ({ d: +q.depth.toFixed(2), n: [+q.nx.toFixed(2), +q.nz.toFixed(2)], sh: JSON.stringify(q.shape).slice(0, 150) })); })(), vel: [+d.veh.velocity.x.toFixed(2), +d.veh.velocity.z.toFixed(2)], ph0: 0, ph: Object.fromEntries(Object.entries(d.veh.ph).filter(([k, v]) => typeof v === 'number' || typeof v === 'boolean').map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v])), hp: d.veh.health, wr: d.veh.wrecked, dis: d.veh.disabled, hd: +d.veh.heading.toFixed(2), lat: +d.lat.toFixed(2), dist: +d.dist.toFixed(2), spd: +d.veh.speed.toFixed(2), gap: +d.gapObs.toFixed(1), stopDist: d.stopDist, dStop: d.dStop, nbs: T.neighbors(d.veh.position.x, d.veh.position.z, 9, []).filter(o => o !== d.veh).map(o => { const sh = Math.sin(d.veh.heading), ch = Math.cos(d.veh.heading), dx = o.position.x - d.veh.position.x, dz = o.position.z - d.veh.position.z; return [o.type, +(dx * sh + dz * ch).toFixed(1), +(dx * ch - dz * sh).toFixed(1), o.parked ? 'P' : o.ai ? 'ai' + o.ai.id : '-']; }), pos: [Math.round(d.veh.position.x), Math.round(d.veh.position.z)], sig: d.jn.node && d.jn.conn && T.signals.state(d.jn.node, d.net.constructor.akey(d.jn.conn.inEdge, d.jn.conn.inDir)) }));
    return { slow, hits: T.hitInfo.slice(0, 20), ex: __game.debug.extra.traffic(), errors: __game.errors.slice(0, 2) };
  }, Number(process.env.SECS || 40));
  console.log(JSON.stringify(r.ex), r.errors);
  for (const o of r.slow) console.log('SLOW', JSON.stringify(o));
  for (const h of r.hits) console.log(h.t, h.x, h.z, '\n   A', h.A, '\n   B', h.B);
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
