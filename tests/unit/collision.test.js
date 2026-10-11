import test from 'node:test';
import assert from 'node:assert/strict';
import { circleVsObb, circleVsCircle, segmentVsObb, obbOverlap, resolveCircle, segmentHit } from '../../src/physics/collision.js';
import { SpatialGrid } from '../../src/physics/spatialGrid.js';

const box = (x, z, hw, hd, rot = 0) => ({ x, z, hw, hd, rot });

test('circle vs box: push out along +x', () => {
  const r = circleVsObb(6, 0, 1.5, box(0, 0, 5, 2));
  assert.ok(r);
  assert.ok(Math.abs(r.pen - 0.5) < 1e-9);
  assert.ok(r.nx > 0.99 && Math.abs(r.nz) < 1e-9);
});

test('circle vs box: no hit when apart', () => {
  assert.equal(circleVsObb(10, 0, 1, box(0, 0, 5, 2)), null);
});

test('circle vs rotated box (rot=90deg: local X axis points to -Z)', () => {
  const o = box(0, 0, 5, 2, Math.PI / 2); // long axis along world Z
  assert.equal(circleVsObb(4, 0, 1, o), null); // would hit an unrotated box, but box is now narrow in x
  const r = circleVsObb(2.5, 0, 1, o);
  assert.ok(r && Math.abs(r.pen - 0.5) < 1e-9 && r.nx > 0.99);
  const r2 = circleVsObb(0, -5.5, 1, o); // beyond the end along -Z
  assert.ok(r2 && Math.abs(r2.pen - 0.5) < 1e-9 && r2.nz < -0.99);
});

test('circle vs 45 degree box corner push direction', () => {
  const o = box(0, 0, 2, 2, Math.PI / 4);
  const r = circleVsObb(3.0, 0, 0.5, o); // box corner tip at x = 2.828
  assert.ok(r && r.pen > 0);
  assert.ok(r.nx > 0.9);
});

test('circle centre inside box is pushed out through the nearest face', () => {
  const r = circleVsObb(4.5, 0.2, 0.4, box(0, 0, 5, 2));
  assert.ok(r && r.nx > 0.99);
  assert.ok(Math.abs(r.pen - 0.9) < 1e-9);
});

test('circle vs circle', () => {
  const r = circleVsCircle(1, 0, 1, 0, 0, 1);
  assert.ok(r && Math.abs(r.pen - 1) < 1e-9 && r.nx === 1);
  assert.equal(circleVsCircle(3, 0, 1, 0, 0, 1), null);
});

test('resolveCircle through the spatial grid leaves the circle outside every box', () => {
  const grid = new SpatialGrid(16);
  grid.insertAll([box(0, 0, 5, 5), box(10, 0, 3, 3, 0.4), { x: 20, z: 20, r: 2 }]);
  const pos = { x: 4.5, z: 1 };
  const res = resolveCircle(grid, pos, 0.4);
  assert.ok(res.hit);
  assert.equal(circleVsObb(pos.x, pos.z, 0.4, box(0, 0, 5, 5)), null);
  const p2 = { x: 20.5, z: 20 };
  assert.ok(resolveCircle(grid, p2, 0.4).hit);
  assert.ok(Math.hypot(p2.x - 20, p2.z - 20) >= 2.4 - 1e-6);
});

test('segment vs box and segmentHit via grid', () => {
  const o = box(0, 0, 2, 2);
  const t = segmentVsObb(-10, 0, 10, 0, o);
  assert.ok(Math.abs(t - 0.4) < 1e-9);
  assert.equal(segmentVsObb(-10, 5, 10, 5, o), -1);
  const grid = new SpatialGrid();
  grid.insert(box(0, 0, 2, 2));
  assert.ok(segmentHit(grid, -10, 0, 10, 0) > 0);
  assert.equal(segmentHit(grid, -10, 9, 10, 9), -1);
});

test('obb overlap (SAT)', () => {
  assert.ok(obbOverlap(box(0, 0, 2, 2), box(3, 0, 2, 2)));
  assert.ok(!obbOverlap(box(0, 0, 2, 2), box(5, 0, 2, 2)));
  assert.ok(!obbOverlap(box(0, 0, 2, 2, Math.PI / 4), box(3, 3, 1, 1)));
});
