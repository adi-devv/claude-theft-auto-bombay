import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLandmarks, landmarkFootprints, LANDMARK_POIS } from '../../src/world/landmarks/index.js';
import { marineDrive, ROADS, MD_HALF_BAND, distToPolyline, defaultSeededFn } from '../../src/world/landmarks/coords.js';
import { merge } from '../../src/utils/geom.js';

const built = buildLandmarks(defaultSeededFn(1337));

function triCount(g) {
  return (g.index ? g.index.count : g.attributes.position.count) / 3;
}

// distance from point to an oriented box (0 if inside)
function distToObb(px, pz, b) {
  const dx = px - b.x, dz = pz - b.z;
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const lx = dx * c - dz * s; // local X axis = (cos, -sin)
  const lz = dx * s + dz * c;
  const ox = Math.max(Math.abs(lx) - b.hw, 0);
  const oz = Math.max(Math.abs(lz) - b.hd, 0);
  return Math.hypot(ox, oz);
}

test('every geometry has position, normal, color and no uv', () => {
  assert.ok(built.geoms.length > 500);
  for (const g of [...built.geoms, ...built.emissive]) {
    assert.ok(g.attributes.position, 'position');
    assert.ok(g.attributes.normal, 'normal');
    assert.ok(g.attributes.color, 'color');
    assert.equal(g.attributes.uv, undefined, 'no uv');
    assert.ok(g.index, 'indexed');
    assert.equal(g.attributes.position.count, g.attributes.color.count);
    for (const v of g.attributes.position.array) assert.ok(Number.isFinite(v));
  }
});

test('geoms and emissive merge() to a non-null geometry', () => {
  const a = buildLandmarks(defaultSeededFn(1));
  const m = merge(a.geoms);
  const e = merge(a.emissive);
  assert.ok(m && m.attributes.position.count > 1000);
  assert.ok(e && e.attributes.position.count > 0);
});

test('colliders are finite oriented boxes', () => {
  assert.ok(built.colliders.length > 100);
  for (const c of built.colliders) {
    for (const k of ['x', 'z', 'hw', 'hd', 'rot']) assert.ok(Number.isFinite(c[k]), k);
    assert.ok(c.hw > 0 && c.hd > 0);
  }
});

test('Gateway arch stays passable between its piers', () => {
  const g = landmarkFootprints().find((f) => f.id === 'gateway');
  assert.ok(g);
  // walk through the arch along its axis (local Z) at local x = 0
  for (let t = -20; t <= 20; t += 1) {
    const px = g.x + t * Math.sin(g.rot);
    const pz = g.z + t * Math.cos(g.rot);
    for (const c of built.colliders) {
      assert.ok(distToObb(px, pz, c) > 0.4 || c.hw < 0.5, `blocked at t=${t}`);
    }
  }
});

test('instanced objects: few, sized, with matrices', () => {
  assert.ok(built.instanced.length <= 6);
  for (const o of built.instanced) {
    assert.ok(o.isInstancedMesh);
    assert.ok(o.count > 0);
  }
  const tet = built.instanced.find((o) => o.name === 'tetrapods');
  assert.ok(tet.count >= 600 && tet.count <= 800, 'tetrapod count ' + tet.count);
});

test('streetlights: setNight drives the bulb emissive intensity', () => {
  const { material, setNight } = built.streetlights;
  setNight(0);
  const day = material.emissiveIntensity;
  setNight(1);
  const night = material.emissiveIntensity;
  assert.ok(night > day * 5);
  setNight(0);
});

test('deterministic given the same rng; footprints independent of rng', () => {
  const a = buildLandmarks(defaultSeededFn(9));
  const b = buildLandmarks(defaultSeededFn(9));
  assert.deepEqual(a.colliders, b.colliders);
  const c = buildLandmarks(defaultSeededFn(10));
  assert.deepEqual(a.footprints, c.footprints);
  assert.deepEqual(landmarkFootprints(), a.footprints);
});

test('footprints keep clear of the Marine Drive road band', () => {
  const md = marineDrive();
  const fps = landmarkFootprints();
  assert.ok(fps.length > 40);
  for (const f of fps) {
    for (const k of ['x', 'z', 'hw', 'hd', 'rot']) assert.ok(Number.isFinite(f[k]));
    if (f.id.startsWith('chowpatty')) continue; // beach sits past the end of the road
    for (let s = 0; s <= md.length; s += 3) {
      const q = md.at(s);
      assert.ok(distToObb(q.x, q.z, f) >= MD_HALF_BAND - 0.01, `${f.id} intrudes at s=${s}`);
    }
  }
});

test('hard footprints keep clear of the other roads (maidans excluded)', () => {
  for (const f of landmarkFootprints()) {
    if (f.id.startsWith('maidan_') || f.id === 'gateway_plaza') continue;
    for (const r of ROADS) {
      if (r.id === 'marine_drive') continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 3);
        for (let k = 0; k <= n; k++) {
          const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
          assert.ok(distToObb(x, z, f) >= r.half - 0.01, `${f.id} overlaps road ${r.id}`);
        }
      }
    }
  }
});

test('art-deco row: ~30 buildings, east of the road, with colliders', () => {
  const ad = landmarkFootprints().filter((f) => f.id.startsWith('artdeco_'));
  assert.ok(ad.length >= 28 && ad.length <= 32);
  const md = marineDrive();
  for (const f of ad) {
    // east of the centreline: landward normal points toward the building
    let best = Infinity, bq = null;
    for (let s = 0; s <= md.length; s += 4) {
      const q = md.at(s);
      const d = Math.hypot(q.x - f.x, q.z - f.z);
      if (d < best) { best = d; bq = q; }
    }
    assert.ok((f.x - bq.x) * bq.ex + (f.z - bq.z) * bq.ez > 0);
  }
});

test('sea wall colliders sit seaward of the road', () => {
  const md = marineDrive();
  const walls = built.colliders.filter((c) => c.hd === 1.5 && c.hw > 3);
  assert.ok(walls.length > 150);
  for (const w of walls) {
    let d = Infinity;
    for (let s = 0; s <= md.length; s += 4) { const q = md.at(s); d = Math.min(d, Math.hypot(q.x - w.x, q.z - w.z)); }
    assert.ok(d > 21 && d < 24.5, 'wall distance ' + d);
  }
  void distToPolyline;
});

test('POIs match the builders and are well formed', () => {
  assert.ok(LANDMARK_POIS.length >= 10);
  for (const p of LANDMARK_POIS) {
    assert.ok(typeof p.id === 'string' && typeof p.name === 'string');
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
    const b = built.pois.find((q) => q.id === p.id);
    assert.ok(b, 'builder poi ' + p.id);
    assert.ok(Math.hypot(b.x - p.x, b.z - p.z) < 1, 'poi drift ' + p.id);
  }
});

test('total triangle count < 120k (static + emissive + instanced)', () => {
  let tris = 0;
  for (const g of [...built.geoms, ...built.emissive]) tris += triCount(g);
  for (const o of built.instanced) tris += triCount(o.geometry) * o.count;
  assert.ok(tris < 120000, 'tris ' + tris);
});
