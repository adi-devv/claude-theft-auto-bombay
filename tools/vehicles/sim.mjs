// Headless telemetry for the vehicle physics (no browser). Usage: node tools/vehicles/sim.mjs [type...]
import { getSpec } from '../../work/vehicles/src/vehicles/tuning.js';
import { makePhysState, stepVehicle } from '../../work/vehicles/src/vehicles/physics.js';

const DT = 1 / 60;
const KMH = 3.6;
function mk(type, speed = 0) {
  const v = { spec: getSpec(type), position: { x: 0, z: 0 }, heading: 0, velocity: { x: 0, z: speed }, yawRate: 0,
    controls: { throttle: 0, brake: 0, steer: 0, handbrake: false }, ph: makePhysState(), wrecked: false };
  // pre-select a sensible gear for rolling starts
  if (speed > 0) { const s = v.spec; const rpmPer = 60 / (2 * Math.PI * s.wheelR) * s.final; v.ph.gear = 0; while (v.ph.gear < s.gears.length - 1 && speed * rpmPer * s.gears[v.ph.gear] > s.shiftUp * 0.8) v.ph.gear++; }
  return v;
}
const fwd = (v) => v.velocity.x * Math.sin(v.heading) + v.velocity.z * Math.cos(v.heading);
const spd = (v) => Math.hypot(v.velocity.x, v.velocity.z);
const step = (v) => stepVehicle(v, DT, null);

