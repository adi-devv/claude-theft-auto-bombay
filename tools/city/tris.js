// prints triangle counts per mesh kind (instanced counted × count)
const H = require('../harness');
(async () => {
  const { page, browser } = await H.launch({ width: 640, height: 360 });
  await page.goto((process.env.GAME_URL || 'http://localhost:8765/work/city/') + '?test=1');
  await page.waitForFunction(() => window.__game && window.__game.city, null, { timeout: 60000 });
  const r = await page.evaluate(() => {
    const out = {}; const G = window.__game;
    G.scene.traverse((o) => {
      if (!o.isMesh && !o.isPoints) return;
      const g = o.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      const k = (o.isInstancedMesh ? 'inst:' : '') + (o.material.name || o.material.type) + (o.name ? ':' + o.name : '');
      out[k] = (out[k] || 0) + Math.round(n * (o.isInstancedMesh ? o.count : (g.instanceCount && g.instanceCount !== Infinity ? g.instanceCount : 1)));
    });
    return { out, extra: G.debug.extra.city() };
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
