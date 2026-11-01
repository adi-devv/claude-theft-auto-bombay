// hits diagnostic: step 120 s logging AI-AI overlaps
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  await g.eval(() => __game.debug.traffic.log(true));
  const secs = Number(process.env.SECS || 120);
  for (let i = 0; i < secs / 10; i++) {
    await g.eval(() => { __game.debug.step(10); });
  }
  const r = await g.eval(() => ({ t: __game.debug.extra.traffic(), errors: __game.errors.slice(0, 3), hits: (__game.debug.traffic.T.hitInfo || []).slice(0, 25) }));
  console.log(JSON.stringify(r.t), r.errors);
  for (const h of r.hits) console.log(h.t, h.x, h.z, '\n   A', h.A, '\n   B', h.B);
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
