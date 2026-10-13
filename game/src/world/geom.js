// Geometry batching for the static city: everything is accumulated per (material key, spatial chunk)
// and merged into a handful of big indexed meshes. Vertex attributes: position, normal, uv, color, aFacade.
//   uv      : metres on the surface (u along the wall, v up) for facades, or atlas uv ('keep' mode)
//   color   : per-vertex tint (linear)
//   aFacade : (bayWidth, floorHeight, style, seed+flags) — read by the facade shader (see materials.js)
import * as THREE from 'three';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();
const _m3 = new THREE.Matrix3();

class Group {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.fac = []; this.idx = []; this.count = 0; }
}

export class Batch {
  constructor(chunk = 300, origin = { x: -700, z: -700 }) {
    this.chunk = chunk; this.origin = origin; this.groups = new Map();
  }

  _group(key, x, z) {
    const cx = Math.floor((x - this.origin.x) / this.chunk), cz = Math.floor((z - this.origin.z) / this.chunk);
    const k = key + '|' + cx + ',' + cz;
    let g = this.groups.get(k);
    if (!g) { g = new Group(); g.key = key; this.groups.set(k, g); }
    return g;
  }

  /**
   * Add a THREE.BufferGeometry transformed by matrix.
   * opts: { color (hex|Color), facade [bay, floorH, style, seed], uv: 'keep' | 'world' (default world), uvScale, at:{x,z} chunk anchor }
   */
  add(key, geom, matrix, opts = {}) {
    const P = geom.attributes.position, N = geom.attributes.normal, U = geom.attributes.uv;
    const C = geom.attributes.color;
    const idx = geom.index;
    // chunk anchor = transformed bbox centre (or explicit)
    let ax, az;
    if (opts.at) { ax = opts.at.x; az = opts.at.z; }
    else { _v.set(0, 0, 0); if (matrix) _v.applyMatrix4(matrix); ax = _v.x; az = _v.z; }
    const g = this._group(key, ax, az);
    const base = g.count;
    if (matrix) _m3.getNormalMatrix(matrix);
    const col = opts.color !== undefined ? _c.set(opts.color) : _c.set(0xffffff);
    const cr = col.r, cg = col.g, cb = col.b;
    const f = opts.facade || [3, 3.3, 0, 0];
    const keepUv = opts.uv === 'keep';
    const us = opts.uvScale || 1;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i); if (matrix) _v.applyMatrix4(matrix);
      if (N) { _n.fromBufferAttribute(N, i); if (matrix) _n.applyMatrix3(_m3).normalize(); } else _n.set(0, 1, 0);
      g.pos.push(_v.x, _v.y, _v.z); g.nrm.push(_n.x, _n.y, _n.z);
      if (keepUv && U) g.uv.push(U.getX(i) * us, U.getY(i) * us);
      else {
        // world-planar uv in metres
        if (Math.abs(_n.y) > 0.7) g.uv.push(_v.x * us, _v.z * us);
        else {
          let tx = _n.z, tz = -_n.x; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
          g.uv.push((_v.x * tx + _v.z * tz) * us, _v.y * us);
        }
      }
      if (C) g.col.push(C.getX(i) * cr, C.getY(i) * cg, C.getZ(i) * cb); else g.col.push(cr, cg, cb);
      g.fac.push(f[0], f[1], f[2], f[3]);
    }
    if (idx) for (let i = 0; i < idx.count; i++) g.idx.push(base + idx.getX(i));
    else for (let i = 0; i < P.count; i++) g.idx.push(base + i);
    g.count += P.count;
    // keep winding correct for mirrored transforms
    if (matrix && matrix.determinant() < 0) {
      const ii = g.idx; for (let i = ii.length - (idx ? idx.count : P.count); i < ii.length; i += 3) { const t = ii[i + 1]; ii[i + 1] = ii[i + 2]; ii[i + 2] = t; }
    }
  }

  /** Add raw arrays (already in world space). pos/nrm/uv flat arrays, idx local indices. */
  addRaw(key, pos, nrm, uv, idx, opts = {}) {
    const n = pos.length / 3;
    let ax = 0, az = 0;
    if (opts.at) { ax = opts.at.x; az = opts.at.z; } else { for (let i = 0; i < n; i++) { ax += pos[i * 3]; az += pos[i * 3 + 2]; } ax /= n; az /= n; }
    const g = this._group(key, ax, az);
    const base = g.count;
    const col = opts.color !== undefined ? _c.set(opts.color) : _c.set(0xffffff);
    const f = opts.facade || [3, 3.3, 0, 0];
    for (let i = 0; i < pos.length; i++) g.pos.push(pos[i]);
    for (let i = 0; i < nrm.length; i++) g.nrm.push(nrm[i]);
    for (let i = 0; i < uv.length; i++) g.uv.push(uv[i]);
    const cols = opts.colors; // optional per-vertex colors (flat array)
    for (let i = 0; i < n; i++) {
      if (cols) g.col.push(cols[i * 3], cols[i * 3 + 1], cols[i * 3 + 2]); else g.col.push(col.r, col.g, col.b);
      g.fac.push(f[0], f[1], f[2], f[3]);
    }
    for (let i = 0; i < idx.length; i++) g.idx.push(base + idx[i]);
    g.count += n;
  }

  /** Build meshes; materials: { key: Material | {material, castShadow, receiveShadow, renderOrder} } */
  build(scene, materials, defaults = { castShadow: true, receiveShadow: true }) {
    const meshes = [];
    let tris = 0;
    for (const g of this.groups.values()) {
      if (!g.count) continue;
      const spec = materials[g.key];
      if (!spec) { console.warn('no material for', g.key); continue; }
      const mat = spec.isMaterial ? spec : spec.material;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
      if (spec.facade !== false) geo.setAttribute('aFacade', new THREE.Float32BufferAttribute(g.fac, 4));
      geo.setIndex(g.count > 65535 ? new THREE.Uint32BufferAttribute(g.idx, 1) : new THREE.Uint16BufferAttribute(g.idx, 1));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = spec.castShadow ?? defaults.castShadow;
      mesh.receiveShadow = spec.receiveShadow ?? defaults.receiveShadow;
      if (spec.renderOrder !== undefined) mesh.renderOrder = spec.renderOrder;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      mesh.name = 'city:' + g.key;
      scene.add(mesh);
      meshes.push(mesh);
      tris += g.idx.length / 3;
    }
    this.groups.clear();
    return { meshes, tris };
  }
}

