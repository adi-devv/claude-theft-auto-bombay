// Find an actual forward-route roadblock beyond 240m, then verify its cars and
// officers survive the lifecycle update. No placement/visibility bypasses.
const L=require('./lib'),fs=require('fs');
(async()=>{
  const g=await L.start({out:__dirname+'/shots/final'});
  const result=await g.eval(()=>{
    const G=__game,P=G.police;G.paused=true;G.traffic.update=()=>{};G.pedSystem.update=()=>{};
    for(const v of [...G.vehicles])if(v!==G.player.vehicle)v.destroy();
    if(!G.player.vehicle)G.debug.spawnCar('sedan');
    const v=G.player.vehicle,originalFov=G.camera.fov;let tries=0;
    for(const e of G.roads.edges)for(let s=25;s<e.length-25;s+=30)for(const dir of [1,-1])for(const fov of [25,45,62,75]){
      G.wanted.clear();P.clearAll();G.player.state='normal';const p=G.roads.lanePoint(e,s,dir,Math.max(0,e.lanes-1));v.position.set(p.x,0,p.z);v.heading=Math.atan2(p.hx,p.hz);v.velocity.set(p.hx*20,0,p.hz*20);G.player.position.copy(v.position);
      G.camera.fov=fov;G.camera.updateProjectionMatrix();G.camera.position.set(p.x-p.hx*8,5,p.z-p.hz*8);G.camera.lookAt(p.x+p.hx*40,1,p.z+p.hz*40);G.camera.updateMatrixWorld();
      G.wanted.setLevel(3);P.update(1/60);G.wanted.update(1/60);tries++;
      if(!G.debug.police.roadblock())continue;
      const rb=P.roadblocks[0],d=Math.hypot(rb.x-p.x,rb.z-p.z);if(d<240)continue;
      const fr=new G.THREE.Frustum().setFromProjectionMatrix(new G.THREE.Matrix4().multiplyMatrices(G.camera.projectionMatrix,G.camera.matrixWorldInverse));
      const inView=rb.cars.filter(u=>fr.intersectsSphere(new G.THREE.Sphere(new G.THREE.Vector3(u.position.x,1.5,u.position.z),8))).length;
      const cars=rb.cars.slice(),cops=rb.cops.slice();
      for(let i=0;i<5*60;i++){P.update(1/60);G.wanted.update(1/60);G.time+=1/60;}
      const out={tries,playerRoad:e.name,roadblockRoad:rb.edge,routeSample:s,dir,fov,distance:d,inFrustumAtCreation:inView,carsAfter5s:cars.filter(u=>P.units.includes(u)).length,officersAfter5s:cops.filter(u=>P.units.includes(u)).length,formationsAfter5s:P.roadblocks.length,errors:G.errors.slice()};
      // Pan to a formation that already exists; snapshot is for visual QA only.
      G.player.updateCamera=()=>{};G.camera.position.set(rb.x-p.hx*24,7,rb.z-p.hz*24);G.camera.lookAt(rb.x,1,rb.z);G.camera.updateMatrixWorld();G.police.frameUpdate(0);for(const car of G.vehicles)car.frameUpdate(0);
      return out;
    }
    G.camera.fov=originalFov;G.camera.updateProjectionMatrix();return{tries,error:'No distant route fixture found',errors:G.errors.slice()};
  });
  fs.writeFileSync(__dirname+'/preload.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await g.shot('preloaded-roadblock-pan');await g.close();
})().catch(e=>{console.error(e);process.exit(1);});
