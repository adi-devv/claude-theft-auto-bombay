const H=require('../harness'),fs=require('fs'),path=require('path');
const report={sites:[],notes:'Live samples precede accelerated stress; no input.setKey, no mocked systems.'};
const file=path.join(__dirname,'world-audit.json');
(async()=>{const g=await H.launch({width:960,height:540,out:path.join(__dirname,'shots')});try{
 await g.wait(4);
 await g.eval(()=>{
  window.qw={pops:[],changes:[],crossStarts:[],rings:{cw:0,ccw:0},road:[],static:[],pairs:[],samples:[],perf:{}};
  __game.debug.traffic.log(true);
  // Observe final simulation states; wrappers only measure/record, never change decisions.
  for(const name of ['traffic','pedSystem','police']){const sys=__game[name],old=sys.update;qw.perf[name]={n:0,sum:0,max:0};sys.update=function(dt){const a=performance.now();try{return old.call(this,dt);}finally{const t=performance.now()-a,s=qw.perf[name];s.n++;s.sum+=t;s.max=Math.max(s.max,t);}};}
  window.qwPrev=new Map();window.qwSite='';
  window.qwScan=()=>{
   const G=__game,p=G.player,fr=new G.THREE.Frustum(),m=new G.THREE.Matrix4();G.camera.updateMatrixWorld();m.multiplyMatrices(G.camera.projectionMatrix,G.camera.matrixWorldInverse);fr.setFromProjectionMatrix(m);
   let near20=0,near50=0,overlap=0,road=0,still=0;const ps=G.peds.filter(p=>!p.isCop&&!['dead','down'].includes(p.state));
   for(const ped of ps){let d=p.position.distanceTo(ped.position);if(d<20)near20++;if(d<50)near50++;let contacts=G.collision.queryCircle(ped.position.x,ped.position.z,Math.max(.05,ped.radius-.02));if(contacts.some(c=>c.depth>.04)&&qw.static.length<30)qw.static.push({site:qwSite,t:G.time,id:ped.id,x:ped.position.x,z:ped.position.z,contacts:contacts.map(c=>({tag:c.shape.data?.tag,depth:c.depth}))});if(!ped.crossing&&G.roads.isOnRoad(ped.position.x,ped.position.z,.15)){road++;if(qw.road.length<30)qw.road.push({site:qwSite,t:G.time,id:ped.id,x:ped.position.x,z:ped.position.z,state:ped.state,activity:ped.activity});}
    const prev=qwPrev.get(ped);if(ped.crossing&&!prev?.crossing){const c=ped.path.crossing,node=G.roads.nodes.get(c.node),ctrl=G.debug.traffic.sig.ctrl.find(x=>x.node.id===c.node);if(ctrl){const apps=ctrl.groups.flatMap(gr=>gr.apps).filter(a=>a.edge.id===c.edge);qw.crossStarts.push({site:qwSite,t:G.time,id:ped.id,x:ped.position.x,z:ped.position.z,crossing:c,signals:apps.map(a=>({key:a.key,state:G.debug.traffic.sig.state(node,a.key)?.s})),allGroups:ctrl.groups.map(gr=>({state:gr.st,edges:gr.apps.map(a=>a.edge.id)}))});}}
    if(prev&&Math.hypot(prev.x-ped.position.x,prev.z-ped.position.z)<.02&&ped.state==='walk')still++;
    qwPrev.set(ped,{x:ped.position.x,z:ped.position.z,crossing:ped.crossing});
   }
   for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){let d=ps[i].position.distanceTo(ps[j].position);if(d<ps[i].radius+ps[j].radius-.12){overlap++;if(qw.pairs.length<30)qw.pairs.push({site:qwSite,t:G.time,a:ps[i].id,b:ps[j].id,d,x:ps[i].position.x,z:ps[i].position.z,activity:[ps[i].activity,ps[j].activity]});}}
   for(const d of G.debug.traffic.T.drivers){const v=d.veh,leg=d.leg,prev=qwPrev.get(v);if(leg.kind==='conn'&&leg.node.roundabout&&prev){const n=leg.node,rx=v.position.x-n.x,rz=v.position.z-n.z,rr=Math.hypot(rx,rz);if(rr>n.roundabout&&rr<n.radius+3&&v.speed>1){let ang=Math.atan2(rz,rx),da=Math.atan2(Math.sin(ang-prev.a),Math.cos(ang-prev.a));if(Math.abs(da)<.4){if(da>.001)qw.rings.cw++;if(da<-.001)qw.rings.ccw++;}}}qwPrev.set(v,{a:leg.node?Math.atan2(v.position.z-leg.node.z,v.position.x-leg.node.x):0});}
   const s={site:qwSite,t:G.time,near20,near50,overlap,road,still,state:G.debug.state()};qw.samples.push(s);return s;
  };
 });
 for(const [name,x,z,h] of [['marine',-418,150,Math.PI],['fort',58,80,0],['horniman',213,105,Math.PI/2],['regal',85,345,Math.PI/2],['signals',104,-115,Math.PI],['churchgate',-225,100,Math.PI]]){
  await g.eval(a=>{__game.wanted.clear();__game.player.teleport(a.x,a.z,a.h);qwSite=a.name;__game.debug.traffic.resetPerf();}, {name,x,z,h});
  const live=[];await g.wait(2);for(let i=0;i<8;i++){await g.wait(1);live.push(await g.eval(()=>qwScan()));}
  await g.shot('w-'+name+'-street');
  const stress=await g.eval(()=>{const a=[];for(let i=0;i<90;i++){__game.debug.step(1);a.push(qwScan());}return {final:__game.debug.state(),last:a.at(-1)};});
  await g.shot('w-'+name+'-stress');report.sites.push({name,x,z,live,stress});fs.writeFileSync(file,JSON.stringify(report,null,2));
 }
 report.telemetry=await g.eval(()=>({observations:qw,aiHits:__game.debug.traffic.T.hitInfo,why:__game.debug.traffic.T.why,signals:__game.debug.traffic.sig.ctrl.map(c=>({id:c.node.id,groups:c.groups.map(gr=>({edges:gr.apps.map(a=>({id:a.edge.id,key:a.key})),st:gr.st}))}))}));report.logs=g.logs;
}finally{fs.writeFileSync(file,JSON.stringify(report,null,2));await g.close();}})().catch(e=>{report.failure=String(e.stack);fs.writeFileSync(file,JSON.stringify(report,null,2));console.error(e);process.exitCode=1;});
