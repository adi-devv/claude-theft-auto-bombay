// Whole-game draw-call budget, including shadow passes, sampled across overviews and hours.
const H=require('../harness'),path=require('path'),fs=require('fs');
(async()=>{
 const g=await H.launch({out:path.join(__dirname,'shots'),width:960,height:540});
 await g.wait(2); await g.eval(()=>__game.debug.step(8));
 await g.eval(()=>{const G=__game;G.city.timeScale=0;G.player.updateCamera=()=>{};G.paused=false;});
 const samples=[];
 for(const h of [12.5,18.4,21.5]) for(const [name,p,t,up] of [
  ['top',[-150,1100,60],[-150,0,0],[0,0,-1]],
  ['overview_n',[-100,500,650],[-100,0,-50],[0,1,0]],
  ['necklace',[-760,160,380],[-420,0,-80],[0,1,0]],
  ['overview_s',[0,500,-600],[-100,0,50],[0,1,0]],
 ]) {
  await g.eval(({h,p,t,up})=>{const G=__game;G.city.setTimeOfDay(h);G.camera.position.set(...p);G.camera.up.set(...up);G.camera.lookAt(...t);G.camera.updateMatrixWorld();},{h,p,t,up});await g.wait(.5);
  samples.push(await g.eval(({name,h})=>({name,h,calls:__game.renderer.info.render.calls,tris:__game.renderer.info.render.triangles}),{name,h}));
 }
 const result={samples,worstCalls:Math.max(...samples.map(s=>s.calls)),worstTriangles:Math.max(...samples.map(s=>s.tris)),...await g.eval(()=>({nVeh:__game.vehicles.length,city:__game.debug.extra.city(),errors:__game.errors}))};
 console.log(JSON.stringify(result));fs.writeFileSync(path.join(__dirname,'calls-results.json'),JSON.stringify(result,null,2));await g.close();
})().catch(e=>{console.error(e);process.exit(1)});


