const L = require('./lib');
(async () => {
  const g = await L.start();
  const s = await g.state(); console.log(JSON.stringify(s).slice(0, 1500));
  const info = await g.eval(() => { const G = __game; const r = G.roads; return { nodes: [...r.nodes.values()].filter(n => n.roundabout || /FLORA|HORN|REGAL|GATE/.test(n.id)).map(n => ({ id: n.id, x: n.x, z: n.z, r: n.radius, rb: n.roundabout })), spawn: G.roads.spawn, edges: r.edges.map(e => ({ n: e.name, k: e.kind, len: Math.round(e.length), w: e.width, a: e.a, b: e.b, p0: e.pts[0], p1: e.pts[e.pts.length - 1] })).slice(0, 60), dbg: Object.keys(G.debug), pol: Object.keys(G.debug.police) }; });
  console.log(JSON.stringify(info));
  await g.close();
})();
