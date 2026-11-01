const H=require('../harness');const fs=require('fs');const path=require('path');
(async()=>{
 const g=await H.launch({width:480,height:270,out:path.join(__dirname,'shots')});
 await g.eval(()=>{const G=__game;G.player.updateCamera=()=>{};G.city.timeScale=0;G.paused=true; const a=G.audio.ctx.createAnalyser();a.fftSize=2048;G.audio.bus('ambient').connect(a);window.__ambientProbe=a;});
 const out=[];
 for(const [name,x,z,h,seconds] of [['station',-273,55,18.4,10],['fort',180,110,18.4,12],['seawall',-426,150,18.4,10],['station-return',198,-440,18.4,24],['late-night',180,110,2.5,5]]) {
  await g.eval(({x,z,h})=>{__game.camera.position.set(x,2,z);__game.city.setTimeOfDay(h)},{x,z,h});
  await g.wait(seconds);
  const sample=await g.eval(()=>{const a=window.__ambientProbe,d=new Float32Array(a.fftSize);a.getFloatTimeDomainData(d);return {context:__game.audio.ctx.state,...__game.debug.extra.cityAmbient(),rms:Math.sqrt(d.reduce((s,x)=>s+x*x,0)/d.length),errors:__game.errors};});out.push({name,...sample});console.log(name,JSON.stringify(sample));
 }
 fs.writeFileSync(path.join(__dirname,'ambient-results.json'),JSON.stringify(out,null,2));await g.close();
})().catch(e=>{console.error(e);process.exit(1)});
