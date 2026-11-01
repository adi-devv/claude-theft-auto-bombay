// Integrated QA. Runtime setup/telemetry uses debug APIs; actions use real Playwright keyboard/mouse.
const H=require('../harness');
const fs=require('fs'); const path=require('path');
const data={url:'http://localhost:8765/game/?test=1',viewport:[960,540],scenarios:[]};
const out=path.join(__dirname,'shots');
(async()=>{
 const g=await H.launch({width:960,height:540,out});
 const save=()=>fs.writeFileSync(path.join(__dirname,'audit.json'),JSON.stringify(data,null,2));
 async function snap(label,shot=false){const s={label,state:await g.state(),detail:await g.eval(()=>({camera:__game.camera.position.toArray(),paused:__game.paused,pointer:!!document.pointerLockElement,perf:window.qaPerf,events:window.qaEvents?.slice(-20)}))};if(shot)s.shot=await g.shot(label);data.scenarios.push(s);save();return s;}
 try{
  await g.wait(3);
  await g.eval(()=>{
   window.qaPerf={};window.qaEvents=[];
   for(const name of ['traffic','pedSystem','police']){const sys=__game[name],old=sys.update;const stat=qaPerf[name]={n:0,sum:0,max:0};sys.update=function(dt){let a=performance.now();try{return old.call(this,dt);}finally{let t=performance.now()-a;stat.n++;stat.sum+=t;stat.max=Math.max(t,stat.max);}};}
   for(const type of ['crime','pedHit','playerHit','playerEnteredVehicle','playerExitedVehicle','vehicleCollision','wasted','busted','respawn'])__game.events.on(type,e=>{qaEvents.push({t:__game.time,type,crime:e.type,x:e.x,z:e.z,speed:e.speed,impulse:e.impulse,ped:e.ped?.id,jacked:e.jacked});if(qaEvents.length>400)qaEvents.shift();});
  });
  await snap('a01-baseline',true);
  // On-foot speed, diagonal normalization and input orbit.
  await g.eval(()=>__game.debug.teleport(-423,150,Math.PI));
  await snap('a02-run-start');await g.hold(['KeyW'],2);await snap('a03-run-end',true);
  await g.hold(['KeyW','ShiftLeft'],2);await snap('a04-sprint-end',true);
  await g.hold(['KeyQ'],.5);await snap('a05-q-orbit');
  await g.page.mouse.click(480,270);await g.page.mouse.move(630,240,{steps:5});await g.wait(.2);await snap('a06-mouse-orbit',true);
  // Native feet versus a real stationary ambient pedestrian: catch closest approach per rendered frame.
  const target=await g.eval(()=>{
   const p=__game.peds.filter(p=>!p.isCop&&p.activity==='walk'&&p.state==='idle'&&Math.hypot(p.position.x+423,p.position.z-120)<160).find(p=>!__game.collision.queryCircle(p.position.x,p.position.z+2.2,.5).length)||__game.peds.find(p=>p.activity==='sit');
   window.qaTarget=p;__game.player.teleport(p.position.x,p.position.z+2.2,Math.PI);
   window.qaOverlap={id:p.id,min:99,samples:[],radius:p.radius};
   const fn=()=>{if(!window.qaTrack)return;let d=__game.player.position.distanceTo(p.position);qaOverlap.min=Math.min(qaOverlap.min,d);if(d<.8)qaOverlap.samples.push({t:__game.time,d,ps:__game.player.action,ped:p.state});requestAnimationFrame(fn);};window.qaTrack=true;requestAnimationFrame(fn);
   return {id:p.id,position:p.position.toArray(),state:p.state,activity:p.activity};
  });data.target=target;
  await g.down('KeyW');await g.wait(.5);await snap('a07-running-through-ped',true);await g.wait(.5);await g.up('KeyW');
  data.playerPed=await g.eval(()=>{qaTrack=false;return qaOverlap;});await snap('a08-through-ped-end');
  // Punch a real ped, no fake victim or direct knockDown call.
  await g.eval(()=>{const p=qaTarget;__game.player.teleport(p.position.x,p.position.z+1,Math.PI);});
  await g.tap('KeyJ');await g.wait(.18);await snap('a09-punch',true);await g.wait(3.7);await snap('a10-punch-recovery',true);
  await g.eval(()=>__game.wanted.clear());
  // Parked-car enter, drive and bail: all actual input.
  data.parked=await g.eval(()=>{__game.player.exitVehicle(true);const v=__game.vehicles.find(v=>!v.driver&&!v.wrecked&&v.type!=='police');window.qaCar=v;let d=v.driverDoor();__game.player.teleport(d.x,d.z,v.heading);return {type:v.type,x:v.position.x,z:v.position.z,h:v.heading,door:d};});
  await g.tap('KeyF');await g.wait(2);await snap('a11-parked-enter',true);
  await g.hold(['KeyW'],3);await snap('a12-driving');await g.tap('KeyF');await g.wait(.2);await snap('a13-bail',true);await g.wait(3);await snap('a14-bail-recovery');
  // Road-blocking on foot: naturally approaching real AI car, frame-by-frame impact evidence.
  await g.eval(()=>{__game.wanted.clear();const p=__game.player;if(p.vehicle)p.exitVehicle(true);const ds=__game.debug.traffic.T.drivers.filter(d=>Math.abs(d.veh.speed)>7&&d.leg.kind==='lane');const d=ds.find(d=>!__game.collision.queryCircle(d.veh.position.x+Math.sin(d.veh.heading)*16,d.veh.position.z+Math.cos(d.veh.heading)*16,.4).length);const v=d.veh;window.qaBlock=v;p.teleport(v.position.x+Math.sin(v.heading)*16,v.position.z+Math.cos(v.heading)*16,v.heading+Math.PI);window.qaBlockSamples=[];});
  await snap('a15-roadblock-start',true);
  for(let i=0;i<12;i++){await g.wait(.25);data.scenarios.push({label:'roadblock-'+i,state:await g.state(),car:await g.eval(()=>({pos:qaBlock.position.toArray(),speed:qaBlock.speed,controls:qaBlock.controls,reason:qaBlock.ai?.waitReason}))});}
  await snap('a16-roadblock-impact',true);await g.wait(3);
  // Jack a real traffic car stopped at a signal (or slowest vehicle). Approach, pull and driver flee.
  data.jack=await g.eval(()=>{__game.wanted.clear();const ds=__game.debug.traffic.T.drivers.filter(d=>!d.dead&&d.veh.type!=='bus').sort((a,b)=>Math.abs(a.veh.speed)-Math.abs(b.veh.speed));const d=ds[0];window.qaJack=d.veh;let q=d.veh.driverDoor();__game.player.teleport(q.x,q.z,d.veh.heading);return {id:d.id,speed:d.veh.speed,x:q.x,z:q.z,peds:__game.peds.length};});
  await g.tap('KeyF');await g.wait(.65);await snap('a17-jack-pull',true);await g.wait(2);await snap('a18-jack-complete',true);
  data.driver=await g.eval(()=>({carDriver:qaJack.driver==='player'?'player':qaJack.driver?.kind,ai:!!qaJack.ai,drivers:__game.peds.filter(p=>p.kind==='driver').map(p=>({id:p.id,state:p.state,pos:p.position.toArray()}))}));
  await g.tap('KeyF');await g.wait(1);await g.eval(()=>__game.wanted.clear());
  // Native arrest: debug only establishes police/wanted context; no player.bust() call.
  await g.eval(()=>{__game.player.teleport(-423,150,Math.PI);__game.debug.setWanted(1);__game.debug.police.spawnFootAt(-423,151.5);});
  await g.wait(2);await snap('a19-arrest-contact',true);await g.wait(3);await snap('a20-arrest-respawn',true);await g.wait(3);await snap('a21-arrest-released',true);
  // Explicit flow unit check supplements the natural-hit/arrest tests above.
  await g.eval(()=>__game.player.damage(200,'qa-flow'));await g.wait(1.1);await snap('a22-wasted',true);await g.wait(5);await snap('a23-hospital',true);
  // Building collision and full Q orbit near an actual building wall.
  data.wall=await g.eval(()=>{
   const p=__game.player;__game.wanted.clear();
   // Find a building face from the actual static collider set by probing footpath candidates.
   for(const e of __game.roads.edges)for(let s=20;s<e.length-20;s+=15){let n=__game.roads.sample(e,s);for(const sign of [-1,1]){let off=e.width/2+2,x=n.x+n.tz*off*sign,z=n.z-n.tx*off*sign;let dx=n.tz*sign,dz=-n.tx*sign;let hit=__game.collision.raycast(x,z,dx,dz,6,2);if(hit&&hit.shape?.tag==='building'&&!__game.collision.queryCircle(x,z,.5).length){p.teleport(x,z,Math.atan2(dx,dz));return {x,z,dx,dz,hit:hit.dist};}}}return null;
  });
  if(data.wall){await g.hold(['KeyW','ShiftLeft'],2);await snap('a24-wall-contact',true);await g.hold(['KeyQ'],2.6);await snap('a25-wall-orbit',true);}
  await snap('a26-finish');data.logs=g.logs;save();
 }finally{save();await g.close();}
})().catch(e=>{data.failure=String(e.stack);fs.writeFileSync(path.join(__dirname,'audit.json'),JSON.stringify(data,null,2));console.error(e);process.exitCode=1;});
