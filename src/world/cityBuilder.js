// Procedural buildings on a jittered grid with rejection rules.
import { box, cyl } from '../utils/geom.js';
import { pointInPoly, distToPolyEdges } from '../utils/math.js';
import { obbOverlap } from '../physics/collision.js';
import { SpatialGrid } from '../physics/spatialGrid.js';
import { LANDMARKS, MAIDANS, SAND, POIS, REGAL, FORT_ZONE } from './mapData.js';
import { landmarkFootprints } from './landmarks/index.js';
import { CONFIG } from '../core/config.js';

const FORT_COLS = [0xd9c9a3, 0xe4d6b8, 0xcdb58b, 0xbfa98a, 0xe8dcc3, 0xd2bf9a];
const DECO_COLS = [0xf1e3c4, 0xf3c9c4, 0xc8e6c9, 0xf6d9b0, 0xe9e2d0, 0xf0d9e6];
const GEN_COLS = [0xd9d4c4, 0xe9e2d0, 0xb7c4cf, 0xd7b9a3, 0xc9b9a0, 0xa9b8a3, 0xe0c9a6, 0xbfc7c9, 0xd9a89b];
const WINDOW = 0x39475a;
const SLAB = 0xcfc8b8;

function shade(hex, f) {
  const r = Math.round(((hex >> 16) & 255) * f);
  const g = Math.round(((hex >> 8) & 255) * f);
  const b = Math.round((hex & 255) * f);
  return (r << 16) | (g << 8) | b;
}

/** Exclusion boxes (oriented) that procedural buildings must stay out of. */
function exclusions() {
  const ex = [];
  for (const l of LANDMARKS) ex.push({ x: l.x, z: l.z, hw: l.w / 2 + 7, hd: l.d / 2 + 7, rot: 0 });
  for (const f of landmarkFootprints()) ex.push({ x: f.x, z: f.z, hw: f.hw + 6, hd: f.hd + 6, rot: f.rot || 0 });
  for (const m of MAIDANS) {
    ex.push({ x: (m.x0 + m.x1) / 2, z: (m.z0 + m.z1) / 2, hw: (m.x1 - m.x0) / 2 + 5, hd: (m.z1 - m.z0) / 2 + 5, rot: 0 });
  }
  ex.push({ x: (SAND.x0 + SAND.x1) / 2, z: (SAND.z0 + SAND.z1) / 2, hw: (SAND.x1 - SAND.x0) / 2 + 6, hd: (SAND.z1 - SAND.z0) / 2 + 6, rot: 0 });
  for (const p of Object.values(POIS)) ex.push({ x: p.x, z: p.z, hw: 16, hd: 16, rot: 0 });
  ex.push({ x: REGAL.x, z: REGAL.z, hw: 34, hd: 34, rot: 0 });
  return ex;
}

