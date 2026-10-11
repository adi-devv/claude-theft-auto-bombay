// Pure 2D collision helpers. Collider = { x, z, hw, hd, rot } (oriented box: centre,
// half-width along local X, half-depth along local Z, rot = heading radians,
// local X axis in world = (cos rot, -sin rot), local Z axis = (sin rot, cos rot)).
// Circle colliders may also be used: { x, z, r }.

/** Fill cached trig/bounding info on a collider (idempotent). */
export function prepare(c) {
  if (c._c !== undefined) return c;
  if (c.r !== undefined) {
    c._c = 1;
    c._s = 0;
    c._rad = c.r;
    return c;
  }
  const rot = c.rot || 0;
  c._c = Math.cos(rot);
  c._s = Math.sin(rot);
  c._rad = Math.hypot(c.hw, c.hd);
  return c;
}

/**
 * Circle (cx,cz,r) vs oriented box. Returns null or {nx, nz, pen}: the unit push
 * direction (from box towards circle) and the penetration depth.
 */
export function circleVsObb(cx, cz, r, o, out = { nx: 0, nz: 0, pen: 0 }) {
  prepare(o);
  const c = o._c;
  const s = o._s;
  const dx = cx - o.x;
  const dz = cz - o.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const qx = lx < -o.hw ? -o.hw : lx > o.hw ? o.hw : lx;
  const qz = lz < -o.hd ? -o.hd : lz > o.hd ? o.hd : lz;
  const ex = lx - qx;
  const ez = lz - qz;
  const d2 = ex * ex + ez * ez;
  if (d2 > r * r) return null;
  let nlx;
  let nlz;
  let pen;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    nlx = ex / d;
    nlz = ez / d;
    pen = r - d;
  } else {
    const px = o.hw - Math.abs(lx);
    const pz = o.hd - Math.abs(lz);
    if (px < pz) {
      nlx = lx < 0 ? -1 : 1;
      nlz = 0;
      pen = px + r;
    } else {
      nlx = 0;
      nlz = lz < 0 ? -1 : 1;
      pen = pz + r;
    }
  }
  // local -> world: X axis (c, -s), Z axis (s, c)
  out.nx = nlx * c + nlz * s;
  out.nz = -nlx * s + nlz * c;
  out.pen = pen;
  return out;
}

export function circleVsCircle(ax, az, ar, bx, bz, br, out = { nx: 0, nz: 0, pen: 0 }) {
  const dx = ax - bx;
  const dz = az - bz;
  const rr = ar + br;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return null;
  const d = Math.sqrt(d2);
  if (d < 1e-6) {
    out.nx = 1;
    out.nz = 0;
  } else {
    out.nx = dx / d;
    out.nz = dz / d;
  }
  out.pen = rr - d;
  return out;
}

/** Circle vs any collider (box or circle). */
export function circleVsCollider(cx, cz, r, col, out) {
  if (col.r !== undefined) return circleVsCircle(cx, cz, r, col.x, col.z, col.r, out);
  return circleVsObb(cx, cz, r, col, out);
}

/**
 * Push a circle out of all colliders in the grid. Mutates pos {x,z}.
 * Returns {hit, nx, nz} (summed normals, normalised) for response.
 */
export function resolveCircle(grid, pos, r, iterations = 3) {
  const res = { hit: false, nx: 0, nz: 0 };
  const out = { nx: 0, nz: 0, pen: 0 };
  const list = [];
  for (let it = 0; it < iterations; it++) {
    list.length = 0;
    grid.query(pos.x, pos.z, r + 1, list);
    let any = false;
    for (let i = 0; i < list.length; i++) {
      const hit = circleVsCollider(pos.x, pos.z, r, list[i], out);
      if (hit) {
        pos.x += hit.nx * (hit.pen + 0.001);
        pos.z += hit.nz * (hit.pen + 0.001);
        res.hit = true;
        res.nx += hit.nx;
        res.nz += hit.nz;
        any = true;
      }
    }
    if (!any) break;
  }
  const l = Math.hypot(res.nx, res.nz);
  if (l > 0) {
    res.nx /= l;
    res.nz /= l;
  }
  return res;
}

/** Segment vs oriented box. Returns t in [0,1] of the first hit or -1. */
export function segmentVsObb(x0, z0, x1, z1, o) {
  prepare(o);
  if (o.r !== undefined) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const fx = x0 - o.x;
    const fz = z0 - o.z;
    const a = dx * dx + dz * dz;
    const b = 2 * (fx * dx + fz * dz);
    const cc = fx * fx + fz * fz - o.r * o.r;
    const disc = b * b - 4 * a * cc;
    if (disc < 0 || a < 1e-12) return cc <= 0 ? 0 : -1;
    const sq = Math.sqrt(disc);
    const t = (-b - sq) / (2 * a);
    return t >= 0 && t <= 1 ? t : cc <= 0 ? 0 : -1;
  }
  const c = o._c;
  const s = o._s;
  const ax = x0 - o.x;
  const az = z0 - o.z;
  const bx = x1 - o.x;
  const bz = z1 - o.z;
  const lax = ax * c - az * s;
  const laz = ax * s + az * c;
  const lbx = bx * c - bz * s;
  const lbz = bx * s + bz * c;
  const dx = lbx - lax;
  const dz = lbz - laz;
  let tmin = 0;
  let tmax = 1;
  for (let k = 0; k < 2; k++) {
    const p = k === 0 ? lax : laz;
    const d = k === 0 ? dx : dz;
    const h = k === 0 ? o.hw : o.hd;
    if (Math.abs(d) < 1e-9) {
      if (p < -h || p > h) return -1;
    } else {
      let t1 = (-h - p) / d;
      let t2 = (h - p) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

/** First collider hit along a segment: returns t in [0,1] or -1. */
export function segmentHit(grid, x0, z0, x1, z1) {
  const list = [];
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  grid.query(mx, mz, Math.hypot(x1 - x0, z1 - z0) / 2 + 1, list);
  let best = -1;
  for (const o of list) {
    const t = segmentVsObb(x0, z0, x1, z1, o);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}

/** SAT overlap test between two oriented boxes. */
export function obbOverlap(a, b) {
  prepare(a);
  prepare(b);
  const axes = [
    [a._c, -a._s],
    [a._s, a._c],
    [b._c, -b._s],
    [b._s, b._c],
  ];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [ax, az] of axes) {
    const ra =
      a.hw * Math.abs(ax * a._c - az * a._s) + a.hd * Math.abs(ax * a._s + az * a._c);
    const rb =
      b.hw * Math.abs(ax * b._c - az * b._s) + b.hd * Math.abs(ax * b._s + az * b._c);
    if (Math.abs(dx * ax + dz * az) > ra + rb) return false;
  }
  return true;
}
