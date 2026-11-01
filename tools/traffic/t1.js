// smoke: load, errors, step, telemetry
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  await g.wait(1.5);
  console.log('after load', JSON.stringify(await g.eval(() => ({ errors: __game.errors, t: __game.debug.extra.traffic(), veh: __game.vehicles.length }))));
  for (let i = 0; i < 6; i++) {
    const r = await g.eval(() => { __game.debug.step(10); return { t: __game.debug.extra.traffic(), errors: __game.errors.slice(0, 3) }; });
    console.log(i * 10 + 10, 's', JSON.stringify(r));
  }
  console.log(await g.eval(() => (__game.debug.traffic.T.hitInfo || []).slice(0, 10)));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
