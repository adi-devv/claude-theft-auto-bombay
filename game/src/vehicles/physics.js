// Vehicle dynamics: planar rigid body + two-axle tyre model ("bicycle" with per-axle loads).
// Pure JS (no three.js) so tools/vehicles/*.mjs can run it headless for tuning.
//
// Frames: forward f = (sin h, cos h), right r = (-cos h, sin h), left = -r. yawRate w>0 turns LEFT.
// The velocity of a point d metres ahead of the CG = v + d*w*left, i.e. its rightward component is (vr - d*w).
// A force F applied d metres ahead of the CG makes torque  tau = -d * (F . r).
import { G, torqueAt } from './tuning.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const _contacts = [];

/** Physics state stored on the vehicle (v.ph). */
export function makePhysState() {
  return {
    steer: 0, steerAngle: 0, gear: 0, rpm: 850, rpmTarget: 850, shiftT: 0, driveF: 0, brakeIn: 0, drive: 0,
    axF: 0, ayF: 0, slipF: 0, slipR: 0, beta: 0, spin: 0, wheelRot: 0, frontLoad: 0.5, reversing: false,
    sleeping: false, sleepT: 0, lod: false, skid: 0, hb: false, lastHit: 0, scrape: 0, scrapeX: 0, scrapeZ: 0,
  };
}

/** Max wheel angle at forward speed u: what the front tyres can actually use (prevents pointless understeer). */
export function steerLimit(s, u) {
  const v = Math.abs(u);
  if (v < 1) return s.maxSteer;
  const lim = s.wheelbase * s.mu * G / (v * v) + s.peakSlip * s.steerSlack;
  return Math.min(s.maxSteer, lim);
}

