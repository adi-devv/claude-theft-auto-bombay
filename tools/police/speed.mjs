// Real police engine/gearbox + both versions of the police driver on a virtual clear
// straight. Complements critic chase runs: terrain/steering/traffic are isolated here.
// Run: node --experimental-default-type=module tools/police/speed.mjs
import fs from 'node:fs';
import { getSpec } from '../../work/police/src/vehicles/tuning.js';
import { makePhysState, stepVehicle } from '../../work/police/src/vehicles/physics.js';

const results = {};
for (const [tag, dir] of [['before', '../../game'], ['after', '../../work/police']]) {
  const { driveCar } = await import(dir + '/src/ai/policeNav.js');
  const source = fs.readFileSync(new URL(dir + '/src/ai/police.js', import.meta.url), 'utf8');
  const caps = JSON.parse(source.match(/vmax:\s*(\[[^\]]+\])/)[1]);
  results[tag] = [];
  for (const stars of [1, 2, 3, 4, 5]) {
    const spec = getSpec('police');
    const v = { spec, width: spec.width, length: spec.length, position: { x: 0, z: 0 },
      velocity: { x: 0, z: 0 }, heading: 0, yawRate: 0, ph: makePhysState(),
      controls: { throttle: 0, brake: 0, steer: 0, handbrake: false },
      get speed() { return this.velocity.z; }, setControls(c) { Object.assign(this.controls, c); } };
    const ctl = {}, samples = [];
    for (let i = 0; i < 90 * 60; i++) {
      driveCar(v, ctl, 1 / 60, { x: 0, z: 100000 }, caps[stars], { game: {}, noAvoid: true });
      stepVehicle(v, 1 / 60, null, false);
      if (i >= 80 * 60) samples.push(v.speed * 3.6);
    }
    results[tag].push({ stars, capKmh: caps[stars] * 3.6,
      physicalSteadyKmh: samples.reduce((a, b) => a + b, 0) / samples.length,
      maxKmh: Math.max(...samples) });
  }
}
fs.writeFileSync(new URL('physical-speed.json', import.meta.url), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
