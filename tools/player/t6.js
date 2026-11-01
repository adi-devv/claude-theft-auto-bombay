const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 1280, height: 720 });
  await g.wait(1);
  console.log(await g.eval(() => { let n = 0, tris = 0; __game.player.model.group.traverse((o) => { if (o.isMesh) { n++; tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; } }); return { meshes: n, tris }; }));
  const t = await g.eval(async () => { const hud = __game.hud; const N = 200; const t0 = performance.now(); for (let i = 0; i < N; i++) hud.update(0.016); return (performance.now() - t0) / N; });
  console.log('hud.update ms', t.toFixed(3));
  const t2 = await g.eval(async () => { const p = __game.player; const N = 200; const t0 = performance.now(); for (let i = 0; i < N; i++) { p.update(1/60); p.updateCamera(1/60); } return (performance.now() - t0) / N; });
  console.log('player update+cam ms', t2.toFixed(3));
  await g.hold(['KeyW'], 2);
  console.log(JSON.stringify((await g.state()).render), (await g.state()).fps);
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
