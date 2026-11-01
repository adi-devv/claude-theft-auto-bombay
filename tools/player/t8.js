// real traffic carjack / parked-car entry / police car
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  await g.wait(6);
  console.log(JSON.stringify(await g.eval(() => { const c = {}; for (const v of __game.vehicles) { const k = v.type + (v.parked ? ':parked' : '') + (v.driver ? ':' + (typeof v.driver === 'object' ? v.driver.kind : v.driver) : ':empty'); c[k] = (c[k] || 0) + 1; } return c; })));
  // pick nearest parked car to the player
  const pick = (cond) => g.eval((cond) => {
    const p = __game.player; let best = null, bd = 1e9;
    for (const v of __game.vehicles) { const ok = cond === 'parked' ? (!v.driver && !v.wrecked) : (v.driver && typeof v.driver === 'object' && !v.isPolice && Math.abs(v.speed) < 8); if (!ok) continue;
      const d = Math.hypot(v.position.x - p.position.x, v.position.z - p.position.z); if (d < bd) { bd = d; best = v; } }
    if (!best) return null; window.__t = best; return { type: best.type, d: Math.round(bd), x: best.position.x, z: best.position.z, h: best.heading, door: best.driverDoor(), sp: best.speed, parked: best.parked };
  }, cond);
  console.log('parked pick', JSON.stringify(await pick('parked')));
  // stand on the far side (left) of the car
  await g.eval(() => { const v = __t, r = v.right; __game.debug.teleport(v.position.x - r.x * 3.2, v.position.z - r.z * 3.2, 0); });
  await g.wait(0.2); await g.tap('KeyF');
  for (let i = 0; i < 12; i++) { await g.wait(0.3); const s = await g.eval(() => ({ a: __game.player.action, m: __game.player.mode, x: +__game.player.position.x.toFixed(1), z: +__game.player.position.z.toFixed(1) })); if (s.m === 'vehicle') { console.log('entered parked', JSON.stringify(s)); break; } if (i === 11) console.log('FAILED to enter parked', JSON.stringify(s)); }
  await g.hold(['KeyW'], 1.5);
  console.log('drive', JSON.stringify(await g.eval(() => ({ kmh: Math.round(__game.player.vehicle.kmh), x: __game.player.position.x, z: __game.player.position.z }))));
  await g.tap('KeyF'); await g.wait(1.2);
  // jack a moving/stopped traffic car
  for (let tries = 0; tries < 4; tries++) {
    const t = await pick('traffic');
    console.log('traffic pick', JSON.stringify(t));
    if (!t) { await g.wait(3); continue; }
    await g.eval(() => { const v = __t; const r = v.right; window.__ev = []; for (const e of ['crime', 'playerEnteredVehicle']) __game.events.on(e, (d) => __ev.push(e + ':' + (d.type || d.jacked))); __game.debug.teleport(v.position.x + r.x * 3, v.position.z + r.z * 3, 0); });
    await g.tap('KeyF');
    for (let i = 0; i < 20; i++) { await g.wait(0.3); if (await g.eval(() => __game.player.mode === 'vehicle')) break; }
    console.log('jack result', JSON.stringify(await g.eval(() => ({ m: __game.player.mode, ev: __ev, veh: __game.player.vehicle?.type, sameCar: __game.player.vehicle === __t, ai: !!__t.ai, drv: String(__t.driver), peds: __game.peds.length }))));
    break;
  }
  await g.shot('t8-jacked');
  await g.hold(['KeyW'], 3);
  console.log('after drive', JSON.stringify(await g.eval(() => ({ kmh: Math.round(__game.player.vehicle?.kmh), w: __game.wanted?.level }))));
  console.log('errors', JSON.stringify((await g.state()).errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
