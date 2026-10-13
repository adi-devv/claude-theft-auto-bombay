// Ground: asphalt carriageways, raised pavements/footpaths with painted kerbs, promenade slabs, maidan grass,
// sea-wall faces, road markings and zebra crossings. Built from the SDF fields (field.js) so junctions are clean.
import * as THREE from 'three';
import { contour } from './field.js';
import { STREET } from './mapdata.js';

export const KERB_H = STREET.kerbHeight; // 0.15
const SEA_WALL_BOTTOM = -4.5;

export function buildGround(game, fields, mats, batch) {
  const F = fields;
  const W = F.W;
  const grassField = (k) => Math.min(F.park[k], F.G[k] - 0.5);
  // --- asphalt
  const asph = contour((k) => Math.min(-F.dC[k], F.land[k] + 2), 0.0, { uvScale: 1 / 9 });
  addChunked(batch, 'asphalt', asph, null);
  // --- pavement (non-promenade) and promenade
  const pavVal = (k) => Math.min(F.dC[k], F.land[k], -grassField(k));
  const pav = contour((k) => Math.min(pavVal(k), F.land[k] - 10.6), KERB_H, { uvScale: 1 / 4 });
  const prom = contour((k) => Math.min(pavVal(k), 10.6 - F.land[k]), KERB_H, { uvScale: 1 / 6 });
  const colorize = (m, dark) => {
    const cols = [];
    for (let q = 0; q < m.pos.length; q += 3) {
      const g = F.sample(F.G, m.pos[q], m.pos[q + 2]);
      const v = dark ? 1 - 0.32 * THREE.MathUtils.smoothstep(g, 3, 14) : 1;
      cols.push(v, v * 0.98, v * 0.95);
    }
    return cols;
  };
  addChunked(batch, 'paving', pav, colorize(pav, true));
  addChunked(batch, 'promenade', prom, null);
  const gr = contour((k) => Math.min(grassField(k), F.land[k], F.dC[k]), KERB_H + 0.01, { uvScale: 1 / 14 });
  addChunked(batch, 'grass', gr, null);
  // --- kerb faces + painted kerb strip; sea wall faces
  const kp = [], kn = [], ku = [], ki = [];
  const sp = [], sn = [], su = [], si = [];
  const tp = [], tn = [], tu = [], ti = [];
  const segs = pav.segs.concat(prom.segs);
  const grad = (x, z) => {
    const e = 0.6;
    const f = (xx, zz) => Math.min(F.sample(F.dC, xx, zz), F.sample(F.land, xx, zz));
    return [f(x + e, z) - f(x - e, z), f(x, z + e) - f(x, z - e)];
  };
  for (const [x1, z1, x2, z2] of segs) {
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    const dC = F.sample(F.dC, mx, mz), ld = F.sample(F.land, mx, mz);
    const isSea = ld < dC - 0.05;
    const isKerb = !isSea && Math.abs(dC) < 0.6;
    if (!isSea && !isKerb) continue; // boundary to grass or promenade split
    let [gx, gz] = grad(mx, mz); const gl = Math.hypot(gx, gz) || 1; gx /= gl; gz /= gl; // points into pavement
    const nx = -gx, nz = -gz; // face normal: out of the pavement
    const L = Math.hypot(x2 - x1, z2 - z1); if (L < 1e-3) continue;
    // orient segment so that triangle winding faces (nx,nz)
    let ax = x1, az = z1, bx = x2, bz = z2;
    // edge direction e, want cross(e, up) . n > 0  →  (ez*1 - 0, ..., -ex) => (-ez? ) compute: cross((ex,0,ez),(0,1,0)) = (-ez, 0, ex)
    const ex = bx - ax, ez = bz - az;
    if (-ez * nx + ex * nz < 0) { [ax, bx] = [bx, ax]; [az, bz] = [bz, az]; }
    const y0 = isSea ? SEA_WALL_BOTTOM : 0, y1 = KERB_H;
    const P = isSea ? sp : kp, N = isSea ? sn : kn, Uv = isSea ? su : ku, I = isSea ? si : ki;
    const b = P.length / 3;
    // quad a0,b0,b1,a1 : triangle (a0,b0,b1) normal = cross(b0-a0, b1-a0) = cross(e, up*h) ∝ (-ez,0,ex)
    P.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
    for (let q = 0; q < 4; q++) N.push(nx, 0, nz);
    const u0 = (ax * -nz + az * nx), u1 = (bx * -nz + bz * nx);
    Uv.push(u0, y0, u1, y0, u1, y1, u0, y1);
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    if (isKerb) {
      // painted top strip 0.3 m into the pavement
      const tb = tp.length / 3, ix = gx * 0.3, iz = gz * 0.3, y = KERB_H + 0.003;
      tp.push(ax, y, az, bx, y, bz, bx + ix, y, bz + iz, ax + ix, y, az + iz);
      for (let q = 0; q < 4; q++) tn.push(0, 1, 0);
      tu.push(ax, az, bx, bz, bx + ix, bz + iz, ax + ix, az + iz);
      // winding: want +Y. triangle (a, b, b+i): cross(b-a, i) y = ez*ix - ex*iz
      if ((bz - az) * ix - (bx - ax) * iz > 0) ti.push(tb, tb + 1, tb + 2, tb, tb + 2, tb + 3); else ti.push(tb, tb + 2, tb + 1, tb, tb + 3, tb + 2);
    }
  }
  addChunked(batch, 'kerb', { pos: kp, nrm: kn, uv: ku, idx: ki }, null);
  addChunked(batch, 'kerb', { pos: tp, nrm: tn, uv: tu, idx: ti }, null);
  addChunked(batch, 'facade', { pos: sp, nrm: sn, uv: su, idx: si }, null, { facade: [3, 3, 6, 0.3 + 40], color: 0x7d7468 });
  return { asphaltTris: asph.idx.length / 3, pavementTris: pav.idx.length / 3 };
}

