// Vehicle dynamics: planar rigid body + two-axle tyre model ("bicycle" with per-axle loads).
// Pure JS (no three.js) so tools/vehicles/*.mjs can run it headless for tuning.
//
// Frames: forward f = (sin h, cos h), right r = (-cos h, sin h), left = -r. yawRate w>0 turns LEFT.
// The velocity of a point d metres ahead of the CG = v + d*w*left, i.e. its rightward component is (vr - d*w).
// A force F applied d metres ahead of the CG makes torque  tau = -d * (F . r).
import { G, torqueAt } from './tuning.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const _contacts = [];

/** Physics state stored on the vehicle (v.ph). */
export function makePhysState() {
  return {
    steer: 0, steerAngle: 0, gear: 0, rpm: 850, rpmTarget: 850, shiftT: 0, driveF: 0, brakeIn: 0, drive: 0,
    axF: 0, ayF: 0, slipF: 0, slipR: 0, beta: 0, spin: 0, wheelRot: 0, frontLoad: 0.5, reversing: false,
    sleeping: false, sleepT: 0, lod: false, skid: 0, hb: false, lastHit: 0, scrape: 0, scrapeX: 0, scrapeZ: 0,
    impactT: 0, betaDot: 0, betaPrev: 0, slideT: 0, hbT: 99,
  };
}

