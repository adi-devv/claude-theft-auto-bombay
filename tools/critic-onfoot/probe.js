const H = require('../harness');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'shots');
(async () => {
 const g = await H.launch({width:960,height:540,out:OUT});
 try {
  await g.wait(5);
  console.log('BASE',JSON.stringify(await g.state()));
  console.log('SCENE',JSON.stringify(await g.eval(()=>({
   nodes:[...__game.roads.nodes.values()].map(n=>({id:n.id,x:n.x,z:n.z,roundabout:n.roundabout})),
   vehicles:__game.vehicles.slice(0,12).map(v=>({type:v.type,x:v.position.x,z:v.position.z,h:v.heading,driver:!!v.driver,speed:v.speed})),
   peds:__game.peds.slice(0,12).map(p=>({id:p.id,x:p.position.x,z:p.position.z,activity:p.activity,state:p.state})),
   cityKeys:Object.keys(__game.city), playerKeys:Object.keys(__game.player),
   cross:__game.city.crossings?.slice(0,5), pointer:!!document.pointerLockElement,
  }))));
  await g.shot('01-spawn');
  const samples=[];
  const snap=async(label)=>samples.push({label,state:await g.state(),extra:await g.eval(()=>({action:__game.player.action,stamina:__game.player.stamina,y:__game.player.position.y,yaw:__game.player.footCam.yaw,camera:__game.camera.position.toArray(),paused:__game.paused,bigMap:__game.hud.bigMapOpen,pointer:!!document.pointerLockElement}))});
  await snap('before-run'); await g.hold(['KeyW'],2); await snap('run-2s');
  await g.hold(['KeyW','ShiftLeft'],3); await snap('sprint-3s'); await g.shot('02-sprint');
  await g.hold(['KeyQ'],1); await snap('q-orbit-1s');
  await g.page.mouse.move(700,200,{steps:12}); await g.wait(.3); await snap('mouse-orbit');
  await g.tap('Space'); await g.wait(.12); await snap('jump'); await g.shot('03-jump');
  await g.wait(1); await g.tap('KeyP'); await g.shot('04-pause'); await snap('paused');
  await g.hold(['KeyW'],1); await snap('pause-held-W'); await g.tap('KeyP');
  await g.tap('KeyM'); await g.wait(.4); await g.shot('05-fullmap'); await snap('map-open');
  await g.tap('KeyM'); await g.wait(.6); await snap('map-close'); await g.shot('06-map-closed');
  fs.writeFileSync(path.join(__dirname,'probe.json'),JSON.stringify({samples,logs:g.logs},null,2));
  console.log('SAMPLES',JSON.stringify(samples));
 } finally {await g.close();}
 const title=await H.launch({width:960,height:540,out:OUT,query:''});
 try {
  // Harness clicks the centre on launch; restore title through its public API for inspection.
  await title.eval(()=>__game.hud.showTitle()); await title.wait(.3); await title.shot('07-title');
  await title.tap('Enter'); await title.wait(.8); await title.shot('08-title-start');
  console.log('TITLE',JSON.stringify(await title.eval(()=>({started:__game.started,mode:__game.player.mode,action:__game.player.action,locked:!!document.pointerLockElement}))));
 }finally {await title.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
