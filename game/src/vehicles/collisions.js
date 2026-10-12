// Vehicle <-> vehicle collisions: SAT overlap (obbOverlap), mass-weighted positional correction,
// impulse with restitution + friction at the contact point (so hits spin cars), damage via each car.
// Emits 'vehicleCollision' {a, b, impulse (N*s), x, z} (throttled per pair while they stay in contact).
import { obbOverlap } from '../world/collision.js';
import { bodyBox } from './physics.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const boxes = [];
const lastEmit = new Map();
let emitClock = 0;

export function resolveVehicleCollisions(game, dt) {
  const vs = game.vehicles, n = vs.length;
  emitClock += dt;
  if (n < 2) return;
  // broad phase: sort by x-extent (sweep and prune)
  for (let i = 0; i < n; i++) {
    const v = vs[i];
    const b = boxes[i] || (boxes[i] = {});
    bodyBox(v, b);
    b.r = Math.hypot(b.hw, b.hd); b.v = v; b.min = b.cx - b.r; b.max = b.cx + b.r;
  }
  boxes.length = n;
  const order = boxes.slice(0, n).sort((a, b) => a.min - b.min);
  for (let i = 0; i < n; i++) {
    const A = order[i];
    for (let j = i + 1; j < n; j++) {
      const B = order[j];
      if (B.min > A.max) break;
      const va = A.v, vb = B.v;
      if (va.ph.sleeping && vb.ph.sleeping) continue;
      const dz = A.cz - B.cz, rr = A.r + B.r;
      if (dz > rr || dz < -rr) continue;
      const dx = A.cx - B.cx;
      if (dx * dx + dz * dz > rr * rr) continue;
      const o = obbOverlap(A, B);
      if (!o) continue;
      solvePair(game, va, vb, o, A, B);
    }
  }
}

function solvePair(game, a, b, o, A, B) {
  const sa = a.spec, sb = b.spec;
  const ima = 1 / sa.mass, imb = 1 / sb.mass, iia = 1 / sa.inertia, iib = 1 / sb.inertia;
  let { nx, nz, depth, px, pz } = o;
  // positional correction split by inverse mass
  const corr = Math.max(0, depth - 0.005) / (ima + imb);
  a.position.x += nx * corr * ima; a.position.z += nz * corr * ima;
  b.position.x -= nx * corr * imb; b.position.z -= nz * corr * imb;
  A.cx += nx * corr * ima; A.cz += nz * corr * ima; B.cx -= nx * corr * imb; B.cz -= nz * corr * imb;
  // relative velocity at the contact point
  const rax = px - a.position.x, raz = pz - a.position.z, rbx = px - b.position.x, rbz = pz - b.position.z;
  const vax = a.velocity.x + a.yawRate * raz, vaz = a.velocity.z - a.yawRate * rax;
  const vbx = b.velocity.x + b.yawRate * rbz, vbz = b.velocity.z - b.yawRate * rbx;
  const rvx = vax - vbx, rvz = vaz - vbz;
  const vn = rvx * nx + rvz * nz;
  if (vn >= 0) return; // separating
  const ran = nx * raz - nz * rax, rbn = nx * rbz - nz * rbx;
  const kn = ima + imb + ran * ran * iia + rbn * rbn * iib;
  const e = Math.max(0.1, 0.35 - Math.abs(vn) * 0.015);
  const j = -(1 + e) * vn / kn;
  const tx = -nz, tz = nx;
  const vt = rvx * tx + rvz * tz;
  const rat = tx * raz - tz * rax, rbt = tx * rbz - tz * rbx;
  const kt = ima + imb + rat * rat * iia + rbt * rbt * iib;
  const jt = clamp(-vt / kt, -0.45 * j, 0.45 * j);
  const Jx = j * nx + jt * tx, Jz = j * nz + jt * tz;
  a.velocity.x += Jx * ima; a.velocity.z += Jz * ima;
  b.velocity.x -= Jx * imb; b.velocity.z -= Jz * imb;
  a.yawRate = clamp(a.yawRate + (Jx * raz - Jz * rax) * iia * 0.8, -6, 6);
  b.yawRate = clamp(b.yawRate - (Jx * rbz - Jz * rbx) * iib * 0.8, -6, 6);
  a.wake(); b.wake();
  // damage / effects (velocity change felt by each car)
  const dva = j * ima, dvb = j * imb;
  a._vehicleHit(dva, px, pz, nx, nz, b, Math.abs(vt));
  b._vehicleHit(dvb, px, pz, -nx, -nz, a, Math.abs(vt));
  // event (throttled per pair unless the hit is clearly harder)
  if (j > 250) {
    const key = a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id;
    const prev = lastEmit.get(key);
    if (!prev || emitClock - prev.t > 0.35 || j > prev.j * 1.8) {
      lastEmit.set(key, { t: emitClock, j });
      if (lastEmit.size > 400) lastEmit.clear();
      game.events.emit('vehicleCollision', { a, b, impulse: j, x: px, z: pz, relSpeed: -vn });
    }
  }
}
