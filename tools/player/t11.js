// own car explodes while driving -> wasted -> respawn; punch cop -> copAssault; F while approaching cancels
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 640, height: 360 });
  await g.wait(1);
  console.log(JSON.stringify(await g.eval(() => {
    const G = __game, p = G.player, ev = []; for (const e of ['wasted', 'respawn', 'playerExitedVehicle', 'explosion']) G.events.on(e, (d) => ev.push(e));
    G.debug.spawnCar('sedan'); G.debug.step(0.3);
    const v = p.vehicle; v.damage(5000, { x: v.position.x, z: v.position.z });
    const log = [];
    for (let i = 0; i < 12; i++) { G.debug.step(0.5); log.push([p.state, p.mode, Math.round(p.health), +G.timeScale.toFixed(2)].join('/')); }
    return { ev, log, wrecked: v.wrecked };
  })));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
