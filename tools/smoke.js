const H = require('./harness');
(async () => {
  const g = await H.launch({ out: process.argv[2] || __dirname + '/shots' });
  await g.wait(1);
  await g.shot('smoke-start');
  await g.tap('KeyF'); await g.wait(0.3);
  await g.hold(['KeyW'], 3);
  console.log(JSON.stringify(await g.state()));
  await g.shot('smoke-drive');
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
