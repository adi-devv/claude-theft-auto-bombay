const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  const r = await g.eval(() => { const sg = __game.debug.traffic.sig; const out = []; const N = __game.roads.nodes;
    for (const c of sg.ctrl) out.push([c.node.id, Math.round(c.node.x), Math.round(c.node.z), c.groups.length]);
    for (const id of ['FLORA','HORN','REGAL','GATE']) { const n = N.get(id); if (n) out.push([id, Math.round(n.x), Math.round(n.z), n.ai.kind]); }
    return out; });
  console.log(JSON.stringify(r));
  console.log(Object.keys(await g.eval(() => __game.debug.traffic)));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