/** Once per fixed step: control smoothing, pedal logic (GTA reverse), gearbox, engine force. */
export function controlStep(v, dt) {
  const s = v.spec, ph = v.ph, c = v.controls;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const u = v.velocity.x * fx + v.velocity.z * fz;
  const dead = v.wrecked || v.disabled;
  let thr = dead ? 0 : clamp(+c.throttle || 0, 0, 1);
  let brk = dead ? 0 : clamp(+c.brake || 0, 0, 1);
  const target = dead ? 0 : clamp(+c.steer || 0, -1, 1);
  ph.hb = dead ? true : !!c.handbrake;
  ph.hbT = ph.hb ? 0 : (ph.hbT || 0) + dt;

  // --- steering: keyboard-friendly ramp, quicker return to centre, calmer at speed
  const sp = Math.abs(u);
  const k = clamp(sp / 35, 0, 1);
  const rate = s.steerRate + (s.steerRateFast - s.steerRate) * k;
  const cur = ph.steer;
  if (target === 0 || (cur !== 0 && sgn(target) !== sgn(cur))) {
    // back towards centre fast; any leftover time continues towards the new side
    const r = s.returnRate * dt;
    if (Math.abs(cur) > r) ph.steer = cur - sgn(cur) * r;
    else ph.steer = target === 0 ? 0 : sgn(target) * Math.min(Math.abs(target), rate * dt * (1 - Math.abs(cur) / r));
  } else {
    const r = rate * dt;
    ph.steer = cur + clamp(target - cur, -r, r);
  }
  let angle = ph.steer * steerLimit(s, u);
  // counter-steer assist: front wheels drift towards the direction of travel when the rear slides
  if (u > 2) {
    const beta = Math.atan2(v.velocity.x * -fz + v.velocity.z * fx, u); // lateral-right vs forward
    ph.beta = beta;
    // drift mode: after a handbrake flick, holding throttle keeps the slide alive (assists back off)
    const ab = Math.abs(beta);
    if (ph.drift) { if (ab < 0.06 || thr < 0.25 || ph.hb) ph.drift = ph.hb && ab > 0.1; }
    else if ((ph.hbT < 1.2 || ph.hb) && thr > 0.3 && ab > 0.12) ph.drift = true;
    const assist = s.counterSteer * beta * clamp((u - 2) / 4, 0, 1) * (ph.hb ? 0.3 : ph.drift ? 0.6 : 1);
    angle = clamp(angle + assist, -s.maxSteer, s.maxSteer);
  } else { ph.beta = 0; ph.drift = false; }
  ph.steerAngle = angle;

  // --- pedals (GTA style): brake brakes when rolling forward, reverses when (nearly) stopped
  let drive = 0, brakeIn = 0;
  if (brk > 0.05 && u > 0.7) { brakeIn = brk; }
  else if (brk > 0.05 && thr < 0.05) { drive = -brk; }
  else if (thr > 0.05 && u < -0.7) { brakeIn = thr; }
  else if (thr > 0.05) { drive = thr; }
  if (dead) brakeIn = 0.35;
  ph.drive = drive; ph.brakeIn = brakeIn;
  ph.reversing = drive < 0 || u < -0.3;

  // --- gearbox + engine
  const rpmPerMs = 60 / (2 * Math.PI * s.wheelR) * s.final;
  const n = s.gears.length;
  const wheelRpm = sp * rpmPerMs;
  if (ph.shiftT > 0) ph.shiftT -= dt;
  else if (drive >= 0) {
    if (ph.gear < n - 1 && wheelRpm * s.gears[ph.gear] > s.shiftUp && drive > 0.05) { ph.gear++; ph.shiftT = s.shiftTime; }
    else if (ph.gear > 0 && wheelRpm * s.gears[ph.gear] < s.shiftDown) { ph.gear--; ph.shiftT = drive > 0.05 ? s.shiftTime * 0.5 : 0; }
  }
  if (drive < 0) ph.gear = 0;
  let rpm = wheelRpm * s.gears[ph.gear];
  if (drive < 0) rpm = Math.max(s.idle + (s.launchRpm - s.idle) * 0.45 * -drive, rpm * 1.6); // short reverse gear: revs climb with speed
  else if (ph.gear === 0 && drive > 0) rpm = Math.max(rpm, s.idle + (s.launchRpm - s.idle) * drive);
  if (drive === 0 && brakeIn === 0 && sp < 1.5) rpm = Math.max(rpm, s.idle);
  rpm = clamp(rpm, s.idle, s.redline * 1.01);
  if (ph.shiftT > 0 && drive > 0) rpm = Math.max(s.idle, rpm * 0.82);
  if (dead) rpm = 0;
  ph.rpmTarget = rpm;
  ph.rpm += (rpm - ph.rpm) * (1 - Math.exp(-14 * dt));

  let F = 0;
  if (drive > 0) {
    if (ph.shiftT <= 0) {
      F = torqueAt(s, rpm) * s.gears[ph.gear] * s.final * s.eff / s.wheelR * drive;
      const lim = s.redline * 0.985;
      if (rpm > lim) F *= clamp(1 - (rpm - lim) / (s.redline * 0.02), 0, 1);
    } else F = 0.15 * torqueAt(s, rpm) * s.gears[ph.gear] * s.final * s.eff / s.wheelR * drive;
  } else if (drive < 0) {
    const Fmax = Math.min(torqueAt(s, s.launchRpm) * s.gears[0] * s.final * s.eff / s.wheelR, s.reverseForceG * s.mass * G);
    F = -Fmax * -drive * clamp(1 - (-u) / s.reverseMax, 0, 1);
  } else if (!dead && u > 1) {
    F = -s.engineBrake * 0.06 * s.mass * G * (rpm / s.redline);
  }
  ph.driveF = F;
}

/** Pacejka-ish normalised lateral curve: odd, peaks at 1 at peakSlip, falls off to sin(C*pi/2). */
function curve(alpha, B, C) { return Math.sin(C * Math.atan(B * alpha)); }

/**
 * One integration substep of length h (seconds). env = { collision, onContact(v, c) }.
 */
