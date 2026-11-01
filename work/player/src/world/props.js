// Street props: Marine Drive "Queen's Necklace" lamps (promenade row + median double-arm row), city streetlights,
// instanced trees (rain trees / gulmohar), maidan railings with gaps + cricket pitches. All solid props get colliders.
// Run AFTER generateBuildings (uses ctx.obstacles) and BEFORE buildSea (fills ctx.reflectLights).
import * as THREE from 'three';
import { mat, PRIM } from './geom.js';
import { SIGNALS, STREET } from './mapdata.js';

const POLE = '#3d4144', SODIUM = '#ffb45c', WHITE_LED = '#fff1d6';
const fMetal = [3, 3, 9, 0.85 + 40]; // smooth, no street glow (flag 4)

export function buildProps(game, ctx) {
  const { roads, collision } = game;
  const { batch, glows, fields } = ctx;
  const rnd = mulberry(4242);
  const nodeList = [...roads.nodes.values()];
  const sig = new Set(SIGNALS);
  const nearJunction = (x, z, extra) => nodeList.some((n) => (n.edges.length >= 3 || n.roundabout) && Math.hypot(x - n.x, z - n.z) < n.radius + extra + (sig.has(n.id) ? 8 : 0));
  const stats = { lamps: 0, trees: 0, rails: 0 };

  function lamp(x, z, ax, az, h, reach, color, sea = false, double = false) {
    // pole + curved arm (two angled boxes) + head; arm points along (ax,az)
    const rot = Math.atan2(ax, az);
    batch.add('facade', PRIM.cyl8, mat(x, h / 2, z, 0, 0.22, h, 0.22), { color: POLE, facade: fMetal });
    const arms = double ? [1, -1] : [1];
    for (const s of arms) {
      const dx = ax * s, dz = az * s;
      batch.add('facade', PRIM.box, mat(x + dx * reach * 0.3, h + 0.35, z + dz * reach * 0.3, rot, 0.1, 0.1, reach * 0.65, -0.55 * s), { color: POLE, facade: fMetal });
      batch.add('facade', PRIM.box, mat(x + dx * reach * 0.78, h + 0.62, z + dz * reach * 0.78, rot, 0.1, 0.1, reach * 0.45, 0), { color: POLE, facade: fMetal });
      const hx = x + dx * reach, hz = z + dz * reach;
      batch.add('glow', PRIM.box, mat(hx, h + 0.5, hz, rot, 0.38, 0.12, 0.75), { color: '#ffd9a0' });
      glows.add(hx, h + 0.4, hz, color, sea ? 4.2 : 3.4, 0, sea ? 2.6 : 1.8);
      if (sea) ctx.reflectLights.push({ x: hx, y: h + 0.4, z: hz, i: 1 });
    }
    collision.addCircle(x, z, 0.25, { tag: 'lamp', h });
    stats.lamps++;
  }

  // ---- Marine Drive: promenade row (sea side) + median double-arm row
  const md = roads.roads.find((r) => r.name === 'Marine Drive');
  const mdSeats = [];
  for (const e of md.edges) {
    for (let s = 6; s < e.length - 3; s += 24) {
      const p = roads.sample(e, s); const nx = p.tz, nz = -p.tx; // sea side normal
      const o = e.width / 2 + 0.9;
      if (!nearJunction(p.x, p.z, 2)) lamp(p.x + nx * o, p.z + nz * o, -nx, -nz, 9, 2.2, SODIUM, true);
      if (e.median > 0 && !nearJunction(p.x, p.z, 10) && (Math.round(s / 24) % 2 === 0)) lamp(p.x, p.z, nx, nz, 10, 2.6, SODIUM, false, true);
      mdSeats.push(p);
    }
  }

  // ---- other roads: staggered lamps both sides, skipping junction corners
  for (const r of roads.roads) {
    if (r === md) continue;
    const step = r.kind === 'arterial' ? 32 : 40, fp = STREET.footpath;
    for (const e of r.edges) {
      for (let s = 8, k = 0; s < e.length - 6; s += step / 2, k++) {
        const side = k % 2 ? 1 : -1, p = roads.sample(e, s);
        const nx = side * p.tz, nz = -side * p.tx, o = e.width / 2 + 0.7;
        const x = p.x + nx * o, z = p.z + nz * o;
        if (nearJunction(x, z, 4)) continue;
        if (fields.sample(fields.land, x, z) < 1) continue;
        lamp(x, z, -nx, -nz, 7.5, 1.6, rnd() < 0.3 ? WHITE_LED : SODIUM);
      }
    }
  }

  // ---- maidans: railings with gaps (colliders per run), cricket pitches, edge trees
  const trees = [];
  for (const park of roads.parks || []) {
    const poly = park.poly; let cx = 0, cz = 0; for (const [x, z] of poly) { cx += x; cz += z; } cx /= poly.length; cz /= poly.length;
    const pos = [], nrm = [], uv = [], idx = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      // inset 1 m toward centroid
      let nx = -tz, nz = tx; if ((cx - a[0]) * nx + (cz - a[1]) * nz < 0) { nx = -nx; nz = -nz; }
      const inset = 1.0, gapEvery = 45, gapW = 4;
      let s = 0;
      while (s < L - 1) {
        const run = Math.min(gapEvery - gapW, L - s);
        const x0 = a[0] + tx * s + nx * inset, z0 = a[1] + tz * s + nz * inset, x1 = x0 + tx * run, z1 = z0 + tz * run;
        const bI = pos.length / 3;
        pos.push(x0, 0.15, z0, x1, 0.15, z1, x1, 1.35, z1, x0, 1.35, z0);
        for (let j = 0; j < 4; j++) nrm.push(nx, 0, nz);
        uv.push(0, 0, run / 2, 0, run / 2, 1, 0, 1); idx.push(bI, bI + 1, bI + 2, bI, bI + 2, bI + 3);
        collision.addSegment(x0, z0, x1, z1, { tag: 'railing', h: 1.2 }, 0.1);
        stats.rails++;
        // trees just inside the railing
        for (let t = 5; t < run - 3; t += 13) trees.push([x0 + tx * t + nx * 4.5, z0 + tz * t + nz * 4.5, rnd()]);
        s += run + gapW;
      }
    }
    batch.addRaw('railing', pos, nrm, uv, idx, { at: { x: cx, z: cz } });
    // cricket pitches (dirt strips) along the maidan's long axis
    let bw = 0, ang = 0;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > bw) { bw = L; ang = Math.atan2(b[0] - a[0], b[1] - a[1]); } }
    for (let k = -1; k <= 1; k++) {
      const px = cx + Math.cos(ang) * k * 34, pz = cz - Math.sin(ang) * k * 34;
      batch.add('dirt', PRIM.box, mat(px, 0.03, pz, ang, 3.2, 0.06, 20));
      for (const e of [-1, 1]) for (const w of [-0.25, 0, 0.25]) // stumps
        batch.add('facade', PRIM.box, mat(px + Math.sin(ang) * e * 9 + Math.cos(ang) * w, 0.4, pz + Math.cos(ang) * e * 9 - Math.sin(ang) * w, ang, 0.05, 0.7, 0.05), { color: '#e8dcc0', facade: fMetal });
    }
  }

  // ---- street trees: footpath edge of non-MD roads (gaps near junctions / where buildings are tight)
  for (const r of roads.roads) {
    if (r === md || r.kind === 'lane') continue;
    for (const e of r.edges) for (let s = 12, k = 0; s < e.length - 8; s += 15, k++) {
      if (rnd() < 0.45) continue;
      const side = rnd() < 0.5 ? 1 : -1, p = roads.sample(e, s);
      const nx = side * p.tz, nz = -side * p.tx, o = e.width / 2 + STREET.footpath - 1.1;
      const x = p.x + nx * o, z = p.z + nz * o;
      if (nearJunction(x, z, 8)) continue;
      if (fields.sample(fields.land, x, z) < 2 || fields.sample(fields.park, x, z) > -2) continue;
      if (ctx.obstacles && ctx.obstacles.overlaps({ cx: x, cz: z, hw: 0.6, hd: 0.6, rot: 0 }, 0)) continue;
      trees.push([x, z, rnd()]);
    }
  }
  // ---- map exits: Metro-works barricade across the whole street a little beyond the exit node (+ collider)
  const sg = ctx.mats.signs, bi = sg.bigIndex['METRO WORK IN PROGRESS'];
  for (const n of nodeList) {
    if (!n.exit || !n.edges.length) continue;
    const { edge, dir } = n.edges[0];
    const p = roads.sample(edge, dir === 1 ? 0.5 : edge.length - 0.5), q = roads.sample(edge, dir === 1 ? 6 : edge.length - 6);
    let dx = p.x - q.x, dz = p.z - q.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L; // outward
    const cx = n.x + dx * 6, cz = n.z + dz * 6, px = -dz, pz = dx, half = edge.width / 2 + STREET.footpath + 8;
    const rot = Math.atan2(dx, dz);
    for (let t = -half; t < half; t += 4) {
      const x = cx + px * (t + 2), z = cz + pz * (t + 2);
      batch.add('facade', PRIM.box, mat(x, 1.6, z, rot, 3.9, 3.2, 0.12), { color: '#e9e4d6', facade: fMetal });
      batch.add('facade', PRIM.box, mat(x, 0.08, z, rot, 4, 0.16, 0.5), { color: '#c9a227', facade: fMetal });
      if (bi !== undefined && Math.abs(t) < half - 4) for (const s2 of [-1, 1]) {
        const fx = -dx * s2, fz = -dz * s2, rx = fz, rz = -fx, w = 3.6, h = 0.9, y = 1.9, ox = x + fx * 0.07, oz = z + fz * 0.07, uvr = sg.bigUV[bi];
        batch.addRaw('signs', [ox - rx * w / 2, y - h / 2, oz - rz * w / 2, ox + rx * w / 2, y - h / 2, oz + rz * w / 2, ox + rx * w / 2, y + h / 2, oz + rz * w / 2, ox - rx * w / 2, y + h / 2, oz - rz * w / 2],
          [fx, 0, fz, fx, 0, fz, fx, 0, fz, fx, 0, fz], [uvr[0], uvr[1], uvr[2], uvr[1], uvr[2], uvr[3], uvr[0], uvr[3]], [0, 1, 2, 0, 2, 3], {});
      }
      if (Math.abs(t) < edge.width / 2) glows.add(x, 3.4, z, '#ff8a2a', 1.2, 1, 1.4);
    }
    collision.addSegment(cx - px * half, cz - pz * half, cx + px * half, cz + pz * half, { tag: 'exit', h: 3.2 }, 0.4);
    // tall blank site hoarding behind for visual closure
    batch.add('facade', PRIM.box, mat(cx + dx * 14, 5, cz + dz * 14, rot, half * 2 + 6, 10, 0.4), { color: '#7d8a7a', facade: [3, 3, 0, 0.5] });
    stats.exits = (stats.exits || 0) + 1;
  }
  buildTrees(game, ctx, trees);
  stats.trees = trees.length;
  for (const [x, z] of trees) collision.addCircle(x, z, 0.45, { tag: 'tree', h: 6 });
  ctx.propStats = stats;
  return stats;
}

