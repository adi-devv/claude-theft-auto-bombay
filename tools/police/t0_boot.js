const H = require('./harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots' });
  await g.wait(1);
  const r = await g.eval(() => {
    const G = __game; G.debug.step(10);
    return { s: G.debug.state().police, info: G.debug.police.unitInfo(), errors: G.errors };
  });
  console.log(JSON.stringify(r, null, 1));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
