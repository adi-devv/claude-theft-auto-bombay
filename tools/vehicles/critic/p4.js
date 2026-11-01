const L = require('./lib');
(async () => {
  const g = await L.start(); await L.installMD(g);
  for (const kmh of [60,100]) {
  await g.eval(() => { const G=__game; const p=MD.lanePt(40,1,1); G.debug.teleport(p.x,p.z,Math.atan2(p.hx,p.hz)); G.debug.spawnCar('sedan'); });
  await g.wait(0.2); await L.clean(g); await g.eval(()=>{__game.debug.step(0.5)});
  const AP = `const near=MD.near(v.position.x,v.position.z); const look=Math.max(8,Math.abs(v.speed)*0.7); const tp=MD.lanePt(near.s+look,1,1); const want=Math.atan2(tp.x-v.position.x,tp.z-v.position.z); let e=want-v.heading; while(e>Math.PI)e-=2*Math.PI; while(e<-Math.PI)e+=2*Math.PI; const pwm=Math.min(1,Math.abs(e)/0.12); S.acc=(S.acc||0)+pwm; const on=S.acc>=1; if(on)S.acc-=1; K('KeyA',on&&e>0); K('KeyD',on&&e<0);`;
  const a = await L.sim(g, 26, `if(!S.ph)S.ph=1; if(S.ph===1){K('KeyW',v.speed*3.6<${kmh}); ${AP} if(v.speed*3.6>=${kmh}-1 && !S.stab){S.stab=t;} if(S.stab&&t-S.stab>1.2){S.ph=2;S.t0=t;K('KeyA',false);K('KeyD',false);} } else if(S.ph===2){ K('KeyW',v.speed*3.6<${kmh}); K('KeyD',true); if(t-S.t0>=0.5){S.ph=3;S.t1=t;K('KeyD',false);} } else if(S.ph===3){ K('KeyW',false); if(t-S.t1>=1.0)S.ph=4; }`,1);
  const seg=a.filter(s=>s.ph===2||s.ph===3);
  console.log(kmh, seg.filter((_,i)=>i%3===0).map(s=>`${(s.t-seg[0].t).toFixed(2)}:${s.yr.toFixed(2)}/${s.st.toFixed(2)}`).join(' '));
  }
  await g.close();
})();
