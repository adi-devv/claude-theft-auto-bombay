// Traffic regression on the city sandbox: step 120 s (player parked at spawn), sample stuck / collisions every 10 s.
// GAME_URL=http://localhost:8765/work/city/ node tools/city/traffic.js [secs]
const H = require('../harness'); const path = require('path');
(async () => {
  const g = await H.launch({ out: path.join(__dirname, 'shots'), width: 960, height: 540 });
  const secs = Number(process.argv[2] || 120); const rows = [];
  for (let i = 0; i < secs / 10; i++) {
    const r = await g.eval(() => { __game.debug.step(10); const t = __game.debug.extra.traffic(); return { active: t.active, parked: t.parked, stuck: t.stuck, col: t.collisionsLastMin, hits: t.aiHitsTotal, avg: t.avgSpeedKmh, msStep: t.msPerStep }; });
    rows.push(r);
  }
  console.log(rows.map((r) => JSON.stringify(r)).join('\n'));
  const fin = await g.eval(() => ({ t: __game.debug.extra.traffic(), errors: __game.errors, fps: __game.fps }));
  console.log('FINAL', JSON.stringify(fin.t), 'errors', JSON.stringify(fin.errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
