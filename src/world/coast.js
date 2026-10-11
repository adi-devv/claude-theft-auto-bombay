// Land polygon, sea, ground, sea wall and coast colliders.
import * as THREE from 'three';
import { COAST, MAIDANS, SAND } from './mapData.js';
import { box, flatPoly } from '../utils/geom.js';
import { pointInPoly } from '../utils/math.js';
import { CONFIG } from '../core/config.js';

/** Seaward offset polyline of Marine Drive (every ~12 m) at the given distance. */
export function marineOffset(graph, dist = COAST.marineOffset) {
  const r = graph.roads.get('marine_drive');
  const pts = [];
  const n = r.px.length;
  for (let i = 0; i < n; i += 3) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let tx = r.px[b] - r.px[a];
    let tz = r.pz[b] - r.pz[a];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    // seaSide = +1 -> left of travel = (tz, -tx)
    pts.push({ x: r.px[i] + tz * dist, z: r.pz[i] - tx * dist });
  }
  const last = n - 1;
  if ((n - 1) % 3 !== 0) {
    const tx = r.px[last] - r.px[last - 1];
    const tz = r.pz[last] - r.pz[last - 1];
    const l = Math.hypot(tx, tz) || 1;
    pts.push({ x: r.px[last] + (tz / l) * dist, z: r.pz[last] - (tx / l) * dist });
  }
  return pts;
}

/** Clockwise land polygon [{x,z}] and the index range that follows Marine Drive. */
export function buildLandPolygon(graph) {
  const sea = marineOffset(graph);
  const poly = sea.slice();
  const mdCount = sea.length;
  const end = sea[sea.length - 1];
  poly.push({ x: end.x - 4, z: COAST.north });
  for (const [x, z] of COAST.eastNorth) poly.push({ x, z });
  for (const [x, z] of COAST.eastSouth) poly.push({ x, z });
  for (const [x, z] of COAST.south) poly.push({ x, z });
  return { poly, mdCount };
}

const GROUND = 0x8d9279;
const GRASS = 0x6c9b57;
const PITCH = 0xc9bb7c;
const SAND_C = 0xe0cd98;

export function buildCoast(graph, chunks) {
  const { poly, mdCount } = buildLandPolygon(graph);
  const group = new THREE.Group();
  const colliders = [];

  // ground
  const ground = flatPoly(poly.map((p) => [p.x, p.z]), GROUND, 0);
  const gm = new THREE.Mesh(ground, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  gm.name = 'ground';
  group.add(gm);

  // maidans, pitches, sand
  for (const m of MAIDANS) {
    chunks.addGeom(flatPoly([[m.x0, m.z0], [m.x1, m.z0], [m.x1, m.z1], [m.x0, m.z1]], GRASS, 0.02));
    if (m.pitches) {
      const cx = (m.x0 + m.x1) / 2;
      for (let i = 0; i < 4; i++) {
        const z = m.z0 + 50 + i * ((m.z1 - m.z0 - 100) / 3);
        chunks.addGeom(flatPoly([[cx - 2, z - 11], [cx + 2, z - 11], [cx + 2, z + 11], [cx - 2, z + 11]], PITCH, 0.03));
      }
    }
  }
  chunks.addGeom(flatPoly([[SAND.x0, SAND.z0], [SAND.x1, SAND.z0], [SAND.x1, SAND.z1], [SAND.x0, SAND.z1]], SAND_C, 0.02));

  // sea
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x2c6f93, flatShading: true }),
  );
  sea.position.set(0, CONFIG.seaY, 0);
  sea.name = 'sea';
  group.add(sea);

  // skirt so the sea edge doesn't show a gap under the ground
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    chunks.rawAt((a.x + b.x) / 2, (a.z + b.z) / 2).vquad(a.x, a.z, b.x, b.z, -1.4, 0.0, 0x6d7075, true);
  }

  // sea wall along Marine Drive (offset 21.4 m) + invisible colliders along the other coasts
  const wallPts = marineOffset(graph, COAST.marineOffset - 0.6);
  for (let i = 0; i < wallPts.length - 1; i++) {
    const a = wallPts[i];
    const b = wallPts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    const rot = Math.atan2(-dz, dx);
    const cx = (a.x + b.x) / 2;
    const cz = (a.z + b.z) / 2;
    chunks.addGeom(box(len + 0.4, 1.1, 0.7, 0xb9b3a3, cx, 0, cz, rot));
    // collider shifted seaward by 1 m, 3 m thick (thick enough against fast vehicles)
    const nx = dz / len; // seaward = left of travel (tz,-tx) with t=(dx,dz)/len -> (dz,-dx)/len
    const nz = -dx / len;
    colliders.push({ x: cx + nx * 1.2, z: cz + nz * 1.2, hw: len / 2 + 0.3, hd: 1.7, rot, kind: 'seawall' });
  }
  for (let i = mdCount - 1; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    const rot = Math.atan2(-dz, dx);
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    let nx = dz / len;
    let nz = -dx / len;
    if (pointInPoly(mx + nx * 0.5, mz + nz * 0.5, poly)) {
      nx = -nx;
      nz = -nz;
    }
    colliders.push({ x: mx + nx * 1.5, z: mz + nz * 1.5, hw: len / 2 + 2, hd: 1.5, rot, kind: 'coast' });
  }
  return { group, colliders, poly };
}
