// Close-up beauty shots of each model (front 3/4 + rear 3/4), optional night.
const H = require('../harness');
(async () => {
  const g = await H.launch({ out: __dirname + '/shots' });
  const types = (process.argv[2] || 'taxi,hatch,sedan,suv,police,van,bus').split(',');
  const night = process.argv[3] === 'night';
  await g.eval(() => { __game.debug.teleport(-380, 120, Math.PI); });
  for (const t of types) {
    await g.eval(([t, night]) => {
      const G = __game;
      (G._shotCars || []).forEach((v) => v.destroy());
      const v = G.createVehicle({ type: t, x: -400, z: 230, heading: 0.0 });
      v.driver = { kind: 'test' };
      if (t === 'police') v.sirenOn = true;
      G._shotCars = [v];
      if (night && !G._nightSet) {
        G._nightSet = true; G.city.isNight = true; G.city.lightLevel = 0.08;
        G.scene.traverse((o) => { if (o.isLight && !o.isSpotLight) o.intensity *= 0.07; });
        G.scene.background = new (G.scene.background?.constructor || Object)(0x0a0f1c);
        if (G.scene.fog) G.scene.fog.color.setHex(0x0a0f1c);
      }
    }, [t, night]);
    for (const [name, ang, d, y] of [['f', 0.7, 1, 0.5], ['r', 3.6, 1, 0.55]]) {
      await g.eval(([ang, d, y, t]) => {
        const G = __game, L = t === 'bus' ? 13 : 6.5;
        G.player.updateCamera = () => { G.camera.position.set(-400 + Math.sin(ang) * L * d, L * y * 0.45 + 0.6, 230 + Math.cos(ang) * L * d); G.camera.lookAt(-400, t === 'bus' ? 2 : 0.8, 230); };
      }, [ang, d, y, t]);
      await g.wait(0.35);
      await g.shot(`close-${t}-${name}${night ? '-night' : ''}`);
    }
  }
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
