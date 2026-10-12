// Static 2D collision world (XZ plane) for buildings, walls, poles, trees, sea wall.
// Rotation convention matches three.js Object3D.rotation.y = rot:
//   local +X axis in world = ( cos rot, -sin rot ), local +Z axis in world = ( sin rot, cos rot ).
// All contact normals point OUT of the static obstacle (direction to push the moving thing).

export class StaticCollision {
  constructor(cellSize = 16) {
    this.cell = cellSize;
    this.grid = new Map();
    this.shapes = [];
    this._stamp = 0;
  }

  _insert(shape, minX, maxX, minZ, maxZ) {
    shape.id = this.shapes.length; shape.stamp = 0;
    this.shapes.push(shape);
    const c = this.cell;
    for (let gx = Math.floor(minX / c); gx <= Math.floor(maxX / c); gx++)
      for (let gz = Math.floor(minZ / c); gz <= Math.floor(maxZ / c); gz++) {
        const k = gx * 73856093 ^ gz * 19349663;
        let arr = this.grid.get(k); if (!arr) this.grid.set(k, (arr = []));
        arr.push(shape);
      }
    return shape;
  }

  /** Oriented box. hw/hd = half extents along local X/Z. h = height (for line-of-sight / camera). */
  addBox(cx, cz, hw, hd, rot = 0, data = {}) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const ax = { x: c, z: -s }, az = { x: s, z: c };
    const ex = Math.abs(c) * hw + Math.abs(s) * hd, ez = Math.abs(s) * hw + Math.abs(c) * hd;
    return this._insert({ type: 'box', cx, cz, hw, hd, rot, ax, az, h: data.h ?? 20, data }, cx - ex, cx + ex, cz - ez, cz + ez);
  }

  addCircle(x, z, r, data = {}) {
    return this._insert({ type: 'circle', cx: x, cz: z, r, h: data.h ?? 5, data }, x - r, x + r, z - r, z + r);
  }

  /** Thin wall segment (treated as a box of thickness 2*thick). */
  addSegment(x1, z1, x2, z2, data = {}, thick = 0.3) {
    const L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 1e-3) return null;
    const rot = Math.atan2(-(z2 - z1), x2 - x1); // local X along the segment
    return this.addBox((x1 + x2) / 2, (z1 + z2) / 2, L / 2, thick, rot, { h: 1.2, ...data });
  }

  /** Polyline of wall segments. */
  addPolyline(pts, data = {}, closed = false, thick = 0.3) {
    for (let i = 0; i < pts.length - 1; i++) this.addSegment(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], data, thick);
    if (closed && pts.length > 2) this.addSegment(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], data, thick);
  }

  _candidates(minX, maxX, minZ, maxZ, out) {
    const c = this.cell; const stamp = ++this._stamp;
    for (let gx = Math.floor(minX / c); gx <= Math.floor(maxX / c); gx++)
      for (let gz = Math.floor(minZ / c); gz <= Math.floor(maxZ / c); gz++) {
        const arr = this.grid.get(gx * 73856093 ^ gz * 19349663); if (!arr) continue;
        for (const s of arr) if (s.stamp !== stamp) { s.stamp = stamp; out.push(s); }
      }
    return out;
  }

  /** Shapes near an AABB. */
  queryAABB(minX, maxX, minZ, maxZ) { return this._candidates(minX, maxX, minZ, maxZ, []); }

  /** Circle vs world. Returns contacts [{nx,nz,depth,shape}]. */
  queryCircle(x, z, r, out = []) {
    const cand = this._candidates(x - r, x + r, z - r, z + r, []);
    for (const s of cand) {
      if (s.type === 'circle') {
        const dx = x - s.cx, dz = z - s.cz, d = Math.hypot(dx, dz), pen = s.r + r - d;
        if (pen > 0) out.push({ nx: d > 1e-6 ? dx / d : 1, nz: d > 1e-6 ? dz / d : 0, depth: pen, shape: s });
      } else {
        const dx = x - s.cx, dz = z - s.cz;
        const lx = dx * s.ax.x + dz * s.ax.z, lz = dx * s.az.x + dz * s.az.z;
        const qx = Math.max(-s.hw, Math.min(s.hw, lx)), qz = Math.max(-s.hd, Math.min(s.hd, lz));
        let nlx = lx - qx, nlz = lz - qz, d = Math.hypot(nlx, nlz), pen;
        if (d > 1e-6) { pen = r - d; nlx /= d; nlz /= d; }
        else { // centre inside box: push out along the axis of least penetration
          const px = s.hw - Math.abs(lx), pz = s.hd - Math.abs(lz);
          if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; pen = px + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; pen = pz + r; }
        }
        if (pen > 0) out.push({ nx: nlx * s.ax.x + nlz * s.az.x, nz: nlx * s.ax.z + nlz * s.az.z, depth: pen, shape: s });
      }
    }
    return out;
  }

  /** Push a circle out of the world. Returns {x, z, hit, nx, nz} (n = last/accumulated push direction). */
  resolveCircle(x, z, r, iterations = 3) {
    let hit = false, nx = 0, nz = 0;
    for (let k = 0; k < iterations; k++) {
      const cs = this.queryCircle(x, z, r);
      if (!cs.length) break;
      hit = true;
      let deepest = cs[0];
      for (const c of cs) if (c.depth > deepest.depth) deepest = c;
      x += deepest.nx * deepest.depth; z += deepest.nz * deepest.depth;
      nx += deepest.nx; nz += deepest.nz;
    }
    const L = Math.hypot(nx, nz) || 1;
    return { x, z, hit, nx: nx / L, nz: nz / L };
  }

  /**
   * Oriented box vs world (for vehicles). Returns contacts [{nx,nz,depth,px,pz,shape}]:
   * n pushes the query box out; (px,pz) approximates the contact point in world space.
   */
  queryOBB(cx, cz, hw, hd, rot, out = []) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const A = { cx, cz, hw, hd, ax: { x: c, z: -s }, az: { x: s, z: c } };
    const ext = Math.hypot(hw, hd);
    const cand = this._candidates(cx - ext, cx + ext, cz - ext, cz + ext, []);
    const cornersA = boxCorners(A);
    for (const S of cand) {
      if (S.type === 'circle') {
        const dx = S.cx - cx, dz = S.cz - cz;
        const lx = dx * A.ax.x + dz * A.ax.z, lz = dx * A.az.x + dz * A.az.z;
        const qx = Math.max(-hw, Math.min(hw, lx)), qz = Math.max(-hd, Math.min(hd, lz));
        let nlx = lx - qx, nlz = lz - qz, d = Math.hypot(nlx, nlz), pen;
        if (d > 1e-6) { pen = S.r - d; nlx /= d; nlz /= d; }
        else { const px = hw - Math.abs(lx), pz = hd - Math.abs(lz); if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; pen = px + S.r; } else { nlx = 0; nlz = Math.sign(lz) || 1; pen = pz + S.r; } }
        if (pen > 0) {
          // n from box towards circle; push box the opposite way
          const wx = nlx * A.ax.x + nlz * A.az.x, wz = nlx * A.ax.z + nlz * A.az.z;
          out.push({ nx: -wx, nz: -wz, depth: pen, px: S.cx - wx * S.r, pz: S.cz - wz * S.r, shape: S });
        }
        continue;
      }
      // SAT box-box
      const axes = [A.ax, A.az, S.ax, S.az];
      let minPen = Infinity, nx = 0, nz = 0;
      const dx = cx - S.cx, dz = cz - S.cz;
      let separated = false;
      for (const ax of axes) {
        const rA = hw * Math.abs(A.ax.x * ax.x + A.ax.z * ax.z) + hd * Math.abs(A.az.x * ax.x + A.az.z * ax.z);
        const rB = S.hw * Math.abs(S.ax.x * ax.x + S.ax.z * ax.z) + S.hd * Math.abs(S.az.x * ax.x + S.az.z * ax.z);
        const dist = dx * ax.x + dz * ax.z;
        const pen = rA + rB - Math.abs(dist);
        if (pen <= 0) { separated = true; break; }
        if (pen < minPen) { minPen = pen; const sg = dist >= 0 ? 1 : -1; nx = ax.x * sg; nz = ax.z * sg; }
      }
      if (separated) continue;
      // contact point: corners of A inside S, else corners of S inside A, else midpoint
      let px = 0, pz = 0, n = 0;
      for (const p of cornersA) if (pointInBox(p.x, p.z, S)) { px += p.x; pz += p.z; n++; }
      if (!n) for (const p of boxCorners(S)) if (pointInBox(p.x, p.z, A)) { px += p.x; pz += p.z; n++; }
      if (n) { px /= n; pz /= n; } else { px = (cx + S.cx) / 2; pz = (cz + S.cz) / 2; }
      out.push({ nx, nz, depth: minPen, px, pz, shape: S });
    }
    return out;
  }

  /** Ray in XZ. Returns { dist, nx, nz, shape } of the first hit within maxDist, or null. minH ignores low shapes. */
  raycast(x, z, dx, dz, maxDist, minH = 0) {
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const ex = x + dx * maxDist, ez = z + dz * maxDist;
    const cand = this._candidates(Math.min(x, ex), Math.max(x, ex), Math.min(z, ez), Math.max(z, ez), []);
    let best = null;
    for (const S of cand) {
      if (S.h < minH) continue;
      let t = Infinity, nx = 0, nz = 0;
      if (S.type === 'circle') {
        const ox = x - S.cx, oz = z - S.cz;
        const b = ox * dx + oz * dz, cc = ox * ox + oz * oz - S.r * S.r, disc = b * b - cc;
        if (disc >= 0) { const tt = -b - Math.sqrt(disc); if (tt >= 0) { t = tt; nx = (ox + dx * t) / S.r; nz = (oz + dz * t) / S.r; } else if (cc < 0) { t = 0; } }
      } else {
        const ox = x - S.cx, oz = z - S.cz;
        const lox = ox * S.ax.x + oz * S.ax.z, loz = ox * S.az.x + oz * S.az.z;
        const ldx = dx * S.ax.x + dz * S.ax.z, ldz = dx * S.az.x + dz * S.az.z;
        let tmin = -Infinity, tmax = Infinity, axis = 0;
        const slab = (o, d, h, id) => {
          if (Math.abs(d) < 1e-9) return Math.abs(o) <= h;
          let t1 = (-h - o) / d, t2 = (h - o) / d; if (t1 > t2) [t1, t2] = [t2, t1];
          if (t1 > tmin) { tmin = t1; axis = id * (d > 0 ? -1 : 1); }
          tmax = Math.min(tmax, t2); return tmin <= tmax;
        };
        if (slab(lox, ldx, S.hw, 1) && slab(loz, ldz, S.hd, 2) && tmax >= 0) {
          t = Math.max(0, tmin);
          const lnx = Math.abs(axis) === 1 ? Math.sign(axis) : 0, lnz = Math.abs(axis) === 2 ? Math.sign(axis) : 0;
          nx = lnx * S.ax.x + lnz * S.az.x; nz = lnx * S.ax.z + lnz * S.az.z;
        }
      }
      if (t <= maxDist && (!best || t < best.dist)) best = { dist: t, nx, nz, shape: S };
    }
    return best;
  }

  /** True if nothing taller than minH blocks the straight line between two points. */
  lineOfSight(x1, z1, x2, z2, minH = 2) {
    const d = Math.hypot(x2 - x1, z2 - z1);
    if (d < 1e-3) return true;
    return !this.raycast(x1, z1, x2 - x1, z2 - z1, d, minH);
  }
}