// ---------------------------------------------------------------------------------------------
// Primitive generators producing raw arrays with metre-UVs (u along wall, v = height).

/**
 * Prism (extruded footprint). poly: [[x,z],...] counter-clockwise when seen from above (+Y)… either winding
 * is accepted (auto-fixed). y0..y1. Returns {pos,nrm,uv,idx}. smoothAngle: normals averaged across vertices
 * whose adjacent edges turn by less than this (radians) → rounded corners look curved.
 */
export function prism(poly, y0, y1, opts = {}) {
  const { top = true, bottom = false, smoothAngle = 0.5, uOffset = 0, inward = false } = opts;
  // ensure CW in x/z-with-z-down sense: we want outward normals. Compute signed area in (x,z).
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const P = area < 0 ? poly : poly.slice().reverse(); // area<0 means clockwise in x-right/z-down = CCW seen from +Y
  const n = P.length;
  const pos = [], nrm = [], uv = [], idx = [];
  // edge normals (outward): for CCW-from-above order, outward normal of edge (dx,dz) is (dz, -dx)?? verify:
  // seen from +Y with x right, z down (screen), area<0 ⇒ ... we just test with centroid.
  let cx = 0, cz = 0; for (const p of P) { cx += p[0]; cz += p[1]; } cx /= n; cz /= n;
  const en = [];
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    let nx = b[1] - a[1], nz = -(b[0] - a[0]); const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
    en.push([nx, nz, L]);
  }
  // check orientation with first long edge vs centroid
  let sgn = 1;
  { let best = 0, bi = 0; for (let i = 0; i < n; i++) if (en[i][2] > best) { best = en[i][2]; bi = i; }
    const a = P[bi], b = P[(bi + 1) % n]; const mx = (a[0] + b[0]) / 2 - cx, mz = (a[1] + b[1]) / 2 - cz;
    if (mx * en[bi][0] + mz * en[bi][1] < 0) sgn = -1; }
  for (const e of en) { e[0] *= sgn; e[1] *= sgn; }
  if (inward) { sgn = -sgn; for (const e of en) { e[0] = -e[0]; e[1] = -e[1]; } }
  // vertex normals
  const vn = [];
  for (let i = 0; i < n; i++) {
    const ep = en[(i - 1 + n) % n], ec = en[i];
    const ang = Math.acos(Math.max(-1, Math.min(1, ep[0] * ec[0] + ep[1] * ec[1])));
    if (ang < smoothAngle) { let x = ep[0] + ec[0], z = ep[1] + ec[1]; const L = Math.hypot(x, z) || 1; vn.push([x / L, z / L, true]); }
    else vn.push(null);
  }
  // u coordinate: restart at every sharp corner, centring whole window bays on each straight/curved run
  const bay = opts.bay || 0;
  const ustart = new Array(n).fill(0);
  {
    let first = 0; for (let i = 0; i < n; i++) if (!vn[i]) { first = i; break; }
    let run = [], runIdx = 0;
    const flushRun = () => {
      if (!run.length) return;
      let L = 0; for (const i of run) L += en[i][2];
      let u0 = runIdx * 1000 + uOffset;
      if (bay > 0) u0 -= (L - Math.floor(L / bay) * bay) / 2;
      for (const i of run) { ustart[i] = u0; u0 += en[i][2]; }
      run = []; runIdx++;
    };
    for (let k = 0; k < n; k++) { const i = (first + k) % n; if (!vn[i] && run.length) flushRun(); run.push(i); }
    flushRun();
  }
  let u = uOffset;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], e = en[i];
    const na = vn[i] || e, nb = vn[(i + 1) % n] || e;
    const base = pos.length / 3;
    pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
    nrm.push(na[0], 0, na[1], nb[0], 0, nb[1], nb[0], 0, nb[1], na[0], 0, na[1]);
    const us = ustart[i];
    uv.push(us, y0, us + e[2], y0, us + e[2], y1, us, y1);
    u += e[2];
    // triangle (a0,b0,b1) faces -rawNormal; sgn>0 means outward == rawNormal → flip
    if (sgn > 0) idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  if (top || bottom) {
    const contour = P.map((p) => new THREE.Vector2(p[0], p[1]));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const addCap = (y, up) => {
      const base = pos.length / 3;
      for (const p of P) { pos.push(p[0], y, p[1]); nrm.push(0, up ? 1 : -1, 0); uv.push(p[0], p[1]); }
      for (const t of tris) {
        // determine winding so normal faces up/down
        const A = P[t[0]], B = P[t[1]], C = P[t[2]];
        const cr = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]); // >0 ⇒ (x,z) CCW ⇒ seen from +Y is CW
        const faceUpIfOrder = cr < 0;
        if (faceUpIfOrder === up) idx.push(base + t[0], base + t[1], base + t[2]); else idx.push(base + t[0], base + t[2], base + t[1]);
      }
    };
    if (top) addCap(y1, true);
    if (bottom) addCap(y0, false);
  }
  return { pos, nrm, uv, idx, perimeter: u - uOffset };
}

