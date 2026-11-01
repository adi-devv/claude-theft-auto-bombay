// Per-type vehicle specs. Pure data + derivation (no three.js) so tools can run the physics in node.
// Units: metres, kg, seconds, N, Nm, radians. Speeds in m/s unless the key says kmh.
export const G = 9.81;
const DEG = Math.PI / 180;

const BASE = {
  // dimensions
  length: 4.4, width: 1.75, height: 1.45, wheelbase: 2.6, track: 1.5, wheelR: 0.31, frontWeight: 0.55, cgH: 0.52,
  overhangF: null,          // derived if null (body centred on axles with slight front bias)
  inertiaScale: 1.0,
  mass: 1300,
  // engine / gearbox
  drive: 'rwd',             // 'rwd' | 'fwd' | 'awd'
  idle: 850, redline: 6200, peakRpm: 4200, torque: 190, gears: [3.4, 2.1, 1.45, 1.1, 0.88], final: null, eff: 0.88,
  vmaxKmh: 160, shiftTime: 0.18, launchRpm: 3000, engineBrake: 0.9, reverseMaxKmh: 26, reverseForceG: 0.32,
  dragFrac: 0.8,            // share of top-gear force eaten by drag at vmax (<1 -> car reaches limiter gently)
  crr: 0.015,
  // tyres
  mu: 1.2, muLong: 1.25, peakSlip: 7.5 * DEG, frontC: 1.25, rearC: 1.42, rearGrip: 1.07,
  // brakes
  brakeG: 1.05, brakeBias: 0.62, hbMu: 0.62,
  // steering (max wheel angle at standstill; speed limiting is derived from grip)
  maxSteer: 36 * DEG, steerRate: 4.0, steerRateFast: 2.4, returnRate: 7.0, steerSlack: 1.1,
  // assists
  counterSteer: 0.55, stability: 0.35, hbYaw: 1.0, hbKick: 1.5, driftGrip: 0.85, antiSpin: 4.0, spinBeta: 0.42,
  // visuals
  rollK: 0.035, pitchK: 0.018, suspension: 1.0,
  // damage
  durability: 1.0,
  // audio
  hornF: [415, 520], cylinders: 4, engineTone: 1.0,
};

