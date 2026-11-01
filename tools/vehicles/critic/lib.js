const H = require('../../harness'); const fs = require('fs');
async function start(opts = {}) {
  const g = await H.launch({ width: 960, height: 540, out: __dirname + '/shots', ...opts });
  await g.eval(() => {
    const G = __game; const o = window.obs = { coll: [], stat: [], ped: [], crime: [], frames: [], wanted: [] };
    const pv = (x) => !!(G.player.vehicle && (x === G.player.vehicle));
    G.events.on('vehicleCollision', a => o.coll.push({ t: +G.time.toFixed(2), imp: Math.round(a.impulse), rel: a.relSpeed && +a.relSpeed.toFixed(1), a: a.a.type, b: a.b.type, pl: pv(a.a) || pv(a.b), aAI: a.a.ai ? 1 : 0, bAI: a.b.ai ? 1 : 0, ap: a.a.isPolice, bp: a.b.isPolice }));
    G.events.on('vehicleHitStatic', a => o.stat.push({ t: +G.time.toFixed(2), imp: Math.round(a.impulse), pl: pv(a.vehicle), type: a.vehicle.type, ai: a.vehicle.ai ? 1 : 0 }));
    G.events.on('pedHit', a => o.ped.push({ t: +G.time.toFixed(2), sp: +a.speed.toFixed(1) }));
    G.events.on('crime', a => o.crime.push({ t: +G.time.toFixed(2), type: a.type }));
    G.events.on('wantedChanged', a => o.wanted.push({ t: +G.time.toFixed(2), l: a.level, p: a.prev }));
    let last = performance.now(); (function f(t) { o.frames.push(t - last); last = t; if (o.frames.length > 4000) o.frames.shift(); requestAnimationFrame(f); })(last);
    window.rec=null; (function r(){ if(window.rec){const v=G.player.vehicle; if(v){const c=G.camera; const dx=c.position.x-v.position.x, dz=c.position.z-v.position.z; const f=v.forward; window.rec.push({t:+G.time.toFixed(3),sp:v.speed,kmh:v.speed*3.6,h:v.heading,yr:v.yawRate,x:v.position.x,z:v.position.z,vx:v.velocity.x,vz:v.velocity.z,fov:c.fov,cd:Math.hypot(dx,dz),cy:c.position.y,ca:Math.atan2(dx,dz),thr:v.controls.throttle,brk:v.controls.brake,st:v.controls.steer,gear:v.gear,rpm:v.rpm,hp:v.health});}} requestAnimationFrame(r);})();
  });
  return g;
}
async function rec(g, fn){ await g.eval(()=>{window.rec=[]}); await fn(); return g.eval(()=>{const r=window.rec; window.rec=null; return r;}); }
async function clean(g){ await g.eval(()=>{const G=__game; if(!G.traffic._upd){G.traffic._upd=G.traffic.update; G.traffic.update=()=>{};} let i=0; for(const v of G.vehicles){ if(v!==G.player.vehicle){ v.position.set(9000+i*30,0,9000); v.velocity.set(0,0,0); i++; } } for(const p of G.peds){ if(p.position&&!p.isCop) p.position.set(9500,0,9500);} }); }
async function unclean(g){ await g.eval(()=>{const G=__game; if(G.traffic._upd){G.traffic.update=G.traffic._upd; delete G.traffic._upd;}}); }
// Marine Drive helpers (page side)
async function installMD(g){ await g.eval(()=>{
  const G=__game; const edges=G.roads.edges.filter(e=>e.name==='Marine Drive'); const pts=[]; for(const e of edges){ const sl=e.pts; for(let i=(pts.length?1:0);i<sl.length;i++) pts.push({x:sl[i].x,z:sl[i].z}); }
  const cum=[0]; for(let i=1;i<pts.length;i++) cum.push(cum[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z));
  const at=(s)=>{ s=Math.max(0,Math.min(cum[cum.length-1]-0.01,s)); let i=1; while(cum[i]<s) i++; const w=(s-cum[i-1])/(cum[i]-cum[i-1]); const a=pts[i-1],b=pts[i]; const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz); return {x:a.x+dx*w,z:a.z+dz*w,tx:dx/l,tz:dz/l}; };
  const lanePt=(s,dir,lane)=>{ const p=at(s); const off=12-(lane+0.5)*3.6; const o=dir>0?off:-off; return {x:p.x+p.tz*o,z:p.z-p.tx*o,hx:p.tx*dir,hz:p.tz*dir,s}; };
  const near=(x,z)=>{ let best=1e9,bs=0; for(let i=1;i<pts.length;i++){ const a=pts[i-1],b=pts[i]; const dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz; let w=((x-a.x)*dx+(z-a.z)*dz)/l2; w=Math.max(0,Math.min(1,w)); const px=a.x+dx*w,pz=a.z+dz*w,d=Math.hypot(x-px,z-pz); if(d<best){best=d;bs=cum[i-1]+w*Math.sqrt(l2);} } return {s:bs,d:best}; };
  window.MD={pts,cum,at,lanePt,near,len:cum[cum.length-1]};
  window.AP=null;
  (function loop(){ const ap=window.AP; if(ap&&G.player.vehicle){ const v=G.player.vehicle; const n=MD.near(v.position.x,v.position.z); const dir=ap.dir; const look=Math.max(8,Math.abs(v.speed)*0.7); const tp=MD.lanePt(n.s+dir*look,dir,ap.lane); const want=Math.atan2(tp.x-v.position.x,tp.z-v.position.z); let err=want-v.heading; while(err>Math.PI)err-=2*Math.PI; while(err<-Math.PI)err+=2*Math.PI; const dead=0.03; G.input.setKey('KeyA',err>dead); G.input.setKey('KeyD',err<-dead); ap.s=n.s; } requestAnimationFrame(loop); })();
}); }
// generic route autopilot via keys: AP2.go(tx,tz,kmh)
async function installNav(g){ await g.eval(async()=>{
  const nav=await import('/game/src/ai/policeNav.js'); const G=__game;
  const ap=window.AP2={on:false,pts:null,kmh:40,done:false,cum:null,i:0,log:[]};
  ap.go=(tx,tz,kmh=40)=>{ const v=G.player.vehicle; const r=nav.planRoute(G.roads,v.position.x,v.position.z,v.heading,tx,tz); if(!r) return null; ap.pts=r.pts; ap.cum=[0]; for(let i=1;i<r.pts.length;i++) ap.cum.push(ap.cum[i-1]+Math.hypot(r.pts[i].x-r.pts[i-1].x,r.pts[i].z-r.pts[i-1].z)); ap.kmh=kmh; ap.on=true; ap.done=false; ap.i=0; ap.tx=tx; ap.tz=tz; return {len:r.length,n:r.pts.length}; };
  ap.setPts=(pts,kmh=30)=>{ ap.pts=pts; ap.cum=[0]; for(let i=1;i<pts.length;i++) ap.cum.push(ap.cum[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z)); ap.kmh=kmh; ap.on=true; ap.done=false; ap.i=0; };
  ap.stop=()=>{ap.on=false; for(const k of ['KeyW','KeyS','KeyA','KeyD']) G.input.setKey(k,false);};
  (function loop(){ if(ap.on&&G.player.vehicle&&ap.pts){ const v=G.player.vehicle, P=ap.pts; let best=ap.i,bd=1e9; for(let j=Math.max(0,ap.i-3);j<Math.min(P.length,ap.i+40);j++){ const d=Math.hypot(P[j].x-v.position.x,P[j].z-v.position.z); if(d<bd){bd=d;best=j;} } ap.i=best;
      const look=Math.max(7,Math.abs(v.speed)*0.55); let k=best; while(k<P.length-1&&ap.cum[k]-ap.cum[best]<look) k++; const t=P[k];
      const want=Math.atan2(t.x-v.position.x,t.z-v.position.z); let err=want-v.heading; while(err>Math.PI)err-=2*Math.PI; while(err<-Math.PI)err+=2*Math.PI;
      const dead=0.04; G.input.setKey('KeyA',err>dead); G.input.setKey('KeyD',err<-dead);
      const kmh=v.speed*3.6; const tgt=ap.kmh*(Math.abs(err)>0.5?0.5:1); G.input.setKey('KeyW',kmh<tgt); G.input.setKey('KeyS',kmh>tgt+8);
      const dEnd=Math.hypot(P[P.length-1].x-v.position.x,P[P.length-1].z-v.position.z); if(dEnd<8){ ap.done=true; ap.stop(); } }
    requestAnimationFrame(loop); })();
}); }
// deterministic stepped sim with key control: ctlSrc is a function body using (t, v, K, S) ; K(code,bool) sets a key
async function sim(g, secs, ctlSrc, every=1){ return g.eval(({secs,ctlSrc,every})=>{ const G=__game; const ctl=new Function('t','v','K','S','G',ctlSrc); const K=(c,b)=>G.input.setKey(c,b); const S={}; const out=[]; const n=Math.round(secs*60);
  for(let i=0;i<n;i++){ const v=G.player.vehicle; ctl(i/60,v,K,S,G); G.debug.step(1/60); if(i%every===0){ const w=G.player.vehicle; if(w){ const c=G.camera; const dx=c.position.x-w.position.x, dz=c.position.z-w.position.z; out.push({t:+(i/60).toFixed(3),kmh:w.speed*3.6,sp:w.speed,h:w.heading,yr:w.yawRate,x:w.position.x,z:w.position.z,vx:w.velocity.x,vz:w.velocity.z,fov:c.fov,cd:Math.hypot(dx,dz),cy:c.position.y,ca:Math.atan2(dx,dz),hp:w.health,gear:w.gear,ph:S.ph,thr:w.controls.throttle,brk:w.controls.brake,st:w.controls.steer}); } } }
  for(const k of ['KeyW','KeyS','KeyA','KeyD','Space']) K(k,false); return out; },{secs,ctlSrc,every}); }
