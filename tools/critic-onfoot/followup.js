const H=require('../harness'),fs=require('fs'),path=require('path');const file=path.join(__dirname,'followup.json'),out=path.join(__dirname,'shots');const data={scenarios:[]};
(async()=>{let g=await H.launch({width:960,height:540,out});const save=()=>fs.writeFileSync(file,JSON.stringify(data,null,2));const snap=async(label)=>{data.scenarios.push({label,state:await g.state(),extra:await g.eval(()=>({events:window.qEvents,peds:__game.peds.filter(p=>p.kind==='driver').map(p=>({id:p.id,state:p.state,health:p.health,pos:p.position.toArray()})),camera:__game.camera.position.toArray(),camDist:__game.player.footCam.curDist,car:window.qJack?{driver:qJack.driver==='player'?'player':qJack.driver?.kind,ai:!!qJack.ai}:null})),shot:await g.shot(label)});save();};
try{
 await g.wait(5);await g.eval(()=>{window.qEvents=[];for(const type of ['crime','pedHit','playerHit','busted','respawn','playerEnteredVehicle'])__game.events.on(type,e=>qEvents.push({type,t:__game.time,crime:e.type,speed:e.speed,jacked:e.jacked,ped:e.ped?.id}));});
 // Clear promenade movement, independent of the wall point in the first audit.
 await g.eval(()=>__game.player.teleport(-418,150,Math.PI));await snap('f01-move-start');await g.hold(['KeyW'],2);await snap('f02-run');await g.hold(['KeyW','ShiftLeft'],2);await snap('f03-sprint');
 await g.down('Space');await g.wait(.18);await snap('f04-jump');await g.up('Space');await g.wait(.7);
 // Wall push + mouse pitch and full orbit. Use actual registered facade, no fake wall.
 data.wall=await g.eval(()=>{for(const e of __game.roads.edges)for(let s=20;s<e.length-20;s+=15){const n=__game.roads.sample(e,s);for(const sign of [-1,1]){const off=e.width/2+1.5,x=n.x+n.tz*off*sign,z=n.z-n.tx*off*sign,dx=n.tz*sign,dz=-n.tx*sign;const hit=__game.collision.raycast(x,z,dx,dz,8,3);if(hit&&__game.roads.isLand(x,z)&&!__game.collision.queryCircle(x,z,.4).length){__game.player.teleport(x,z,Math.atan2(dx,dz));return {x,z,dx,dz,dist:hit.dist,tag:hit.shape?.data?.tag};}}}return null;});
 if(data.wall){await g.hold(['KeyW','ShiftLeft'],2);await snap('f05-wall-push');await g.hold(['KeyQ'],1.3);await snap('f06-wall-behind-camera');await g.hold(['KeyQ'],1.3);await snap('f07-wall-full-orbit');}
 // Real traffic carjack, only when player is fully alive.
 data.jack=await g.eval(()=>{__game.wanted.clear();const d=__game.debug.traffic.T.drivers.filter(d=>!d.dead&&d.veh.type!=='bus').sort((a,b)=>Math.abs(a.veh.speed)-Math.abs(b.veh.speed))[0];window.qJack=d.veh;const q=qJack.driverDoor();__game.player.teleport(q.x,q.z,qJack.heading);return {id:d.id,speed:qJack.speed,pos:qJack.position.toArray(),door:q};});
 await g.tap('KeyF');await g.wait(.35);await snap('f08-carjack-pull');await g.wait(2);await snap('f09-carjack-entered');await g.wait(3);await snap('f10-driver-flee');
 if((await g.state()).player.mode==='vehicle'){await g.hold(['KeyW'],2);await g.tap('KeyF');await g.wait(.25);await snap('f11-exit');await g.wait(3);}
 // Natural arrest at a collision-free footpath point.
 await g.eval(()=>{if(__game.player.vehicle)__game.player.exitVehicle(true);__game.wanted.clear();__game.player.teleport(-418,150,Math.PI);__game.debug.setWanted(1);__game.debug.police.spawnFootAt(-418,151);});
 for(let i=0;i<5;i++){await g.wait(1);await snap('f12-arrest-'+i);if((await g.state()).player.state==='busted')break;}
 await g.wait(6);await snap('f13-after-arrest');
 // End-to-end vehicle/ped impact using a real car entered by F, then keyboard acceleration.
 data.pedImpact=await g.eval(()=>{__game.wanted.clear();const ped=__game.peds.find(p=>p.activity==='walk'&&p.state==='idle'&&Math.hypot(p.position.x+418,p.position.z-150)<90);window.qVictim=ped;const h=ped.heading;const f={x:Math.sin(h),z:Math.cos(h)};const v=__game.createVehicle({type:'taxi',x:ped.position.x-f.x*10,z:ped.position.z-f.z*10,heading:h});window.qImpact=v;const d=v.driverDoor();__game.player.teleport(d.x,d.z,h);return {id:ped.id,pos:ped.position.toArray(),h,car:v.position.toArray()};});
 await g.tap('KeyF');await g.wait(1.7);await g.down('KeyW');await g.wait(1);await snap('f14-ped-impact-approach');await g.wait(1);await snap('f15-ped-impact');await g.up('KeyW');await g.wait(1);await snap('f16-ped-impact-after');data.victim=await g.eval(()=>({state:qVictim.state,health:qVictim.health,pos:qVictim.position.toArray()}));
 // Contract gunshot scare; there is no firearm binding in this build. Synthetic event test is labelled.
 await g.eval(()=>{if(__game.player.vehicle)__game.player.exitVehicle(true);__game.player.teleport(-418,150,Math.PI);__game.wanted.clear();});await snap('f17-before-panic');await g.eval(()=>__game.events.emit('panic',{x:-418,z:150,radius:25}));await g.wait(.7);await snap('f18-contract-panic');
 data.logs=g.logs;
}finally{save();await g.close();}
 // Title seen before the harness's automatic click: override mouse click only until launch completes.
 g=await H.launch({width:960,height:540,out,query:'titleAudit=1'});try{await g.eval(()=>__game.hud.showTitle());await g.page.keyboard.press('Escape');if(await g.eval(()=>__game.paused))await g.page.keyboard.press('KeyP');await g.wait(.4);await snap('f19-title');await g.tap('Enter');await g.wait(1);await snap('f20-title-start');await g.tap('KeyP');await snap('f21-pause');await g.tap('KeyP');await g.tap('KeyM');await snap('f22-full-map');await g.tap('KeyM');}finally{save();await g.close();}
})().catch(e=>{data.failure=String(e.stack);fs.writeFileSync(file,JSON.stringify(data,null,2));console.error(e);process.exitCode=1;});
