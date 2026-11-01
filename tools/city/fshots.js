// Close-up screenshots of street furniture: node tools/city/fshots.js "bus,kiosk,cart,hoard" [hour] [n per type]
const H = require('../harness'); const path = require('path');
(async () => {
  const types = (process.argv[2] || 'bus,kiosk,cart,hoard').split(','); const hour = Number(process.argv[3] ?? 18.4); const per = Number(process.argv[4] || 1);
  const g = await H.launch({ out: path.join(__dirname, 'shots'), width: 960, height: 540 });
  await g.eval((h) => { const G = window.__game; G.city.setTimeOfDay(h); G.city.timeScale = 0; G.paused = true; G.player.updateCamera = () => {}; }, hour);
  for (const t of types) {
    const items = (await g.eval(() => window.__game.city.furniture)).filter((i) => i[0] === t);
    for (let k = 0; k < per; k++) {
      const it = items[Math.floor((items.length * (k + 0.5)) / per)]; if (!it) continue;
      const dist = t === 'hoard' ? 16 : 7;
      if (t === 'hoard') { await g.eval(([a, b, x, z]) => { const c = window.__game.camera; c.position.set(a, 1.8, b); c.up.set(0, 1, 0); c.lookAt(x, 12, z); c.updateMatrixWorld(); }, [it[1], it[2], it[3], it[4]]); await g.wait(0.5); const p = await g.shot(`f_${t}${k}_${String(hour).replace('.', 'h')}`); console.log(t, k, path.basename(p)); continue; }
      await g.eval(([x, z, d]) => { const G = window.__game, c = G.camera; const r = G.roads.nearest(x, z, 40); const nx = r ? (x - r.x) : 0, nz = r ? (z - r.z) : 1; const L = Math.hypot(nx, nz) || 1;
        c.position.set(x - (nx / L) * d * 0.9 + (r ? r.tx : 0) * d * 0.4, 2.2, z - (nz / L) * d * 0.9 + (r ? r.tz : 0) * d * 0.4); c.up.set(0, 1, 0); c.lookAt(x, d > 10 ? 5 : 1.4, z); c.updateMatrixWorld(); }, [it[1], it[2], dist]);
      await g.wait(0.5);
      const p = await g.shot(`f_${t}${k}_${String(hour).replace('.', 'h')}`); console.log(t, k, it[1].toFixed(0), it[2].toFixed(0), path.basename(p));
    }
  }
  console.log(JSON.stringify(await g.state().then((s) => s.errors))); await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
