const H=require('../harness');const fs=require('fs'),path=require('path');
(async()=>{
 const suffix=process.argv[2]||'final',g=await H.launch({width:960,height:540,out:path.join(__dirname,'shots')});
 await g.eval(()=>{__game.player.updateCamera=()=>{};__game.city.timeScale=0;__game.paused=true;});
 const horse=await g.eval(()=>{const s=__game.collision.shapes.find(s=>s.data.id==='kalaghoda');return s?{x:s.cx,z:s.cz,rot:s.rot}:null;});
 const specs=[
 ['sunset-west',[-420,4,140],[-1500,45,280],18.4],
 ['flora-close',[50,2,42],[60,5,55],12.5],
 ['clock',[-90,32,280],[-66,46,262],21.5],
 ['deco-oval',[-180,5,220],[-242,12,230],18.4],
 ['np-coast',[-520,60,520],[-320,15,470],18.4],
 ['cafe',[117,2.2,424],[101,3.1,412],18.4],
 ['gateway-steps',[440,18,420],[404,5,390],18.4],
 ['bus-stop',[-326,2.2,-385],[-334,1.4,-386],21.5],
 ['trees',[-150,2,200],[-230,8,190],21.5],
 ['horizon-noon',[-760,160,380],[-420,0,-80],12.5],
 ['horizon-dawn',[-760,160,380],[-420,0,-80],7.2],
 ];
 if(horse) specs.push(['horse',[horse.x+9,3.5,horse.z+7],[horse.x,4.2,horse.z],12.5]);
 const bus=await g.eval(()=>{const G=__game,list=G.city.furniture.filter(i=>i[0]==='bus').sort((a,b)=>Math.hypot(a[1]+334,a[2]+386)-Math.hypot(b[1]+334,b[2]+386));const [,x,z]=list[0],r=G.roads.nearest(x,z,40),dx=x-r.x,dz=z-r.z,L=Math.hypot(dx,dz);return {p:[x-dx/L*6.3+r.tx*2.8,2.2,z-dz/L*6.3+r.tz*2.8],t:[x,1.4,z]};});
 const bs=specs.find(s=>s[0]==='bus-stop');bs[1]=bus.p;bs[2]=bus.t;
 const results=[];
 for(const [name,p,t,h] of specs.filter(s=>!process.argv[3]||process.argv[3].split(',').includes(s[0]))){await g.eval(({p,t,h})=>{const G=__game;G.city.setTimeOfDay(h);G.camera.position.set(...p);G.camera.up.set(0,1,0);G.camera.lookAt(...t);G.camera.updateMatrixWorld();},{p,t,h});await g.wait(.5);await g.shot(name+'_'+suffix);const s=await g.state();results.push({name,h,calls:s.render.calls,triangles:s.render.triangles,errors:s.errors});}
 console.log(JSON.stringify({horse,results,city:await g.eval(()=>__game.debug.extra.city())}));fs.writeFileSync(path.join(__dirname,'review-'+suffix+'.json'),JSON.stringify(results,null,2));await g.close();
})().catch(e=>{console.error(e);process.exit(1)});