function accel(type) {
  const v = mk(type); v.controls.throttle = 1;
  let t = 0, t60 = null, t100 = null, t50 = null; const s = v.spec;
  while (t < 90) { step(v); t += DT; const k = fwd(v) * KMH; if (t50 == null && k >= 50) t50 = t; if (t60 == null && k >= 60) t60 = t; if (t100 == null && k >= 100) t100 = t; }
  return { t0_50: t50 && +t50.toFixed(2), t0_100: t100 && +t100.toFixed(2), vmax: +(fwd(v) * KMH).toFixed(1), target: s.vmaxKmh, gear: v.ph.gear + 1 };
}
function brake(type, from = 100) {
  const v = mk(type, from / KMH); v.controls.brake = 1;
  let t = 0, z0 = v.position.z; while (fwd(v) > 0.05 && t < 20) { step(v); t += DT; }
  return { from, dist: +(v.position.z - z0).toFixed(1), time: +t.toFixed(2) };
}
function holdSpeed(v, target) { const u = fwd(v); v.controls.throttle = u < target ? Math.min(1, (target - u) * 0.8 + 0.25) : 0; v.controls.brake = u > target + 1.5 ? 0.3 : 0; }
function turn90(type, kmh = 45) {
  const v = mk(type, kmh / KMH); const target = kmh / KMH;
  for (let i = 0; i < 60; i++) { holdSpeed(v, target); step(v); }
  const h0 = v.heading, p0 = { ...v.position }; let t = 0, maxBeta = 0, minSp = 99;
  v.controls.steer = 1; // right
  while (Math.abs(v.heading - h0) < Math.PI / 2 && t < 8) { v.controls.throttle = 0.35; step(v); t += DT; maxBeta = Math.max(maxBeta, Math.abs(v.ph.beta)); minSp = Math.min(minSp, spd(v)); }
  // displacement during the turn ~ radius
  const dx = v.position.x - p0.x, dz = v.position.z - p0.z;
  return { kmh, t90: +t.toFixed(2), radiusApprox: +((Math.abs(dx) + Math.abs(dz)) / 2).toFixed(1), exitKmh: +(spd(v) * KMH).toFixed(0), minKmh: +(minSp * KMH).toFixed(0), maxBetaDeg: +(maxBeta * 57.3).toFixed(1), done: Math.abs(v.heading - h0) >= Math.PI / 2 - 0.01 };
}
function steady(type, kmh, steer = 1) {
  const v = mk(type, kmh / KMH); const target = kmh / KMH; v.controls.steer = steer;
  for (let i = 0; i < 300; i++) { holdSpeed(v, target); step(v); }
  const ay = spd(v) * Math.abs(v.yawRate);
  return { kmh, steer, yawRateDeg: +(v.yawRate * 57.3).toFixed(1), radius: +(spd(v) / Math.abs(v.yawRate)).toFixed(1), latG: +(ay / 9.81).toFixed(2), betaDeg: +(v.ph.beta * 57.3).toFixed(1), speedKmh: +(spd(v) * KMH).toFixed(0) };
}
function handbrake(type, kmh = 60, hold = 1.0, steer = 1) {
  const v = mk(type, kmh / KMH);
  v.controls.steer = steer; v.controls.handbrake = true; let t = 0;
  const h0 = v.heading; let maxYaw = 0;
  while (t < hold) { step(v); t += DT; maxYaw = Math.max(maxYaw, Math.abs(v.yawRate)); }
  v.controls.handbrake = false; v.controls.steer = 0;
  while (t < 5 && (spd(v) > 0.5 || Math.abs(v.yawRate) > 0.05)) { v.controls.brake = 0; step(v); t += DT; }
  return { kmh, hold, rotDeg: +((v.heading - h0) * 57.3).toFixed(0), maxYawDeg: +(maxYaw * 57.3).toFixed(0), settleT: +t.toFixed(2), endKmh: +(spd(v) * KMH).toFixed(0) };
}
function hbDrift(type, kmh = 70) {
  // tap handbrake while steering, then keep throttle + steer to hold a drift; measure if it is catchable
  const v = mk(type, kmh / KMH); let t = 0; const log = [];
  while (t < 4) {
    // keyboard-like driver: flick right with handbrake, then bang-bang steer to hold ~25 deg of slide
    const bt = -0.44;
    if (t < 0.4) v.controls.steer = 1;
    else if (t < 3) v.controls.steer = v.ph.beta < bt - 0.08 ? -1 : v.ph.beta > bt + 0.08 ? 1 : 0;
    else v.controls.steer = 0;
    v.controls.handbrake = t < 0.4;
    v.controls.throttle = t > 0.4 ? 1 : 0;
    if (t > 0.8 && t < 3) { (v._b ||= []).push(v.ph.beta); }
    step(v); t += DT;
    if (Math.round(t * 60) % 15 === 0) log.push(`${t.toFixed(2)}s v=${(spd(v) * KMH).toFixed(0)} beta=${(v.ph.beta * 57.3).toFixed(0)} yaw=${(v.yawRate * 57.3).toFixed(0)}`);
  }
  const b = (v._b || []).map((x) => x * 57.3); const inDrift = b.filter((x) => x < -10 && x > -50).length / Math.max(1, b.length);
  return { driftShare: +inDrift.toFixed(2), meanBeta: +(b.reduce((a, c) => a + c, 0) / Math.max(1, b.length)).toFixed(1), endBetaDeg: +(v.ph.beta * 57.3).toFixed(1), endYaw: +(v.yawRate * 57.3).toFixed(1), endKmh: +(spd(v) * KMH).toFixed(0), log };
}
function slalom(type, kmh = 80, period = 2.0) {
  const v = mk(type, kmh / KMH); const target = kmh / KMH; let t = 0, maxBeta = 0, maxYaw = 0, spin = false; let latMax = 0;
  while (t < 8) { holdSpeed(v, target); v.controls.steer = Math.sign(Math.sin(2 * Math.PI * t / period)); step(v); t += DT; maxBeta = Math.max(maxBeta, Math.abs(v.ph.beta)); maxYaw = Math.max(maxYaw, Math.abs(v.yawRate)); latMax = Math.max(latMax, Math.abs(v.position.x)); if (Math.abs(v.ph.beta) > 0.6) spin = true; }
  return { kmh, maxBetaDeg: +(maxBeta * 57.3).toFixed(1), maxYawDeg: +(maxYaw * 57.3).toFixed(0), latSwing: +latMax.toFixed(1), spin, endKmh: +(spd(v) * KMH).toFixed(0) };
}
function lowSpeed(type) {
  const v = mk(type); let t = 0, jitter = 0; let prevYaw = 0;
  while (t < 6) { v.controls.throttle = t < 1 ? 0.4 : 0; v.controls.steer = t > 0.5 ? 1 : 0; v.controls.brake = t > 3 ? 1 : 0; step(v); t += DT; jitter += Math.abs(v.yawRate - prevYaw); prevYaw = v.yawRate; }
  return { jitterSum: +jitter.toFixed(2), endKmh: +(fwd(v) * KMH).toFixed(1), reversing: v.ph.reversing };
}
function steerTiming(type, kmh) {
  const v = mk(type, kmh / KMH); v.controls.steer = 1; let t = 0;
  while (v.ph.steer < 0.99 && t < 2) { step(v); t += DT; }
  const tin = t; v.controls.steer = 0; t = 0; while (v.ph.steer > 0.01 && t < 2) { step(v); t += DT; }
  return { kmh, tFull: +tin.toFixed(2), tReturn: +t.toFixed(2), maxAngleDeg: +(Math.abs(v.ph.steerAngle) * 57.3).toFixed(1) };
}

const types = process.argv.slice(2).length ? process.argv.slice(2) : ['sedan'];
for (const type of types) {
  console.log('=====', type);
  console.log('accel', JSON.stringify(accel(type)));
  console.log('brake', JSON.stringify(brake(type, type === 'bus' ? 50 : 100)));
  for (const k of [30, 45, 60]) console.log('turn90', JSON.stringify(turn90(type, k)));
  for (const k of [20, 50, 90, 140]) console.log('steady', JSON.stringify(steady(type, k)));
  for (const k of [40, 60, 90]) console.log('hb', JSON.stringify(handbrake(type, k, 1.0)));
  const d = hbDrift(type); console.log('hbDrift', JSON.stringify({ ...d, log: undefined })); if (process.env.LOG) console.log(d.log.join('\n'));
  for (const k of [60, 100]) console.log('slalom', JSON.stringify(slalom(type, k)));
  console.log('lowSpeed', JSON.stringify(lowSpeed(type)));
  for (const k of [10, 50, 120]) console.log('steerTiming', JSON.stringify(steerTiming(type, k)));
}
