const H = require('../harness');
const path = require('path');
const assert = require('assert/strict');
(async () => {
 const g = await H.launch({width:960,height:540,out:path.join(__dirname,'shots')});
 try {
  await g.eval(() => { __game.paused=true; __game.player.updateCamera=()=>{}; });
  const stress = await g.eval(() => {
   const g=__game, samples=[];
   for(const [x,z] of [[-419,180],[-232,60],[84,-135],[125,-375],[-163,245]]) {
    g.debug.teleport(x,z); g.debug.step(45);
    const q=g.peds.filter(p=>p.activity!=='cross' && p.state!=='down' && p.state!=='dead');
    samples.push({x,z,stats:g.debug.extra.peds(),onRoad:q.filter(p=>g.roads.isOnRoad(p.position.x,p.position.z,.05)).length,offLand:q.filter(p=>!g.roads.isLand(p.position.x,p.position.z)).length,overlap:q.filter(p=>p.activity!=='sit' && g.collision.queryCircle(p.position.x,p.position.z,p.radius-.02).length).length,overlappers:q.filter(p=>p.activity!=='sit' && g.collision.queryCircle(p.position.x,p.position.z,p.radius-.02).length).map(p=>({id:p.id,activity:p.activity,state:p.state,x:p.position.x,z:p.position.z,hits:g.collision.queryCircle(p.position.x,p.position.z,p.radius-.02).map(c=>({tag:c.shape.data.tag,depth:c.depth}))})),finite:q.every(p=>Number.isFinite(p.position.x+p.position.z+p.heading+p.velocity.length()))});
   }
   return samples;
  });
  console.log('stress',JSON.stringify(stress));
  for(const s of stress) {assert.equal(s.onRoad,0);assert.equal(s.offLand,0);assert.equal(s.overlap,0);assert.equal(s.finite,true);assert.ok(s.stats.active>=200&&s.stats.active<=250);}
  const api=await g.eval(() => {
   const g=__game, s=g.pedSystem, p=s.spawnPed({x:-417,z:190,kind:'cop',controller(p,dt){p.velocity.set(0,0,1.2);p.heading=0;p.state='walk';}});
   const start=p.position.z; g.debug.step(1); const moved=p.position.z-start;
   const near=s.nearest(p.position.x,p.position.z,.1,q=>q===p)===p;
   p.knockDown(4,0,'player');const down=p.state;g.debug.step(4);const recovered=p.state;
   const driver=s.spawnPed({x:-417,z:190,kind:'driver',heading:Math.PI});const fleeing=driver.state;
   s.panicAround(-417,190,20);const panicked=g.peds.filter(p=>p.state==='flee').length;
   g.debug.step(14);const calm=g.peds.filter(p=>p.state==='flee'&&!p.controller).length;
   const out={moved,near,isCop:p.isCop,variant:p.appearance.variant,down,recovered,fleeing,panicked,calm};p.remove();driver.remove();return out;
  });
  console.log('api',api);assert.ok(Math.abs(api.moved-1.2)<.05);assert.equal(api.near,true);assert.equal(api.isCop,true);assert.equal(api.variant,'cop');assert.equal(api.down,'down');assert.notEqual(api.recovered,'down');assert.equal(api.fleeing,'flee');assert.ok(api.panicked>0);assert.equal(api.calm,0);
  // Use real Vehicle instances, the full fixed loop, and the driver's player identity.
  const hits=await g.eval(() => {
   const g=__game, events=[]; g.events.on('pedHit',e=>events.push({event:'hit',speed:e.speed}));g.events.on('crime',e=>events.push({event:e.type}));
   g.player.update=()=>{};
   const result=[];
   for(const [speed,h] of [[1,0],[5,0],[14,.7],[48,Math.PI/2]]) {
    const car=g.debug.spawnCar('sedan');car.position.set(-401,0,210);car.heading=h;car.velocity.set(Math.sin(h)*speed,0,Math.cos(h)*speed);car.driver='player';car.setControls({throttle:0,brake:0,handbrake:false});
    const f={x:Math.sin(h),z:Math.cos(h)};
    const p=g.pedSystem.spawnPed({x:car.position.x+f.x*(car.length/2+.35),z:car.position.z+f.z*(car.length/2+.35),kind:'cop',controller(p){p.velocity.set(0,0,0);}});
    g.debug.step(.13);result.push({speed,state:p.state,health:p.health,finite:Number.isFinite(p.position.x+p.position.z),events:events.splice(0)});
    if(speed===5) {g.camera.position.set(p.position.x+3,2.5,p.position.z+4);g.camera.lookAt(p.position.x,.4,p.position.z);g.pedSystem.frameUpdate(0);}
    car.destroy();p.remove();
   }
   return result;
  });
  console.log('hits',JSON.stringify(hits));assert.notEqual(hits[0].state,'down');assert.equal(hits[1].state,'down');assert.equal(hits[2].state,'dead');assert.equal(hits[3].state,'dead');assert.ok(hits[1].events.some(e=>e.event==='pedHit'));assert.ok(hits[2].events.some(e=>e.event==='pedKilled'));
  console.log('final',JSON.stringify(await g.state()));
  assert.deepEqual(await g.eval(()=>__game.errors),[]);
 }finally{await g.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

