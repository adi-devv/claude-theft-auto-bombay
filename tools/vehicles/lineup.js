// Model line-up: all types parked side by side, several camera angles.
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots' });
  g.page.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
  await g.wait(0.5);
  const info = await g.eval(() => {
    const G = __game; G.debug.teleport(-380, 200, Math.PI);
    const types = ['taxi', 'hatch', 'sedan', 'suv', 'police', 'van', 'bus'];
    G.lineup = types.map((t, i) => G.createVehicle({ type: t, x: -405 + i * 4.2 - (t === 'bus' ? 0 : 0), z: 230, heading: Math.PI * 0.85 }));
    G.lineup[4].sirenOn = true;
    const v = G.lineup[2];
    return { children: v.shell.children.map((m) => [m.geometry.attributes.position.count, m.material.type, m.visible]), wheels: G._vehicleFX.wheels.count, color: v.color.toString(16) };
  });
  console.log(JSON.stringify(info));
  const views = [[-392, 2.2, 238, -392, 1, 230], [-397, 3, 222, -393, 1, 230], [-380, 6, 236, -394, 1, 230], [-410, 1.6, 227, -401, 1, 230]];
  let i = 0;
  for (const [x, y, z, tx, ty, tz] of views) {
    await g.eval(([x, y, z, tx, ty, tz]) => { const G = __game; G.player.updateCamera = () => { G.camera.position.set(x, y, z); G.camera.lookAt(tx, ty, tz); }; }, [x, y, z, tx, ty, tz]);
    await g.wait(0.4);
    await g.shot('lineup-' + i++);
  }
  await g.eval(() => __game.city.setTimeOfDay?.(21));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
