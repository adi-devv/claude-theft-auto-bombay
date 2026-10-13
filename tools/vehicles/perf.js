// 40 active vehicles: physics (update + v-v collisions) cost per frame, plus frameUpdate (visual) cost.
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots' });
  await g.wait(0.8);
  const r = await g.eval(async () => {
    const G = __game; const { resolveVehicleCollisions } = await import(new URL('./src/vehicles/collisions.js', location.href).href);
    G.player.update = () => {};
    G.debug.teleport(-395, 150, Math.PI);
    const types = ['taxi', 'taxi', 'sedan', 'hatch', 'suv', 'van', 'police', 'bus', 'taxi', 'sedan'];
    const cars = [];
    for (let i = 0; i < 40; i++) {
      const lane = i % 4, row = Math.floor(i / 4);
      const v = G.createVehicle({ type: types[i % types.length], x: -406 + lane * 3.6, z: 210 - row * 14, heading: Math.PI });
      v.driver = { kind: 'ai', eject() {} }; v.ai = {}; cars.push(v);
    }
    const measure = (sec, far) => {
      let tPhys = 0, tVis = 0, n = 0, maxPhys = 0;
      for (let i = 0; i < sec * 60; i++) {
        const t = i / 60;
        for (let k = 0; k < cars.length; k++) { const v = cars[k]; v.setControls({ throttle: 0.55 + 0.3 * Math.sin(k), steer: 0.35 * Math.sin(t * 0.9 + k), brake: 0, handbrake: false }); }
        const t0 = performance.now();
        for (const v of G.vehicles) v.update(1 / 60);
        resolveVehicleCollisions(G, 1 / 60);
        const t1 = performance.now();
        for (const v of G.vehicles) v.frameUpdate(1 / 60);
        const t2 = performance.now();
        if (i > 30) { tPhys += t1 - t0; tVis += t2 - t1; n++; maxPhys = Math.max(maxPhys, t1 - t0); }
      }
      return { physMsPerStep: +(tPhys / n).toFixed(3), maxPhysMs: +maxPhys.toFixed(2), visMsPerFrame: +(tVis / n).toFixed(3) };
    };
    const near = measure(6);
    const collisions = 0;
    const out = { near, vehicles: G.vehicles.length, sleeping: G.vehicles.filter((v) => v.sleeping).length, wrecked: G.vehicles.filter((v) => v.wrecked).length,
      healthMin: Math.min(...G.vehicles.map((v) => Math.round(v.health))) };
    // far LOD: move camera far away
    G.camera.position.set(2000, 50, 2000); G.player.updateCamera = () => {};
    out.far = measure(4);
    // parked cars: stop all, let them sleep
    for (const v of cars) { v.driver = null; v.setControls({ throttle: 0, brake: 0, steer: 0, handbrake: true }); }
    G.camera.position.set(-395, 30, 150);
    const tmp = cars.map((v) => v); for (const v of tmp) v.setControls = () => {};
    out.parked = measure(3);
    out.sleepingAfter = G.vehicles.filter((v) => v.sleeping).length;
    out.errors = G.errors.slice(-3);
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
