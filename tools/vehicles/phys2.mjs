// Headless feel + crash telemetry (no browser). Usage:
//   node --experimental-default-type=module tools/vehicles/phys2.mjs [type] [suite...]
// suites: steer sustained hb drift wall glance   (default: all). VPATH=game/src/vehicles runs the integrated (before) copy.
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VP = process.env.VPATH || 'work/vehicles/src/vehicles';
const U = (p) => pathToFileURL(path.join(ROOT, p)).href;
const { getSpec, TYPES } = await import(U(VP + '/tuning.js'));
// P="key=val,key=val" overrides spec fields for the chosen type (tuning experiments without editing files)
for (const kv of (process.env.P || '').split(',').filter(Boolean)) { const [k, val] = kv.split('='); (TYPES[process.argv[2] || 'sedan'] ||= {})[k] = +val; }
const { makePhysState, stepVehicle } = await import(U(VP + '/physics.js'));
const { StaticCollision } = await import(U(VP.replace(/vehicles$/, 'world') + '/collision.js'));

const DT = 1 / 60, KMH = 3.6, D = 180 / Math.PI;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
function mk(type, kmh = 0, x = 0, z = 0, heading = 0) {
  const s = getSpec(type), sp = kmh / KMH;
  const v = { spec: s, position: { x, z }, heading, velocity: { x: Math.sin(heading) * sp, z: Math.cos(heading) * sp }, yawRate: 0,
    controls: { throttle: 0, brake: 0, steer: 0, handbrake: false }, ph: makePhysState(), wrecked: false, disabled: false };
  if (sp > 0) { const rpmPer = 60 / (2 * Math.PI * s.wheelR) * s.final; while (v.ph.gear < s.gears.length - 1 && sp * rpmPer * s.gears[v.ph.gear] > s.shiftUp * 0.8) v.ph.gear++; }
  return v;
}
const fwd = (v) => v.velocity.x * Math.sin(v.heading) + v.velocity.z * Math.cos(v.heading);
const spd = (v) => Math.hypot(v.velocity.x, v.velocity.z);
const beta = (v) => (spd(v) > 3 ? wrap(v.heading - Math.atan2(v.velocity.x, v.velocity.z)) : 0); // + = nose left of travel (same sign as ph.beta)
const hold = (v, kmh) => { const u = fwd(v) * KMH; v.controls.throttle = u < kmh ? Math.min(1, (kmh - u) * 0.08 + 0.2) : 0; v.controls.brake = u > kmh + 6 ? 0.3 : 0; };
const f1 = (x, n = 1) => +x.toFixed(n);

