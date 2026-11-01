const L = require('./lib');
(async () => {
  const g = await L.start(); await L.installMD(g);
  for (const type of ['suv','hatch']) {
  await g.eval(({type}) => { const G=__game; const p=MD.lanePt(165,1,1); G.debug.teleport(p.x,p.z,Math.atan2(p.hx,p.hz)); G.debug.spawnCar(type); obs.coll.length=0;obs.stat.length=0; },{type});
  await g.wait(0.3); await L.clean(g); await g.wait(0.5);
  console.log(type, JSON.stringify(await g.state().then(s=>s.vehicle)));
  const a = await L.rec(g, async()=>{ await g.hold(['KeyW'],6); });
  console.log(a.filter((_,i)=>i%40==0).map(s=>[+s.t.toFixed(1),Math.round(s.kmh),+s.x.toFixed(1),+s.z.toFixed(1),+s.h.toFixed(2)].join(',')).join(' | '));
  console.log(JSON.stringify(await g.eval(()=>({stat:obs.stat.filter(s=>s.pl), coll:obs.coll.filter(s=>s.pl)}))));
  }
  await g.shot('dbg-suv'); await g.close();
})();
