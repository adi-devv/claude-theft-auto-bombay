const H = require('../harness');
(async () => {
 const g = await H.launch({width:960,height:540,out:__dirname+'/shots'});
 const run = async (name, fn) => { const result = await g.eval(fn); console.log(name, JSON.stringify(result)); };
 await run('patrol', () => { __game.debug.step(12); return __game.debug.state(); });
 await run('crime', () => { let G=__game,p=G.player; G.police.clearAll(); G.debug.police.spawnPatrolAt(p.position.x+10,p.position.z,0); G.events.emit('crime',{type:'pedHit',x:p.position.x,z:p.position.z}); G.debug.step(10); return G.debug.state(); });
 await g.shot('dispatch');
 await run('escape', () => {let G=__game; G.police.clearAll(); G.debug.teleport(-200,-200,0); G.debug.step(20); return G.debug.state();});
 await run('foot_arrest', () => {let G=__game; G.police.clearAll(); G.wanted.setLevel(1); let p=G.player; G.debug.police.spawnFootAt(p.position.x+1,p.position.z); G.debug.step(2); return G.debug.state();});
 await g.shot('arrest');
 await g.close();
})().catch(e=>{console.error(e);process.exit(1)});
