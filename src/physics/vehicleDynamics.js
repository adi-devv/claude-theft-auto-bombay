// Arcade bicycle-model vehicle dynamics + circle-vs-OBB / vehicle-vs-vehicle
// collision resolution. Pure logic, no `three` imports.
//
// Conventions: world +X east, +Z south. Heading h: forward = (sin h, cos h),
// left = (cos h, -sin h). steer/input > 0 turns LEFT (heading increases).
import { getVehicleType } from '../entities/vehicleTypes.js';

const RESTITUTION = 0.3;
const SIGNIFICANT_HIT = 1.5; // m/s normal speed before speed *= 0.6
const DAMAGE_THRESHOLD = 5;

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
function typeOf(v) { return getVehicleType(v.type); }

export function createVehicleState(type, x = 0, z = 0, heading = 0) {
  const def = getVehicleType(type);
  return {
    type: def.id,
    x, z, heading,
    speed: 0,
    vx: 0, vz: 0,
    steer: 0,
    health: def.health,
    wrecked: false,
  };
}

/** Advance one vehicle by dt seconds. input = {throttle -1..1, steer -1..1, handbrake}. */
export function stepVehicle(v, input, dt) {
  if (!(dt > 0)) return v;
  const def = typeOf(v);
  const inp = input || {};
  const throttle = v.wrecked ? 0 : clamp(+inp.throttle || 0, -1, 1);
  const steerIn = v.wrecked ? 0 : clamp(+inp.steer || 0, -1, 1);
  const handbrake = !v.wrecked && !!inp.handbrake;

  // Longitudinal.
  let speed = v.speed;
  if (throttle > 0) {
    // Positive throttle while rolling backwards = braking.
    speed += throttle * (speed < -0.1 ? def.brake : def.accel) * dt;
    if (speed > def.maxSpeed) speed = def.maxSpeed;
  } else if (throttle < 0) {
    if (speed > 0.1) speed -= -throttle * def.brake * dt;
    else speed += throttle * def.accel * 0.6 * dt; // reverse gear is weaker
    if (speed < -def.revMax) speed = -def.revMax;
  }
  // Drag: speed -= (0.12*speed + 0.4*sign)*dt, never crossing zero.
  if (speed !== 0) {
    const sign = Math.sign(speed);
    const drag = (0.12 * Math.abs(speed) + 0.4) * dt * (v.wrecked ? 3 : 1);
    speed = Math.abs(speed) <= drag ? 0 : speed - sign * drag;
  }
  if (handbrake) speed *= Math.exp(-0.35 * dt);
  v.speed = speed;

  // Steering: speed-dependent limit, eased.
  const lim = def.steerMax * (1 - 0.55 * Math.min(1, Math.abs(speed) / def.maxSpeed));
  const target = steerIn * lim;
  v.steer += (target - v.steer) * (1 - Math.exp(-8 * dt));

  // Bicycle model yaw.
  const yawRate = (speed * Math.tan(v.steer)) / def.wheelbase;
  v.heading += yawRate * dt;

  // Velocity lerps toward forward*speed at grip*8 (handbrake: grip x0.25).
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const grip = def.grip * (handbrake ? 0.25 : 1);
  const k = Math.min(1, grip * 8 * dt);
  v.vx += (fx * speed - v.vx) * k;
  v.vz += (fz * speed - v.vz) * k;

  v.x += v.vx * dt;
  v.z += v.vz * dt;
  return v;
}

/** World-space collision circles [{x,z,r}] for a vehicle. */
export function vehicleCircles(v) {
  const def = typeOf(v);
  const s = Math.sin(v.heading), c = Math.cos(v.heading);
  return def.circles.map(ci => ({ x: v.x + s * ci.z, z: v.z + c * ci.z, r: ci.r }));
}

/** Angle (rad, >= 0) between velocity and heading; 0 when nearly stationary. */
export function slipAngle(v) {
  const sp = Math.hypot(v.vx, v.vz);
  if (sp < 0.5) return 0;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const dot = (v.vx * fx + v.vz * fz) / sp;
  return Math.acos(clamp(dot, -1, 1));
}

/**
 * Circle vs oriented box. box = {x,z,hw,hd,rot}; local X axis = (cos rot,-sin rot),
 * local Z axis = (sin rot, cos rot). Returns {hit,nx,nz,depth}; (nx,nz) is the unit
 * push-out direction (from the box towards the circle).
 */
export function circleVsObb(cx, cz, r, box) {
  const rot = box.rot || 0;
  const c = Math.cos(rot), s = Math.sin(rot);
  const dx = cx - box.x, dz = cz - box.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const px = clamp(lx, -box.hw, box.hw);
  const pz = clamp(lz, -box.hd, box.hd);
  let nlx = lx - px, nlz = lz - pz;
  const d2 = nlx * nlx + nlz * nlz;
  let depth;
  if (d2 > 1e-12) {
    if (d2 >= r * r) return { hit: false, nx: 0, nz: 0, depth: 0 };
    const d = Math.sqrt(d2);
    nlx /= d; nlz /= d;
    depth = r - d;
  } else {
    // Centre inside the box: exit through the nearest face.
    const ox = box.hw - Math.abs(lx);
    const oz = box.hd - Math.abs(lz);
    if (ox < oz) { nlx = lx >= 0 ? 1 : -1; nlz = 0; depth = ox + r; }
    else { nlx = 0; nlz = lz >= 0 ? 1 : -1; depth = oz + r; }
  }
  // Local -> world: X axis (c,-s), Z axis (s,c).
  return { hit: true, nx: nlx * c + nlz * s, nz: -nlx * s + nlz * c, depth };
}