export function buildCity({ graph, rng, chunks, poly, step = 22 }) {
  const r = rng.fork(101);
  const ex = exclusions();
  const placed = new SpatialGrid(32);
  const colliders = [];
  const o = { x: 0, z: 0, hw: 0, hd: 0, rot: 0 };
  const tmpList = [];
  let count = 0;

  const loc = (b, lx, lz) => [
    b.x + lx * Math.cos(b.rot) + lz * Math.sin(b.rot),
    b.z - lx * Math.sin(b.rot) + lz * Math.cos(b.rot),
  ];

  for (let gx = CONFIG.bounds.minX + 10; gx < CONFIG.bounds.maxX; gx += step) {
    for (let gz = CONFIG.bounds.minZ + 10; gz < CONFIG.bounds.maxZ; gz += step) {
      const x = gx + r.range(-4, 4);
      const z = gz + r.range(-4, 4);
      // random draws always happen so the stream stays stable regardless of rejection
      const w = r.range(12, 28);
      const d = r.range(12, 28);
      const hRoll = r.next();
      const colRoll = r.next();
      const tankRoll = r.next();
      const balRoll = r.next();
      if (!pointInPoly(x, z, poly)) continue;
      if (distToPolyEdges(x, z, poly) < 12) continue;
      const ne = graph.nearestEdge(x, z, 90);
      const rot = ne ? Math.atan2(-ne.tz, ne.tx) : 0;
      const b = { x, z, hw: w / 2, hd: d / 2, rot };
      // land + road clearance on perimeter samples
      let ok = true;
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      const samples = [[0, 0]];
      for (let t = -1; t <= 1.001; t += 6 / w) {
        samples.push([t * b.hw, b.hd], [t * b.hw, -b.hd]);
      }
      for (let t = -1; t <= 1.001; t += 6 / d) {
        samples.push([b.hw, t * b.hd], [-b.hw, t * b.hd]);
      }
      for (const [lx, lz] of samples) {
        const wx = x + lx * cs + lz * sn;
        const wz = z - lx * sn + lz * cs;
        if (!pointInPoly(wx, wz, poly) || distToPolyEdges(wx, wz, poly) < 4) { ok = false; break; }
        if (graph.roadClearance(wx, wz, 24) < 6) { ok = false; break; }
      }
      if (!ok) continue;
      for (const e of ex) {
        if (obbOverlap(b, e)) { ok = false; break; }
      }
      if (!ok) continue;
      tmpList.length = 0;
      placed.query(x, z, 40, tmpList);
      const infl = { x, z, hw: b.hw + 1.5, hd: b.hd + 1.5, rot };
      for (const p of tmpList) {
        if (obbOverlap(infl, p)) { ok = false; break; }
      }
      if (!ok) continue;

      // --- accepted ---
      const fort = x > FORT_ZONE.x0 && x < FORT_ZONE.x1 && z > FORT_ZONE.z0 && z < FORT_ZONE.z1;
      const nearMD = graph.roads.get('marine_drive') && distToMarine(graph, x, z) < 46;
      let h;
      let base;
      if (fort) {
        h = 15 + hRoll * 13;
        base = FORT_COLS[Math.floor(colRoll * FORT_COLS.length)];
      } else if (nearMD) {
        h = 17 + hRoll * 9;
        base = DECO_COLS[Math.floor(colRoll * DECO_COLS.length)];
      } else {
        h = 9 + hRoll * hRoll * 31;
        base = GEN_COLS[Math.floor(colRoll * GEN_COLS.length)];
      }
      h = Math.round(h / 3.4) * 3.4;
      const col = { x, z, hw: b.hw, hd: b.hd, rot, kind: 'building', h };
      colliders.push(col);
      placed.insert({ x, z, hw: b.hw, hd: b.hd, rot });
      count++;

      chunks.addGeom(box(w, h, d, base, x, 0, z, rot));
      chunks.addGeom(box(w + 0.6, 0.8, d + 0.6, shade(base, 0.82), x, h, z, rot));
      if (tankRoll < 0.4) {
        const [tx, tz] = loc(b, w * 0.2, d * 0.15);
        chunks.addGeom(cyl(1.2, 1.2, 2.2, 6, 0x7a6c5e, tx, h + 0.8, tz));
      }
      // balconies on both long faces of taller buildings
      if (h > 12) {
        const nb = 1 + Math.floor(balRoll * 3);
        for (let k = 0; k < nb; k++) {
          const fy = 3.4 * (2 + k * 2);
          if (fy > h - 3) break;
          for (const sgn of [1, -1]) {
            const [bx, bz] = loc(b, 0, sgn * (b.hd + 0.7));
            chunks.addGeom(box(w * 0.55, 0.25, 1.4, SLAB, bx, fy, bz, rot));
          }
        }
      }
      // window bands
      const raw = chunks.rawAt(x, z);
      const floors = Math.floor(h / 3.4);
      for (let f = 1; f < floors; f++) {
        const y0 = f * 3.4 + 0.8;
        const y1 = y0 + 1.5;
        const m = 1.3;
        const e = 0.06;
        const faces = [
          [-b.hw + m, b.hd + e, b.hw - m, b.hd + e],
          [b.hw - m, -b.hd - e, -b.hw + m, -b.hd - e],
          [b.hw + e, b.hd - m, b.hw + e, -b.hd + m],
          [-b.hw - e, -b.hd + m, -b.hw - e, b.hd - m],
        ];
        for (const [ax, az, bx2, bz2] of faces) {
          const [x0, z0] = loc(b, ax, az);
          const [x1, z1] = loc(b, bx2, bz2);
          raw.vquad(x0, z0, x1, z1, y0, y1, WINDOW);
        }
      }
    }
  }
  return { colliders, count };
}

function distToMarine(graph, x, z) {
  const r = graph.roads.get('marine_drive');
  let best = Infinity;
  for (let i = 0; i < r.px.length; i += 2) {
    const d = (r.px[i] - x) ** 2 + (r.pz[i] - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
