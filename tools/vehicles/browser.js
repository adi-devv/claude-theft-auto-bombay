// In-browser telemetry for vehicles (deterministic stepping via __game.debug.step).
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots' });
  await g.wait(0.8);
  // install helpers
  await g.eval(() => {
    const G = __game, p = G.player;
    p.update = () => {};
    const DT = 1 / 60;
    const T = (window.T = {});
    T.ev = []; for (const n of ['vehicleCollision', 'vehicleHitStatic', 'explosion', 'panic']) G.events.on(n, (e) => T.ev.push({ n, t: +G.time.toFixed(2), imp: e.impulse && Math.round(e.impulse), rel: e.relSpeed && +e.relSpeed.toFixed(1) }));
    T.clear = () => { for (const v of G.vehicles.slice()) v.destroy(); T.ev.length = 0; G.collision._testShapes?.forEach(() => {}); };
    T.car = (type, x, z, h, kmh = 0, driver = { kind: 'test', eject() {} }) => {
      const v = G.createVehicle({ type, x, z, heading: h }); v.driver = driver;
      v.velocity.set(Math.sin(h) * kmh / 3.6, 0, Math.cos(h) * kmh / 3.6);
      if (kmh > 0 && v.ph) { const s = v.spec, rpmPer = 60 / (2 * Math.PI * s.wheelR) * s.final; v.ph.gear = 0; while (v.ph.gear < s.gears.length - 1 && kmh / 3.6 * rpmPer * s.gears[v.ph.gear] > s.shiftUp * 0.8) v.ph.gear++; }
      return v;
    };
    T.player = (v) => { p.vehicle = v; p.mode = 'vehicle'; v.driver = 'player'; };
    T.run = (sec, fn) => { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { if (fn && fn(i * DT) === false) return i * DT; G.debug.step(DT); } return sec; };
    T.fwd = (v) => v.velocity.x * Math.sin(v.heading) + v.velocity.z * Math.cos(v.heading);
    T.kmh = (v) => +(Math.hypot(v.velocity.x, v.velocity.z) * 3.6).toFixed(1);
  });
  const R = {};
  const X = -401, Z = 250, N = Math.PI; // north along Marine Drive
  R.accel = await g.eval(([X, Z, N]) => { const G = __game; T.clear(); const v = T.car('sedan', X, Z, N); T.player(v); v.setControls({ throttle: 1 });
    let t100 = null; const t = T.run(12, (t) => { if (T.fwd(v) * 3.6 >= 100) { t100 = t; return false; } });
    return { t0_100: t100 && +t100.toFixed(2), dist: +Math.abs(v.position.z - Z).toFixed(0) }; }, [X, Z, N]);
  R.brake = await g.eval(([X, Z, N]) => { const G = __game; T.clear(); const v = T.car('sedan', X, Z, N, 100); T.player(v); v.setControls({ brake: 1 });
    const t = T.run(8, () => (T.fwd(v) < 0.05 ? false : undefined)); return { dist: +Math.abs(v.position.z - Z).toFixed(1), t: +t.toFixed(2) }; }, [X, Z, N]);
  R.hb180 = await g.eval(([X, Z, N]) => { const G = __game; T.clear(); const v = T.car('sedan', X, Z, N, 60); T.player(v);
    v.setControls({ steer: -1, handbrake: true }); T.run(1.0); v.setControls({ steer: 0, handbrake: false }); T.run(2.5);
    return { rotDeg: Math.round((v.heading - N) * 57.3), endKmh: T.kmh(v) }; }, [X, Z, N]);
  // wall scrape at 100 km/h, 10 deg into a wall to the car's right
  R.scrape = await g.eval(([X, Z, N]) => { const G = __game; T.clear(); const wx = X - 6; // car right side when heading north (-z) is -x? right=(-cos h, sin h) = (1,0) at h=pi
    const wallX = X + 4; G.collision.addBox(wallX + 0.3, Z - 80, 0.3, 90, 0, { tag: 'testwall', h: 3 });
    const h = N - 10 / 57.3; // rotate toward +x (right)
    const v = T.car('sedan', X, Z, h, 100); T.player(v); v.setControls({ throttle: 0.6 });
    let maxX = -1e9, contact = null, hits = 0;
    T.run(3, (t) => { maxX = Math.max(maxX, v.position.x); if (contact == null && T.ev.some((e) => e.n === 'vehicleHitStatic')) contact = { t: +t.toFixed(2), kmh: T.kmh(v) }; });
    const o = v.getOBB();
    return { contact, endKmh: T.kmh(v), headingDeg: +((v.heading - N) * 57.3).toFixed(1), maxX: +(maxX - wallX).toFixed(2), obbEdge: +(o.cx + Math.abs(Math.cos(o.rot)) * o.hw + Math.abs(Math.sin(o.rot)) * o.hd - wallX).toFixed(2), health: Math.round(v.health), hitEvents: T.ev.filter((e) => e.n === 'vehicleHitStatic').length };
  }, [X, Z, N]);
  // tunnelling: police at 172 km/h perpendicular into a 0.3 m thick segment
  R.tunnel = await g.eval(([X, Z]) => { const G = __game; const out = []; for (const [type, kmh] of [['police', 175], ['sedan', 165], ['hatch', 140], ['bus', 75]]) {
    T.clear(); const wz = Z - 60; G.collision.addSegment(X - 20, wz, X + 20, wz, { tag: 'thin' }, 0.15);
    const v = T.car(type, X, Z, Math.PI, kmh); v.setControls({ throttle: 1 }); T.run(3);
    out.push({ type, kmh, passed: v.position.z < wz, endZ: +(v.position.z - wz).toFixed(2), endKmh: T.kmh(v), health: Math.round(v.health) }); } return out; }, [X, Z]);
  // head-on: two sedans at 60 km/h each
  R.headon = await g.eval(([X, Z]) => { const G = __game; T.clear(); const a = T.car('sedan', X, Z, Math.PI, 60); const b = T.car('taxi', X + 0.6, Z - 40, 0, 60);
    a.setControls({ throttle: 0.3 }); b.setControls({ throttle: 0.3 }); let first = null;
    T.run(4, (t) => { if (!first && T.ev.some((e) => e.n === 'vehicleCollision')) first = t; });
    const dist = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
    return { firstContact: first && +first.toFixed(2), events: T.ev.filter((e) => e.n === 'vehicleCollision').slice(0, 3), healthA: Math.round(a.health), healthB: Math.round(b.health), kmhA: T.kmh(a), kmhB: T.kmh(b), sep: +dist.toFixed(2), yawA: +(a.yawRate * 57.3).toFixed(0), panic: T.ev.filter((e) => e.n === 'panic').length };
  }, [X, Z]);
  // T-bone: sedan 80 km/h into side of a parked bus
  R.tbone = await g.eval(([X, Z]) => { const G = __game; T.clear(); const bus = G.createVehicle({ type: 'bus', x: X, z: Z - 40, heading: Math.PI / 2, parked: true }); const a = T.car('sedan', X, Z, Math.PI, 80); a.setControls({ throttle: 0 });
    const b0 = { x: bus.position.x, z: bus.position.z, h: bus.heading }; T.run(3);
    return { busMoved: +Math.hypot(bus.position.x - b0.x, bus.position.z - b0.z).toFixed(2), busRotDeg: +((bus.heading - b0.h) * 57.3).toFixed(1), carKmh: T.kmh(a), carHealth: Math.round(a.health), busHealth: Math.round(bus.health), sep: +(a.position.z - bus.position.z).toFixed(2) };
  }, [X, Z]);
  // explosion sequence
  R.explode = await g.eval(([X, Z]) => { const G = __game; T.clear(); const v = T.car('taxi', X, Z, Math.PI); const near = T.car('hatch', X + 3, Z, Math.PI); v.damage(990, { x: X, z: Z }); const sm = { health: Math.round(v.health) }; v.damage(50);
    const s1 = { health: Math.round(v.health), wrecked: v.wrecked }; let tf = null, tx = null;
    T.run(8, (t) => { if (tf == null && v.onFire) tf = t; if (tx == null && v.wrecked) tx = t; });
    v.setControls({ throttle: 1 }); const z0 = v.position.z; T.run(1);
    return { afterDmg: s1, fireAt: tf, explodedAt: tx && +tx.toFixed(2), events: T.ev.filter((e) => e.n !== 'vehicleCollision').map((e) => e.n + '@' + e.t), drivesAfter: +Math.abs(v.position.z - z0).toFixed(2), nearHealth: Math.round(near.health), nearPushedKmh: T.kmh(near) };
  }, [X, Z]);
  R.errors = await g.eval(() => __game.errors.slice(-5));
  console.log(JSON.stringify(R, null, 1));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