export const TYPES = {
  // Premier Padmini kaali-peeli: old RWD Fiat 1100 derivative. Slow, soft, floaty.
  taxi: {
    length: 4.0, width: 1.58, height: 1.47, wheelbase: 2.34, track: 1.25, wheelR: 0.29, mass: 950, cgH: 0.55, frontWeight: 0.54,
    drive: 'rwd', torque: 108, peakRpm: 3200, redline: 5400, gears: [3.75, 2.3, 1.5, 1.0], vmaxKmh: 112, launchRpm: 2400,
    mu: 1.02, muLong: 1.05, peakSlip: 8.5 * DEG, frontC: 1.2, rearC: 1.38, brakeG: 0.95,
    maxSteer: 38 * DEG, steerRate: 3.4, steerRateFast: 2.1, counterSteer: 0.6, stability: 0.6,
    rollK: 0.06, pitchK: 0.03, suspension: 1.4, hornF: [400, 500], cylinders: 4, engineTone: 0.8,
  },
  // Maruti 800-ish: tiny, light, FWD, buzzy 3-cylinder.
  hatch: {
    length: 3.35, width: 1.45, height: 1.4, wheelbase: 2.18, track: 1.22, wheelR: 0.27, mass: 720, cgH: 0.5, frontWeight: 0.6,
    drive: 'fwd', torque: 72, peakRpm: 3600, redline: 6200, gears: [3.5, 2.1, 1.4, 1.0], vmaxKmh: 132, launchRpm: 3000,
    mu: 1.08, muLong: 1.1, peakSlip: 7.5 * DEG, frontC: 1.22, rearC: 1.35, brakeG: 0.98,
    maxSteer: 38 * DEG, steerRate: 4.4, steerRateFast: 2.4, counterSteer: 0.55, stability: 0.6, rearGrip: 1.2,
    rollK: 0.045, pitchK: 0.025, suspension: 1.2, hornF: [470, 590], cylinders: 3, engineTone: 1.25,
  },
  // Generic modern sedan: the fun one.
  sedan: {
    length: 4.5, width: 1.78, height: 1.42, wheelbase: 2.68, track: 1.52, wheelR: 0.31, mass: 1300, cgH: 0.5, frontWeight: 0.53,
    drive: 'rwd', torque: 265, peakRpm: 4300, redline: 6800, gears: [3.3, 2.05, 1.45, 1.1, 0.88], vmaxKmh: 162, launchRpm: 3200,
    mu: 1.26, muLong: 1.3, peakSlip: 7 * DEG, frontC: 1.25, rearC: 1.32, brakeG: 1.06,
    maxSteer: 36 * DEG, counterSteer: 0.55, stability: 0.45,
    rollK: 0.035, pitchK: 0.018, hornF: [415, 520], engineTone: 1.0,
  },
  suv: {
    length: 4.6, width: 1.86, height: 1.8, wheelbase: 2.72, track: 1.58, wheelR: 0.36, mass: 1850, cgH: 0.7, frontWeight: 0.56,
    drive: 'awd', torque: 330, peakRpm: 3000, redline: 4800, gears: [3.6, 2.15, 1.4, 1.0, 0.8], vmaxKmh: 150, launchRpm: 2200,
    mu: 1.08, muLong: 1.12, peakSlip: 8 * DEG, frontC: 1.22, rearC: 1.36, brakeG: 0.98,
    maxSteer: 35 * DEG, steerRate: 3.4, steerRateFast: 2.1, counterSteer: 0.6, stability: 0.45,
    rollK: 0.05, pitchK: 0.022, suspension: 1.15, durability: 1.25, hornF: [380, 470], engineTone: 0.75, inertiaScale: 1.1,
  },
  // Mumbai Police: white SUV-ish (Bolero/Innova feel) but fast and grippy.
  police: {
    length: 4.6, width: 1.84, height: 1.78, wheelbase: 2.75, track: 1.58, wheelR: 0.34, mass: 1700, cgH: 0.62, frontWeight: 0.55,
    drive: 'awd', torque: 400, peakRpm: 4200, redline: 6400, gears: [3.3, 2.05, 1.45, 1.1, 0.88], vmaxKmh: 172, launchRpm: 3200,
    mu: 1.32, muLong: 1.35, peakSlip: 7 * DEG, frontC: 1.25, rearC: 1.4, brakeG: 1.1,
    maxSteer: 36 * DEG, counterSteer: 0.6, stability: 0.6,
    rollK: 0.035, pitchK: 0.018, durability: 1.5, hornF: [430, 540], engineTone: 0.9,
  },
  // Maruti Omni: tall box on tiny wheels.
  van: {
    length: 3.4, width: 1.42, height: 1.85, wheelbase: 1.84, track: 1.22, wheelR: 0.26, mass: 820, cgH: 0.68, frontWeight: 0.5,
    drive: 'rwd', torque: 74, peakRpm: 3200, redline: 5600, gears: [3.6, 2.2, 1.45, 1.0], vmaxKmh: 104, launchRpm: 2600,
    mu: 0.98, muLong: 1.02, peakSlip: 8.5 * DEG, frontC: 1.2, rearC: 1.36, brakeG: 0.92,
    maxSteer: 38 * DEG, steerRate: 3.6, counterSteer: 0.6, stability: 0.7, rearGrip: 1.17,
    rollK: 0.07, pitchK: 0.03, suspension: 1.3, hornF: [450, 560], cylinders: 3, engineTone: 1.15,
  },
  // BEST double-decker: slow, heavy, wide turning circle, deep horn.
  bus: {
    length: 10.6, width: 2.55, height: 4.4, wheelbase: 5.9, track: 2.1, wheelR: 0.5, mass: 11000, cgH: 1.3, frontWeight: 0.42,
    drive: 'rwd', torque: 1050, peakRpm: 1500, redline: 2600, idle: 600, gears: [6.5, 3.6, 2.2, 1.4, 1.0], vmaxKmh: 72, launchRpm: 1200,
    mu: 0.95, muLong: 1.0, peakSlip: 7 * DEG, frontC: 1.15, rearC: 1.25, brakeG: 0.75, brakeBias: 0.55, hbMu: 0.7,
    maxSteer: 34 * DEG, steerRate: 2.2, steerRateFast: 1.5, returnRate: 4.0, counterSteer: 0.4, stability: 0.8, hbYaw: 0.25,
    rollK: 0.03, pitchK: 0.012, suspension: 0.8, durability: 4.0, hornF: [235, 296], cylinders: 6, engineTone: 0.5,
    shiftTime: 0.35, reverseMaxKmh: 14, reverseForceG: 0.18, inertiaScale: 1.15, engineBrake: 0.6,
  },
};

