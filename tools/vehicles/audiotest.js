const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots' });
  await g.wait(0.8);
  await g.eval(() => { __game.debug.teleport(-401, 250, Math.PI); __game.debug.spawnCar('police'); });
  await g.down('KeyW'); await g.wait(2);
  const r = await g.eval(async () => {
    const G = __game, v = G.player.vehicle; const A = await import(new URL('./src/vehicles/audio.js', location.href).href);
    const a = A.getAudio(G);
    v.horn(true); v.sirenOn = true;
    await new Promise((r) => setTimeout(r, 600));
    const o = { ready: G.audio.ready, state: G.audio.ctx?.state, voices: a.voices?.length, keys: Object.keys(a).slice(0, 30) };
    v.horn(false); a.crash(v.position.x, v.position.z, 12); a.explosion(v.position.x + 10, v.position.z);
    const t = G.createVehicle({ type: 'bus', x: v.position.x + 5, z: v.position.z, heading: 0 }); t.driver = { kind: 'ai', eject() {} }; t.horn(true);
    await new Promise((r) => setTimeout(r, 500)); t.horn(false);
    o.errors = G.errors.slice(-3);
    return o;
  });
  console.log(JSON.stringify(r));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
