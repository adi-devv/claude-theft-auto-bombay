// Targeted before/after police checks, reusing the critic's browser and Marine Drive helpers.
const L = require('../critic-driving/lib');
const fs = require('fs');
const tag = process.env.RUN_TAG || 'before';
(async () => {
  const g = await L.start({out:__dirname+'/shots/'+tag});
  await L.installMD(g);
  await g.eval(()=>{__game.paused=true;});
  const result = await g.eval(async(tag)=>{
    const G=__game;
    // The fresh sandbox's original police files match game/. Load those originals in the
    // same sandbox for targeted baseline checks without writing another owner's files.
    if(tag==='before') {
      G.police.clearAll();G.wanted.clear();
      const {createPolice}=await import('/game/src/ai/police.js');
      const {createWanted}=await import('/game/src/systems/wanted.js');
      G.wanted=createWanted(G);G.police=createPolice(G);
    }
    const P=G.police, nav=await import((tag==='before'?'/game':'/work/police')+'/src/ai/policeNav.js');
    const out={};
    G.traffic.update=()=>{}; G.pedSystem.update=()=>{};
    for(const v of [...G.vehicles]) if(v!==G.player.vehicle) v.destroy();
    const reset=()=>{G.wanted.clear();P.clearAll(); G.player.state='normal'; G.player.health=100;};
    const step=()=>G.debug.step(1/60);
    const place=(s=170)=>{reset(); const p=MD.lanePt(s,1,1); G.debug.teleport(p.x,p.z,Math.atan2(p.hx,p.hz)); if(!G.player.vehicle)G.debug.spawnCar('sedan'); const v=G.player.vehicle; v.position.set(p.x,0,p.z);v.heading=Math.atan2(p.hx,p.hz);v.velocity.set(0,0,0);v.yawRate=0;G.player.position.copy(v.position);G.player.updateCamera(1);return v;};
    // Keep a real on-foot officer by the driver door, with the vehicle stationary.
    let pv=place();G.wanted.setLevel(1);let door=pv.driverDoor();G.debug.police.spawnFootAt(door.x,door.z);
    let bustAt=null;
    for(let i=0;i<210;i++){const foot=P.units.find(u=>u.kind==='foot');if(foot)foot.position.set(door.x,0,door.z);P.update(1/60);G.time+=1/60; if(G.player.state!=='normal'){bustAt=(i+1)/60;break;}}
    out.arrest={bustAt,errors:G.errors.slice()};
    // Wanted's timer alone: stationary hiding inside the search circle, versus reports every tick.
    place();G.wanted.setLevel(1);G.wanted.update(5.1);
    for(let i=0;i<11*60;i++)G.wanted.update(1/60);
    out.escapeHiddenInsideCircle={level:G.wanted.level,progress:G.wanted.escapeProgress};
    place();G.wanted.setLevel(1);for(let i=0;i<20*60;i++){G.wanted.reportSighting(G.player.position.x,G.player.position.z);G.wanted.update(1/60);}
    out.escapeWithSight={level:G.wanted.level,progress:G.wanted.escapeProgress};
    // Real clear LOS at 120m: distance must not by itself make one-star cops lose sight.
    pv=place(170);const p=MD.lanePt(290,1,1);G.debug.police.spawnPatrolAt(p.x,p.z,Math.atan2(p.hx,p.hz));G.wanted.setLevel(1);G.wanted.update(5.1);P.update(.1);G.wanted.update(.1);
    out.sight120m={clearLOS:G.collision.lineOfSight(p.x,p.z,pv.position.x,pv.position.z,2),seen:G.wanted.seen};
    // Physically pinned pursuit car: vTarget can be limited by an obstacle, so the watchdog
    // must measure progress independently of throttle. Freeze the car only, run real police AI.
    pv=place(170);const q=MD.lanePt(130,1,1);const id=G.debug.police.spawnPatrolAt(q.x,q.z,Math.atan2(q.hx,q.hz));let u=P.units.find(u=>u.id===id);G.wanted.setLevel(5);
    const ray=G.collision.raycast;G.collision.raycast=()=>({dist:0});let firstReverse=null,removed=null,trace=[];
    for(let i=0;i<660;i++){G.wanted.reportSighting(pv.position.x,pv.position.z);G.wanted.update(1/60);u.vehicle.velocity.set(0,0,0);P.update(1/60);G.time+=1/60;if(u.ctl.reverseT>0&&firstReverse===null)firstReverse=(i+1)/60;if(!P.units.includes(u)){removed=(i+1)/60;break;}if(i%60===0)trace.push({t:i/60,mode:u.mode,reverse:u.ctl.reverseT||0,stuck:u.ctl.stuckT||0,progress:u.noProgressT||0});}
    G.collision.raycast=ray;out.pinned={firstReverse,removed,trace};
    // Repeated forced overlaps isolate each unit's contact cooldown from chase path changes.
    pv=place(170);const r=MD.lanePt(174,1,1);G.debug.police.spawnPatrolAt(r.x,r.z,Math.atan2(r.hx,r.hz));u=P.units.find(u=>u.kind==='car');G.wanted.setLevel(5);let last=P.stats.rams,contacts=[];
    for(let i=0;i<600;i++){u.position.copy(pv.position);if(i%60>=30)u.position.x+=20;u.vehicle.velocity.set(0,0,20);pv.velocity.set(0,0,20);G.wanted.reportSighting(pv.position.x,pv.position.z);G.wanted.update(1/60);P.update(1/60);G.time+=1/60;if(P.stats.rams>last){contacts.push((i+1)/60);last=P.stats.rams;}}
    out.forcedContact={contacts,minGap:contacts.length>1?Math.min(...contacts.slice(1).map((t,i)=>t-contacts[i])):null};
    // Isolate the real steering/speed controller from city obstacles on a straight aim.
    // The fake car integrates only acceleration, so this measures controller ceiling, not engine vmax.
    out.controller=[];
    for(const level of [1,2,3,4,5]){let speed=0;const v={position:{x:0,z:0},heading:0,length:4.4,width:1.9,velocity:{x:0,z:0},get speed(){return speed;},setControls(c){speed=Math.max(0,speed+(c.throttle*5-c.brake*8-.15)*1/60);this.velocity.z=speed;this.position.z+=speed/60;}};const ctl={};for(let i=0;i<40*60;i++)nav.driveCar(v,ctl,1/60,{x:0,z:100000},P.TUNE.vmax[level],{game:G,noAvoid:true});out.controller.push({level,configured:P.TUNE.vmax[level]*3.6,steadyKmh:speed*3.6});}
    out.errors=G.errors.slice();reset();return out;
  }, tag);
  fs.writeFileSync(__dirname+'/'+tag+'-regression.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  await g.close();
})().catch(e=>{console.error(e);process.exit(1)});
