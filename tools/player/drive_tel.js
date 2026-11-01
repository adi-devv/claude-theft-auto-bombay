// driving through the player's input path: accel, steering response, handbrake, R reset, exit tumble
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 640, height: 360 });
  await g.wait(1);
  const r = await g.eval(() => {
    const G = __game, inp = G.input, out = {};
    G.debug.teleport(-388, 150, Math.PI); G.debug.spawnCar('sedan'); G.debug.step(0.5);
    const v = () => G.player.vehicle;
    // stand it on a long straight: Marine Drive heading north (-z)? use heading from road
    const n = G.roads.nearest(-390, 150, 80); const dir = n.tz < 0 ? 1 : -1; const h = Math.atan2(n.tx * dir, n.tz * dir);
    v().position.set(n.x, 0, n.z); v().heading = h; v().velocity.set(0, 0, 0); G.debug.step(0.3);
    inp.setKey('KeyW', true); let t = 0, t100 = null, t50 = null;
    while (t < 12) { G.debug.step(0.05); t += 0.05; if (t50 === null && v().kmh >= 50) t50 = t; if (t100 === null && v().kmh >= 100) { t100 = t; break; } }
    out.t50 = t50; out.t100 = t100; out.kmhAt = Math.round(v().kmh);
    // steering response: restart, hold W to ~50 km/h (then cruise), steer right 1 s
    v().position.set(n.x, 0, n.z); v().heading = h; v().velocity.set(0, 0, 0); G.debug.step(0.5);
    inp.setKey('KeyW', true); while (v().kmh < 48) G.debug.step(0.05); inp.setKey('KeyW', false);
    const h0 = v().heading, k0 = v().kmh; inp.setKey('KeyD', true); G.debug.step(0.3); const hA = v().heading; G.debug.step(0.7); const hB = v().heading; inp.setKey('KeyD', false);
    out.steer = { kmh0: Math.round(k0), after0_3s: +(((((h0 - hA) % 6.2832) + 9.4248) % 6.2832 - 3.1416) * 57.3).toFixed(1), after1s: +(((((h0 - hB) % 6.2832) + 9.4248) % 6.2832 - 3.1416) * 57.3).toFixed(1), kmhEnd: Math.round(v().kmh) };
    inp.setKey('KeyS', true); G.debug.step(6); inp.setKey('KeyS', false); out.afterBrake = { kmh: Math.round(v().kmh), spd: +v().speed.toFixed(1) };
    return out;
  });
  console.log(JSON.stringify(r));
  console.log('errors', JSON.stringify((await g.state()).errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