export function integrate(v, h, env) {
  const s = v.spec, ph = v.ph;
  const sh = Math.sin(v.heading), ch = Math.cos(v.heading);
  const fx = sh, fz = ch, rx = -ch, rz = sh;
  const vx = v.velocity.x, vz = v.velocity.z;
  const u = vx * fx + vz * fz;      // forward
  const w = vx * rx + vz * rz;      // rightward
  const om = v.yawRate;
  const m = s.mass, I = s.inertia, a = s.a, b = s.b, L = s.wheelbase;

  // loads with longitudinal weight transfer
  const mg = m * G;
  let Nf = mg * b / L - m * ph.axF * s.cgH / L;
  Nf = clamp(Nf, mg * 0.18, mg * 0.82);
  const Nr = mg - Nf;
  ph.frontLoad = Nf / mg;

  // contact velocities
  const d = ph.steerAngle, cd = Math.cos(d), sd = Math.sin(d);
  const wf = w - a * om, wr = w + b * om;
  const latF = wf * cd - u * sd, lonF = u * cd + wf * sd;
  const latR = wr, lonR = u;

  // effective masses (for stable low-speed clamping: never push past zero slip in one substep)
  const meF = 1 / (1 / m + a * a / I), meR = 1 / (1 / m + b * b / I);

  // --- longitudinal forces
  const split = s.drive === 'fwd' ? 1 : s.drive === 'awd' ? 0.4 : 0;
  let FxF = ph.driveF * split, FxR = ph.driveF * (1 - split);
  if (ph.hb) FxR = 0;
  // brakes + rolling resistance: "force needed to stop this substep", capped
  const Bmax = ph.brakeIn * s.brakeG * mg;
  const capFl = s.muLong * Nf, capRl = s.muLong * Nr;
  const brF = Math.min(Bmax * s.brakeBias, capFl * 0.88) + s.crr * Nf;
  const brR = Math.min(Bmax * (1 - s.brakeBias), capRl * 0.88) + s.crr * Nr;
  const hold = (ph.drive === 0 && Math.abs(u) < 1.0) ? 0.45 : 0; // parking hold (in gear / handbrake)
  const bF = brF + hold * Nf, bR = brR + hold * Nr;
  FxF += clamp(-lonF * m * (Nf / mg) / h, -bF, bF);
  if (!ph.hb) FxR += clamp(-lonR * m * (Nr / mg) / h, -bR, bR);

  // traction limit (wheelspin)
  let spin = 0;
  if (Math.abs(FxF) > capFl) { spin = Math.max(spin, Math.abs(FxF) / capFl - 1); FxF = sgn(FxF) * capFl * 0.92; }
  if (!ph.hb && Math.abs(FxR) > capRl) { spin = Math.max(spin, Math.abs(FxR) / capRl - 1); FxR = sgn(FxR) * capRl * 0.92; }
  ph.spin = spin;

  // --- lateral forces (friction ellipse: longitudinal use eats lateral grip)
  const capF = s.mu * Nf, capR = s.mu * Nr * s.rearGrip * (ph.drift ? s.driftGrip : 1);
  const vref = Math.max(Math.abs(lonF), 1.0);
  const alphaF = Math.atan2(latF, vref);
  let FyF = -capF * curve(alphaF, s.B_f, s.frontC);
  const availF = Math.sqrt(Math.max(0, capF * capF - FxF * FxF * (capF * capF) / (capFl * capFl)));
  FyF = clamp(FyF, -availF, availF);
  FyF = clamp(FyF, -meF * Math.abs(latF) / h * 0.5, meF * Math.abs(latF) / h * 0.5);
  ph.slipF = alphaF;

  let FyR, alphaR = Math.atan2(latR, Math.max(Math.abs(lonR), 1.0));
  if (ph.hb) {
    // locked rear wheels: sliding friction against the contact patch velocity
    const spd = Math.hypot(lonR, latR);
    const fk = s.hbMu * capR;
    const mag = Math.min(fk, meR * spd / h * 0.5);
    if (spd > 1e-4) { FxR = -lonR / spd * mag; FyR = -latR / spd * mag; } else { FxR = 0; FyR = 0; }
  } else {
    FyR = -capR * curve(alphaR, s.B_r, s.rearC);
    const availR = Math.sqrt(Math.max(0, capR * capR - FxR * FxR * (capR * capR) / (capRl * capRl)));
    FyR = clamp(FyR, -availR, availR);
    FyR = clamp(FyR, -meR * Math.abs(latR) / h * 0.5, meR * Math.abs(latR) / h * 0.5);
  }
  ph.slipR = alphaR;

  // --- body frame totals
  const Ff_f = FxF * cd - FyF * sd, Ff_r = FxF * sd + FyF * cd;
  let Ffwd = Ff_f + FxR;
  let Fright = Ff_r + FyR;
  let tau = -a * Ff_r + b * FyR;

  // aero drag (along velocity)
  const spd = Math.hypot(vx, vz);
  let Fx = Ffwd * fx + Fright * rx - s.dragK * spd * vx;
  let Fz = Ffwd * fz + Fright * rz - s.dragK * spd * vz;

  // --- assists
  if (u > 3) {
    const omKin = u * Math.tan(d) / L * -1; // steering right (d>0) => negative yaw
    if (ph.hb) {
      // handbrake: arcade yaw kick in the steering direction so 180s are reliable
      const st = ph.steer;
      tau += -st * s.hbYaw * I * clamp(u / 12, 0, 1) * s.hbKick;
    } else if (!ph.drift) {
      const excess = om - omKin;
      const thr = 0.25;
      if (Math.abs(excess) > thr) tau += -sgn(excess) * (Math.abs(excess) - thr) * I * s.stability * 6;
    }
  }

  // anti-spin: deep in a slide (and not on the handbrake) bleed yaw so slides stay catchable
  if (!ph.hb && u > 2) {
    const ab = Math.abs(ph.beta);
    if (ab > s.spinBeta) tau += -om * I * s.antiSpin * Math.min(1, (ab - s.spinBeta) * 4);
  }

  // integrate (semi-implicit Euler)
  v.velocity.x += Fx / m * h;
  v.velocity.z += Fz / m * h;
  v.yawRate += tau / I * h;
  // tiny angular damping, stronger when crawling (kills jitter)
  v.yawRate *= Math.abs(u) < 1 ? Math.exp(-6 * h) : Math.exp(-0.3 * h);
  v.position.x += v.velocity.x * h;
  v.position.z += v.velocity.z * h;
  v.heading += v.yawRate * h;

  // filtered accelerations (weight transfer + visual pitch/roll)
  const axNow = Ffwd / m, ayNow = Fright / m;
  ph.axF += (axNow - ph.axF) * Math.min(1, h * 10);
  ph.ayF += (ayNow - ph.ayF) * Math.min(1, h * 8);

  if (env && env.collision) resolveStatic(v, env);
}

