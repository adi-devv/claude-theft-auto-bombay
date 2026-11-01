// functional checks: roundabouts, gate u-turn, eject, siren
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  // ---- roundabouts + GATE
  const places = [['FLORA', 60, 55], ['HORN', 250, 105], ['REGAL', 112, 345], ['GATE', 362, 385]];
  for (const [id, x, z] of places) {
    const r = await g.eval(([id, x, z]) => {
      const N = __game.roads.nodes.get(id); const T = __game.debug.traffic.T;
      __game.debug.teleport(x + 60, z, 0); __game.debug.step(5);
      const res = { cw: 0, ccw: 0, samples: 0, ids: new Set(), uturn: 0, conns: new Set(), hits0: T.stats.aiHits };
      for (let t = 0; t < 150; t += 0.5) {
        __game.debug.step(0.5);
        for (const d of T.drivers) {
          const l = d.legs[0];
          if (l.kind === 'conn' && l.conn.node === N) {
            res.conns.add(l.conn.move.type + (l.conn.type ? '' : ''));
            if (l.conn.move.type === 'uturn') res.ids.add(d.id);
            if (N.ai.kind === 'roundabout') {
              const p = d.veh.position, v = d.veh.velocity;
              const w = (p.x - N.x) * v.z - (p.z - N.z) * v.x;      // >0 : polar angle atan2(z,x) increasing
              if (Math.hypot(p.x - N.x, p.z - N.z) < N.radius + 2 && Math.abs(d.veh.speed) > 1) { w > 0 ? res.cw++ : res.ccw++; }
            }
          }
        }
      }
      return { id, kind: N.ai.kind, radius: N.radius, cw: res.cw, ccw: res.ccw, moves: [...res.conns], uturners: res.ids.size, newHits: T.stats.aiHits - res.hits0, errors: __game.errors.slice(0, 2) };
    }, [id, x, z]);
    console.log(JSON.stringify(r));
  }
  // ---- eject
  const e = await g.eval(() => {
    const T = __game.debug.traffic.T; const p = __game.player.position;
    __game.debug.teleport(-405, -20, 0); __game.debug.step(3);
    let best = null, bd = 1e9;
    for (const d of T.drivers) { const dd = Math.hypot(d.veh.position.x - p.x, d.veh.position.z - p.z); if (dd < bd) { bd = dd; best = d; } }
    const n0 = __game.peds.length, a0 = T.drivers.length, v = best.veh;
    best.eject(); v.driver = 'player';
    __game.debug.step(0.5);
    return { dist: Math.round(bd), type: v.type, driversDelta: T.drivers.length - a0, pedsDelta: __game.peds.length - n0, vehAi: !!v.ai, abandoned: T.abandoned.length, errors: __game.errors.slice(0, 2) };
  });
  console.log('eject', JSON.stringify(e));
  // ---- siren
  const s = await g.eval(() => {
    const T = __game.debug.traffic.T; __game.debug.teleport(-405, 40, 0); __game.debug.step(4);
    let tgt = null;
    for (const d of T.drivers) { const l = d.legs[0]; if (l.kind === 'lane' && l.edge.name === 'Marine Drive' && Math.abs(d.veh.speed) > 6 && d.distToLegEnd() > 60 && Math.hypot(d.veh.position.x + 405, d.veh.position.z - 40) < 150) { tgt = d; break; } }
    if (!tgt) return 'no target';
    const v = tgt.veh, f = v.forward;
    const pol = __game.createVehicle({ type: 'police', x: v.position.x - f.x * 18, z: v.position.z - f.z * 18, heading: v.heading });
    pol.sirenOn = true; pol.alwaysFullPhysics = true;
    const rec = [];
    for (let t = 0; t < 8; t += 1) { __game.debug.step(1); rec.push([+tgt.veh.speed.toFixed(1), tgt.pull ? 1 : 0, +tgt.shift.toFixed(2), +tgt.lat.toFixed(2)].join('/')); }
    pol.sirenOn = false; __game.debug.step(5);
    return { rec, after: [+tgt.veh.speed.toFixed(1), tgt.pull ? 1 : 0], errors: __game.errors.slice(0, 2) };
  });
  console.log('siren', JSON.stringify(s));
  console.log(JSON.stringify(await g.eval(() => __game.debug.extra.traffic())));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
