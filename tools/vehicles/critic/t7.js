const L = require('./lib'); const fs=require('fs');
(async () => {
  const g = await L.start(); await L.installNav(g); await L.installPop(g);
  await g.eval(()=>{ const G=__game;
    window.rbRoute=(id,inIdx,outIdx)=>{ const n=G.roads.nodes.get(id), R=G.roads; const arm=(i)=>n.edges[i]; 
      const lanePts=(ai,inbound)=>{ const {edge,dir}=arm(ai); const nodeIsA=dir>0; const travelDir=inbound?(nodeIsA?-1:1):(nodeIsA?1:-1); const pts=[]; 
        // s measured from a. distance from node d: s = nodeIsA? d : L-d
        const ds=[]; for(let d=70; d>=n.radius-0.5; d-=3) ds.push(d); const seq=inbound?ds:ds.slice().reverse(); for(const d of seq){ const s=nodeIsA?d:edge.length-d; pts.push(R.lanePoint(edge,s,travelDir,0)); } return pts; };
      const inP=lanePts(inIdx,true), outP=lanePts(outIdx,false);
      const e1=inP[inP.length-1], e2=outP[0]; let a1=Math.atan2(e1.z-n.z,e1.x-n.x), a2=Math.atan2(e2.z-n.z,e2.x-n.x); while(a2<=a1) a2+=Math.PI*2;
      const ring=[]; for(let a=a1;a<=a2;a+=0.08) ring.push({x:n.x+Math.cos(a)*n.roundabout,z:n.z+Math.sin(a)*n.roundabout});
      return [...inP.map(p=>({x:p.x,z:p.z})),...ring,...outP.map(p=>({x:p.x,z:p.z}))]; };
    window.rbPlace=(type,pts)=>{ G.wanted.clear(); const p=pts[0],q=pts[3]; G.debug.teleport(p.x,p.z,Math.atan2(q.x-p.x,q.z-p.z)); G.debug.spawnCar(type); };
  });
  const rows={};
  const cases=[['FLORA',0,1,'W->E'],['FLORA',3,2,'S->N'],['HORN',0,2,'W->S'],['HORN',1,0,'N->W'],['REGAL',0,2,'W->SE'],['REGAL',1,3,'N->E']];
  for (const [id,i,o,label] of cases) {
    await g.eval(({id,i,o})=>{ const pts=rbRoute(id,i,o); window.RB=pts; rbPlace('sedan',pts); },{id,i,o});
    await g.wait(1.5);
    await g.eval(()=>{ obs.coll.length=0; obs.stat.length=0; AP2.setPts(RB,32); });
    const t0=Date.now(); let last=null, st=0, minGap=99, shotIn=false, shotMid=false, lead=0; const samples=[];
    while(Date.now()-t0<60000){
      const d=await g.eval(({id})=>{ const G=__game,v=G.player.vehicle,n=G.roads.nodes.get(id); const dc=Math.hypot(v.position.x-n.x,v.position.z-n.z); let mg=99; for(const o of G.vehicles){ if(o===v) continue; const dd=Math.hypot(o.position.x-v.position.x,o.position.z-v.position.z); if(dd<mg) mg=dd; } const nearRing=G.vehicles.filter(o=>o!==v&&Math.hypot(o.position.x-n.x,o.position.z-n.z)<n.radius+10).map(o=>({sp:Math.abs(o.speed)*3.6,k:(o.driver&&o.driver.kind)||'p',cw:((o.position.x-n.x)*o.velocity.z-(o.position.z-n.z)*o.velocity.x)})); return {x:v.position.x,z:v.position.z,kmh:v.speed*3.6,dc,mg,done:AP2.done,pc:obs.coll.filter(c=>c.pl).length,ps:obs.stat.filter(c=>c.pl).length,hp:v.health,ring:nearRing,fps:G.fps}; },{id});
      samples.push(d);
      minGap=Math.min(minGap,d.mg);
      if(!shotIn && d.dc<n_r(id)+25 && d.dc>n_r(id)+10){ shotIn=true; await g.shot(`rb-${id}-${label.replace(/[^A-Z]/g,'')}-approach`); }
      if(!shotMid && d.dc<n_r(id)+3 ){ shotMid=true; await g.shot(`rb-${id}-${label.replace(/[^A-Z]/g,'')}-ring`); }
      if(d.done) break;
      if(last&&Math.hypot(last.x-d.x,last.z-d.z)<0.6) st+=0.4; else st=0; last=d; if(st>=6) break;
      await g.wait(0.4);
    }
    await g.eval(()=>AP2.stop());
    const end=samples[samples.length-1];
    const res={label,done:end.done,stuckAt:end.done?null:[Math.round(end.x),Math.round(end.z)],timeS:+((Date.now()-t0)/1000).toFixed(0),minGapM:+minGap.toFixed(1),playerColl:end.pc,playerStatic:end.ps,hpLoss:1000-end.hp,maxRingCars:Math.max(...samples.map(s=>s.ring.length)),ringMovingCCW:samples.reduce((a,s)=>a+s.ring.filter(r=>r.sp>5&&r.cw<-0.5).length,0),ringMovingCW:samples.reduce((a,s)=>a+s.ring.filter(r=>r.sp>5&&r.cw>0.5).length,0)};
    rows[id+' '+label]=res; console.log(id,label,JSON.stringify(res));
  }
  const pop=await g.eval(()=>({tr:__game.debug.extra.traffic(),aiaa:obs.coll.filter(c=>!c.pl&&c.aAI&&c.bAI).length}));
  console.log('traffic',JSON.stringify(pop));
  fs.writeFileSync(__dirname+'/t7-results.json',JSON.stringify(rows,null,1));
  await g.close();
  function n_r(id){ return {FLORA:23,HORN:40,REGAL:30.5}[id]; }
})().catch(e=>{console.error(e);process.exit(1)});