function steer(type, kmh, hold_s = 0.5) {
  const v = mk(type, kmh); for (let i = 0; i < 90; i++) { hold(v, kmh); stepVehicle(v, DT, null); }
  const h0 = v.heading;
  let t = 0, peakB = 0, peakW = 0; const tail = {};
  while (t < hold_s + 3) {
    if (t < hold_s) { v.controls.steer = 1; hold(v, kmh); } else { v.controls.steer = 0; v.controls.throttle = 0; v.controls.brake = 0; }
    stepVehicle(v, DT, null); t += DT; const b = Math.abs(beta(v)) * D, w = Math.abs(v.yawRate) * D;
    peakB = Math.max(peakB, b); peakW = Math.max(peakW, w);
    for (const k of [0.25, 0.5, 1, 1.5, 2]) if (Math.abs(t - hold_s - k) < DT / 2) tail[k] = `${f1(w, 0)}d/s b${f1(b, 1)}`;
  }
  return { kmh, peakSlipDeg: f1(peakB), peakYawDeg: f1(peakW, 0), hdgDeg: f1(wrap(v.heading - h0) * D, 0), tail };
}
function sustained(type, kmh, secs = 2.5) {
  const v = mk(type, kmh); for (let i = 0; i < 90; i++) { hold(v, kmh); stepVehicle(v, DT, null); }
  let t = 0, peakB = 0, spin = false;
  while (t < secs) { v.controls.steer = 1; hold(v, kmh); stepVehicle(v, DT, null); t += DT; peakB = Math.max(peakB, Math.abs(beta(v)) * D); if (Math.abs(beta(v)) > 1.2) spin = true; }
  const endB = Math.abs(beta(v)) * D, endW = Math.abs(v.yawRate) * D;
  v.controls.steer = 0; v.controls.throttle = 0; let tr = 0, tB = null;
  while (tr < 4) { stepVehicle(v, DT, null); tr += DT; if (tB == null && Math.abs(beta(v)) * D < 1.5 && Math.abs(v.yawRate) * D < 3) tB = tr; }
  return { kmh, peakSlipDeg: f1(peakB), endSlipDeg: f1(endB), endYawDeg: f1(endW, 0), spin, tRecover: tB && f1(tB, 2), endKmh: f1(spd(v) * KMH, 0) };
}
function handbrake(type, kmh, holdS = 1.0, st = 1, thr = 0) {
  const v = mk(type, kmh); for (let i = 0; i < 90; i++) { hold(v, kmh); stepVehicle(v, DT, null); }
  let hdg = 0, prev = v.heading, t = 0, minU = 1e9, peakW = 0, peakB = 0, tRel = null, tRec = null; const tl = [];
  while (t < holdS + 5) {
    const on = t < holdS; v.controls.handbrake = on; v.controls.steer = on ? st : 0; v.controls.throttle = on ? 0 : thr; v.controls.brake = 0;
    if (!on && tRel == null) tRel = t;
    stepVehicle(v, DT, null); t += DT; hdg += wrap(v.heading - prev); prev = v.heading;
    minU = Math.min(minU, fwd(v)); peakW = Math.max(peakW, Math.abs(v.yawRate)); peakB = Math.max(peakB, Math.abs(beta(v)));
    if (tRel != null && tRec == null && t - tRel > 0.1 && Math.abs(beta(v)) < 0.17 && Math.abs(v.yawRate) < 0.25) tRec = t - tRel;
    if (Math.abs(t - holdS) < DT / 2 || Math.abs(t - holdS - 1) < DT / 2 || Math.abs(t - holdS - 2) < DT / 2) tl.push(`t${f1(t, 1)}: hdg${f1(hdg * D, 0)} b${f1(beta(v) * D, 0)} u${f1(fwd(v) * KMH, 0)}`);
  }
  return { kmh, hdgDeg: f1(hdg * D, 0), peakYawDeg: f1(peakW * D, 0), peakBeta: f1(peakB * D, 0), minKmh: f1(minU * KMH, 1), endKmh: f1(fwd(v) * KMH, 0), recoverAfterRelease: tRec && f1(tRec, 2), tl: tl.join(' | ') };
}
// drift hold: flick right with handbrake 0.4 s, then throttle; the bot steers to keep slip near targetBeta (countersteer)
function drift(type, kmh = 70, mode = 'bot') {
  const v = mk(type, kmh); for (let i = 0; i < 90; i++) { hold(v, kmh); stepVehicle(v, DT, null); }
  let t = 0, inD = 0, n = 0, spin = false, maxB = 0; const bt = 0.5; // flick right => nose right of travel => beta < 0
  while (t < 5) {
    const flick = t < 0.4;
    v.controls.handbrake = flick; v.controls.throttle = flick ? 0 : 1;
    if (flick) v.controls.steer = 1;
    else if (mode === 'none') v.controls.steer = 0;
    else { const b = -beta(v); /* positive = nose right of travel */ v.controls.steer = Math.abs(b - bt) < 0.06 ? 0 : b > bt ? -1 : 1; /* too much slide -> steer left (countersteer) */ }
    stepVehicle(v, DT, null); t += DT;
    if (t > 1.0) { const b = Math.abs(beta(v)); n++; if (b > 0.17 && b < 1.0) inD++; maxB = Math.max(maxB, b); if (b > 1.3) spin = true; }
  }
  return { kmh, mode, driftShare: f1(inD / n, 2), maxBetaDeg: f1(maxB * D, 0), endKmh: f1(spd(v) * KMH, 0), endBetaDeg: f1(beta(v) * D, 0), spin };
}
// walls: long wall at z=100 facing -z. heading bias rotates the approach (rad, +left)
function wall(type, kmh, bias = 0, offsetX = 0, side = false) {
  const col = new StaticCollision();
  if (side) col.addBox(4, 150, 0.5, 200, 0, { h: 3 }); else col.addBox(0, 100, 60, 0.5, 0, { h: 3 });
  const hit = []; const env = { collision: col, onContact: (v, c) => hit.push(c) };
  const v = side ? mk(type, kmh, 0, -20, bias) : mk(type, kmh, offsetX, 99 - 10 - kmh * 0.5, bias);
  // aim so that the contact happens well inside the wall
  let t = 0, peakW = 0, dmg = 0, minF = 1e9, maxVn = 0, lastHitT = -9; const impulses = []; const u0 = spd(v) * KMH;
  while (t < 6) {
    v.controls.throttle = 1; hit.length = 0;
    stepVehicle(v, DT, env); t += DT;
    for (const c of hit) {
      maxVn = Math.max(maxVn, c.vn);
      const dv = c.dv ?? Math.max(c.jn / v.spec.mass, c.vn * 0.7);
      if (dv > 1.2) { dmg += Math.max(0, dv - 4) * 20; if (t - lastHitT > 0.2) impulses.push(Math.round(dv * v.spec.mass)); lastHitT = t; }
    }
    peakW = Math.max(peakW, Math.abs(v.yawRate)); minF = Math.min(minF, fwd(v));
  }
  return { kmh0: f1(u0, 0), bias, endKmh: f1(spd(v) * KMH, 0), endFwdKmh: f1(fwd(v) * KMH, 0), minFwdKmh: f1(minF * KMH, 1), peakYaw: f1(peakW, 2), dmgHP: Math.round(dmg), maxVn: f1(maxVn, 1), impulses: impulses.slice(0, 5).join(','), endHdgDeg: f1(v.heading * D, 0) };
}

