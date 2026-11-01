// per-vehicle accel / brake / top speed on Marine Drive northbound; deterministic stepped sim (same input path via setKey)
const L = require('./lib'); const fs=require('fs');
const VMAX={taxi:112,hatch:132,sedan:162,suv:150,van:104,bus:72,police:172};
const AP = `const near=MD.near(v.position.x,v.position.z); const look=Math.max(8,Math.abs(v.speed)*0.7); const tp=MD.lanePt(near.s+look,1,S.lane??1); const want=Math.atan2(tp.x-v.position.x,tp.z-v.position.z); let e=want-v.heading; while(e>Math.PI)e-=2*Math.PI; while(e<-Math.PI)e+=2*Math.PI; const pwm=Math.min(1,Math.abs(e)/0.12); S.acc=(S.acc||0)+pwm; const on=S.acc>=1; if(on)S.acc-=1; K('KeyA',on&&e>0); K('KeyD',on&&e<0);`;
(async () => {
  const g = await L.start(); await L.installMD(g); const res={};
  async function setup(type, s, lane=1, bias=0) {
    await g.eval(({type,s,lane,bias}) => { const G=__game; G.wanted.clear(); window.AP=null; const p=MD.lanePt(s,1,lane); G.debug.teleport(p.x,p.z,Math.atan2(p.hx,p.hz)+bias); G.debug.spawnCar(type); }, {type,s,lane,bias});
    await g.wait(0.3); await L.clean(g); await g.eval(()=>__game.debug.step(0.5));
  }
  for (const t of Object.keys(VMAX)) {
    await setup(t,170,0,0.045);
    const tgt=Math.min(100,0.92*VMAX[t]);
    const a = await L.sim(g, t==='bus'?25:20, `K('KeyW',true);`, 1);
    // trim: samples after reaching target are coasting; keep until target
    const idx=a.findIndex(s=>s.kmh>=tgt-0.01); const aa=idx>0?a.slice(0,idx+1):a;
    const at=(k)=>{const r=aa.find(s=>s.kmh>=k); return r? +r.t.toFixed(2):null};
    // brake from speed: need car at speed -> second run: accelerate then brake at tgt
    await setup(t,170,0,0.045);
    const b = await L.sim(g, 14, `if(!S.b){K('KeyW',true); if(v.speed*3.6>=${tgt}){S.b=true;S.t0=t;}} else {K('KeyW',false);K('KeyS',true);}`, 1);
    const bi=b.findIndex((s,i)=>i>0&&b[i-1].t>=0 && s.t>=b.find(q=>true).t && false);
    // find brake start index: first sample where kmh>=tgt
    const i0=b.findIndex(s=>s.kmh>=tgt-0.01); const bb=b.slice(i0);
    const iStop=bb.findIndex(s=>s.sp<0.3); let dist=0; for(let i=1;i<(iStop>0?iStop:bb.length);i++) dist+=Math.hypot(bb[i].x-bb[i-1].x,bb[i].z-bb[i-1].z);
    const hits=await g.eval(()=>obs.coll.filter(c=>c.pl).length+obs.stat.filter(c=>c.pl).length);
    res[t]={tgt:+tgt.toFixed(0),t50:at(50),t100:at(100),tTarget:idx>0?+aa[aa.length-1].t.toFixed(2):null,brakeFromKmh:+bb[0].kmh.toFixed(1),brakeDistM:+dist.toFixed(1),brakeT:iStop>0?+(bb[iStop].t-bb[0].t).toFixed(2):null,hits};
    console.log(t,JSON.stringify(res[t]));
    fs.writeFileSync(__dirname+`/tel-accel-${t}.json`, JSON.stringify({a:aa.filter((_,i)=>i%6==0),b:bb.filter((_,i)=>i%6==0)}));
  }
  // top speed with PWM autopilot
  for (const t of Object.keys(VMAX)) {
    await setup(t,30,1);
    await g.eval(()=>{obs.coll.length=0;obs.stat.length=0});
    const a = await L.sim(g, t==='bus'?30:26, `K('KeyW',true);`+AP, 3);
    const mx=a.reduce((m,s)=>s.kmh>m.kmh?s:m,a[0]);
    const hit=await g.eval(()=>obs.coll.filter(c=>c.pl).length+obs.stat.filter(c=>c.pl).length);
    const tt=(k)=>{const r=a.find(s=>s.kmh>=k*mx.kmh); return r?+r.t.toFixed(1):null};
    res[t].top={maxKmh:+mx.kmh.toFixed(1),t90pct:tt(0.9),t98pct:tt(0.98),fovAtTop:+mx.fov.toFixed(1),camDistTop:+mx.cd.toFixed(1),hits:hit,endZ:Math.round(a[a.length-1].z)};
    console.log(t,'top',JSON.stringify(res[t].top));
    if(t==='sedan') fs.writeFileSync(__dirname+`/tel-top-${t}.json`, JSON.stringify(a));
  }
  fs.writeFileSync(__dirname+'/t1-results.json', JSON.stringify(res,null,1));
  await g.close();
})().catch(e=>{console.error(e);process.exit(1)});
