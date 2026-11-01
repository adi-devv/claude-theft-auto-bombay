// police chase scenarios 1..4 stars
const L = require('./lib'); const fs=require('fs');
const [,, ...args] = process.argv;
const cfgs = args.length? args.map(a=>{const [type,lvl,s0,secs]=a.split(':');return {type,lvl:+lvl,s0:+(s0||30),secs:+(secs||45)}}) :
  [{type:'sedan',lvl:1,s0:30,secs:34},{type:'taxi',lvl:2,s0:30,secs:42},{type:'taxi',lvl:3,s0:30,secs:42},{type:'taxi',lvl:4,s0:30,secs:42}];
(async () => {
  const g = await L.start(); await L.installMD(g); await L.installNav(g);
  await g.eval(()=>{ const G=__game; window.PZ={seen:new Set(), spawnEv:[], samples:[], maxCars:0};
    const P=G.debug.police.api; });
  const results=[];
  for (const c of cfgs) {
    for(let k=0;k<40;k++){ const st=await g.eval(()=>__game.player.state); if(st==='normal') break; await g.wait(0.5); }
    await g.eval(()=>{__game.wanted.clear(); __game.debug.police.api.clearAll&&__game.debug.police.api.clearAll();}); await g.wait(1);
    await g.eval(({type,s0})=>{ const G=__game; G.wanted.clear(); G.debug.police.api.clearAll&&G.debug.police.api.clearAll(); window.AP=null; const p=MD.lanePt(s0,1,1); G.debug.teleport(p.x,p.z,Math.atan2(p.hx,p.hz)); G.debug.spawnCar(type); window.PZ={seen:new Set(),spawnEv:[],samples:[],maxCars:0}; }, c);
    await g.wait(0.5); await L.clean(g); await g.wait(1);
    const stat0 = await g.eval(()=>({...__game.police.stats, ...__game.debug.extra.police().stats}));
    await g.eval((lvl)=>{ __game.debug.setWanted(lvl); window.AP={dir:1,lane:1}; }, c.lvl);
    await g.down('KeyW');
    const t0 = Date.now(); let shots=0, closeShot=false, rbShot=false, tl=[];
    const name=`chase-${c.lvl}-${c.type}`;
    let ended=null;
    while ((Date.now()-t0)/1000 < c.secs) {
      const d = await g.eval(()=>{ const G=__game, P=G.debug.police.api, pv=G.player.vehicle, pp=G.player.position; const ex=G.debug.extra.police(); const rows=P.units.filter(u=>u.kind==='car').map(u=>({id:u.id,mode:u.mode,d:Math.hypot(u.position.x-pp.x,u.position.z-pp.z),kmh:Math.abs(u.vehicle.speed)*3.6,vis:P.isVisible(u.position.x,u.position.z),rammer:u.rammer,age:G.time-u.bornT,hp:u.vehicle.health}));
        for(const r of rows){ if(!PZ.seen.has(r.id)){ PZ.seen.add(r.id); PZ.spawnEv.push({id:r.id,t:+G.time.toFixed(1),d:Math.round(r.d),vis:r.vis,mode:r.mode}); } }
        return {t:+G.time.toFixed(1),state:G.player.state,mode:G.player.mode,lvl:G.wanted.level,esc:+(G.wanted.escapeProgress||0).toFixed(2),sr:G.wanted.searchRadius,seen:!!G.wanted.seen,pk:pv?Math.round(pv.speed*3.6):0,px:Math.round(pp.x),pz:Math.round(pp.z),cars:rows.length,foot:ex.foot,rb:ex.roadblocks,rams:ex.stats.rams,minD:rows.length?Math.round(Math.min(...rows.map(r=>r.d))):null,rows:rows.map(r=>[r.id,r.mode,Math.round(r.d),Math.round(r.kmh),r.vis?1:0,r.rammer?1:0]),hp:G.player.health,vhp:pv&&Math.round(pv.health),errs:G.errors.length}; });
      tl.push(d);
      if (!closeShot && d.minD!==null && d.minD<14) { closeShot=true; await g.shot(name+'-close'); }
      if (!rbShot && d.rb>0 && d.pk>0) { rbShot=true; await g.shot(name+'-roadblock'); }
      if (d.state!=='normal' && !ended) { ended={t:d.t,state:d.state}; await g.shot(name+'-end-'+d.state); break; }
      await g.wait(0.4);
    }
    await g.shot(name+'-final');
    await g.up('KeyW');
    const out = await g.eval(()=>({spawn:PZ.spawnEv, ev:{wanted:obs.wanted, crime:obs.crime}, st:__game.debug.extra.police().stats, coll:obs.coll.filter(c=>c.pl).length, collAll:obs.coll.length, statP:obs.stat.filter(s=>s.pl).length}));
    const minD=Math.min(...tl.map(r=>r.minD??1e9)); const maxCars=Math.max(...tl.map(r=>r.cars));
    const summary={cfg:c, ended, minD, maxCars, maxFoot:Math.max(...tl.map(r=>r.foot)), maxRb:Math.max(...tl.map(r=>r.rb)), finalLvl:tl[tl.length-1].lvl, esc:tl[tl.length-1].esc, finalRams:out.st.rams, playerCollisions:out.coll, wallHits:out.statP, spawnInView: out.spawn.filter(s=>s.vis).length, spawnTotal: out.spawn.length, spawnMinDist: Math.min(...out.spawn.map(s=>s.d)), spawn:out.spawn.slice(0,10), maxPk:Math.max(...tl.map(r=>r.pk)), vhpEnd: tl[tl.length-1].vhp, wanted:out.ev.wanted};
    console.log(name, JSON.stringify(summary));
    fs.writeFileSync(__dirname+`/${name}.json`, JSON.stringify({summary,tl},null,0));
  }
  await g.close();
})().catch(e=>{console.error(e);process.exit(1)});
