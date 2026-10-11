// Shared math helpers. Heading convention (PLAN §0):
// models face +Z, mesh.rotation.y = h, forward = (sin h, cos h),
// right = (-cos h, sin h), left = (cos h, -sin h). +Z is south.
export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v < 0 ? -1 : 1);
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export function wrapAngle(a) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  else if (a < -Math.PI) a += TAU;
  return a;
}
/** Shortest signed rotation from a to b. */
export const angleDiff = (a, b) => wrapAngle(b - a);
export const lerpAngle = (a, b, t) => a + angleDiff(a, b) * t;

export function fwd(h, out = { x: 0, z: 0 }) {
  out.x = Math.sin(h);
  out.z = Math.cos(h);
  return out;
}
export function right(h, out = { x: 0, z: 0 }) {
  out.x = -Math.cos(h);
  out.z = Math.sin(h);
  return out;
}
export function left(h, out = { x: 0, z: 0 }) {
  out.x = Math.cos(h);
  out.z = -Math.sin(h);
  return out;
}
/** Left-hand perpendicular of a unit travel tangent (tx, tz). */
export function leftOfTangent(tx, tz, out = { x: 0, z: 0 }) {
  out.x = tz;
  out.z = -tx;
  return out;
}
/** Heading of a direction vector (x, z). */
export const headingOf = (x, z) => Math.atan2(x, z);

export const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

/** Squared distance from point to segment, returns {d2, t}. */
export function pointSegment(px, pz, ax, az, bx, bz, out = { d2: 0, t: 0 }) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t;
  const qz = az + dz * t;
  out.d2 = (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
  out.t = t;
  return out;
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Shoelace area in (x,z); positive == clockwise when viewed from above with north (-z) up. */
export function polyArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.z - b.x * a.z;
  }
  return s / 2;
}

export function distToPolyEdges(x, z, poly) {
  let best = Infinity;
  const o = { d2: 0, t: 0 };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    pointSegment(x, z, a.x, a.z, b.x, b.z, o);
    if (o.d2 < best) best = o.d2;
  }
  return Math.sqrt(best);
}
