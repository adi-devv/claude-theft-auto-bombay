const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  g.page.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
  await g.page.reload(); await g.wait(3);
  const s = await g.state();
  console.log('errors', JSON.stringify(s.errors), 'fps', s.fps, JSON.stringify(s.render));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
