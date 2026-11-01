const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  await g.wait(1);
  await g.eval(() => {
    const p = __game.player, cam = __game.camera, o = p.updateCamera;
    window.__camAng = 0.6; window.__camD = 3.4;
    p.updateCamera = (dt) => { o(dt); const x = p.position.x, z = p.position.z, a = p.heading + window.__camAng; cam.position.set(x + Math.sin(a) * __camD, 1.5, z + Math.cos(a) * __camD); cam.lookAt(x, 0.95, z); cam.fov = 40; cam.updateProjectionMatrix(); };
  });
  const clip = { x: 330, y: 70, width: 300, height: 400 };
  const snap = async (n) => { await g.page.screenshot({ path: __dirname + '/shots/pose-' + n + '.png', clip }); };
  await g.wait(0.6); await snap('idle');
  await g.hold(['KeyW'], 0.9); await g.down('KeyW'); await g.wait(0.15); await snap('run'); await g.up('KeyW');
  await g.down('KeyW'); await g.down('ShiftLeft'); await g.wait(1.4); await snap('sprint'); await g.up('KeyW'); await g.up('ShiftLeft'); await g.wait(0.5);
  await g.tap('Space'); await g.wait(0.2); await snap('jump'); await g.wait(1);
  await g.tap('KeyJ'); await g.wait(0.1); await snap('punch1'); await g.wait(0.5);
  await g.wait(0.2); await snap('guard'); await g.wait(2.5);
  await g.eval(() => __game.debug.step(0.01)); 
  await g.eval(() => { const p = __game.player; p.model && 0; __game.player.damage(30, 'x'); });
  // knockdown via hit by car
  await g.eval(() => { const p = __game.player; const v = __game.createVehicle({ type: 'sedan', x: p.position.x, z: p.position.z - 18, heading: 0 }); v.driver = { kind: 'test' }; window.__hv = v; v.setControls({ throttle: 1 }); });
  for (let i = 0; i < 40; i++) { await g.wait(0.05); if ((await g.eval(() => __game.player.action)) === 'down') break; }
  await g.eval(() => __hv.setControls({ throttle: 0, brake: 1 }));
  await g.wait(0.35); await snap('down');
  await g.wait(2.5);
  await g.eval(() => __game.player.bust()); await g.wait(1.2); await snap('busted');
  await g.wait(5); 
  await g.eval(() => __game.player.wasted()); await g.wait(1.6); await snap('wasted');
  console.log('errors', JSON.stringify((await g.state()).errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