/** Rectangle footprint (centre, half extents, rotation like three.js rotation.y) → polygon [[x,z]...]. */
export function rectPoly(cx, cz, hw, hd, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const ax = [c, -s], az = [s, c];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [cx + ax[0] * hw * i + az[0] * hd * j, cz + ax[1] * hw * i + az[1] * hd * j]);
}

/** Rounded rectangle polygon; radii per corner [r0..r3] in local order (-,-),(+,-),(+,+),(-,+). */
export function roundRectPoly(cx, cz, hw, hd, rot, radii, seg = 5) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const W = (lx, lz) => [cx + c * lx + s * lz, cz - s * lx + c * lz];
  const corners = [[-hw, -hd, Math.PI, 1.5 * Math.PI], [hw, -hd, 1.5 * Math.PI, 2 * Math.PI], [hw, hd, 0, 0.5 * Math.PI], [-hw, hd, 0.5 * Math.PI, Math.PI]];
  const out = [];
  corners.forEach(([x, z, a0, a1], i) => {
    const r = Math.min(radii[i] || 0, hw * 0.9, hd * 0.9);
    if (r < 0.1) { out.push(W(x, z)); return; }
    const ox = x - Math.sign(x) * r, oz = z - Math.sign(z) * r;
    for (let k = 0; k <= seg; k++) { const a = a0 + (a1 - a0) * (k / seg); out.push(W(ox + Math.cos(a) * r, oz + Math.sin(a) * r)); }
  });
  return out;
}

