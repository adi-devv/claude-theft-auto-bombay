const H=require('../harness');
(async()=>{const g=await H.launch({width:960,height:540,out:__dirname+'/shots'}); console.log(JSON.stringify(await g.state())); console.log(JSON.stringify(await g.eval(()=>({nodes:[...__game.roads.nodes.values()].filter(n=>['FLORA','HORN','REGAL'].includes(n.id)), extra:Object.keys(__game.debug.extra)})))); await g.close()})().catch(console.error);
