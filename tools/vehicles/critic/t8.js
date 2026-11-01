// player blocks a lane / whole street; traffic reaction
const L = require('./lib'); const fs=require('fs');
(async () => {
  const g = await L.start(); await L.installMD(g); await L.installPop(g);
  const scen = [
    {name:'md-lane', type:'sedan', place:`const p=MD.lanePt(430,1,1); return [p.x,p.z,Math.atan2(p.hx,p.hz)];`, secs:50},
    {name:'bazargate-bus', type:'bus', place:`const e=G.roads.edges.find(e=>e.name==='Bazargate Street'&&e.a==='DN1'); const p=G.roads.sample(e,70); return [p.x,p.z,Math.atan2(p.tx,p.tz)+Math.PI/2];`, secs:60},
    {name:'vn-block-sedan', type:'sedan', place:`const e=G.roads.edges.find(e=>e.name==='Veer Nariman Rd'&&e.a==='MK_VN'); const p=G.roads.lanePoint(e,60,1,0); return [p.x,p.z,Math.atan2(p.hx,p.hz)+Math.PI/2];`, secs:50},
  ];
  for (const sc of scen) {
    const pos = await g.eval(`(()=>{const G=__game; ${sc.place}})()`);
    await g.eval(({type,pos})=>{ const G=__game; G.wanted.clear(); G.debug.teleport(pos[0],pos[1],pos[2]); G.debug.spawnCar(type); const v=G.player.vehicle; v.position.set(pos[0],0,pos[2]*0+pos[1]); v.heading=pos[2]; v.setControls({handbrake:true}); window.BLK=[]; },{type:sc.type,pos});
    await g.wait(1);
    const t0=Date.now(); const rows=[]; let shot1=false, shot2=false;
    while((Date.now()-t0)/1000<sc.secs){
      const d=await g.eval(()=>{const G=__game,v=G.player.vehicle,pp=v.position; v.setControls({handbrake:true,throttle:0,brake:0}); const near=G.vehicles.filter(o=>o!==v&&o.driver&&o.driver.kind==='traffic').map(o=>({d:Math.hypot(o.position.x-pp.x,o.position.z-pp.z),sp:Math.abs(o.speed)*3.6})).filter(o=>o.d<70);
        const tr=G.debug.extra.traffic(); return {t:+G.time.toFixed(1),n:near.length,stopped:near.filter(o=>o.sp<2).length,moving:near.filter(o=>o.sp>=5).length,minD:near.length?Math.round(Math.min(...near.map(o=>o.d))):null,tr:{stuck:tr.stuck,waiting:tr.waiting,honks:tr.honks,forced:tr.forced,recycled:tr.recycled,coll:tr.collisionsLastMin,aiHits:tr.aiHitsTotal,why:tr.why},aiaa:obs.coll.filter(c=>!c.pl&&c.aAI&&c.bAI).length,pl:obs.coll.filter(c=>c.pl).length}; });
      rows.push(d);
      const el=(Date.now()-t0)/1000; if(!shot1&&el>18){shot1=true;await g.shot('block-'+sc.name+'-18s');} if(!shot2&&el>sc.secs-4){shot2=true;await g.shot('block-'+sc.name+'-end');}
      await g.wait(1);
    }
    const last=rows[rows.length-1];
    console.log(sc.name,'max queue within 70m',Math.max(...rows.map(r=>r.n)),'max stopped',Math.max(...rows.map(r=>r.stopped)),'moving-near at end',last.moving,'honks',last.tr.honks,'stuck',last.tr.stuck,'forced',last.tr.forced,'AI-AI collisions',last.aiaa,'player collisions',last.pl,'why',JSON.stringify(last.tr.why));
    console.log(' timeline(n,stopped,moving,stuck):',rows.filter((_,i)=>i%6===0).map(r=>`${r.t}:${r.n}/${r.stopped}/${r.moving}/${r.tr.stuck}`).join(' '));
  }
  const pop=await g.eval(()=>({appear:POP.appear,vanish:POP.vanish}));
  console.log('pop appear',JSON.stringify(pop.appear.slice(0,10)),'vanish',JSON.stringify(pop.vanish.slice(0,10)));
  await g.close();
})().catch(e=>{console.error(e);process.exit(1)});