/** Offset a polygon outward by d (simple miter for convex-ish polys). */
export function offsetPoly(poly, d) {
  const n = poly.length; let area = 0;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? -1 : 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = poly[(i - 1 + n) % n], c = poly[i], q = poly[(i + 1) % n];
    const n1 = norm2(c[1] - p[1], -(c[0] - p[0])), n2 = norm2(q[1] - c[1], -(q[0] - c[0]));
    let mx = n1[0] + n2[0], mz = n1[1] + n2[1]; const L = Math.hypot(mx, mz) || 1; mx /= L; mz /= L;
    const cosh = Math.max(0.3, mx * n1[0] + mz * n1[1]);
    out.push([c[0] + sg * mx * d / cosh, c[1] + sg * mz * d / cosh]);
  }
  return out;
}
function norm2(x, z) { const L = Math.hypot(x, z) || 1; return [x / L, z / L]; }

/** Helper: Matrix4 from position, rotation.y, scale. */
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function mat(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// Shared unit primitives (centered, size 1) — reuse to avoid allocations.
export const PRIM = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1),
  cyl12: new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1),
  cyl16: new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1),
  cyl24: new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1, true),
  cone8: new THREE.ConeGeometry(0.5, 1, 8, 1),
  cone4: new THREE.ConeGeometry(0.5, 1, 4, 1),
  pyr4: new THREE.ConeGeometry(0.7071, 1, 4, 1).rotateY(Math.PI / 4),
  oct: new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1),
  dome: new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  sphere: new THREE.SphereGeometry(0.5, 12, 8),
  plane: new THREE.PlaneGeometry(1, 1),
};
// Onion dome profile (lathe), height 1, max radius 0.5 at base bulge.
{
  const pts = [];
  const prof = [[0.42, 0], [0.48, 0.08], [0.52, 0.2], [0.5, 0.33], [0.42, 0.48], [0.3, 0.62], [0.17, 0.76], [0.08, 0.88], [0.03, 0.96], [0, 1]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  PRIM.onion = new THREE.LatheGeometry(pts, 14);
  const pts2 = [];
  const prof2 = [[0.5, 0], [0.5, 0.1], [0.47, 0.35], [0.38, 0.6], [0.24, 0.82], [0.1, 0.95], [0, 1]];
  for (const [r, y] of prof2) pts2.push(new THREE.Vector2(r, y));
  PRIM.ribDome = new THREE.LatheGeometry(pts2, 16);
}