function buildTrees(game, ctx, trees) {
  const n = trees.length; if (!n) return;
  const trunkG = new THREE.CylinderGeometry(0.22, 0.38, 1, 6, 1).translate(0, 0.5, 0);
  const canG = new THREE.IcosahedronGeometry(1, 0);
  { // squash + jitter the canopy for a spreading rain-tree look
    const p = canG.attributes.position; const rr = mulberry(7);
    for (let i = 0; i < p.count; i++) { const k = 0.85 + rr() * 0.3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * 0.55 * k, p.getZ(i) * k); }
    canG.computeVertexNormals();
  }
  const tm = new THREE.MeshStandardMaterial({ color: 0x4a3d33, roughness: 1 });
  const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  const trunk = new THREE.InstancedMesh(trunkG, tm, n), can = new THREE.InstancedMesh(canG, cm, n * 2);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  const greens = ['#3f5f2a', '#4c6d2e', '#36552a', '#56703a'];
  trees.forEach(([x, z, r], i) => {
    const h = 4 + r * 3, s = 3.2 + r * 2.4;
    trunk.setMatrixAt(i, mat(x, 0, z, 0, 1 + r * 0.4, h + 1, 1 + r * 0.4));
    can.setMatrixAt(i * 2, mat(x, h + 1.4, z, r * 6, s, s, s));
    can.setMatrixAt(i * 2 + 1, mat(x + (r - 0.5) * 2.5, h + 0.6, z + (0.5 - r) * 2.5, r * 3, s * 0.7, s * 0.8, s * 0.7));
    const gul = r > 0.86; // gulmohar: flame-red canopy
    c.set(gul ? '#b2412a' : greens[Math.floor(r * 97) % greens.length]); can.setColorAt(i * 2, c);
    c.set(gul ? '#7c5a2a' : greens[Math.floor(r * 53) % greens.length]); can.setColorAt(i * 2 + 1, c);
  });
  for (const im of [trunk, can]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); game.scene.add(im); }
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
