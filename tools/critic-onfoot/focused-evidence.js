// Focus the observer on native crowd overlaps and green-light crossing starts.
const H=require('../harness'),fs=require('fs'),path=require('path');
const data={pairs:[],crossings:[],states:[]},file=path.join(__dirname,'focused-evidence.json');const save=()=>fs.writeFileSync(file,JSON.stringify(data,null,2));
(async()=>{const g=await H.launch({width:960,height:540,out:path.join(__dirname,'shots')});try{
await g.wait(3);await g.eval(()=>{__game.player.teleport(57,14,0);window.qf={crosses:[]};const old=__game.pedSystem.update;__game.pedSystem.update=function(dt){const r=old.call(this,dt);for(const p of __game.peds){if(p.crossing&&!p._qfCross){const c=p.path?.crossing,ctrl=__game.debug.traffic.sig.ctrl.find(x=>x.node.id===c?.node),apps=ctrl?.groups.flatMap(x=>x.apps).filter(a=>a.edge.id===c.edge)||[];const signals=apps.map(a=>({key:a.key,s:__game.debug.traffic.sig.state(ctrl.node,a.key)?.s}));if(signals.some(a=>a.s===0))qf.crosses.push({id:p.id,t:__game.time,pos:p.position.toArray(),c,signals});}p._qfCross=p.crossing;}return r;};});
for(let i=0;i<80;i++){
 const pair=await g.eval(()=>{__game.debug.step(.25);const ps=__game.peds.filter(p=>p.state==='walk'&&p.activity==='walk');let best=null;for(let i=0;i<ps.length;i++)for(let j=0;j<i;j++){const a=ps[i],b=ps[j],d=a.position.distanceTo(b.position);if(d<.32&&a.position.distanceTo(__game.player.position)<70&&(!best||d<best.d))best={a:a.id,b:b.id,d,ax:a.position.x,az:a.position.z,bx:b.position.x,bz:b.position.z};}return best;});
 if(pair){data.pairs.push(pair);await g.eval(p=>{const mx=(p.ax+p.bx)/2,mz=(p.az+p.bz)/2;const n=__game.roads.nearest(mx,mz);const x=mx-n.tx*5,z=mz-n.tz*5;__game.player.teleport(x,z,Math.atan2(n.tx,n.tz));},pair);await g.wait(.12);data.states.push(await g.state());await g.shot('e-ped-overlap');break;}
}
await g.eval(()=>{__game.player.teleport(-65,-104,Math.PI);qf.crosses=[];});await g.wait(2);
let found=null;
for(let i=0;i<160;i++){
 found=await g.eval(()=>{__game.debug.step(.25);return qf.crosses.find(e=>{const p=__game.peds.find(p=>p.id===e.id);return p?.crossing&&Math.hypot(e.pos[0]+73,e.pos[2]+116)<120;})||null;});
 if(found){data.crossings.push(found);await g.eval(e=>{const p=__game.peds.find(p=>p.id===e.id),c=e.c;__game.player.teleport(p.position.x-c.tx*7,p.position.z-c.tz*7,Math.atan2(c.tx,c.tz));},found);await g.wait(.15);data.states.push(await g.state());await g.shot('e-green-ped-crossing');break;}
}
data.allGreen=await g.eval(()=>qf.crosses);save();
}catch(e){data.failure=String(e.stack);throw e;}finally{save();await g.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