// traffic pop-in tracker
async function installPop(g){ await g.eval(()=>{ const G=__game; const THREE=G.THREE; const fr=new THREE.Frustum(), pm=new THREE.Matrix4(), sph=new THREE.Sphere(new THREE.Vector3(),2.5);
  const known=new Map(); window.POP={appear:[],vanish:[],n:0}; let acc=0;
  const vis=(x,z)=>{ const c=G.camera; sph.center.set(x,1,z); if(!fr.intersectsSphere(sph)) return false; return G.collision.lineOfSight(c.position.x,c.position.z,x,z,5); };
  (function loop(){ acc++; if(acc%3===0){ const c=G.camera; c.updateMatrixWorld(); pm.multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse); fr.setFromProjectionMatrix(pm); const cur=new Set(); const pl=G.player.vehicle;
    for(const v of G.vehicles){ cur.add(v); if(v===pl) continue; if(!known.has(v)){ const d=Math.hypot(v.position.x-c.position.x,v.position.z-c.position.z); known.set(v,{x:v.position.x,z:v.position.z,type:v.type,t:G.time}); POP.n++; const kind=v.isPolice?'police':(v.driver&&v.driver.kind)||(v.ai?'ai':'parked/other'); if(G.time>3 && vis(v.position.x,v.position.z)) POP.appear.push({t:+G.time.toFixed(1),type:v.type,kind,d:Math.round(d),spd:Math.round(Math.abs(v.speed)*3.6)}); } else { const k=known.get(v); k.x=v.position.x;k.z=v.position.z; k.vis=vis(v.position.x,v.position.z); k.d=Math.hypot(v.position.x-c.position.x,v.position.z-c.position.z); }}
    for(const [v,k] of known){ if(!cur.has(v)){ known.delete(v); if(k.vis&&k.d<200) POP.vanish.push({t:+G.time.toFixed(1),type:k.type,d:Math.round(k.d)}); } } }
    requestAnimationFrame(loop); })();
}); }
function pick(s) { return { t: s.time, fps: s.fps, k: s.vehicle && s.vehicle.kmh, sp: s.vehicle && s.vehicle.speed, h: s.vehicle && s.vehicle.heading, x: s.vehicle && s.vehicle.x, z: s.vehicle && s.vehicle.z, hp: s.vehicle && s.vehicle.health, w: s.wanted && s.wanted.level }; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
module.exports = { installPop, sim, installNav, installMD, clean, unclean, rec, start, pick, sleep, fs };