/** Split a big raw mesh into spatial chunks (by triangle centroid) before adding to the batch. */
export function addChunked(batch, key, m, colors, opts = {}) {
  const { pos, nrm, uv, idx } = m;
  const groups = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const cx = Math.floor((pos[a] - batch.origin.x) / batch.chunk), cz = Math.floor((pos[a + 2] - batch.origin.z) / batch.chunk);
    const key2 = cx + ',' + cz;
    let g = groups.get(key2); if (!g) groups.set(key2, (g = { map: new Map(), pos: [], nrm: [], uv: [], col: [], idx: [], x: pos[a], z: pos[a + 2] }));
    for (let q = 0; q < 3; q++) {
      const vi = idx[t + q];
      let ni = g.map.get(vi);
      if (ni === undefined) {
        ni = g.pos.length / 3; g.map.set(vi, ni);
        g.pos.push(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]); g.nrm.push(nrm[vi * 3], nrm[vi * 3 + 1], nrm[vi * 3 + 2]); g.uv.push(uv[vi * 2], uv[vi * 2 + 1]);
        if (colors) g.col.push(colors[vi * 3], colors[vi * 3 + 1], colors[vi * 3 + 2]);
      }
      g.idx.push(ni);
    }
  }
  for (const g of groups.values()) batch.addRaw(key, g.pos, g.nrm, g.uv, g.idx, { ...opts, at: { x: g.x, z: g.z }, colors: colors ? g.col : undefined });
}

// ------------------------------------------------------------------------------------------------
// Road markings

