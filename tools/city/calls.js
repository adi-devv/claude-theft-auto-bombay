const H = require('../harness'); const path = require('path');
(async () => {
  const g = await H.launch({ out: path.join(__dirname, 'shots'), width: 960, height: 540 });
  await g.eval(() => { const G = window.__game; G.city.timeScale = 0; G.player.updateCamera = () => {}; const c = G.camera; c.position.set(-150, 1100, 60); c.up.set(0, 0, -1); c.lookAt(-150, 0, 0); c.updateMatrixWorld(); });
  await g.wait(1);
  const r = await g.eval(async () => {
    const G = window.__game; const out = {};
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(G.renderer.info.render.calls))));
    out.all = await frame();
    const vis = []; G.vehicles.forEach((v) => { vis.push([v.mesh, v.mesh.visible]); v.mesh.visible = false; });
    out.noVeh = await frame();
    vis.forEach(([m, v]) => (m.visible = v));
    out.nVeh = G.vehicles.length;
    let nc = 0; G.scene.traverse((o) => { if (o.castShadow && o.isMesh) nc++; }); out.shadowCasters = nc;
    const kids = {}; G.scene.children.forEach((o) => { const k = o.type + (o.isInstancedMesh ? '/inst' : ''); kids[k] = (kids[k] || 0) + 1; }); out.kids = kids;
    return out;
  });
  console.log(JSON.stringify(r)); await g.close();
})();