/** Box used for collisions (body centre may sit ahead of the CG). */
export function bodyBox(v, out = {}) {
  const s = v.spec, sh = Math.sin(v.heading), ch = Math.cos(v.heading);
  out.cx = v.position.x + sh * s.bodyOffset; out.cz = v.position.z + ch * s.bodyOffset;
  out.hw = s.width / 2; out.hd = s.length / 2; out.rot = v.heading;
  return out;
}

const _box = {};
/** Static world contact: positional correction + impulse with restitution, friction and spin. */
export function resolveStatic(v, env) {
  const s = v.spec, m = s.mass, I = s.inertia;
  for (let iter = 0; iter < 3; iter++) {
    bodyBox(v, _box);
    _contacts.length = 0;
    const cs = env.collision.queryOBB(_box.cx, _box.cz, _box.hw, _box.hd, _box.rot, _contacts);
    if (!cs.length) return;
    let deep = cs[0];
    for (const c of cs) if (c.depth > deep.depth) deep = c;
    v.position.x += deep.nx * (deep.depth + 0.002);
    v.position.z += deep.nz * (deep.depth + 0.002);
    for (const c of cs) {
      const rx = c.px - v.position.x, rz = c.pz - v.position.z;
      const om = v.yawRate;
      const vpx = v.velocity.x + om * rz, vpz = v.velocity.z - om * rx;
      const vn = vpx * c.nx + vpz * c.nz;
      if (vn >= 0) continue;
      const rn = c.nx * rz - c.nz * rx;
      const kn = 1 / m + rn * rn / I;
      const e = Math.max(0.08, 0.3 - Math.abs(vn) * 0.02);
      const jn = -(1 + e) * vn / kn;
      const tx = -c.nz, tz = c.nx;
      const vt = vpx * tx + vpz * tz;
      const rt = tx * rz - tz * rx;
      const kt = 1 / m + rt * rt / I;
      const mu = 0.32;
      const jt = clamp(-vt / kt, -mu * jn, mu * jn);
      const Jx = jn * c.nx + jt * tx, Jz = jn * c.nz + jt * tz;
      v.velocity.x += Jx / m; v.velocity.z += Jz / m;
      v.yawRate += (Jx * rz - Jz * rx) / I * 0.75;
      v.yawRate = clamp(v.yawRate, -6, 6);
      if (env.onContact) env.onContact(v, { jn, vn: -vn, vt: Math.abs(vt), px: c.px, pz: c.pz, nx: c.nx, nz: c.nz, shape: c.shape });
    }
  }
}

