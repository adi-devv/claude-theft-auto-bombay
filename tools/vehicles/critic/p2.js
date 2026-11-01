const L = require('./lib');
(async () => {
  const g = await L.start();
  console.log(JSON.stringify(await g.eval(()=>{const r=__game.roads; return r.edges.filter(e=>e.name==='Marine Drive').map(e=>({a:e.a,b:e.b,lanes:e.lanes,med:e.median,lw:e.laneWidth,w:e.width,pts:e.pts.length, p:e.pts.map(p=>[Math.round(p.x),Math.round(p.z)]).slice(0,6)}));})));
  // lane starts
  console.log(JSON.stringify(await g.eval(()=>{const r=__game.roads; const e=r.edges.find(e=>e.name==='Marine Drive'&&e.a==='MD_C'); return [0,1,2].map(l=>[l,r.lanePoint(e,80,1,l)]);})));
  await g.close();
})();
