// signals + scene screenshots
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  const spots = [['mkvn_day', -230, 55, 0, 10], ['md_day', -400, -20, 0, 10], ['mkvn_night', -230, 55, 0, 22]];
  for (const [name, x, z, h, tod] of spots) {
    await g.eval(([x, z, h, tod]) => { __game.debug.setTime(tod); __game.debug.teleport(x, z, h); __game.debug.step(12); }, [x, z, h, tod]);
    console.log(name, await g.shot(name), JSON.stringify(await g.eval(() => __game.errors.slice(0, 2))));
  }
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
