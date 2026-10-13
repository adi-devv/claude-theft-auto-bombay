// Signed-distance grids over the map (2 m vertex spacing) used to mesh the ground cleanly and to place buildings.
//   dC    : carriageway SDF (<0 on asphalt). Roads are smooth-min'ed so junction corners get kerb fillets.
//   G     : footpath outer edge SDF (dist - width/2 - footpath(side)); <0 = carriageway or footpath.
//   F     : building frontage clearance (G - setback); buildings need F >= 0.
//   land  : signed distance inside the *visual* land (positive on land).
//   park  : signed distance inside maidans (positive inside).
//   occ   : occupancy (0 free, 1 building, 2 reserved/landmark)
import { STREET, NODES } from './mapdata.js';
import { pointInPoly } from './roads.js';
import { smin, distToPoly } from './smin.js';

export const GRID = { x0: -820, z0: -760, h: 2, nx: 640, nz: 760 };
export { distToPoly };

export class Fields {
  constructor(roads) {
    this.roads = roads;
    const N = (GRID.nx + 1) * (GRID.nz + 1);
    this.W = GRID.nx + 1;
    this.dC = new Float32Array(N).fill(60);
    this.G = new Float32Array(N).fill(60);
    this.F = new Float32Array(N).fill(60);
    this.land = new Float32Array(N).fill(-30);
    this.park = new Float32Array(N).fill(-30);
    this.occ = new Uint8Array(N);
    this.islands = [];
    this._roadsField();
    this._landField();
    this._parkField();
  }

  vx(i) { return GRID.x0 + i * GRID.h; }
  vz(j) { return GRID.z0 + j * GRID.h; }

