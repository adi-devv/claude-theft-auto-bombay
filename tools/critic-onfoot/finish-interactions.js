const H=require('../harness'),fs=require('fs'),path=require('path');
const data={scenarios:[],note:'Real input actions. Teleports and a genuine vehicle spawn only arrange test positions. panic event explicitly labelled as API supplement; no firearm exists.'};
const file=path.join(__dirname,'finish-interactions.json'),save=()=>fs.writeFileSync(file,JSON.stringify(data,null,2));
(async()=>{const g=await H.launch({width:960,height:540,out:path.join(__dirname,'shots')});
const snap=async label=>{data.scenarios.push({label,state:await g.state(),detail:await g.eval(()=>({events:qi.events,vehicle:window.qiCar?{pos:qiCar.position.toArray(),speed:qiCar.speed}:null,peds:__game.peds.filter(p=>['down','dead','flee'].includes(p.state)).map(p=>({id:p.id,pos:p.position.toArray(),air:p.airY,state:p.state,health:p.health}))})),shot:await g.shot(label)});save();};
try{await g.wait(3);await g.eval(()=>{window.qi={events:[]};for(const type of ['crime','pedHit','playerHit','busted','wasted','respawn','vehicleCollision'])__game.events.on(type,e=>qi.events.push({type,t:__game.time,crime:e.type,id:e.ped?.id,speed:e.speed,impulse:e.impulse}));});
// Camera relative movement, including parked-car collision, on clear promenade.
await g.eval(()=>__game.player.teleport(-418,150,Math.PI));await g.hold(['KeyW'],1);await snap('i01-forward');await g.hold(['KeyD'],1);await snap('i02-strafe');
await g.page.mouse.move(640,310,{steps:6});await g.wait(.2);await snap('i03-mouse-orbit');
await g.eval(()=>{window.qiCar=__game.createVehicle({type:'taxi',x:-418,z:160,heading:Math.PI});__game.player.teleport(-418,165,Math.PI);});await g.hold(['KeyW'],1);await snap('i04-run-into-parked-car');
// Drive along actual populated promenade using F and W. Do not pin/move pedestrians.
await g.eval(()=>{const d=qiCar.driverDoor();__game.player.teleport(d.x,d.z,qiCar.heading);});await g.tap('KeyF');await g.wait(1.6);await snap('i05-enter-impact-car');
await g.down('KeyW');for(let i=0;i<10;i++){await g.wait(.25);await snap('i06-drive-impact-'+i);}await g.up('KeyW');
await g.wait(3.5);await snap('i07-impact-recovery');
// API panic supplement to the crash/punch events captured elsewhere. No gunfire key exists.
await g.eval(()=>{if(__game.player.vehicle)__game.player.exitVehicle(true);__game.wanted.clear();__game.player.teleport(-418,150,Math.PI);});await snap('i08-before-panic');await g.eval(()=>__game.events.emit('panic',{x:-418,z:150,radius:25}));await g.wait(.65);await snap('i09-panic');await g.wait(9);await snap('i10-panic-calmed');
// Arrest initiated by the integrated police system, then release flow.
await g.eval(()=>{__game.wanted.clear();__game.player.teleport(-418,150,Math.PI);__game.debug.setWanted(1);__game.debug.police.spawnFootAt(-418,151);});await g.wait(2);await snap('i11-busted-overlay');await g.wait(5);await snap('i12-released');
}catch(e){data.failure=String(e.stack);throw e;}finally{data.logs=g.logs;save();await g.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