/** Max wheel angle at forward speed u: what the front tyres can actually use (prevents pointless understeer). */
export function steerLimit(s, u) {
  const v = Math.abs(u);
  if (v < 1) return s.maxSteer;
  // front slip we let the wheels use: ~0.68 of the (soft, progressive) peak slip already gives ~99% of the grip; a bit more at speed
  const lim = s.wheelbase * s.mu * G / (v * v) + s.peakSlip * 0.68 * s.steerSlack * (1 + 0.3 * smooth(18, 42, v));
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
  if (ph.hb && u > 3) ph.slideT = 2;
  else ph.slideT = Math.max(0, ph.slideT - dt);

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
  // body slip: + = velocity to the RIGHT of the nose (nose pointing left of travel). Valid over the full circle when moving.
  const vsp = Math.hypot(v.velocity.x, v.velocity.z);
  ph.beta = vsp > 3 ? Math.atan2(v.velocity.x * -fz + v.velocity.z * fx, u) : 0;
  const bd = (ph.beta - ph.betaPrev); ph.betaPrev = ph.beta;
  ph.betaDot += (clamp((Math.abs(bd) > Math.PI ? 0 : bd) / dt, -8, 8) - ph.betaDot) * Math.min(1, dt * 12);
  // counter-steer assist: front wheels drift towards the direction of travel when the rear slides
  if (u > 2) {
    const beta = ph.beta;
    // drift mode: after a handbrake flick, holding throttle keeps the slide alive (assists back off)
    const ab = Math.abs(beta);
    if (ph.drift) { if (ab < 0.06 || thr < 0.25 || ph.hb) ph.drift = ph.hb && ab > 0.1; }
    else if ((ph.hbT < 1.2 || ph.hb) && thr > 0.3 && ab > 0.12) ph.drift = true;
    const assist = s.counterSteer * beta * clamp((u - 2) / 4, 0, 1) * (ph.hb ? 0.3 : ph.drift ? 0.6 : 1);
    angle = clamp(angle + assist, -s.maxSteer, s.maxSteer);
  } else { ph.drift = false; }
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
  // arcade traction control: deep in a slide the engine backs off (power-oversteer spirals are not fun); a held drift is exempt
  const tc = ph.drive > 0 && !ph.drift && !ph.hb ? 1 - 0.8 * smooth(0.3, 0.62, Math.abs(ph.beta)) : 1;
  let FxF = ph.driveF * tc * split, FxR = ph.driveF * tc * (1 - split);
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
  // tyres get softer with speed (longer, more progressive slides and a visible tail after the wheel is released)
  const soft = 1 - s.hiSpeedSoft * smooth(14, 40, Math.hypot(vx, vz));
  const Bf = s.B_f * soft, Br = s.B_r * soft;
  let FyF = -capF * curve(alphaF, Bf, s.frontC);
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
    FyR = -capR * curve(alphaR, Br, s.rearC);
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
  const bt = ph.beta, abt = Math.abs(bt), sgb = sgn(bt);
  const steerIn = ph.steer;
  if (ph.hb) {
    // handbrake slide: steering sets a target yaw rate (bounded, fades with speed) so the slide is controllable, not a donut.
    if (spd > 4) {
      const wMax = clamp(s.hbYawMax - s.hbYawSpd * spd, s.hbYawMin, s.hbYawMax) * s.hbYaw;
      const wT = -steerIn * wMax * smooth(2, 9, spd);
      tau += I * clamp((wT - om) * 6, -s.hbKick, s.hbKick);
      // soft slip limiter: never swing the tail past ~80 deg (that would turn the car round and reverse it)
      const over = clamp((abt - s.hbBeta0) / (s.hbBeta1 - s.hbBeta0), 0, 1);
      if (over > 0 && bt * om < 0) tau += -om * I * 16 * over;
      if (abt > s.hbBeta1) tau += sgb * I * 24 * (abt - s.hbBeta1);
    }
  } else if (ph.drift && u > 4) {
    // held drift: steering picks the slip angle (counter-steer shrinks it, steering into it grows it), PD-controlled
    const k = steerIn * sgb;
    const target = sgb * clamp(s.driftBeta * (1 - 0.75 * k), 0.08, 0.95);
    tau += I * clamp(s.driftK * (bt - target) + s.driftC * ph.betaDot, -9, 9);
  } else if (spd > 3) {
    if (u > 3) {
      // yaw stability toward the kinematic yaw rate; backs off at speed so slides get longer and more progressive
      const omKin = u * Math.tan(d) / L * -1; // steering right (d>0) => negative yaw
      const excess = om - omKin;
      const thr = 0.25;
      const stab = s.stability * (1 - s.hiSpeedStab * smooth(10, 36, u));
      if (Math.abs(excess) > thr) tau += -sgn(excess) * (Math.abs(excess) - thr) * I * stab * 6;
    }
    // self-aligning torque / rear-grip recovery: when the driver is not steering into a slide, swing the nose back along the
    // direction of travel (always the short way: forward, never round to reverse)
    const rec = Math.min(1, (1 - Math.min(1, Math.abs(steerIn) * 1.5)) * smooth(0.2, 0.55, abt) + 0.6 * smooth(0.4, 0.8, abt));
    if (rec > 0) tau += I * rec * s.alignK * Math.sin(bt) * (Math.cos(bt) > 0 ? 1 : 0.4);
  }

  // anti-spin: deep in a slide (and not on the handbrake) bleed yaw so slides stay catchable
  if (!ph.hb && !ph.drift && spd > 2) {
    if (abt > s.spinBeta) tau += -om * I * s.antiSpin * Math.min(1, (abt - s.spinBeta) * 4);
  }

  // integrate (semi-implicit Euler)
  v.velocity.x += Fx / m * h;
  v.velocity.z += Fz / m * h;
  v.yawRate += tau / I * h;
  // tiny angular damping, stronger when crawling (kills jitter)
  v.yawRate *= Math.abs(u) < 1 ? Math.exp(-6 * h) : Math.exp(-0.3 * h);
  if (ph.impactT > 0) { ph.impactT -= h; v.yawRate *= Math.exp(-5 * h); } // short post-impact yaw damping (no camera whip)
  v.position.x += v.velocity.x * h;
  v.position.z += v.velocity.z * h;
  v.heading += v.yawRate * h;
  // A forward handbrake slide cannot rotate the nose past perpendicular to travel.
  if (ph.slideT > 0 && Math.hypot(v.velocity.x, v.velocity.z) > 3) {
    const travel = Math.atan2(v.velocity.x, v.velocity.z);
    const delta = Math.atan2(Math.sin(v.heading - travel), Math.cos(v.heading - travel));
    const limit = 1.45;
    if (Math.abs(delta) > limit) {
      v.heading -= delta - clamp(delta, -limit, limit);
      if (v.yawRate * delta > 0) v.yawRate = 0;
    }
  }

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
/**
 * Static world contact. Arcade-sim: the linear response treats the body as a point mass at the CG, so a graze only removes the
 * velocity component INTO the surface (tangential speed is kept, light wall friction) and a head-on stops dead. Spin is added
 * separately and bounded: glancing hits swing the nose parallel to the surface, near-perpendicular hits barely twist.
 * Damage is driven by the closing (normal) speed only; one impulse per contact per iteration (no re-hit from induced spin).
 */
export function resolveStatic(v, env) {
  const s = v.spec, m = s.mass, I = s.inertia, ph = v.ph;
  const massK = clamp(Math.sqrt(1300 / m), 0.3, 1.2);
  for (let iter = 0; iter < 3; iter++) {
    bodyBox(v, _box);
    _contacts.length = 0;
    const cs = env.collision.queryOBB(_box.cx, _box.cz, _box.hw, _box.hd, _box.rot, _contacts);
    if (!cs.length) return;
    let deep = cs[0];
    for (const c of cs) if (c.depth > deep.depth) deep = c;
    v.position.x += deep.nx * (deep.depth + 0.002);
    v.position.z += deep.nz * (deep.depth + 0.002);
    const sh = Math.sin(v.heading), ch = Math.cos(v.heading);
    for (const c of cs) {
      const vn = v.velocity.x * c.nx + v.velocity.z * c.nz;
      if (vn >= -0.02) continue;
      const closing = -vn;
      const e = Math.max(0.06, 0.28 - closing * 0.02);
      const jn = (1 + e) * closing * m;
      const tx = -c.nz, tz = c.nx;
      const vt = v.velocity.x * tx + v.velocity.z * tz;
      const jt = clamp(-vt * m, -0.12 * jn, 0.12 * jn);
      const Jx = jn * c.nx + jt * tx, Jz = jn * c.nz + jt * tz;
      v.velocity.x += Jx / m; v.velocity.z += Jz / m;
      // --- spin
      const rx = c.px - v.position.x, rz = c.pz - v.position.z;
      const dwLever = (Jx * rz - Jz * rx) / I;                  // what a rigid body would do (can be huge for corner hits)
      const fn = Math.abs(c.nx * sh + c.nz * ch);               // 1 = head-on / rear-end, 0 = side swipe
      const glance = 1 - smooth(0.5, 0.85, fn);
      let dx = tx, dz = tz; if (dx * sh + dz * ch < 0) { dx = -tx; dz = -tz; }
      const ang = Math.atan2(dx * ch - dz * sh, dx * sh + dz * ch); // heading -> surface direction, + = left
      const dwAlign = clamp(ang * 5, -1.6, 1.6) * massK;
      const dwHead = clamp(dwLever * 0.3, -0.9, 0.9) * massK;
      const dw = glance * dwAlign + (1 - glance) * dwHead;
      v.yawRate = clamp(v.yawRate + dw, -2.5, 2.5);
      if (closing > 1.2) ph.impactT = 0.6;
      if (env.onContact) env.onContact(v, { jn, vn: closing, dv: closing, vt: Math.abs(vt), px: c.px, pz: c.pz, nx: c.nx, nz: c.nz, shape: c.shape });
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



