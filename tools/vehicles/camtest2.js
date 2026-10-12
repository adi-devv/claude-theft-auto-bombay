const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots' });
  await g.wait(0.8);
  const r = await g.eval(async () => {
    const G = __game; const { DriveCamera } = await import(new URL('./src/vehicles/driveCamera.js', location.href).href);
    G.debug.teleport(-401, 250, Math.PI); const v = G.debug.spawnCar('sedan');
    const cam = new DriveCamera(G); G.player.updateCamera = () => {};
    const out = [];
    const run = (sec, look) => { for (let i = 0; i < sec * 60; i++) cam.update(1 / 60, v, look); };
    const rec = (l) => { const c = G.camera; const dx = c.position.x - v.position.x, dz = c.position.z - v.position.z; out.push({ l, mode: cam.mode, d: +Math.hypot(dx, dz).toFixed(2), y: +c.position.y.toFixed(2), behindDeg: Math.round(Math.atan2(dx, dz) * 57.3), fov: +c.fov.toFixed(1) }); };
    cam.reset(); run(1); rec('near');
    cam.cycleMode(); run(1.5); rec('far');
    cam.cycleMode(); run(1.5); rec('bonnet');
    cam.cycleMode(); run(1.5); rec('near again');
    run(0.5, { yaw: 1.5, pitch: 0, active: true }); rec('look orbit');
    run(2, { yaw: 0, pitch: 0, active: false }); rec('sprung back');
    // reversing: camera should stay behind the car's tail (not flip)
    v.velocity.set(0, 0, 6); for (let i = 0; i < 120; i++) { v.setControls({ brake: 1 }); v.update(1 / 60); cam.update(1 / 60, v); } rec('reversing');
    cam.release(); out.push({ fovAfterRelease: G.camera.fov });
    return out;
  });
  console.log(r.map((x) => JSON.stringify(x)).join('\n'));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
