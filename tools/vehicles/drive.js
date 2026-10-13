// Real-time keyboard drive with screenshots (feel + camera + fx).
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots' });
  const type = process.argv[2] || 'sedan';
  await g.wait(0.8);
  await g.eval((t) => { __game.debug.teleport(-401, 250, Math.PI); __game.debug.spawnCar(t); }, type);
  await g.wait(0.4);
  const st = async (l) => { const s = await g.eval(() => { const v = __game.player.vehicle; const c = __game.camera; return { kmh: Math.round(v.speed * 3.6), gear: v.gear, rpm: Math.round(v.rpm), h: +(v.heading * 57.3).toFixed(0), beta: +(v.ph.beta * 57.3).toFixed(0), camFov: +c.fov.toFixed(1), camD: +Math.hypot(c.position.x - v.position.x, c.position.z - v.position.z).toFixed(1), camY: +c.position.y.toFixed(1), fps: __game.fps | 0 }; }); console.log(l, JSON.stringify(s)); };
  await g.down('KeyW'); await g.wait(2.0); await st('2s'); await g.shot(`drive-${type}-accel`); await g.wait(2.5); await st('4.5s');
  await g.down('KeyD'); await g.wait(0.6); await st('steerR'); await g.shot(`drive-${type}-turn`);
  await g.up('KeyD'); await g.down('KeyA'); await g.down('Space'); await g.wait(0.5); await st('hb'); await g.shot(`drive-${type}-hb`);
  await g.up('Space'); await g.wait(0.5); await st('hb+0.5'); await g.shot(`drive-${type}-drift`);
  await g.up('KeyA'); await g.up('KeyW'); await g.wait(0.3);
  await g.down('KeyS'); await g.wait(2.5); await st('brake/rev'); await g.wait(1.5); await st('reversing'); await g.shot(`drive-${type}-reverse`);
  await g.up('KeyS'); await g.wait(1); await g.shot(`drive-${type}-skids`);
  console.log(JSON.stringify((await g.state()).errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
