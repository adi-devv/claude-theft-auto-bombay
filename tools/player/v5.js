const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots', width: 960, height: 540 });
  await g.wait(1);
  await g.eval(() => {
    const p = __game.player, G = __game;
    G.debug.spawnCar('sedan');
    G.debug.setWanted(4);
    G.wanted.lastKnown = { x: p.position.x + 20, z: p.position.z - 30 }; G.wanted.searchRadius = 70; G.wanted.flashing = true; G.wanted.seen = false;
    for (let i = 0; i < 3; i++) { const v = G.createVehicle({ type: 'police', x: p.position.x + 40 + i * 30, z: p.position.z - 50 - i * 40, heading: 0 }); v.ai = {}; v.driver = { kind: 'police' }; v.sirenOn = true; }
    G.player.vehicle.sirenOn = false;
  });
  await g.hold(['KeyW'], 1.5);
  await g.page.screenshot({ path: __dirname + '/shots/v5-mini.png', clip: { x: 0, y: 270, width: 330, height: 270 } });
  await g.page.screenshot({ path: __dirname + '/shots/v5-tr.png', clip: { x: 640, y: 0, width: 320, height: 140 } });
  await g.shot('v5-full');
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
