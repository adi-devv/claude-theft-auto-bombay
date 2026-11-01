// Scan every road segment carriageway + junction box for static colliders (prop/landmark/building) overlapping it.
// Usage: GAME_URL=http://localhost:8765/work/city/ node tools/city/clear.js
// Ignored: roundabout 'island' colliders (inside the ring), 'seawall', 'exit' barricades beyond the exit node, MD median props.
const H = require('../harness');
const path = require('path');
(async () => {
  const g = await H.launch({ out: path.join(__dirname, 'shots'), width: 480, height: 270 });
  const res = await g.eval(() => {
    const G = window.__game, R = G.roads, C = G.collision;
    const IGN = new Set(['island', 'seawall']);
    const hits = new Map();
    const add = (kind, name, x, z, s) => {
      const key = kind + ':' + name + ':' + s.id;
      if (!hits.has(key)) hits.set(key, { kind, name, tag: s.data.tag, x: +x.toFixed(1), z: +z.toFixed(1), shape: s.type, sx: +s.cx.toFixed(1), sz: +s.cz.toFixed(1) });
    };
    const probe = (kind, name, x, z, r) => {
      for (const c of C.queryCircle(x, z, r, [])) if (c.depth > 0.02 && !IGN.has(c.shape.data.tag)) add(kind, name, x, z, c.shape);
    };
    let samples = 0;
    for (const e of R.edges) {
      const na = R.nodes.get(e.a), nb = R.nodes.get(e.b);
      const half = e.width / 2 - 0.2, med = e.median / 2 + 0.3;
      for (let s = 0; s <= e.length; s += 1.5) {
        const p = R.sample(e, s);
        for (let o = -half; o <= half + 1e-6; o += 1.0) {
          if (e.median > 0 && Math.abs(o) < med) continue;
          // exit barricade is beyond the node; skip positions beyond edge ends
          const x = p.x + p.tz * o, z = p.z - p.tx * o;
          probe('edge', e.name + '#' + e.a + '-' + e.b, x, z, 0.45); samples++;
        }
      }
    }
    for (const n of R.nodes.values()) {
      if (n.radius < 1) continue;
      for (let x = -n.radius; x <= n.radius; x += 1.5) for (let z = -n.radius; z <= n.radius; z += 1.5) {
        if (x * x + z * z > n.radius * n.radius) continue;
        if (n.exit) continue; probe("junction", n.id, n.x + x, n.z + z, 0.45); samples++;
      }
    }
    return { samples, hits: [...hits.values()], errors: G.errors };
  });
  const by = {};
  for (const h of res.hits) { const k = h.kind + ' ' + h.name + ' [' + h.tag + ']'; (by[k] = by[k] || []).push(h); }
  for (const k of Object.keys(by)) console.log(k, 'x' + by[k].length, 'e.g.', JSON.stringify(by[k][0]));
  console.log('samples', res.samples, 'OVERLAPS', res.hits.length, 'errors', JSON.stringify(res.errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