/** Push v out of static boxes, bounce velocity; returns the max impact speed (normal component). */
export function resolveVehicleVsBoxes(v, colliders) {
  if (!colliders || !colliders.length) return 0;
  const def = typeOf(v);
  const reach = def.length / 2 + 0.5;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  let maxImpact = 0;
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    const bound = Math.hypot(b.hw, b.hd) + reach;
    const ddx = v.x - b.x, ddz = v.z - b.z;
    if (ddx * ddx + ddz * ddz > bound * bound) continue;
    const circles = vehicleCircles(v);
    for (let j = 0; j < circles.length; j++) {
      const ci = circles[j];
      const h = circleVsObb(ci.x, ci.z, ci.r, b);
      if (!h.hit) continue;
      v.x += h.nx * h.depth;
      v.z += h.nz * h.depth;
      // Keep later circles consistent with the push.
      for (let m = j + 1; m < circles.length; m++) {
        circles[m].x += h.nx * h.depth;
        circles[m].z += h.nz * h.depth;
      }
      const vn = v.vx * h.nx + v.vz * h.nz;
      if (vn < 0) {
        const dvx = -(1 + RESTITUTION) * vn * h.nx;
        const dvz = -(1 + RESTITUTION) * vn * h.nz;
        v.vx += dvx; v.vz += dvz;
        v.speed += dvx * fx + dvz * fz;
        if (-vn > maxImpact) maxImpact = -vn;
      }
    }
  }
  if (maxImpact > SIGNIFICANT_HIT) {
    v.speed *= 0.6;
    v.vx *= 0.6; v.vz *= 0.6;
  }
  return maxImpact;
}

/** Mass-weighted separation + impulse between two vehicles; returns impact speed. */
export function resolveVehicleVsVehicle(a, b) {
  const da = typeOf(a), db = typeOf(b);
  const reach = da.length / 2 + db.length / 2 + 1;
  if ((b.x - a.x) ** 2 + (b.z - a.z) ** 2 > reach * reach) return 0;
  const ma = da.mass, mb = db.mass, mt = ma + mb;
  let maxImpact = 0;
  // A few passes so multi-circle overlaps (e.g. a bus beside a car) fully separate.
  for (let iter = 0; iter < 3; iter++) {
    const ddx = b.x - a.x, ddz = b.z - a.z;
    const ca = vehicleCircles(a), cb = vehicleCircles(b);
    let best = null;
    for (const p of ca) {
      for (const q of cb) {
        const dx = q.x - p.x, dz = q.z - p.z;
        const rr = p.r + q.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        const depth = rr - d;
        if (!best || depth > best.depth) best = { dx, dz, d, depth };
      }
    }
    if (!best) break;
    let nx, nz;
    if (best.d > 1e-6 && best.dx * ddx + best.dz * ddz > 0) {
      nx = best.dx / best.d; nz = best.dz / best.d;
    } else {
      // Interleaved/coincident circles: fall back to the centre-to-centre line.
      const l = Math.hypot(ddx, ddz);
      if (l > 1e-6) { nx = ddx / l; nz = ddz / l; } else { nx = Math.sin(a.heading); nz = Math.cos(a.heading); }
    }
    // Separation (a moves against n, b along n; the lighter one moves more).
    a.x -= nx * best.depth * (mb / mt);
    a.z -= nz * best.depth * (mb / mt);
    b.x += nx * best.depth * (ma / mt);
    b.z += nz * best.depth * (ma / mt);
    // Impulse along n.
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0) {
      const j = (-(1 + RESTITUTION) * rv) / (1 / ma + 1 / mb);
      const dax = -(j / ma) * nx, daz = -(j / ma) * nz;
      const dbx = (j / mb) * nx, dbz = (j / mb) * nz;
      a.vx += dax; a.vz += daz;
      b.vx += dbx; b.vz += dbz;
      a.speed += dax * Math.sin(a.heading) + daz * Math.cos(a.heading);
      b.speed += dbx * Math.sin(b.heading) + dbz * Math.cos(b.heading);
      if (-rv > maxImpact) maxImpact = -rv;
    }
  }
  if (maxImpact > SIGNIFICANT_HIT) { a.speed *= 0.85; b.speed *= 0.85; }
  return maxImpact;
}

/**
 * Apply crash damage: (impact-5)*dmgK above 5. Returns damage dealt.
 * `scale` is optional, e.g. the type's playerCrashDamageFactor when the player drives.
 */
export function applyDamage(v, impact, scale = 1) {
  if (v.wrecked || !(impact > DAMAGE_THRESHOLD)) return 0;
  const dmg = (impact - DAMAGE_THRESHOLD) * typeOf(v).dmgK * scale;
  v.health = Math.max(0, v.health - dmg);
  if (v.health <= 0) { v.health = 0; v.wrecked = true; }
  return dmg;
}
