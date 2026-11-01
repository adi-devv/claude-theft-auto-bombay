// steering / handbrake / reverse / weave telemetry (stepped sim)
const L = require('./lib'); const fs=require('fs');
const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a};
const AP = `const near=MD.near(v.position.x,v.position.z); const look=Math.max(8,Math.abs(v.speed)*0.7); const tp=MD.lanePt(near.s+look,1,1); const want=Math.atan2(tp.x-v.position.x,tp.z-v.position.z); let e=want-v.heading; while(e>Math.PI)e-=2*Math.PI; while(e<-Math.PI)e+=2*Math.PI; const pwm=Math.min(1,Math.abs(e)/0.12); S.acc=(S.acc||0)+pwm; const on=S.acc>=1; if(on)S.acc-=1; K('KeyA',on&&e>0); K('KeyD',on&&e<0);`;
const slip=(s)=>Math.hypot(s.vx,s.vz)>4?Math.abs(wrap(Math.atan2(s.vx,s.vz)-s.h))*180/Math.PI:0;
(async () => {
  const g = await L.start(); await L.installMD(g); const out = {};
  async function setup(type, s=170, lane=1) {
    await g.eval(({type,s,lane}) => { const G=__game; G.wanted.clear(); const p=MD.lanePt(s,1,lane); G.debug.teleport(p.x,p.z,Math.atan2(p.hx,p.hz)); G.debug.spawnCar(type); }, {type,s,lane});
    await g.wait(0.3); await L.clean(g); await g.eval(()=>__game.debug.step(0.5));
  }
  const reach = (kmh)=>`if(!S.ph){S.ph=1;} if(S.ph===1){ K('KeyW',true); ${AP} if(v.speed*3.6>=${kmh}){S.ph=2;S.t0=t;} }`;
  for (const type of ['sedan','taxi','bus','hatch']) {
    const r = out[type] = {};
    for (const kmh of (type==='bus'?[40]:type==='taxi'?[50,90]:[50,100])) {
      await setup(type,40,1);
      const a = await L.sim(g, 26, reach(kmh)+` if(S.ph===2){ K('KeyA',true); K('KeyW',true); if(t-S.t0>=0.4){S.ph=3;S.t1=t;K('KeyA',false);} } else if(S.ph===3){ K('KeyA',false); K('KeyW',true); if(t-S.t1>=1.5) S.ph=4; }`, 1);
      const seg=a.filter(s=>s.ph===2||s.ph===3||s.ph===4); const s0=seg[0];
      const steer=a.filter(s=>s.ph===2); const sN=steer[steer.length-1];
      const yrMax=Math.max(...seg.map(s=>Math.abs(s.yr))); const t50=seg.find(s=>Math.abs(s.yr)>0.5*yrMax);
      const lat=Math.max(...seg.map(s=>Math.abs(Math.hypot(s.vx,s.vz)*s.yr)));
      const rec=seg.filter(s=>s.ph===4); 
      r['steer'+kmh]={kmh0:+s0.kmh.toFixed(0),kmhEnd:+sN.kmh.toFixed(0),dHeadingDeg:+(wrap(sN.h-s0.h)*180/Math.PI).toFixed(1),yawRateMax:+yrMax.toFixed(2),latG:+(lat/9.81).toFixed(2),slipMaxDeg:+Math.max(...seg.map(slip)).toFixed(1),tHalfYaw:+(t50.t-s0.t).toFixed(2),camDistMin:+Math.min(...seg.map(s=>s.cd)).toFixed(1),camDistMax:+Math.max(...seg.map(s=>s.cd)).toFixed(1),fov:+s0.fov.toFixed(1),camLagDegEnd:+(wrap(sN.ca-(sN.h+Math.PI))*180/Math.PI).toFixed(1),slipEndRecover:+slip(rec[rec.length-1]).toFixed(1),yawRateEndRecover:+rec[rec.length-1].yr.toFixed(2),hpLoss:+(s0.hp-a[a.length-1].hp).toFixed(0)};
      console.log(type,kmh,'steer',JSON.stringify(r['steer'+kmh]));
      if(type==='sedan') fs.writeFileSync(__dirname+`/tel-steer-${type}-${kmh}.json`, JSON.stringify(seg.filter((_,i)=>i%3==0)));
    }
    if (type==='sedan'||type==='taxi'||type==='hatch'){
      for (const mode of (type==='taxi'?['hb60']:['hb60','hb100'])) {
        const kmh=mode==='hb60'?60:100; await setup(type,40,1);
        const a = await L.sim(g, 24, reach(kmh)+` if(S.ph===2){ K('KeyW',false); K('Space',true); K('KeyA',true); if(t-S.t0>=1.0){S.ph=3;S.t1=t;K('Space',false);K('KeyA',false);} } else if(S.ph===3){ if(t-S.t1>=3) S.ph=4; }`, 1);
        const seg=a.filter(s=>s.ph>=2); let cum=0,pv=seg[0].h,maxcum=0; for(const s of seg){cum+=wrap(s.h-pv);pv=s.h;}
        const at1=seg.find(s=>s.t-seg[0].t>=1.0), at2=seg.find(s=>s.t-seg[0].t>=2.0), at4=seg[seg.length-1];
        // time to settle: yaw rate small and slip small
        const settle=seg.find((s,i)=>i>60&&Math.abs(s.yr)<0.3&&slip(s)<20);
        r[mode]={totalYawDeg:+(cum*180/Math.PI).toFixed(0),kmh0:+seg[0].kmh.toFixed(0),kmhAfter1s:+at1.kmh.toFixed(0),kmhAfter2s:+at2.kmh.toFixed(0),kmhEnd:+at4.kmh.toFixed(0),yrPeak:+Math.max(...seg.map(s=>Math.abs(s.yr))).toFixed(2),slipMax:+Math.max(...seg.map(slip)).toFixed(0),settleT:settle?+(settle.t-seg[0].t).toFixed(2):null,hpLoss:+(seg[0].hp-at4.hp).toFixed(0)};
        console.log(type,mode,JSON.stringify(r[mode]));
      }
      // drift hold: handbrake flick then throttle + hold steer
      await setup(type,40,1);
      const dr = await L.sim(g, 20, reach(70)+` if(S.ph===2){ K('KeyW',false); K('Space',true); K('KeyA',true); if(t-S.t0>=0.5){S.ph=3;S.t1=t;K('Space',false);} } else if(S.ph===3){ K('KeyW',true); K('KeyA',true); if(t-S.t1>=3){S.ph=4;K('KeyA',false);} }`, 1);
      const seg=dr.filter(s=>s.ph===3); const sl=seg.map(slip);
      r.drift={slipMax:+Math.max(...sl).toFixed(0),slipAvgLast1s:+(sl.slice(-60).reduce((a,b)=>a+b,0)/60).toFixed(0),kmhStart:+seg[0].kmh.toFixed(0),kmhEnd:+seg[seg.length-1].kmh.toFixed(0),yawTotalDeg:+(seg.reduce((c,s,i)=>c+(i?wrap(s.h-seg[i-1].h):0),0)*180/Math.PI).toFixed(0)};
      console.log(type,'drift',JSON.stringify(r.drift));
    }
    // reverse
    await setup(type,40,1);
    const rv = await L.sim(g, 6, `K('KeyS',true);`, 1);
    const first=rv.find(s=>s.kmh<=-1), t10=rv.find(s=>s.kmh<=-10);
    r.reverse={maxRevKmh:+Math.min(...rv.map(s=>s.kmh)).toFixed(1),firstMoveT:first?+first.t.toFixed(2):null,t10:t10?+t10.t.toFixed(2):null};
    const fl = await L.sim(g, 3, `K('KeyW',true);`, 1);
    const f5=fl.find(s=>s.kmh>=5);
    r.revToFwd={timeTo5kmh:f5?+f5.t.toFixed(2):null,kmhAt1s:+fl.find(s=>s.t>=1).kmh.toFixed(1)};
    console.log(type,'reverse',JSON.stringify(r.reverse),'revToFwd',JSON.stringify(r.revToFwd));
    if(type==='sedan'){
      await setup(type,40,1);
      const wv = await L.sim(g, 24, reach(80)+` if(S.ph===2){ const k=Math.floor((t-S.t0)/0.45)%2; K('KeyW',true); K('KeyA',k===0); K('KeyD',k===1); if(t-S.t0>=5.4){S.ph=3;K('KeyA',false);K('KeyD',false);} }`, 1);
      const seg=wv.filter(s=>s.ph===2);
      r.weave80={slipMax:+Math.max(...seg.map(slip)).toFixed(0),kmhMin:+Math.min(...seg.map(s=>s.kmh)).toFixed(0),kmhMax:+Math.max(...seg.map(s=>s.kmh)).toFixed(0),yrMax:+Math.max(...seg.map(s=>Math.abs(s.yr))).toFixed(2),hpLoss:+(seg[0].hp-seg[seg.length-1].hp).toFixed(0)};
      console.log('weave80',JSON.stringify(r.weave80));
    }
  }
  fs.writeFileSync(__dirname+'/t2-results.json', JSON.stringify(out,null,1));
  await g.close();
})().catch(e=>{console.error(e);process.exit(1)});