  /** Bilinear sample of a field at world x,z. */
  sample(field, x, z) {
    const fx = (x - GRID.x0) / GRID.h, fz = (z - GRID.z0) / GRID.h;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= GRID.nx || j >= GRID.nz) return (field === this.land || field === this.park) ? -30 : 60;
    const tx = fx - i, tz = fz - j, W = this.W, k = j * W + i;
    const a = field[k], b = field[k + 1], c = field[k + W], d = field[k + W + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  occAt(x, z) {
    const i = Math.round((x - GRID.x0) / GRID.h), j = Math.round((z - GRID.z0) / GRID.h);
    if (i < 0 || j < 0 || i > GRID.nx || j > GRID.nz) return 9;
    return this.occ[j * this.W + i];
  }

  _box(minX, maxX, minZ, maxZ) {
    return [Math.max(0, Math.floor((minX - GRID.x0) / GRID.h)), Math.min(GRID.nx, Math.ceil((maxX - GRID.x0) / GRID.h)),
      Math.max(0, Math.floor((minZ - GRID.z0) / GRID.h)), Math.min(GRID.nz, Math.ceil((maxZ - GRID.z0) / GRID.h))];
  }

  /** Mark occupancy for grid vertices inside polygon (optionally padded). */
  markPoly(poly, v = 1, pad = 0) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const [i0, i1, j0, j1] = this._box(minX - pad, maxX + pad, minZ - pad, maxZ + pad);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.vx(i), z = this.vz(j);
      if (pointInPoly(x, z, poly) || (pad > 0 && distToPoly(x, z, poly) < pad)) { const k = j * this.W + i; if (this.occ[k] < v) this.occ[k] = v; }
    }
  }
  markCircle(x, z, r, v = 2) {
    const [i0, i1, j0, j1] = this._box(x - r, x + r, z - r, z + r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if ((this.vx(i) - x) ** 2 + (this.vz(j) - z) ** 2 <= r * r) { const k = j * this.W + i; if (this.occ[k] < v) this.occ[k] = v; }
  }

  _roadsField() {
    const roads = this.roads, W = this.W;
    const tmpD = new Float32Array(this.dC.length), tmpG = new Float32Array(this.dC.length);
    const stamp = new Int32Array(this.dC.length).fill(-1);
    let rIdx = 0;
    for (const r of roads.roads) {
      rIdx++;
      const isMD = r.name === 'Marine Drive';
      const hw = r.width / 2, med = r.median / 2;
      const pts = r.pts.slice();
      // visual continuation beyond exit nodes (map edges)
      const extend = (atStart) => {
        const a = atStart ? pts[1] : pts[pts.length - 2], b = atStart ? pts[0] : pts[pts.length - 1];
        const L = Math.hypot(b.x - a.x, b.z - a.z) || 1; const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
        const ext = []; for (let k = 1; k <= 60; k++) ext.push({ x: b.x + tx * k * 2.5, z: b.z + tz * k * 2.5 });
        if (atStart) pts.unshift(...ext.reverse()); else pts.push(...ext);
      };
      const first = r.def.nodes[0], last = r.def.nodes[r.def.nodes.length - 1];
      if (NODES[first].exit) extend(true);
      if (NODES[last].exit) extend(false);
      const fpL = isMD ? STREET.promenade : STREET.footpath, fpR = isMD ? STREET.mdLandFootpath : STREET.footpath;
      const R = hw + Math.max(fpL, fpR) + STREET.setback + 8;
      const touched = [];
      for (let s = 0; s < pts.length - 1; s++) {
        const a = pts[s], b = pts[s + 1];
        const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2);
        const [i0, i1, j0, j1] = this._box(Math.min(a.x, b.x) - R, Math.max(a.x, b.x) + R, Math.min(a.z, b.z) - R, Math.max(a.z, b.z) + R);
        for (let j = j0; j <= j1; j++) {
          const z = this.vz(j);
          for (let i = i0; i <= i1; i++) {
            const x = this.vx(i);
            let t = ((x - a.x) * dx + (z - a.z) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
            const px = a.x + dx * t, pz = a.z + dz * t;
            const d = Math.hypot(x - px, z - pz);
            const k = j * W + i;
            // left of travel direction (tx,tz) is (tz,-tx)
            const left = ((x - a.x) * dz - (z - a.z) * dx) / L > 0;
            const dd = d - hw, gg = d - hw - (left ? fpL : fpR);
            if (stamp[k] !== rIdx) { stamp[k] = rIdx; touched.push(k); tmpD[k] = dd; tmpG[k] = gg; }
            else { if (dd < tmpD[k]) tmpD[k] = dd; if (gg < tmpG[k]) tmpG[k] = gg; }
          }
        }
      }
      for (const k of touched) {
        this.dC[k] = smin(this.dC[k], tmpD[k], 7);
        this.G[k] = Math.min(this.G[k], tmpG[k]);
      }
      if (isMD && med > 0) {
        const gaps = [];
        for (const id of r.def.nodes) { const n = roads.nodes.get(id); if (n.edges.length >= 3 || id === 'NP') gaps.push({ x: n.x, z: n.z, r: n.radius + 4 }); }
        this.mdMedianGaps = gaps;
        this._mdMedian = { touched, tmpD, hw, med, gaps };
      }
    }
    // MD median (raised strip) — applied after all roads so crossing streets don't re-open it
    if (this._mdMedian) {
      const { touched, hw, med, gaps } = this._mdMedian;
      // recompute distance to MD centreline for touched vertices
      const md = roads.roads.find((r) => r.name === 'Marine Drive');
      for (const k of touched) {
        const i = k % W, j = (k / W) | 0, x = this.vx(i), z = this.vz(j);
        const n = roads.nearest(x, z, hw + 2);
        if (!n || n.edge.road !== md) continue;
        if (n.dist < med) {
          let gap = false; for (const g of gaps) if ((x - g.x) ** 2 + (z - g.z) ** 2 < g.r * g.r) gap = true;
          if (!gap) this.dC[k] = Math.max(this.dC[k], med - n.dist);
        }
      }
      delete this._mdMedian;
    }
    // roundabouts: ring carriageway + raised island
    for (const n of roads.nodes.values()) {
      if (!n.roundabout) continue;
      const rOut = n.radius - 1, rIn = Math.max(6, n.roundabout - 7);
      const rc = (rOut + rIn) / 2, hwR = (rOut - rIn) / 2;
      this.islands.push({ id: n.id, x: n.x, z: n.z, r: rIn, rOut });
      const R = rOut + 12;
      const [i0, i1, j0, j1] = this._box(n.x - R, n.x + R, n.z - R, n.z + R);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * W + i, d = Math.hypot(this.vx(i) - n.x, this.vz(j) - n.z);
        this.dC[k] = smin(this.dC[k], Math.abs(d - rc) - hwR, 6);
        this.dC[k] = Math.max(this.dC[k], rIn - d);
        this.G[k] = Math.min(this.G[k], d - rOut - STREET.footpath);
      }
    }
    for (let k = 0; k < this.F.length; k++) this.F[k] = this.G[k] - STREET.setback;
  }

  /** Visual land polygon: gameplay land + continuation bands beyond the north and south map edges. */
  visualLand() {
    const { roads } = this;
    const se = roads.seaEdge, c = roads.coast;
    // seaEdge ends at the north map edge; continue the curve bending west towards Chowpatty
    const a = se[se.length - 3], b = se[se.length - 2];
    let x = b[0], z = b[1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
    const zEnd = GRID.z0 + 1;
    const ext = [];
    let turned = 0;
    for (let it = 0; it < 200 && z > zEnd; it++) {
      x += tx * 12; z += tz * 12;
      // bend towards west (-X) but never past heading NW-W
      const ang = turned < 0.45 ? 0.015 : 0; turned += ang;
      const c = Math.cos(ang), s = Math.sin(ang);
      const ntx = tx * c - tz * s, ntz = tx * s + tz * c;
      // pick the rotation sense that turns towards -X
      if (ntx < tx) { tx = ntx; tz = ntz; } else { const mtx = tx * c + tz * s, mtz = -tx * s + tz * c; tx = mtx; tz = mtz; }
      if (tz > -0.3) { tz = -0.3; const L2 = Math.hypot(tx, tz); tx /= L2; tz /= L2; }
      ext.push([x, Math.max(z, zEnd)]);
    }
    this.coastExt = ext;
    const zS = GRID.z0 + GRID.nz * GRID.h - 1;
    return [...se.slice(0, -1), ...ext, [c.harbourX, zEnd], [c.harbourX, zS], [c.southShoreSplitX, zS], [c.southShoreSplitX, c.southShoreZ]];
  }

  _landField() {
    const poly = this.visualLand();
    this.landPoly = poly;
    const W = this.W;
    for (let j = 0; j <= GRID.nz; j++) {
      const z = this.vz(j), xs = [];
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const [xa, za] = poly[a], [xb, zb] = poly[b];
        if ((za > z) !== (zb > z)) xs.push(xa + (z - za) / (zb - za) * (xb - xa));
      }
      xs.sort((p, q) => p - q);
      for (let m = 0; m + 1 < xs.length; m += 2) {
        const i0 = Math.max(0, Math.ceil((xs[m] - GRID.x0) / GRID.h)), i1 = Math.min(GRID.nx, Math.floor((xs[m + 1] - GRID.x0) / GRID.h));
        for (let i = i0; i <= i1; i++) this.land[j * W + i] = 30;
      }
    }
    const B = 14, near = new Float32Array(this.land.length).fill(1e9);
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [xa, za] = poly[b], [xb, zb] = poly[a];
      const dx = xb - xa, dz = zb - za, L2 = dx * dx + dz * dz || 1;
      const [i0, i1, j0, j1] = this._box(Math.min(xa, xb) - B, Math.max(xa, xb) + B, Math.min(za, zb) - B, Math.max(za, zb) + B);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = this.vx(i), z = this.vz(j);
        let t = ((x - xa) * dx + (z - za) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - xa - dx * t, z - za - dz * t);
        const k = j * W + i; if (d < near[k]) near[k] = d;
      }
    }
    for (let k = 0; k < near.length; k++) if (near[k] < 30) this.land[k] = Math.sign(this.land[k]) * near[k];
  }

  _parkField() {
    const W = this.W;
    for (const p of this.roads.parks) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of p.poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
      const [i0, i1, j0, j1] = this._box(minX - 6, maxX + 6, minZ - 6, maxZ + 6);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = this.vx(i), z = this.vz(j);
        const d = distToPoly(x, z, p.poly) * (pointInPoly(x, z, p.poly) ? 1 : -1);
        const k = j * W + i; if (d > this.park[k]) this.park[k] = d;
      }
    }
  }
}

