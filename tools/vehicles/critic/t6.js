// traffic tour with real traffic on: Veer Nariman Rd -> Flora -> Horniman -> Regal; pop-in, density, AI behaviour
const L = require('./lib'); const fs=require('fs');
(async () => {
  const g = await L.start(); await L.installNav(g); await L.installPop(g);
  await g.eval(()=>{ const G=__game; G.wanted.clear(); const e=G.roads.edges.find(e=>e.name==='Veer Nariman Rd'&&e.a==='MK_VN'); const p=G.roads.lanePoint(e,20,1,0); G.debug.teleport(p.x,p.z,Math.atan2(p.hx,p.hz)); G.debug.spawnCar('sedan'); });
  await g.wait(3);
  const legs=[['horn',250,105],['regal',112,345],['cst',125,-375]];
  const rows=[]; const shots={};
  const sample=async(label)=>{ const d=await g.eval(()=>{ const G=__game, v=G.player.vehicle, pp=v.position; const near=G.vehicles.filter(o=>o!==v).map(o=>({d:Math.hypot(o.position.x-pp.x,o.position.z-pp.z),sp:Math.abs(o.speed)*3.6,t:o.type,k:o.driver&&o.driver.kind})).filter(o=>o.d<40);
    const ex=G.debug.extra; return {t:+G.time.toFixed(1),x:Math.round(pp.x),z:Math.round(pp.z),kmh:Math.round(v.speed*3.6),fps:Math.round(G.fps),calls:G.renderer.info.render.calls,tris:G.renderer.info.render.triangles,near:near.length,nearMoving:near.filter(o=>o.sp>3).length,tr:ex.traffic(),road:G.roads.roadNameAt(pp.x,pp.z),hp:Math.round(v.health),pc:G.obs?0:obs.coll.filter(c=>c.pl).length,ps:obs.stat.filter(c=>c.pl).length,aiaa:obs.coll.filter(c=>!c.pl&&c.aAI&&c.bAI).length,node:(()=>{for(const n of G.roads.nodes.values()){ if(n.roundabout&&Math.hypot(n.x-pp.x,n.z-pp.z)<n.radius+4) return n.id;} return null;})()}; });
    d.label=label; rows.push(d); return d; };
  for (const [name,tx,tz] of legs) {
    const r = await g.eval(({tx,tz})=>AP2.go(tx,tz,45),{tx,tz}); console.log('route',name,JSON.stringify(r));
    if(!r) continue;
    const t0=Date.now(); let stuckT=0, lastP=null;
    while(Date.now()-t0<110000){
      const d=await sample(name);
      if(d.node && !shots[d.node]){ shots[d.node]=1; await g.shot('roundabout-'+d.node+'-in'); }
      if(d.node && shots[d.node]===1 && Math.random()<0.3){ shots[d.node]=2; await g.shot('roundabout-'+d.node+'-mid'); }
      const done=await g.eval(()=>AP2.done); if(done) break;
      if(lastP && Math.hypot(lastP.x-d.x,lastP.z-d.z)<1.0){ stuckT+=0.5; } else stuckT=0; lastP=d;
      if(stuckT>=8){ console.log('player stuck at',d.x,d.z,'near',d.near,'road',d.road); await g.shot('stuck-'+name); await g.eval(()=>{const v=__game.player.vehicle; AP2.stop();}); break; }
      await g.wait(0.5);
    }
    await g.eval(()=>AP2.stop());
    console.log('leg',name,'done samples',rows.length);
  }
  const pop=await g.eval(()=>({POP:window.POP,tr:__game.debug.extra.traffic(),obs:{coll:obs.coll.length,collPl:obs.coll.filter(c=>c.pl).length,stat:obs.stat.filter(c=>c.pl).length,aiaa:obs.coll.filter(c=>!c.pl&&c.aAI&&c.bAI).length, ped:obs.ped.length}, fr:(()=>{const f=obs.frames.slice(); f.sort((a,b)=>a-b); return {n:f.length,p50:f[Math.floor(f.length*.5)],p95:f[Math.floor(f.length*.95)],p99:f[Math.floor(f.length*.99)],max:f[f.length-1],over33:f.filter(x=>x>33).length,over50:f.filter(x=>x>50).length};})()}));
  fs.writeFileSync(__dirname+'/t6-results.json',JSON.stringify({rows,pop},null,0));
  const fps=rows.map(r=>r.fps); console.log('fps min/avg',Math.min(...fps),(fps.reduce((a,b)=>a+b,0)/fps.length).toFixed(0),'calls max',Math.max(...rows.map(r=>r.calls)),'tris max',Math.max(...rows.map(r=>r.tris)));
  console.log('POP appear in view',pop.POP.appear.length,'vanish in view',pop.POP.vanish.length,'total new',pop.POP.n);
  console.log(JSON.stringify(pop.POP.appear.slice(0,15)),JSON.stringify(pop.POP.vanish.slice(0,15)));
  console.log('traffic',JSON.stringify(pop.tr),'obs',JSON.stringify(pop.obs),'frames',JSON.stringify(pop.fr));
  console.log('player hp end',rows[rows.length-1].hp);
  await g.close();
})().catch(e=>{console.error(e);process.exit(1)});
