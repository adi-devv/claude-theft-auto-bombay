// Exact creation-time frustum, progress, contact, LOS and CPU checks in the police sandbox.
// Reuses the driving critic's harness and Marine Drive geometry. RUN_TAG=baseline serves
// the integrated originals for ONLY the owned modules through Playwright request routing.
const L = require('./lib');
const fs = require('fs');
const path = require('path');
const tag = process.env.RUN_TAG || 'fixed';
(async () => {
  const g = await L.start({out:__dirname+'/shots/'+tag});
  if(tag==='baseline') {
    await g.page.route('**/work/police/src/{ai/police*,systems/wanted}.js', async route => {
      const rel = new URL(route.request().url()).pathname.replace('/work/police/', '');
      await route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'../../game',rel),'utf8')});
    });
    await g.page.reload();
    await g.page.waitForFunction(()=>window.__game?.player&&!document.getElementById('loading'));
  }
  await L.installMD(g);
  await g.eval(()=>{__game.paused=true;});
  const result = await g.eval(async()=>{
    const G=__game,P=G.police,T=G.THREE,dt=1/60;
    const nav=await import('/work/police/src/ai/policeNav.js');
    G.traffic.update=()=>{};G.pedSystem.update=()=>{};
    const reset=()=>{G.wanted.clear();P.clearAll();G.player.state='normal';G.player.health=100;for(const v of [...G.vehicles])if(v!==G.player.vehicle)v.destroy();};
    const place=(s=170)=>{reset();const q=MD.lanePt(s,1,1);G.debug.teleport(q.x,q.z,Math.atan2(q.hx,q.hz));if(!G.player.vehicle)G.debug.spawnCar('sedan');const v=G.player.vehicle;v.position.set(q.x,0,q.z);v.heading=Math.atan2(q.hx,q.hz);v.velocity.set(0,0,0);v.yawRate=0;G.player.position.copy(v.position);G.player.updateCamera(1);return v;};
    const tick=()=>{P.update(dt);G.wanted.update(dt);G.time+=dt;};
    const out={mdLength:MD.len};
    let pv=place();G.wanted.setLevel(1);const door=pv.driverDoor();G.debug.police.spawnFootAt(door.x,door.z);let bustAt=null;
    for(let i=0;i<240;i++){const f=P.units.find(u=>u.kind==='foot');if(f)f.position.set(door.x,0,door.z);tick();if(G.player.state!=='normal'){bustAt=(i+1)*dt;break;}}
    out.carArrest={bustAt};
    // On-foot custody also requires a stopped suspect, and drains when they move.
    place();G.player.exitVehicle();G.player.velocity.set(0,0,0);G.wanted.setLevel(1);
    G.debug.police.spawnFootAt(G.player.position.x+.9,G.player.position.z);let footBustAt=null;
    for(let i=0;i<240;i++){const f=P.units.find(u=>u.kind==='foot');f.position.set(G.player.position.x+.9,0,G.player.position.z);tick();if(G.player.state!=='normal'){footBustAt=(i+1)*dt;break;}}
    out.footArrest={bustAt:footBustAt};
    place();G.player.exitVehicle();G.player.velocity.set(0,0,2);G.wanted.setLevel(1);
    G.debug.police.spawnFootAt(G.player.position.x+.9,G.player.position.z);
    for(let i=0;i<210&&G.player.state==='normal';i++){const f=P.units.find(u=>u.kind==='foot');f.position.set(G.player.position.x+.9,0,G.player.position.z);tick();}
    out.movingFootArrest={state:G.player.state,progress:G.debug.extra.police().arrest.foot};
    G.player.velocity.set(0,0,0);
    pv=place();G.wanted.setLevel(1);let d2=pv.driverDoor();G.debug.police.spawnFootAt(d2.x,d2.z);
    for(let i=0;i<84;i++)tick();const accumulated=G.debug.extra.police().arrest.car;
    pv.velocity.set(Math.cos(pv.heading)*5,0,-Math.sin(pv.heading)*5);for(let i=0;i<60;i++)tick();
    const drained=G.debug.extra.police().arrest.car;pv.velocity.set(0,0,0);for(let i=0;i<84;i++)tick();
    out.arrestMoveOff={accumulated,drained,state:G.player.state};
    pv=place();G.wanted.setLevel(1);for(let i=0;i<210;i++)tick();out.noOfficerArrest={state:G.player.state};
    // Isolated wanted timer, no police dispatch: hiding stationary inside the search radius.
    place();G.wanted.setLevel(1);for(let i=0;i<16*60;i++){G.wanted.update(dt);G.time+=dt;}out.hiddenInsideCircle={level:G.wanted.level,progress:G.wanted.escapeProgress};
    place();G.wanted.setLevel(1);for(let i=0;i<20*60;i++){G.wanted.reportSighting(pv.position.x,pv.position.z);G.wanted.update(dt);}out.continuousSight={level:G.wanted.level,progress:G.wanted.escapeProgress};
    place();G.wanted.setLevel(1);G.wanted.update(5.1);G.wanted.update(4);const before=G.wanted.escapeProgress;G.wanted.reportSighting(G.player.position.x,G.player.position.z);G.wanted.update(dt);out.reacquired={before,after:G.wanted.escapeProgress};
    out.higherStarDecay=[];
    for(const stars of [2,3,4,5]){place();G.wanted.setLevel(stars);G.wanted.update(5.1);G.player.position.x+=600;let clearAt=null;for(let i=0;i<36*60;i++){G.wanted.update(dt);if(!G.wanted.level){clearAt=(i+1)*dt;break;}}out.higherStarDecay.push({stars,clearAt,level:G.wanted.level});}
    // Real LOS at 120m; acquisition should not disappear at the old witness radius.
    pv=place();let q=MD.lanePt(290,1,1);G.debug.police.spawnPatrolAt(q.x,q.z,Math.atan2(q.hx,q.hz));G.wanted.setLevel(1);G.wanted.update(5.1);P.update(.1);G.wanted.update(.1);out.sight120m={clearLOS:G.collision.lineOfSight(q.x,q.z,pv.position.x,pv.position.z,2),seen:G.wanted.seen};
    // An actual building blocks the sole cop, within the initial 80m search circle.
    pv=place();let hiding=null;
    const corners=[];for(const e of G.roads.edges.filter(e=>e.name!=='Marine Drive'))for(let s=20;s<e.length-20;s+=20){const c=G.roads.lanePoint(e,s,1,0);if(!G.collision.queryOBB(c.x,c.z,1.05,2.4,Math.atan2(c.hx,c.hz)).some(h=>h.depth>.15))corners.push({...c,road:e.name});}
    outer:for(const a of corners)for(const c of corners){const d=Math.hypot(c.x-a.x,c.z-a.z);if(d>40&&d<75&&!G.collision.lineOfSight(c.x,c.z,a.x,a.z,2)){hiding={...c,d,playerRoad:a.road};pv.position.set(a.x,0,a.z);pv.heading=Math.atan2(a.hx,a.hz);G.player.position.copy(pv.position);G.camera.position.set(a.x,6,a.z);break outer;}}
    if(hiding){G.debug.police.spawnPatrolAt(hiding.x,hiding.z,Math.atan2(hiding.hx,hiding.hz));G.camera.lookAt(hiding.x,1.5,hiding.z);G.camera.updateMatrixWorld();const count=P.TUNE.cars[1];P.TUNE.cars[1]=1;G.wanted.setLevel(1);let clearAt=null;for(let i=0;i<17*60;i++){tick();if(!G.wanted.level){clearAt=(i+1)*dt;break;}}P.TUNE.cars[1]=count;out.realOcclusion={distance:hiding.d,playerRoad:hiding.playerRoad,copRoad:hiding.road,clearLOS:false,clearAt,level:G.wanted.level};}else out.realOcclusion={error:'No hidden road sample found'};
    // Distance alone may not clear a one-star cruiser with unobstructed LOS.
    pv=place(500);const far=MD.lanePt(150,1,1);const farId=G.debug.police.spawnPatrolAt(far.x,far.z,Math.atan2(far.hx,far.hz));G.wanted.setLevel(1);
    const farUnit=P.units.find(u=>u.id===farId);G.camera.position.set(pv.position.x,6,pv.position.z);G.camera.lookAt(far.x,1,far.z);G.camera.updateMatrixWorld();const farWant=P.TUNE.cars[1];P.TUNE.cars[1]=1;
    for(let i=0;i<20*60;i++)tick();P.TUNE.cars[1]=farWant;
    out.sight350m={distance:Math.hypot(far.x-pv.position.x,far.z-pv.position.z),clearLOS:G.collision.lineOfSight(far.x,far.z,pv.position.x,pv.position.z,2),level:G.wanted.level,seen:G.wanted.seen,retained:P.units.includes(farUnit)};
    G.camera.lookAt(pv.position.x+(pv.position.x-far.x),1,pv.position.z+(pv.position.z-far.z));G.camera.updateMatrixWorld();
    // Reset only the separate no-progress watchdog, so this single tick isolates the distance recycler.
    farUnit.progressX=far.x-3;farUnit.recoveryT=null;farUnit.ctl.stuckCount=0;tick();out.sight350m.retainedOffscreen=P.units.includes(farUnit);
    // Pin a car on a real straight. Static feelers report a wall ahead only, rear clear.
    pv=place(290);q=MD.lanePt(170,1,1);let id=G.debug.police.spawnPatrolAt(q.x,q.z,Math.atan2(q.hx,q.hz));let u=P.units.find(u=>u.id===id);G.wanted.setLevel(5);
    const ray=G.collision.raycast;G.collision.raycast=function(x,z,dx,dz,...args){return dx*q.hx+dz*q.hz>0.5?{dist:0}:null;};
    let recoveryAt=null,reverseAt=null,removedAt=null;const pinnedTrace=[];
    for(let i=0;i<660;i++){u.vehicle.velocity.set(0,0,0);G.wanted.reportSighting(pv.position.x,pv.position.z);tick();if(u.recoveryT!=null&&recoveryAt===null)recoveryAt=(i+1)*dt;if(u.ctl.reverseT>0&&reverseAt===null)reverseAt=(i+1)*dt;if(!P.units.includes(u)){removedAt=(i+1)*dt;break;}if(i%60===0)pinnedTrace.push({t:i*dt,mode:u.mode,reverse:u.ctl.reverseT||0,noProgress:u.noProgressT||0});}
    G.collision.raycast=ray;out.pinned={recoveryAt,reverseAt,removedAt,trace:pinnedTrace};
    // Collision events every tick exercise the same path as the physics resolver, including
    // contacts outside pursue mode. A unit must re-arm after four seconds and actually back off.
    pv=place();q=MD.lanePt(150,1,1);id=G.debug.police.spawnPatrolAt(q.x,q.z,Math.atan2(q.hx,q.hz));u=P.units.find(u=>u.id===id);G.wanted.setLevel(5);let last=P.stats.rams;const contacts=[];
    let backOffPeak=0;for(let i=0;i<600;i++){u.position.copy(pv.position);if(i%60>=30)u.position.x+=20;u.vehicle.heading=pv.heading;pv.velocity.set(Math.sin(pv.heading)*20,0,Math.cos(pv.heading)*20);u.vehicle.velocity.copy(pv.velocity);G.events.emit('vehicleCollision',{a:pv,b:u.vehicle,impulse:100,x:pv.position.x,z:pv.position.z});G.wanted.reportSighting(pv.position.x,pv.position.z);tick();backOffPeak=Math.max(backOffPeak,u.backOffT||0);if(P.stats.rams>last){contacts.push(i*dt);last=P.stats.rams;}}
    out.forcedContact={contacts,minGap:contacts.length>1?Math.min(...contacts.slice(1).map((t,i)=>t-contacts[i])):null,backOffPeak,cooldown:u.ramCD};
    out.rubberband=[];for(const level of [3,4,5]){G.wanted.setLevel(level);const rows=[];for(const gap of [15,60,140]){u.position.set(pv.position.x-q.hx*gap,0,pv.position.z-q.hz*gap);rows.push({gap,capKmh:G.debug.police.pursuitCap?.(u.id)*3.6||P.TUNE.vmax[level]*3.6});}out.rubberband.push({level,rows});}
    // Exact creation-time frustum audit over MD and Fort, including rear/side camera views.
    const create=G.createVehicle,fr=new T.Frustum(),mat=new T.Matrix4(),sphere=new T.Sphere(new T.Vector3(),8);const spawns=[],footSpawns=[],created=new Map();let scene='';
    G.createVehicle=function(opts){let record;if(opts.type==='police'){const c=G.camera;c.updateMatrixWorld();mat.multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse);fr.setFromProjectionMatrix(mat);sphere.center.set(opts.x,1.5,opts.z);record={scene,x:opts.x,z:opts.z,d:Math.hypot(opts.x-G.player.position.x,opts.z-G.player.position.z),inFrustum:fr.intersectsSphere(sphere)};spawns.push(record);}const v=create(opts);if(record)created.set(v,record);return v;};
    const viewpoints=[];
    for(const name of ['Marine Drive','Veer Nariman Road','Bazargate Street']){let e=G.roads.edges.find(e=>e.name===name);if(!e)e=G.roads.edges.find(e=>e.name.includes(name.split(' ')[0]));if(e)viewpoints.push(e);}
    for(const e of viewpoints)for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
      pv=place();const p=G.roads.lanePoint(e,e.length*.5,1,Math.max(0,e.lanes-1));pv.position.set(p.x,0,p.z);G.player.position.copy(pv.position);pv.heading=Math.atan2(p.hx,p.hz);pv.velocity.set(p.hx*20,0,p.hz*20);G.camera.position.set(p.x-p.hx*8,5,p.z-p.hz*8);G.camera.lookAt(p.x+Math.sin(pv.heading+yaw)*40,1,p.z+Math.cos(pv.heading+yaw)*40);G.camera.updateMatrixWorld();scene=e.name+':'+yaw.toFixed(2);G.wanted.setLevel(5);
      const initial=P.stats.roadblocks,known=new Set();for(let i=0;i<20*60;i++){G.wanted.reportSighting(p.x,p.z);tick();for(const u of P.units){const record=created.get(u.vehicle);if(record&&!record.mode)record.mode=u.mode;if(u.kind==='foot'&&!known.has(u.id)){known.add(u.id);sphere.center.set(u.position.x,1.5,u.position.z);footSpawns.push({scene,inFrustum:fr.intersectsSphere(sphere)});}}}const added=spawns.filter(s=>s.scene===scene);
      (out.viewpoints??=[]).push({scene,spawns:added.length,inFrustum:added.filter(s=>s.inFrustum).length,roadblocks:P.stats.roadblocks-initial});
    }
    G.createVehicle=create;out.spawns={count:spawns.length,inFrustum:spawns.filter(s=>s.inFrustum).length,records:spawns};out.roadblockCrewSpawns={count:footSpawns.length,inFrustum:footSpawns.filter(s=>s.inFrustum).length};
    const rbSpawns=spawns.filter(s=>s.mode==='roadblock');out.roadblockCarSpawns={count:rbSpawns.length,inFrustum:rbSpawns.filter(s=>s.inFrustum).length};
    // Controller ceiling on an unobstructed straight, distinct from engine/road-limited speed.
    out.controller=[];for(const level of [1,2,3,4,5]){let speed=0;const v={position:{x:0,z:0},heading:0,length:4.6,width:1.84,velocity:{x:0,z:0},get speed(){return speed;},setControls(c){speed=Math.max(0,speed+(c.throttle*5-c.brake*8-.15)*dt);this.velocity.z=speed;this.position.z+=speed*dt;}};const ctl={};for(let i=0;i<2400;i++)nav.driveCar(v,ctl,dt,{x:0,z:100000},P.TUNE.vmax[level],{game:G,noAvoid:true});out.controller.push({level,configured:P.TUNE.vmax[level]*3.6,steadyKmh:speed*3.6});}
    out.errors=G.errors.slice();reset();return out;
  });
  fs.writeFileSync(__dirname+'/'+tag+'-audit.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,spawns:{count:result.spawns.count,inFrustum:result.spawns.inFrustum}}));
  await g.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
