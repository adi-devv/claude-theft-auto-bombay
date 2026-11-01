const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  const r = await g.eval(() => {
    const c = __game.collision; const out = [];
    const cx = -96, cz = 88;
    const res = c.queryOBB(cx, cz, 16, 16, 0);
    return { n: res.length, res: res.slice(0, 30).map(q => ({ px: +q.px.toFixed(1), pz: +q.pz.toFixed(1), d: +q.depth.toFixed(2), s: JSON.stringify(q.shape).slice(0,200), t: q.shape && q.shape.type, r: q.shape && q.shape.r, h: q.shape && q.shape.h })) };
  });
  console.log(JSON.stringify(r).slice(0, 3000));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
