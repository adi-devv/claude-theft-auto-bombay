// Time trace of one scenario. node --experimental-default-type=module tools/vehicles/trace.mjs type kmh [steer thr hb secs] ; P=... overrides
import { pathToFileURL, fileURLToPath } from 'node:url'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VP = process.env.VPATH || 'work/vehicles/src/vehicles'; const U = (p) => pathToFileURL(path.join(ROOT, p)).href;
const { getSpec, TYPES } = await import(U(VP + '/tuning.js')); const { makePhysState, stepVehicle } = await import(U(VP + '/physics.js'));
for (const kv of (process.env.P || '').split(',').filter(Boolean)) { const [k, val] = kv.split('='); (TYPES[process.argv[2] || 'sedan'] ||= {})[k] = +val; }
const [,, type = 'sedan', kmh = '90', st = '1', thr = 'hold', hb = '0', secs = '5'] = process.argv;
const s = getSpec(type), sp = +kmh / 3.6; const v = { spec: s, position: { x: 0, z: 0 }, heading: 0, velocity: { x: 0, z: sp }, yawRate: 0, controls: { throttle: 0, brake: 0, steer: 0, handbrake: false }, ph: makePhysState(), wrecked: false };
const rpmPer = 60 / (2 * Math.PI * s.wheelR) * s.final; while (v.ph.gear < s.gears.length - 1 && sp * rpmPer * s.gears[v.ph.gear] > s.shiftUp * 0.8) v.ph.gear++;
const f = () => v.velocity.x * Math.sin(v.heading) + v.velocity.z * Math.cos(v.heading);
if (!process.env.NOPRE) for (let i = 0; i < 90; i++) { v.controls.throttle = f() < sp ? 0.5 : 0; stepVehicle(v, 1 / 60, null); }
for (let i = 0; i < +secs * 60; i++) {
  const u = f();
  const on = hb === '1' || (hb !== '0' && i / 60 < +hb); v.controls.steer = on || hb === '0' ? +st : 0; v.controls.handbrake = on; v.controls.throttle = (thr === 'hold' && !(hb !== '0' && hb !== '1')) ? (u < sp ? Math.min(1, (sp - u) * 0.8 + 0.25) : 0) : +thr;
  stepVehicle(v, 1 / 60, null);
  if (i % 15 === 0) console.log(`t${(i / 60).toFixed(2)} spd${(Math.hypot(v.velocity.x, v.velocity.z) * 3.6).toFixed(0)} u${(u * 3.6).toFixed(0)} beta${(v.ph.beta * 57.3).toFixed(0)} w${(v.yawRate * 57.3).toFixed(0)} steerA${(v.ph.steerAngle * 57.3).toFixed(1)} aF${(v.ph.slipF * 57.3).toFixed(0)} aR${(v.ph.slipR * 57.3).toFixed(0)} thr${v.controls.throttle.toFixed(2)} drift${v.ph.drift ? 1 : 0}`);
}