const cache = new Map();
/** Fully derived spec for a type (cached). */
export function getSpec(type) {
  if (cache.has(type)) return cache.get(type);
  const s = { ...BASE, ...(TYPES[type] || TYPES.sedan), type };
  const L = s.wheelbase;
  s.b = s.frontWeight * L;          // CG -> rear axle
  s.a = L - s.b;                    // CG -> front axle
  // body centre relative to CG along length: overhangs split ~55/45 front/rear around axles
  const over = s.length - L;
  s.overF = s.overhangF ?? over * (s.type === 'bus' ? 0.35 : 0.52);
  s.overR = over - s.overF;
  s.bodyOffset = (s.a + s.overF) - s.length / 2; // body-centre ahead of CG by this much
  s.inertia = s.mass * (s.length * s.length + s.width * s.width) / 12 * s.inertiaScale;
  s.vmax = s.vmaxKmh / 3.6;
  s.reverseMax = s.reverseMaxKmh / 3.6;
  const top = s.gears[s.gears.length - 1];
  // final drive: limiter in top gear at ~vmax * 1.03
  if (!s.final) s.final = (s.redline * 2 * Math.PI / 60) * s.wheelR / (top * s.vmax * 1.03);
  // drag: drag at vmax = dragFrac * (top-gear drive force at that rpm) - rolling resistance
  const rpmTop = s.vmax / s.wheelR * 60 / (2 * Math.PI) * top * s.final;
  const fTop = torqueAt(s, rpmTop) * top * s.final * s.eff / s.wheelR;
  s.dragK = Math.max(0.1, (fTop * s.dragFrac - s.crr * s.mass * G) / (s.vmax * s.vmax));
  s.B_f = Math.tan(Math.PI / (2 * s.frontC)) / s.peakSlip;
  s.B_r = Math.tan(Math.PI / (2 * s.rearC)) / s.peakSlip;
  s.shiftUp = s.redline * 0.93; s.shiftDown = s.redline * 0.42;
  s.healthMax = 1000;
  cache.set(type, s);
  return s;
}

/** Engine torque (Nm) at rpm, full throttle. */
export function torqueAt(s, rpm) {
  const r = Math.max(s.idle, Math.min(s.redline, rpm));
  let k;
  if (r < s.peakRpm) k = 0.72 + 0.28 * Math.sin(Math.PI / 2 * (r - s.idle) / (s.peakRpm - s.idle));
  else { const t = (r - s.peakRpm) / (s.redline - s.peakRpm); k = 1 - 0.22 * t * t; }
  return s.torque * k;
}

/** Realistic Indian car colour palette (paint). */
export const PALETTE = [
  0xf4f4f0, 0xf4f4f0, 0xe8e6df, 0xc9ccce, 0xa7abae, 0x8f9396, // whites & silvers dominate
  0x2a2c30, 0x1c2638, 0x7a1418, 0xa5221d, 0x6b6f4e, 0x31455e,
  0x9c8a6a, 0x5a3b2a, 0x2f5d50, 0xc4a35a, 0x3a5f8a, 0xd8d3c4,
];
