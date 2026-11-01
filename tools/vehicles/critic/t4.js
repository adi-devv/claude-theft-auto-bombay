// collision response
const L = require('./lib'); const fs=require('fs');
const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a};
(async () => {
  const g = await L.start(); const out={};
  async function place(type,x,z,h){ await g.eval(({type,x,z,h})=>{const G=__game; G.wanted.clear(); G.debug.teleport(x,z,h); G.debug.spawnCar(type); },{type,x,z,h}); await g.wait(0.2); await L.clean(g); await g.eval(()=>{__game.debug.step(0.5);obs.coll.length=0;obs.stat.length=0}); }
  const camInside = `let ci=0; { const c=G.camera.position; const q=G.collision.queryCircle(c.x,c.z,0.4); S.ci=(S.ci||0)+(q&&q.length?1:0); }`;
  // A: head-on wall at ~80 km/h
  for (const [type,kmh] of [['sedan',60],['sedan',95],['suv',70],['taxi',55],['bus',40]]) {
    await place(type,-317,316,0);
    const a = await L.sim(g, 14, `${camInside} if(!S.ph){S.ph=1;} if(S.ph===1){K('KeyW',v.speed*3.6<${kmh}); if(v.speed*3.6>=${kmh}-1){S.ph=2;S.t0=t;} } else if(S.ph===2){K('KeyW',v.speed*3.6<${kmh}); if(t-S.t0>6)S.ph=3;} `,1);
    const ph2=a.filter(s=>s.ph===2); const imp=ph2.findIndex((s,i)=>i>0&&ph2[i-1].kmh-s.kmh>8);
    const s0=ph2[0]; const hit=imp>0?ph2[imp]:null;
    const post=imp>0?ph2.slice(imp):[]; 
    const minSp=post.length?Math.min(...post.map(s=>s.sp))*3.6:null;
    const ev=await g.eval(()=>({stat:obs.stat.filter(s=>s.pl).slice(0,8),coll:obs.coll.filter(s=>s.pl).slice(0,4)}));
    const stopT=post.find(s=>Math.abs(s.sp)<0.3);
    const r={kmh0:+s0.kmh.toFixed(0),hitKmh:hit?+ph2[imp-1].kmh.toFixed(0):null,afterHit:post.slice(0,12).filter((_,i)=>i%2==0).map(s=>Math.round(s.kmh)),reboundKmh:minSp===null?null:+minSp.toFixed(1),yawPeak:post.length?+Math.max(...post.map(s=>Math.abs(s.yr))).toFixed(2):null,hpLoss:+(s0.hp-a[a.length-1].hp).toFixed(0),hp0:+s0.hp.toFixed(0),hpEnd:+a[a.length-1].hp.toFixed(0),tToRest:stopT&&hit?+(stopT.t-hit.t).toFixed(2):null,staticEvents:ev.stat.length,staticImp:ev.stat.map(s=>s.imp).slice(0,6),camInsideSolidFrames:await g.eval(()=>0),camDistMinPost:post.length?+Math.min(...post.map(s=>s.cd)).toFixed(1):null,camDistMax:+Math.max(...ph2.map(s=>s.cd)).toFixed(1)};
    out['wall-'+type+kmh]=r; console.log('wall',type,kmh,JSON.stringify(r));
    if(type==='sedan'&&kmh===95){ await g.shot('crash-wall-130-rest'); }
  }
  // B: glancing along a wall (Madame Cama Rd? use JT road, steer east 15 deg)
  for (const [type,kmh,bias] of [['sedan',80,-0.2],['sedan',80,-0.35],['taxi',60,-0.25]]) {
    await place(type,-317,330,0);
    await g.eval(({bias})=>{const v=__game.player.vehicle; v.heading+=bias; window.hits=[]; const orig=v._contact.bind(v); v._contact=c=>{if(c.vn>0.5) hits.push({x:v.position.x,z:v.position.z,nx:c.nx,nz:c.nz,vn:c.vn,vt:c.vt,h:v.heading,tag:c.shape?.tag}); orig(c)};},{bias});
    const a = await L.sim(g, 12, `if(!S.ph){S.ph=1;} if(S.ph===1){K('KeyW',v.speed*3.6<${kmh});} K('KeyW',true);`,1);
    const ev=await g.eval(()=>({stat:obs.stat.filter(s=>s.pl).length,imp:obs.stat.filter(s=>s.pl).map(s=>s.imp).slice(0,10)}));
    console.log('DETAIL',JSON.stringify(await g.eval(()=>window.hits))); const mx=Math.max(...a.map(s=>s.kmh)); const end=a[a.length-1];
    const r={bias,maxKmh:+mx.toFixed(0),endKmh:+end.kmh.toFixed(0),endHeadingVsStreetDeg:+(wrap(end.h-0)*180/Math.PI).toFixed(0),staticEvents:ev.stat,impSamples:ev.imp,hpLoss:+(a[0].hp-end.hp).toFixed(0),endPos:[+end.x.toFixed(1),+end.z.toFixed(1)]};
    out['glance-'+type+bias]=r; console.log('glance',type,JSON.stringify(r));
  }
  // C: car-car: stationary spawned taxi/bus ahead
  for (const [type,kmh,other] of [['sedan',60,'taxi'],['sedan',60,'bus'],['suv',80,'sedan'],['taxi',50,'hatch']]) {
    await place(type,-317,230,0);
    await g.eval(({other})=>{const G=__game; const v=G.player.vehicle; const o=G.createVehicle({type:other,x:v.position.x,z:v.position.z+45,heading:0}); window.TGT=o; o.setControls({handbrake:true}); },{other});
    const a = await L.sim(g, 9, `if(!S.ph){S.ph=1;} K('KeyW',v.speed*3.6<${kmh}); if(S.ph===1&&G.player.vehicle.position.z>${230+5}){S.ph=2;}`,1);
    const o=await g.eval(()=>{const o=TGT; const r={x:o.position.x,z:o.position.z,hp:o.health,sp:o.speed*3.6,h:o.heading}; return r;});
    const ev=await g.eval(()=>({coll:obs.coll.filter(s=>s.pl).slice(0,6)}));
    const idx=a.findIndex((s,i)=>i>0&&a[i-1].kmh-s.kmh>6);
    const end=a[a.length-1];
    const r={player:type,other,hitKmh:idx>0?+a[idx-1].kmh.toFixed(0):null,afterKmh:a.slice(idx,idx+14).filter((_,i)=>i%2==0).map(s=>Math.round(s.kmh)),yawPeak:+Math.max(...a.slice(Math.max(idx,0)).map(s=>Math.abs(s.yr))).toFixed(2),targetMovedM:+(o.z-(230+45)).toFixed(1),targetSideM:+(o.x+317).toFixed(1),targetHp:+o.hp.toFixed(0),playerHpLoss:+(a[0].hp-end.hp).toFixed(0),collEvents:ev.coll.length,imp:ev.coll.map(c=>c.imp),relSpd:ev.coll.map(c=>c.rel)};
    out['car-'+type+'-'+other]=r; console.log('car',JSON.stringify(r));
  }
  fs.writeFileSync(__dirname+'/t4-results.json', JSON.stringify(out,null,1)); await g.close();
})().catch(e=>{console.error(e);process.exit(1)});

