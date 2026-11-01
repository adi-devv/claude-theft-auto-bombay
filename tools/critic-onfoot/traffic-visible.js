const H=require('../harness'),fs=require('fs'),path=require('path');
const data={samples:[],note:'Live 960x540 test. Mutation only creates a real parked roadblock and teleports player to its door. Vehicle appearance/disappearance monitor is read-only and checks static occlusion.'};
const file=path.join(__dirname,'traffic-visible.json'),save=()=>fs.writeFileSync(file,JSON.stringify(data,null,2));
(async()=>{const g=await H.launch({width:960,height:540,out:path.join(__dirname,'shots')});try{
await g.wait(3);await g.eval(()=>{
window.qv={pops:[],previous:new Map(),first:true,site:'marine'};
__game.player.teleport(-418,150,Math.PI);
const G=__game,fr=new G.THREE.Frustum(),m=new G.THREE.Matrix4();
window.qvScan=()=>{G.camera.updateMatrixWorld();m.multiplyMatrices(G.camera.projectionMatrix,G.camera.matrixWorldInverse);fr.setFromProjectionMatrix(m);const now=new Map();
for(const v of G.vehicles){const p=v.position.clone();p.y=1.5;const inside=fr.containsPoint(p),d=p.distanceTo(G.camera.position),delta=p.clone().sub(G.camera.position),hit=G.collision.raycast(G.camera.position.x,G.camera.position.z,delta.x,delta.z,Math.hypot(delta.x,delta.z),1.6);const clear=!hit;const ndc=p.clone().project(G.camera);const state={x:p.x,z:p.z,type:v.type,d,inside,clear,pixel:[480*(1+ndc.x),270*(1-ndc.y)],approxHeightPx:540*2/(2*d*Math.tan(G.camera.fov*Math.PI/360))};now.set(v,state);
if(!qv.first&&!qv.previous.has(v)&&inside&&clear)qv.pops.push({kind:'appear',site:qv.site,t:G.time,...state});}
for(const [v,s] of qv.previous)if(!now.has(v)&&s.inside&&s.clear)qv.pops.push({kind:'disappear',site:qv.site,t:G.time,...s});
qv.previous=now;qv.first=false;return {t:G.time,state:G.debug.state(),pops:qv.pops};};
});
await g.wait(2);await g.eval(()=>{qvScan();qv.pops=[];});
for(let i=0;i<90;i++){await g.wait(.2);const s=await g.eval(()=>qvScan());data.samples.push(s);if(s.pops.length>(data.pops?.length||0)){data.pops=s.pops;await g.shot('v-pop-'+s.pops.length);}if(i%10===0)save();}
await g.shot('v-marine-observe');
data.roadblock=await g.eval(()=>{const e=__game.roads.edges.find(e=>e.name==='Marine Drive'&&e.length>80);const p=__game.roads.lanePoint(e,e.length*.5,1,0);window.qvBlock=__game.createVehicle({type:'bus',x:p.x,z:p.z,heading:Math.atan2(p.hx,p.hz)});qvBlock.setControls({handbrake:true});const d=qvBlock.driverDoor();__game.player.teleport(d.x,d.z,qvBlock.heading);qv.site='roadblock';qv.first=true;return {edge:e.id,p,car:qvBlock.position.toArray(),heading:qvBlock.heading};});
await g.tap('KeyF');await g.wait(1.7);await g.shot('v-roadblock-start');
data.block=[];for(let i=0;i<18;i++){await g.wait(.7);data.block.push(await g.eval(()=>({state:__game.debug.state(),neighbors:__game.debug.traffic.T.drivers.filter(d=>d.veh.position.distanceTo(qvBlock.position)<45).map(d=>({id:d.id,pos:d.veh.position.toArray(),speed:d.veh.speed,reason:d.waitReason,blocked:d.blockedT,pass:!!d.pass,reverse:d.reverseT}))})));save();}await g.shot('v-roadblock-end');
data.final=await g.eval(()=>({pops:qv.pops,errors:__game.errors}));
}catch(e){data.failure=String(e.stack);throw e;}finally{save();await g.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
