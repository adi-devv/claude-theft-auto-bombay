// Resume the interrupted world audit. Preserve world-audit.json; use live frames for FPS.
const H = require('../harness'), fs = require('fs'), path = require('path');
const data = { viewport:[960,540], sites:[], events:[], note:'Debug teleports only establish locations. Normal AI, physics and populations remain active. Stress time is explicitly accelerated; FPS comes only from live samples.' };
const file=path.join(__dirname,'continue-world.json');
const save=()=>fs.writeFileSync(file,JSON.stringify(data,null,2));
(async()=>{const g=await H.launch({width:960,height:540,out:path.join(__dirname,'shots')});
 try {
  await g.wait(3);
  await g.eval(()=>{
   window.qc={pairs:[],static:[],road:[],crossings:[],rings:{cw:0,ccw:0},pops:[],perf:{},previous:new Map(),site:'',samples:0};
   __game.debug.traffic.log(true);
   for(const name of ['traffic','pedSystem','police']){const obj=__game[name],fn=obj.update;qc.perf[name]={n:0,sum:0,max:0};obj.update=function(dt){const a=performance.now();try{return fn.call(this,dt);}finally{const d=performance.now()-a,s=qc.perf[name];s.n++;s.sum+=d;s.max=Math.max(s.max,d);}};}
   const scan=()=>{
    const G=__game;qc.samples++;
    const ps=G.peds.filter(p=>!p.isCop&&!['down','dead'].includes(p.state));
    let n20=0,n50=0,road=0,overlap=0;
    for(const p of ps){const d=p.position.distanceTo(G.player.position);n20+=d<20;n50+=d<50;
     const prev=qc.previous.get(p);
     if(p.crossing&&!prev?.crossing){const c=p.path?.crossing,ctrl=G.debug.traffic.sig.ctrl.find(x=>x.node.id===c?.node);if(ctrl)qc.crossings.push({site:qc.site,t:G.time,id:p.id,x:p.position.x,z:p.position.z,crossing:c,signals:ctrl.groups.flatMap(x=>x.apps).filter(a=>a.edge.id===c.edge).map(a=>({key:a.key,state:G.debug.traffic.sig.state(ctrl.node,a.key)?.s}))});}
     qc.previous.set(p,{crossing:p.crossing});
     if(!p.crossing&&G.roads.isOnRoad(p.position.x,p.position.z,.15)){road++;if(qc.road.length<50)qc.road.push({site:qc.site,t:G.time,id:p.id,pos:p.position.toArray(),state:p.state,activity:p.activity});}
     const contacts=G.collision.queryCircle(p.position.x,p.position.z,Math.max(.05,p.radius-.02)).filter(c=>c.depth>.04);if(contacts.length&&qc.static.length<50)qc.static.push({site:qc.site,t:G.time,id:p.id,pos:p.position.toArray(),contacts:contacts.map(c=>({depth:c.depth,tag:c.shape.data?.tag}))});
    }
    for(let i=0;i<ps.length;i++)for(let j=0;j<i;j++){const a=ps[i],b=ps[j],d=a.position.distanceTo(b.position);if(d<a.radius+b.radius-.12){overlap++;if(qc.pairs.length<100)qc.pairs.push({site:qc.site,t:G.time,a:a.id,b:b.id,d,r:a.radius+b.radius,pos:a.position.toArray(),activities:[a.activity,b.activity],states:[a.state,b.state]});}}
    for(const d of G.debug.traffic.T.drivers){const v=d.veh,leg=d.leg,n=leg.node,prev=qc.previous.get(v);if(n?.roundabout&&leg.kind==='conn'){const a=Math.atan2(v.position.z-n.z,v.position.x-n.x);if(prev?.node===n.id&&v.speed>1){const da=Math.atan2(Math.sin(a-prev.a),Math.cos(a-prev.a));if(Math.abs(da)<.5){if(da>.001)qc.rings.cw++;if(da<-.001)qc.rings.ccw++;}}qc.previous.set(v,{node:n.id,a});}else qc.previous.set(v,{});}
    return {t:G.time,n20,n50,road,overlap,state:G.debug.state()};
   };window.qcScan=scan;
   // Sample crossing transitions at 10 Hz, even during debug.step. Read-only observer.
   const fn=G=>{};let next=0;const old=__game.pedSystem.update;__game.pedSystem.update=function(dt){const r=old.call(this,dt);if(__game.time>=next){next=__game.time+.1;for(const p of __game.peds){const prev=p._qaCross; if(p.crossing&&!prev){const c=p.path?.crossing,ctrl=__game.debug.traffic.sig.ctrl.find(x=>x.node.id===c?.node);if(ctrl)qc.crossings.push({site:qc.site,t:__game.time,id:p.id,x:p.position.x,z:p.position.z,crossing:c,signals:ctrl.groups.flatMap(x=>x.apps).filter(a=>a.edge.id===c.edge).map(a=>({key:a.key,state:__game.debug.traffic.sig.state(ctrl.node,a.key)?.s}))});}p._qaCross=p.crossing;}}return r;};
  });
  for(const [name,x,z,h] of [['fort',58,80,0],['horniman',213,105,Math.PI/2],['regal',85,345,Math.PI/2],['signals',104,-115,Math.PI],['churchgate',-225,100,Math.PI]]){
   console.log('site',name);
   await g.eval(a=>{qc.site=a.name;__game.wanted.clear();__game.player.teleport(a.x,a.z,a.h);__game.debug.traffic.resetPerf();}, {name,x,z,h});
   const site={name,x,z,live:[],stress:[]};data.sites.push(site);save();
   await g.wait(2);for(let i=0;i<8;i++){await g.wait(.75);site.live.push(await g.eval(()=>qcScan()));}await g.shot('c-'+name+'-live');save();
   for(let i=0;i<9;i++){site.stress.push(await g.eval(()=>{__game.debug.step(5);return qcScan();}));save();}
   await g.wait(.25);await g.shot('c-'+name+'-stress');
   data.observations=await g.eval(()=>({pairs:qc.pairs,static:qc.static,road:qc.road,crossings:qc.crossings,rings:qc.rings,perf:qc.perf,aiHits:__game.debug.traffic.T.hitInfo,why:__game.debug.traffic.T.why}));save();
  }
 }catch(e){data.failure=String(e.stack);throw e;}finally{data.logs=g.logs;save();await g.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
