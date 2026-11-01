// random-walk stress: no escaping land, no sinking into colliders, no NaN
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 640, height: 360 });
  await g.wait(1);
  const res = await g.eval(() => {
    const G = __game, p = G.player, inp = G.input, out = { trials: 0, offLand: 0, inCollider: 0, nan: 0, stuck: 0, worst: [] };
    let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const B = G.roads.bounds;
    const combos = [['KeyW'], ['KeyW', 'KeyA'], ['KeyW', 'KeyD'], ['KeyS'], ['KeyA'], ['KeyD'], ['KeyW', 'ShiftLeft']];
    for (let t = 0; t < 80; t++) {
      let x, z, tries = 0;
      do { x = B.minX + rnd() * (B.maxX - B.minX); z = B.minZ + rnd() * (B.maxZ - B.minZ); tries++; } while (tries < 200 && (!G.roads.isLand(x, z) || G.collision.queryCircle(x, z, 0.6).length));
      G.debug.teleport(x, z, rnd() * 6.28); G.debug.step(0.3);
      const c = combos[(rnd() * combos.length) | 0];
      for (const k of c) inp.setKey(k, true);
      let moved = 0, lx = p.position.x, lz = p.position.z, still = 0;
      for (let s = 0; s < 40; s++) {
        if (s % 8 === 0) { // change camera yaw randomly
          p.footCam.yaw += (rnd() - 0.5) * 3;
        }
        G.debug.step(0.25);
        if (!Number.isFinite(p.position.x + p.position.z)) { out.nan++; break; }
        if (!G.roads.isLand(p.position.x, p.position.z)) { out.offLand++; out.worst.push(['land', t, p.position.x, p.position.z]); break; }
        const hit = G.collision.queryCircle(p.position.x, p.position.z, p.radius * 0.8);
        if (hit.length) { out.inCollider++; out.worst.push(['col', t, +p.position.x.toFixed(1), +p.position.z.toFixed(1), JSON.stringify(hit.map(h=>({k:Object.keys(h),...h})).slice(0,2))]); break; }
        const d = Math.hypot(p.position.x - lx, p.position.z - lz); if (d < 0.2) still++; lx = p.position.x; lz = p.position.z;
      }
      for (const k of c) inp.setKey(k, false);
      if (still > 30) out.stuck++;
      out.trials++;
    }
    return out;
  });
  console.log(JSON.stringify(res));
  console.log('errors', JSON.stringify((await g.state()).errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
