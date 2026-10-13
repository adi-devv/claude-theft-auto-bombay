const H = require('../harness');
const pl = (g) => g.eval(() => { const p = __game.player; return { mode: p.mode, state: p.state, action: p.action, x: +p.position.x.toFixed(1), z: +p.position.z.toFixed(1), hp: Math.round(p.health), ts: __game.timeScale }; });
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540, query: 'title=1' });
  await g.wait(1);
  console.log('started after harness click?', await g.eval(() => __game.started));
  await g.eval(() => __game.hud.showTitle());
  await g.wait(2.5);
  console.log('title', await g.eval(() => [__game.started, __game.hud.titleVisible]));
  await g.shot('t3-title');
  await g.tap('Enter'); await g.wait(2.2);
  console.log('after enter', await g.eval(() => [__game.started, __game.hud.titleVisible]), JSON.stringify(await pl(g)));
  // car hit: spawn a car 25 m away driving at us
  await g.eval(() => { const p = __game.player; window.__ev = []; for (const e of ['wasted','busted','respawn','playerHit']) __game.events.on(e, (d) => __ev.push(e + (d && d.x != null ? `@${Math.round(d.x)},${Math.round(d.z)}` : ''))); const v = __game.createVehicle({ type: 'sedan', x: p.position.x, z: p.position.z - 30, heading: 0 }); v.driver = { kind: 'test' }; window.__hv = v; });
  for (let i = 0; i < 60; i++) { await g.eval(() => __hv.setControls({ throttle: 1 })); await g.wait(0.05); const s = await pl(g); if (s.action === 'down') { console.log('HIT', JSON.stringify(s), await g.eval(() => Math.round(__hv.kmh))); break; } }
  await g.eval(() => __hv.setControls({ throttle: 0, brake: 1 }));
  await g.wait(3);
  console.log('after hit', JSON.stringify(await pl(g)));
  // wasted
  await g.eval(() => __game.player.damage(500, 'test'));
  await g.wait(1.3); console.log('wasted', JSON.stringify(await pl(g)));
  await g.shot('t3-wasted');
  await g.wait(5); console.log('respawned', JSON.stringify(await pl(g)), await g.eval(() => [JSON.stringify(__ev), JSON.stringify(__game.debug.playerSpots())]));
  // busted from a car
  await g.eval(() => __game.debug.spawnCar('police'));
  await g.wait(0.5); await g.eval(() => __game.player.bust());
  await g.wait(1.5); console.log('busted', JSON.stringify(await pl(g)));
  await g.wait(5); console.log('released', JSON.stringify(await pl(g)), await g.eval(() => JSON.stringify(__ev)));
  // big map
  await g.tap('KeyM'); await g.wait(0.4);
  console.log('paused w/ map', await g.eval(() => __game.paused));
  await g.shot('t3-bigmap');
  await g.tap('KeyM'); await g.tap('KeyP'); await g.wait(0.2);
  console.log('paused', await g.eval(() => __game.paused)); await g.tap('KeyP'); console.log('unpaused', await g.eval(() => __game.paused));
  console.log('errors', JSON.stringify((await g.state()).errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
