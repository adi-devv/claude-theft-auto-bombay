// clean steering response test: step input, measure yaw response; AP engaged before, free after for 0.9 s only
const L = require('./lib'); const fs=require('fs');
const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a};
const AP = `const near=MD.near(v.position.x,v.position.z); const look=Math.max(8,Math.abs(v.speed)*0.7); const tp=MD.lanePt(near.s+look,1,1); const want=Math.atan2(tp.x-v.position.x,tp.z-v.position.z); let e=want-v.heading; while(e>Math.PI)e-=2*Math.PI; while(e<-Math.PI)e+=2*Math.PI; const pwm=Math.min(1,Math.abs(e)/0.12); S.acc=(S.acc||0)+pwm; const on=S.acc>=1; if(on)S.acc-=1; K('KeyA',on&&e>0); K('KeyD',on&&e<0);`;
const slip=(s)=>Math.hypot(s.vx,s.vz)>4?Math.abs(wrap(Math.atan2(s.vx,s.vz)-s.h))*180/Math.PI:0;
(async () => {
  const g = await L.start(); await L.installMD(g); const out={};
  for (const [type,speeds] of [['sedan',[30,60,100,140]],['taxi',[30,60,90]],['hatch',[30,60,100]],['suv',[30,60,100]],['bus',[30,50]],['van',[30,60]]]) {
    for (const kmh of speeds) {
      await g.eval(({type}) => { const G=__game; G.wanted.clear(); const p=MD.lanePt(40,1,1); G.debug.teleport(p.x,p.z,Math.atan2(p.hx,p.hz)); G.debug.spawnCar(type); },{type});
      await g.wait(0.2); await L.clean(g); await g.eval(()=>{__game.debug.step(0.5);obs.coll.length=0;obs.stat.length=0});
      const a = await L.sim(g, 26, `if(!S.ph)S.ph=1; if(S.ph===1){K('KeyW',v.speed*3.6<${kmh}); ${AP} if(v.speed*3.6>=${kmh}-1 && !S.stab){S.stab=t;} if(S.stab&&t-S.stab>1.2){S.ph=2;S.t0=t;K('KeyA',false);K('KeyD',false);} } else if(S.ph===2){ K('KeyW',v.speed*3.6<${kmh}); K('KeyD',true); if(t-S.t0>=0.5){S.ph=3;S.t1=t;K('KeyD',false);} } else if(S.ph===3){ K('KeyW',false); if(t-S.t1>=1.0)S.ph=4; }`,1);
      const seg=a.filter(s=>s.ph===2||s.ph===3); if(!seg.length){console.log(type,kmh,'never reached');continue;}
      const s0=seg[0]; const hits=await g.eval(()=>obs.coll.filter(c=>c.pl).length+obs.stat.filter(c=>c.pl).length);
      const yrMax=Math.max(...seg.map(s=>Math.abs(s.yr))); const t50=seg.find(s=>Math.abs(s.yr)>0.5*yrMax); const t90=seg.find(s=>Math.abs(s.yr)>0.9*yrMax);
      const ph2=seg.filter(s=>s.ph===2); const last2=ph2[ph2.length-1];
      const lat=Math.max(...seg.map(s=>Math.hypot(s.vx,s.vz)*Math.abs(s.yr)));
      const settle=seg.filter(s=>s.ph===3);
      const camHold=Math.max(...seg.map(s=>Math.abs(wrap(s.ca-(s.h+Math.PI))))) *180/Math.PI;
      const r={startKmh:+s0.kmh.toFixed(0),steerRightFor:'0.5s',headingChangeDeg:+(wrap(seg[seg.length-1].h-s0.h)*180/Math.PI).toFixed(1),yawRatePeakRad:+yrMax.toFixed(2),yawRatePeakDeg:+(yrMax*57.3).toFixed(0),tTo50pctYaw:+(t50.t-s0.t).toFixed(2),tTo90pctYaw:+(t90.t-s0.t).toFixed(2),latG:+(lat/9.81).toFixed(2),slipMax:+Math.max(...seg.map(slip)).toFixed(1),yawRateAtRelease:+last2.yr.toFixed(2),yawRate1sAfterRelease:+settle[settle.length-1].yr.toFixed(2),speedLossKmh:+(s0.kmh-settle[settle.length-1].kmh).toFixed(1),camSwingDegMax:+camHold.toFixed(1),fov0:+s0.fov.toFixed(1),camDist:+s0.cd.toFixed(1),hits};
      out[type+'@'+kmh]=r; console.log(type,kmh,JSON.stringify(r));
    }
  }
  fs.writeFileSync(__dirname+'/t2b-results.json', JSON.stringify(out,null,1)); await g.close();
})().catch(e=>{console.error(e);process.exit(1)});
