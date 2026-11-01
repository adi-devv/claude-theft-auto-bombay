const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 640, height: 360 });
  await g.wait(1);
  const type = process.env.T || 'bus';
  console.log(await g.eval((type) => {
    const G = __game; for (const v of G.vehicles.slice()) v.destroy?.();
    const n = G.roads.nearest(-388, 150, 60); const v = G.createVehicle({ type, x: n.x, z: n.z, heading: Math.atan2(n.tx, n.tz) }); window.__v = v;
    const r = v.right, f = v.forward;
    G.debug.teleport(v.position.x - r.x * 3.0 - f.x * 1.0, v.position.z - r.z * 3.0 - f.z * 1.0, 0);
    return JSON.stringify({ car: [v.position.x, v.position.z], door: v.driverDoor(), pl: [G.player.position.x, G.player.position.z], obb: v.getOBB(), near: G.player.nearVehicle?.type });
  }, type));
  await g.wait(0.3); await g.tap('KeyF');
  for (let i = 0; i < 24; i++) { await g.wait(0.25); console.log(JSON.stringify(await g.eval(() => ({ a: __game.player.action, m: __game.player.mode, p: [+__game.player.position.x.toFixed(1), +__game.player.position.z.toFixed(1)], d: __v.driverDoor() })))); }
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
