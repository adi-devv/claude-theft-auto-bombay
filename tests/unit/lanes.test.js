import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, LANE_W, MEDIAN_W } from '../../src/world/roadGraph.js';
import { fwd, left } from '../../src/utils/math.js';

function straight(ax, az, bx, bz, extra = {}) {
  const NODES = { A: [ax, az], B: [bx, bz] };
  const ROADS = [{ id: 'r', name: 'r', pts: ['A', 'B'], lanes: 2, width: 14, limit: 14, ...extra }];
  return buildGraph({ NODES, ROADS });
}

function lanePos(g, dir, idx) {
  const e = g.edges[0];
  const lane = g.lanes.get(`${e.id}:${dir}:${idx}`);
  return g.lanePoint(lane, e.len / 2, {});
}

test('left-hand traffic: heading north the lane centre is at smaller x', () => {
  const g = straight(0, 100, 0, -100); // travelling north (-Z)
  const p = lanePos(g, 1, 0);
  assert.ok(Math.abs(p.z) < 1e-6);
  assert.ok(p.x < 0, `north-bound lane must be west (x<0), got ${p.x}`);
  assert.ok(Math.abs(p.x + LANE_W / 2) < 1e-6);
  assert.ok(Math.abs(p.h - Math.PI) < 1e-6 || Math.abs(p.h + Math.PI) < 1e-6);
});

test('left-hand traffic: heading south the lane centre is at larger x', () => {
  const g = straight(0, -100, 0, 100);
  const p = lanePos(g, 1, 0);
  assert.ok(p.x > 0);
});

test('left-hand traffic: heading east the lane centre is at smaller z (north side)', () => {
  const g = straight(-100, 0, 100, 0);
  const p = lanePos(g, 1, 0);
  assert.ok(p.z < 0);
});

test('left-hand traffic: heading west the lane centre is at larger z (south side)', () => {
  const g = straight(100, 0, -100, 0);
  const p = lanePos(g, 1, 0);
  assert.ok(p.z > 0);
});

test('opposite direction lanes sit on opposite sides; outer lane index is further from centre', () => {
  const g = straight(0, 100, 0, -100);
  const fwdL = lanePos(g, 1, 0);
  const backL = lanePos(g, -1, 0);
  assert.ok(fwdL.x < 0 && backL.x > 0);
  assert.ok(lanePos(g, 1, 1).x < fwdL.x);
  assert.ok(Math.abs(lanePos(g, 1, 1).x + 1.5 * LANE_W) < 1e-6);
});

test('median pushes lanes outwards', () => {
  const g = straight(0, 100, 0, -100, { median: true });
  assert.ok(Math.abs(lanePos(g, 1, 0).x + (MEDIAN_W / 2 + LANE_W / 2)) < 1e-6);
});

test('utils/math left()/fwd() agree with lane convention in all 4 compass directions', () => {
  // heading h: forward (sin h, cos h); left (cos h, -sin h)
  const north = fwd(Math.PI); // (0,-1)
  const nl = left(Math.PI);
  assert.ok(Math.abs(north.z + 1) < 1e-9 && nl.x < 0);
  const east = fwd(Math.PI / 2);
  const el = left(Math.PI / 2);
  assert.ok(east.x > 0.99 && el.z < 0);
  const south = fwd(0);
  const sl = left(0);
  assert.ok(south.z > 0.99 && sl.x > 0);
  const west = fwd(-Math.PI / 2);
  const wl = left(-Math.PI / 2);
  assert.ok(west.x < -0.99 && wl.z > 0);
});

test('nearestLane picks the left-hand lane for a given heading', () => {
  const g = straight(0, 100, 0, -100);
  const n = g.nearestLane(-1.75, 0, { heading: Math.PI }); // facing north, standing west
  assert.equal(n.dir, 1);
  assert.equal(n.idx, 0);
  assert.ok(n.dist < 1e-6);
  const s = g.nearestLane(1.75, 0, { heading: 0 }); // facing south, standing east
  assert.equal(s.dir, -1);
});