export function buildMarkings(game, batch) {
  const roads = game.roads;
  const pos = [], nrm = [], uv = [], idx = [], col = [];
  const WHITE = [0.86, 0.86, 0.82], YELLOW = [0.9, 0.7, 0.15];
  const Y = 0.012;
  const quad = (pts4, c) => {
    const b = pos.length / 3;
    for (const [x, z] of pts4) { pos.push(x, Y, z); nrm.push(0, 1, 0); uv.push(x, z); col.push(c[0], c[1], c[2]); }
    // ensure +Y facing
    const [a, bq, cq] = pts4; const cr = (bq[1] - a[1]) * (cq[0] - a[0]) - (bq[0] - a[0]) * (cq[1] - a[1]);
    if (cr > 0) idx.push(b, b + 1, b + 2, b, b + 2, b + 3); else idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  };
  // ribbon along edge between s0..s1 at lateral offset off (left of a->b), width w
  const ribbon = (e, s0, s1, off, w, c) => {
    if (s1 - s0 < 0.2) return;
    const n = Math.max(1, Math.ceil((s1 - s0) / 3));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const s = s0 + (s1 - s0) * (i / n);
      const p = roads.sample(e, s);
      const lx = p.tz, lz = -p.tx;
      const A = [p.x + lx * (off - w / 2), p.z + lz * (off - w / 2)], B = [p.x + lx * (off + w / 2), p.z + lz * (off + w / 2)];
      if (prev) quad([prev[0], prev[1], B, A], c);
      prev = [A, B];
    }
  };
  const junctionTrim = (nodeId) => {
    const n = roads.nodes.get(nodeId);
    if (n.roundabout) return n.radius + STREET.zebraOffset + 4;
    if (n.edges.length >= 3) return n.radius + STREET.zebraOffset + 4;
    return 0;
  };
  const crossings = [];
  for (const e of roads.edges) {
    const t0 = junctionTrim(e.a), t1 = junctionTrim(e.b);
    const s0 = t0, s1 = e.length - t1;
    if (s1 - s0 < 2) continue;
    const hw = e.width / 2, med = e.median / 2, lw = e.laneWidth;
    const major = e.kind === 'boulevard' || e.kind === 'arterial';
    // centre
    if (med > 0) { ribbon(e, s0, s1, med + 0.35, 0.15, YELLOW); ribbon(e, s0, s1, -(med + 0.35), 0.15, YELLOW); }
    else if (e.lanes >= 2) { ribbon(e, s0, s1, 0.12, 0.12, YELLOW); ribbon(e, s0, s1, -0.12, 0.12, YELLOW); }
    else if (e.kind === 'street') dashes(e, s0, s1, 0, 0.12, 3, 5, WHITE);
    // lane separators
    for (let k = 1; k < e.lanes; k++) { const o = med + k * lw; dashes(e, s0, s1, o, 0.12, 3, 6, WHITE); dashes(e, s0, s1, -o, 0.12, 3, 6, WHITE); }
    // edge lines
    if (major) { ribbon(e, s0, s1, hw - 0.4, 0.15, WHITE); ribbon(e, s0, s1, -(hw - 0.4), 0.15, WHITE); }
    // zebra crossings + stop lines at junction ends
    for (const end of [0, 1]) {
      const nodeId = end ? e.b : e.a; const n = roads.nodes.get(nodeId);
      if (!(n.roundabout || n.edges.length >= 3)) continue;
      const zs = (n.roundabout ? n.radius : n.radius) + STREET.zebraOffset;
      if (zs + 4 > e.length / 2) continue;
      const sA = end ? e.length - zs - 3 : zs, sB = sA + 3;
      const p = roads.sample(e, (sA + sB) / 2);
      crossings.push({ x: p.x, z: p.z, tx: p.tx, tz: p.tz, width: e.width, node: nodeId, edge: e.id });
      for (let o = -hw + 0.8; o <= hw - 0.6; o += 1.0) {
        if (med > 0 && Math.abs(o) < med + 0.3) continue;
        ribbon(e, sA, sB, o, 0.5, WHITE);
      }
      // stop line on the approach half (traffic towards the node uses: end b → left half; end a → right half)
      const stopS = end ? sA - 1.2 : sB + 1.2;
      const side = end ? 1 : -1;
      const pS = roads.sample(e, stopS), lx = pS.tz, lz = -pS.tx;
      const o0 = side * (med + 0.1), o1 = side * (hw - 0.3);
      const along = [pS.tx * 0.2, pS.tz * 0.2];
      quad([[pS.x + lx * o0 - along[0], pS.z + lz * o0 - along[1]], [pS.x + lx * o1 - along[0], pS.z + lz * o1 - along[1]], [pS.x + lx * o1 + along[0], pS.z + lz * o1 + along[1]], [pS.x + lx * o0 + along[0], pS.z + lz * o0 + along[1]]], WHITE);
    }
  }
  function dashes(e, s0, s1, off, w, dash, gap, c) {
    for (let s = s0 + gap * 0.5; s + dash <= s1; s += dash + gap) ribbon(e, s, s + dash, off, w, c);
  }
  // roundabout ring lane divider (dashed circle)
  for (const n of roads.nodes.values()) {
    if (!n.roundabout) continue;
    const rIn = Math.max(6, n.roundabout - 7), rOut = n.radius - 1, rc = (rIn + rOut) / 2;
    const segs = Math.ceil(2 * Math.PI * rc / 4.5);
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = a0 + (2.4 / rc);
      const p = (a, r) => [n.x + Math.cos(a) * r, n.z + Math.sin(a) * r];
      quad([p(a0, rc - 0.07), p(a1, rc - 0.07), p(a1, rc + 0.07), p(a0, rc + 0.07)], WHITE);
    }
  }
  addChunked(batch, 'markings', { pos, nrm, uv, idx }, col);
  return { crossings };
}
