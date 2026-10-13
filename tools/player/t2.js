const H = require('../harness');
const pl = (g) => g.eval(() => { const p = __game.player; return { mode: p.mode, action: p.action, x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2), h: +p.heading.toFixed(2), hp: Math.round(p.health), veh: p.vehicle?.type, kmh: p.vehicle ? Math.round(p.vehicle.kmh) : null }; });
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  await g.wait(1);
  const taxi = await g.eval(() => { const v = __game.vehicles[0]; return { x: v.position.x, z: v.position.z, h: v.heading, door: v.driverDoor(), obb: v.getOBB(), n: __game.vehicles.length }; });
  console.log('taxi', JSON.stringify(taxi));
  // stand on the passenger side (left = local +X) of the taxi, then F
  await g.eval(() => { const v = __game.vehicles[0]; const h = v.heading; __game.debug.teleport(v.position.x + Math.cos(h) * 2.6, v.position.z - Math.sin(h) * 2.6, 0); });
  console.log('near', JSON.stringify(await g.eval(() => __game.debug.extra.pl())));
  await g.tap('KeyF');
  for (let i = 0; i < 8; i++) { await g.wait(0.35); console.log(JSON.stringify(await pl(g))); }
  await g.hold(['KeyW'], 3);
  console.log('drive', JSON.stringify(await pl(g)));
  await g.shot('t2-drive');
  await g.down('KeyW'); await g.wait(1.5); await g.tap('KeyF'); await g.up('KeyW');
  for (let i = 0; i < 6; i++) { await g.wait(0.4); console.log('bail', JSON.stringify(await pl(g))); }
  await g.wait(1.5);
  console.log('after', JSON.stringify(await pl(g)));
  // carjack: spawn a sedan with a driver next to us
  await g.eval(() => { const p = __game.player; const v = __game.createVehicle({ type: 'sedan', x: p.position.x + 4, z: p.position.z, heading: 0 }); v.driver = { kind: 'traffic', eject() { v.driver = null; window.__ejected = true; } }; window.__crimes = []; __game.events.on('crime', (e) => __crimes.push(e.type)); });
  await g.tap('KeyF');
  await g.wait(2.5);
  console.log('jack', JSON.stringify(await pl(g)), await g.eval(() => [window.__ejected, JSON.stringify(__crimes)]));
  await g.shot('t2-jacked');
  console.log('errors', JSON.stringify((await g.state()).errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