/** Cheap kinematic step for far-away AI cars (no tyre model; lateral velocity killed). */
export function lodStep(v, dt, env) {
  const s = v.spec, ph = v.ph;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  let u = v.velocity.x * fx + v.velocity.z * fz;
  let acc = ph.driveF / s.mass - s.dragK * u * Math.abs(u) / s.mass;
  if (ph.brakeIn > 0) acc -= sgn(u) * ph.brakeIn * s.brakeG * G;
  const nu = u + acc * dt;
  u = (ph.brakeIn > 0 && sgn(nu) !== sgn(u)) ? 0 : nu;
  if (ph.drive === 0 && ph.brakeIn === 0 && Math.abs(u) < 0.5) u *= 0.8;
  v.yawRate = -u * Math.tan(ph.steerAngle) / s.wheelbase;
  v.heading += v.yawRate * dt;
  const nfx = Math.sin(v.heading), nfz = Math.cos(v.heading);
  v.velocity.x = nfx * u; v.velocity.z = nfz * u;
  v.position.x += v.velocity.x * dt; v.position.z += v.velocity.z * dt;
  ph.axF = acc; ph.ayF = u * v.yawRate; ph.slipF = ph.slipR = 0; ph.spin = 0;
  if (env && env.collision && Math.abs(u) > 0.05) resolveStatic(v, env);
}

/**
 * Full fixed step for one vehicle. Returns nothing; uses v.ph.
 * opts: { lod: bool }
 */
export function stepVehicle(v, dt, env, lod = false) {
  const ph = v.ph, c = v.controls;
  controlStep(v, dt);
  // sleeping: parked / stopped cars cost almost nothing
  const active = ph.drive !== 0 || ph.brakeIn > 0 && !(v.wrecked || v.disabled);
  if (ph.sleeping) {
    if (!active && !v._wake) return;
    ph.sleeping = false; ph.sleepT = 0; v._wake = false;
  }
  v._wake = false;
  if (lod) { lodStep(v, dt, env); ph.lod = true; }
  else {
    ph.lod = false;
    const spd = Math.hypot(v.velocity.x, v.velocity.z);
    const n = Math.min(5, Math.max(2, Math.ceil(spd * dt / 0.3)));
    const h = dt / n;
    for (let i = 0; i < n; i++) integrate(v, h, env);
  }
  const spd = Math.hypot(v.velocity.x, v.velocity.z);
  if (!active && spd < 0.08 && Math.abs(v.yawRate) < 0.03) {
    ph.sleepT += dt;
    if (ph.sleepT > 0.4) { ph.sleeping = true; v.velocity.x = v.velocity.z = 0; v.yawRate = 0; ph.axF = ph.ayF = 0; }
  } else ph.sleepT = 0;
}