const [,, type = 'sedan', ...suites0] = process.argv; const suites = suites0.length ? suites0 : ['steer', 'sustained', 'hb', 'drift', 'wall', 'glance'];
const row = (l, o) => console.log(l.padEnd(18), JSON.stringify(o));
console.log('=====', type, process.env.VPATH || '(sandbox)');
if (suites.includes('steer')) for (const k of [30, 60, 100, 140]) row('steer0.5s@' + k, steer(type, k));
if (suites.includes('sustained')) for (const k of [60, 100, 140]) row('sustained@' + k, sustained(type, k));
if (suites.includes('hb')) { for (const k of [40, 60, 100]) row('hb1s@' + k, handbrake(type, k)); row('hb0.5s@100', handbrake(type, 100, 0.5)); row('hb0.5s+thr@100', handbrake(type, 100, 0.5, 1, 1)); row('hbNoSteer@100', handbrake(type, 100, 1.0, 0)); }
if (suites.includes('drift')) { row('drift bot@70', drift(type, 70, 'bot')); row('drift none@70', drift(type, 70, 'none')); row('drift bot@100', drift(type, 100, 'bot')); }
if (suites.includes('wall')) for (const k of [40, 60, 95]) { row('wall@' + k, wall(type, k, 0)); row('wall off@' + k, wall(type, k, 0.03, 0.8)); }
if (suites.includes('glance')) for (const [k, b] of [[86, 0.2], [67, 0.35], [100, 0.17], [56, 0.25], [86, -0.2]]) row(`glance@${k} b${b}`, wall(type, k, b, 0, true));
