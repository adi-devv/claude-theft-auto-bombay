// enter/exit every vehicle type from the far side, via the real key path
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 640, height: 360 });
  await g.wait(1);
  for (const type of ['taxi', 'sedan', 'hatch', 'suv', 'bus', 'police', 'van']) {
    await g.eval((type) => {
      const G = __game; for (const v of G.vehicles.slice()) if (v !== G.player.vehicle) v.destroy?.();
      const n = G.roads.nearest(-388, 150, 60); const v = G.createVehicle({ type, x: n.x, z: n.z, heading: Math.atan2(n.tx, n.tz) }); window.__v = v;
      const r = v.right; const f = v.forward;
      G.debug.teleport(v.position.x - r.x * 3.0 - f.x * 1.0, v.position.z - r.z * 3.0 - f.z * 1.0, 0);
      window.__t0 = performance.now();
    }, type);
    await g.wait(0.3); await g.tap('KeyF');
    let ok = false, t = 0;
    for (; t < 20; t++) { await g.wait(0.25); if (await g.eval(() => __game.player.mode === 'vehicle')) { ok = true; break; } }
    const info = await g.eval(() => ({ drv: String(__v.driver), pos: [__game.player.position.x.toFixed(1), __game.player.position.z.toFixed(1)] }));
    await g.wait(0.6); await g.tap('KeyF'); await g.wait(1.2);
    const after = await g.eval(() => { const p = __game.player, d = Math.hypot(p.position.x - __v.position.x, p.position.z - __v.position.z); const o = __v.getOBB(); const dx = p.position.x - o.cx, dz = p.position.z - o.cz; const c = Math.cos(o.rot), s = Math.sin(o.rot); return { mode: p.mode, d: +d.toFixed(2), lx: +(dx * c - dz * s).toFixed(2), lz: +(dx * s + dz * c).toFixed(2), hw: o.hw, hd: o.hd, act: p.action }; });
    console.log(type, ok ? 'ENTERED in ~' + (t * 0.25).toFixed(1) + 's' : 'FAILED', JSON.stringify(info), 'exit', JSON.stringify(after));
  }
  console.log('errors', JSON.stringify((await g.state()).errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
