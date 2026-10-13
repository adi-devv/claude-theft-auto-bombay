const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  await g.wait(1);
  // fake ped in front of the player
  await g.eval(() => {
    const T = __game.THREE, p = __game.player; window.__cr = []; __game.events.on('crime', (e) => __cr.push(e.type));
    const mk = (dx, cop) => ({ position: new T.Vector3(p.position.x + Math.sin(p.heading) * 1.1 + dx, 0, p.position.z + Math.cos(p.heading) * 1.1), heading: 0, velocity: new T.Vector3(), radius: 0.3, state: 'idle', isCop: cop, health: 100,
      knockDown(vx, vz, src) { this.state = 'down'; this.kd = [vx, vz, src]; } });
    window.__peds = [mk(0, false)]; __game.peds.push(...__peds);
  });
  await g.tap('KeyJ'); await g.wait(0.6);
  console.log('punch', await g.eval(() => [__peds[0].state, JSON.stringify(__peds[0].kd), JSON.stringify(__cr), __game.player.action]));
  await g.tap('KeyJ'); await g.wait(0.15); await g.tap('KeyJ'); await g.wait(0.15); await g.tap('KeyJ');
  await g.wait(0.1); console.log('combo', JSON.stringify(await g.eval(() => __game.debug.extra.pl())));
  await g.shot('t4-punch');
  // camera vs buildings: back the player against a building and orbit
  const r = await g.eval(() => { const c = __game.collision; const out = []; for (const s of c.shapes) if (s.type === 'box' && s.h > 10 && s.hw > 6) { out.push([s.cx, s.cz, s.hw, s.hd, s.rot]); if (out.length > 3) break; } return out; });
  console.log('some buildings', JSON.stringify(r));
  // vehicle keys
  await g.eval(() => __game.debug.spawnCar('police'));
  await g.wait(0.3);
  await g.down('KeyH'); await g.wait(0.3); await g.up('KeyH');
  await g.tap('KeyL'); await g.tap('KeyC'); await g.wait(0.3);
  console.log('police', await g.eval(() => [__game.player.vehicle.sirenOn, __game.player.driveCam.mode]));
  await g.hold(['KeyW', 'KeyD'], 2.5);
  await g.tap('KeyR'); await g.wait(0.3);
  await g.hold(['KeyS'], 1.5); await g.wait(1.5); await g.tap('KeyR'); await g.wait(0.3);
  console.log(JSON.stringify((await g.state()).vehicle));
  await g.tap('KeyF'); await g.wait(1);
  console.log('exit', JSON.stringify((await g.state()).player), await g.eval(() => __game.camera.fov));
  console.log('errors', JSON.stringify((await g.state()).errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
