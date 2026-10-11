// Instanced street props: tetrapods along the sea wall, Marine Drive streetlights
// (Queen's Necklace) and gulmohar trees. Every function is deterministic given its rng.
import * as THREE from 'three';
import { box, cyl, place, colorize, merge, staticMaterial } from '../utils/geom.js';
import { marineDrive, MD_HALF_BAND, WALL_OFFSET, MAIDANS, roadClearance } from './landmarks/coords.js';

function finishInstanced(mesh) {
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- tetrapods
function tetrapodGeometry() {
  const dirs = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  const parts = dirs.map((d) => {
    const v = new THREE.Vector3(...d).normalize();
    const g = new THREE.CylinderGeometry(0.3, 0.62, 1.7, 4);
    g.translate(0, 0.85, 0); // base at centre, tip outwards
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
    g.applyQuaternion(q);
    return colorize(g, 0x9c9a94);
  });
  return merge(parts);
}

export function buildTetrapods(rng, count = 700) {
  const md = marineDrive();
  const geo = tetrapodGeometry();
  const mesh = new THREE.InstancedMesh(geo, staticMaterial(), count);
  mesh.name = 'tetrapods';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  const rows = [[WALL_OFFSET + 3.6, 0.55, 0.2], [WALL_OFFSET + 7.4, 0.5, 0.0]];
  const perRow = [Math.ceil(count * 0.52), Math.floor(count * 0.48)];
  let k = 0;
  rows.forEach(([off, y, base], r) => {
    const step = md.length / perRow[r];
    for (let i = 0; i < perRow[r] && k < count; i++, k++) {
      const q0 = md.at((i + (r ? 0.5 : 0)) * step + (rng() - 0.5) * 1.2);
      const o = off + (rng() - 0.5) * 1.6;
      pos.set(q0.x + q0.nx * o, y + base, q0.z + q0.nz * o);
      e.set(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
      q.setFromEuler(e);
      const s = 0.95 + rng() * 0.4;
      sc.set(s, s, s);
      m.compose(pos, q, sc);
      mesh.setMatrixAt(k, m);
      const v = 0.82 + rng() * 0.25;
      mesh.setColorAt(k, col.setRGB(v, v, v * 0.98));
    }
  });
  mesh.count = k;
  return finishInstanced(mesh);
}

// ------------------------------------------------------------- streetlights
export function buildStreetlights(spacing = 15) {
  const md = marineDrive();
  const poleGeo = merge([
    cyl(0.1, 0.17, 6.4, 6, 0x3d4349, 0, 0, 0),
    box(0.16, 0.16, 2.3, 0x3d4349, 0, 6.25, 1.05),
    box(0.45, 0.2, 0.8, 0x2c3136, 0, 6.15, 2.1),
  ]);
  const bulbGeo = box(0.34, 0.12, 0.55, 0xffffff, 0, 6.05, 2.1);
  const n = Math.floor((md.length - 20) / spacing) + 1;
  const poles = new THREE.InstancedMesh(poleGeo, staticMaterial(), n);
  const bulbMat = new THREE.MeshLambertMaterial({ color: 0x4a4636, emissive: 0xffd58a, emissiveIntensity: 0.12 });
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, n);
  poles.name = 'streetlight_poles';
  bulbs.name = 'streetlight_bulbs';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < n; i++) {
    const p = md.at(10 + i * spacing);
    const off = MD_HALF_BAND + 0.9;
    pos.set(p.x + p.nx * off, 0.17, p.z + p.nz * off);
    q.setFromAxisAngle(up, Math.atan2(p.ex, p.ez)); // arm (+Z) reaches over the road
    m.compose(pos, q, sc);
    poles.setMatrixAt(i, m);
    bulbs.setMatrixAt(i, m);
  }
  finishInstanced(poles);
  finishInstanced(bulbs);
  return {
    poles,
    bulbs,
    material: bulbMat,
    setNight(t) {
      const k = Math.max(0, Math.min(1, t));
      bulbMat.emissiveIntensity = 0.12 + 1.9 * k;
    },
  };
}

// -------------------------------------------------------------------- trees
// Gulmohar: brown trunk + low-poly crown (green with some in flame-red bloom).
export function treeSpots(rng) {
  const spots = [];
  const ring = (m, inset, step, minClear) => {
    const x0 = m.x0 + inset, x1 = m.x1 - inset, z0 = m.z0 + inset, z1 = m.z1 - inset;
    const edge = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.floor(len / step));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = ax + (bx - ax) * t + (rng() - 0.5) * 2.5;
        const z = az + (bz - az) * t + (rng() - 0.5) * 2.5;
        if (roadClearance(x, z) > minClear) spots.push([x, z]);
      }
    };
    edge(x0, z0, x1, z0); edge(x1, z0, x1, z1); edge(x1, z1, x0, z1); edge(x0, z1, x0, z0);
  };
  ring(MAIDANS.oval, 6, 24, 6);
  ring(MAIDANS.cross, 6, 26, 6);
  ring(MAIDANS.azad, 7, 30, 8);
  return spots;
}

export function buildTrees(rng, spots = treeSpots(rng)) {
  const colliders = [];
  const n = spots.length;
  const trunkGeo = cyl(0.28, 0.4, 3.2, 5, 0x6b4a2f, 0, 0, 0);
  const crownGeo = place(colorize(new THREE.IcosahedronGeometry(3.2, 0), 0xffffff), 0, 5.2, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, staticMaterial(), n);
  const crowns = new THREE.InstancedMesh(crownGeo, staticMaterial(), n);
  trunks.name = 'tree_trunks';
  crowns.name = 'tree_crowns';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  const greens = [0x3f8f3f, 0x4d9a45, 0x35803a];
  const flames = [0xd9442c, 0xe2672b, 0xc9362c];
  for (let i = 0; i < n; i++) {
    const [x, z] = spots[i];
    const s = 0.85 + rng() * 0.5;
    pos.set(x, 0, z);
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    sc.set(s, s * (0.9 + rng() * 0.3), s);
    m.compose(pos, q, sc);
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
    const bloom = rng() < 0.4;
    crowns.setColorAt(i, col.set((bloom ? flames : greens)[Math.floor(rng() * 3)]));
    trunks.setColorAt(i, col.setRGB(1, 1, 1));
    colliders.push({ x, z, hw: 0.45, hd: 0.45, rot: 0 });
  }
  finishInstanced(trunks);
  finishInstanced(crowns);
  return { trunks, crowns, colliders };
}
