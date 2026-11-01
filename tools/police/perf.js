// Live integrated five-star CPU/siren/effects soak. Includes dispatch, roadblocks and teleports.
// Only police + wanted work is timed; GPU/other systems' frame cost is reported separately.
const L=require('./lib'),fs=require('fs'),path=require('path');
const tag=process.env.RUN_TAG||'fixed';
(async()=>{
  const g=await L.start({width:1280,height:720,out:__dirname+'/shots/'+tag});
  if(tag==='baseline'){
    await g.page.route('**/work/police/src/{ai/police*,systems/wanted}.js',async route=>{
      const rel=new URL(route.request().url()).pathname.replace('/work/police/','');
      await route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'../../game',rel),'utf8')});
    });
    await g.page.reload();await g.page.waitForFunction(()=>window.__game?.player&&!document.getElementById('loading'));
  }
  await L.installMD(g);
  await g.eval(()=>{
    const G=__game;window.PERF={update:[],fx:[],wanted:[],frames:[],wholeFrames:[],frameCost:0,samples:[],contacts:[]};
    for(const [sys,method,key] of [[G.police,'update','update'],[G.police,'frameUpdate','fx'],[G.wanted,'update','wanted']]){const orig=sys[method];sys[method]=function(...args){const start=performance.now();const r=orig.apply(this,args);const ms=performance.now()-start;PERF[key].push(ms);PERF.frameCost+=ms;if(key==='fx'){PERF.frames.push(PERF.frameCost);PERF.frameCost=0;}return r;};}
    let last=performance.now();(function loop(){const now=performance.now();PERF.wholeFrames.push(now-last);last=now;requestAnimationFrame(loop);})();
    G.events.on('vehicleCollision',e=>{if(e.a===G.player.vehicle||e.b===G.player.vehicle)PERF.contacts.push({t:G.time,police:e.a.isPolice||e.b.isPolice});});
    G.player.damage=()=>{};
  });
  const samples=[];
  for(let phase=0;phase<6;phase++){
    await g.eval(phase=>{
      const G=__game,p=MD.lanePt(phase%2?500:80,phase%2?-1:1,1);G.wanted.clear();G.police.clearAll();G.player.state='normal';G.debug.teleport(p.x,p.z,Math.atan2(p.hx,p.hz));if(!G.player.vehicle)G.debug.spawnCar('sedan');const v=G.player.vehicle;v.heading=Math.atan2(p.hx,p.hz);v.position.set(p.x,0,p.z);v.velocity.set(p.hx*22,0,p.hz*22);v.health=1e8;v.wrecked=false;G.player.position.copy(v.position);G.player.updateCamera(1);G.wanted.setLevel(5);window.AP={dir:phase%2?-1:1,lane:1};
      for(const gap of [24,40,60]){const q=MD.lanePt((phase%2?500:80)-(phase%2?-1:1)*gap,phase%2?-1:1,1);G.debug.police.spawnPatrolAt(q.x,q.z,Math.atan2(q.hx,q.hz));}
      // Force one legitimate offscreen roadblock per phase so the fixed version's
      // deliberate forward-view deferral does not exclude officers/effects from this soak.
      G.police.update(1/60);G.camera.position.set(p.x-p.hx*8,5,p.z-p.hz*8);
      G.camera.lookAt(p.x+p.hz*80,1,p.z-p.hx*80);G.camera.updateMatrixWorld();
      G.debug.police.roadblock();G.player.updateCamera(1);
    },phase);
    await g.down('KeyW');
    for(let i=0;i<10;i++){await g.wait(1);samples.push(await g.eval(()=>({t:__game.time,state:__game.player.state,stars:__game.wanted.level,cars:__game.police.units.filter(u=>u.kind==='car').length,foot:__game.police.units.filter(u=>u.kind==='foot').length,roadblocks:__game.police.roadblocks.length,rams:__game.police.stats.rams,traffic:__game.traffic.cars?.length,peds:__game.peds.length,sirens:__game.vehicles.filter(v=>v.isPolice&&v.sirenOn).length,errors:__game.errors.slice()})));}
    if(phase<3)await g.shot('perf-pursuit-'+phase);
    await g.up('KeyW');
  }
  const result=await g.eval(()=>{
    const summarize=a=>{a.sort((a,b)=>a-b);return{n:a.length,avg:a.reduce((x,y)=>x+y,0)/a.length,p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a[a.length-1],over20:a.filter(x=>x>20).length};};
    return{update:summarize(PERF.update),wanted:summarize(PERF.wanted),fx:summarize(PERF.fx),policePlusWantedPerFrame:summarize(PERF.frames),wholeFrame:summarize(PERF.wholeFrames),stats:__game.police.stats,contacts:PERF.contacts.length,errors:__game.errors,audioReady:__game.audio.ready,fxLights:__game.vehicles.filter(v=>v.isPolice&&v.sirenOn).length};
  });result.samples=samples;
  fs.writeFileSync(__dirname+'/'+tag+'-perf.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,samples:undefined}));await g.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