/**
 * Marching squares over grid vertex values: meshes the region where value > 0 at height y.
 * Full cells are merged into horizontal runs. Returns { pos, nrm, uv, idx, segs } where segs are contour
 * segments [x1,z1,x2,z2] (region on one side; use the field gradient to orient).
 */
export function contour(valueFn, y, opts = {}) {
  const { nx, nz, h, x0, z0 } = GRID;
  const W = nx + 1;
  const vals = new Float32Array(W * (nz + 1));
  for (let k = 0; k < vals.length; k++) vals[k] = valueFn(k);
  const pos = [], idx = [], segs = [];
  let nv = 0;
  const pushV = (x, z) => { pos.push(x, y, z); return nv++; };
  const v = [0, 0, 0, 0], ins = [false, false, false, false];
  const cx = [0, 0, 0, 0], cz = [0, 0, 0, 0];
  for (let j = 0; j < nz; j++) {
    let runStart = -1;
    const flush = (iEnd) => {
      if (runStart < 0) return;
      const xa = x0 + runStart * h, xb = x0 + iEnd * h, za = z0 + j * h, zb = za + h;
      const a = pushV(xa, za), b = pushV(xb, za), c = pushV(xb, zb), d = pushV(xa, zb);
      idx.push(a, d, c, a, c, b);
      runStart = -1;
    };
    for (let i = 0; i < nx; i++) {
      const k = j * W + i;
      v[0] = vals[k]; v[1] = vals[k + 1]; v[2] = vals[k + W + 1]; v[3] = vals[k + W];
      let n = 0; for (let c = 0; c < 4; c++) { ins[c] = v[c] > 0; if (ins[c]) n++; }
      if (n === 4) { if (runStart < 0) runStart = i; continue; }
      flush(i);
      if (n === 0) continue;
      cx[0] = cx[3] = x0 + i * h; cx[1] = cx[2] = x0 + (i + 1) * h;
      cz[0] = cz[1] = z0 + j * h; cz[2] = cz[3] = z0 + (j + 1) * h;
      const poly = [];
      for (let c = 0; c < 4; c++) {
        const m = (c + 1) & 3;
        if (ins[c]) poly.push([cx[c], cz[c], 0]);
        if (ins[c] !== ins[m]) { const t = v[c] / (v[c] - v[m]); poly.push([cx[c] + (cx[m] - cx[c]) * t, cz[c] + (cz[m] - cz[c]) * t, 1]); }
      }
      const base = nv;
      for (const p of poly) pushV(p[0], p[1]);
      for (let q = 1; q + 1 < poly.length; q++) idx.push(base, base + q + 1, base + q);
      for (let q = 0; q < poly.length; q++) {
        const p1 = poly[q], p2 = poly[(q + 1) % poly.length];
        if (p1[2] && p2[2]) segs.push([p1[0], p1[1], p2[0], p2[1]]);
      }
    }
    flush(nx);
  }
  // make triangles face up
  if (idx.length) {
    const a = idx[0] * 3, b = idx[1] * 3, c = idx[2] * 3;
    const ux = pos[b] - pos[a], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vz = pos[c + 2] - pos[a + 2];
    if (uz * vx - ux * vz < 0) for (let q = 0; q < idx.length; q += 3) { const t = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = t; }
  }
  const nrm = new Array(pos.length);
  for (let q = 0; q < pos.length; q += 3) { nrm[q] = 0; nrm[q + 1] = 1; nrm[q + 2] = 0; }
  const s = opts.uvScale || 1, uv = [];
  for (let q = 0; q < pos.length; q += 3) uv.push(pos[q] * s, pos[q + 2] * s);
  return { pos, nrm, uv, idx, segs, vals };
}