function boxCorners(B) {
  const out = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]])
    out.push({ x: B.cx + B.ax.x * B.hw * sx + B.az.x * B.hd * sz, z: B.cz + B.ax.z * B.hw * sx + B.az.z * B.hd * sz });
  return out;
}

function pointInBox(x, z, B) {
  const dx = x - B.cx, dz = z - B.cz;
  return Math.abs(dx * B.ax.x + dz * B.ax.z) <= B.hw && Math.abs(dx * B.az.x + dz * B.az.z) <= B.hd;
}

/** OBB vs OBB for dynamic bodies (vehicles). Returns null or { nx, nz, depth, px, pz } with n pushing A away from B. */
export function obbOverlap(A, B) {
  // A, B: { cx, cz, hw, hd, rot }
  const mk = (o) => { const c = Math.cos(o.rot), s = Math.sin(o.rot); return { ...o, ax: { x: c, z: -s }, az: { x: s, z: c } }; };
  const a = mk(A), b = mk(B);
  let minPen = Infinity, nx = 0, nz = 0;
  const dx = a.cx - b.cx, dz = a.cz - b.cz;
  for (const ax of [a.ax, a.az, b.ax, b.az]) {
    const rA = a.hw * Math.abs(a.ax.x * ax.x + a.ax.z * ax.z) + a.hd * Math.abs(a.az.x * ax.x + a.az.z * ax.z);
    const rB = b.hw * Math.abs(b.ax.x * ax.x + b.ax.z * ax.z) + b.hd * Math.abs(b.az.x * ax.x + b.az.z * ax.z);
    const dist = dx * ax.x + dz * ax.z, pen = rA + rB - Math.abs(dist);
    if (pen <= 0) return null;
    if (pen < minPen) { minPen = pen; const sg = dist >= 0 ? 1 : -1; nx = ax.x * sg; nz = ax.z * sg; }
  }
  let px = 0, pz = 0, n = 0;
  for (const p of boxCorners(a)) if (pointInBox(p.x, p.z, b)) { px += p.x; pz += p.z; n++; }
  for (const p of boxCorners(b)) if (pointInBox(p.x, p.z, a)) { px += p.x; pz += p.z; n++; }
  if (n) { px /= n; pz /= n; } else { px = (a.cx + b.cx) / 2; pz = (a.cz + b.cz) / 2; }
  return { nx, nz, depth: minPen, px, pz };
}
