import test from 'node:test';
import assert from 'node:assert/strict';
import { getGraph } from '../../src/world/roadGraph.js';
import { NODES, ROADS, JUNCTIONS, MARINE_DRIVE_PTS, LANDMARKS, POIS } from '../../src/world/mapData.js';
import { polyArea } from '../../src/utils/math.js';

const g = getGraph();

test('mapData exports contract names', () => {
  assert.ok(Array.isArray(MARINE_DRIVE_PTS) && MARINE_DRIVE_PTS.length >= 10);
  assert.ok(JUNCTIONS.J_CSMT && JUNCTIONS.J_REGAL && JUNCTIONS.J_NP);
  assert.ok(LANDMARKS.length > 5 && ROADS.length > 10);
  for (const p of MARINE_DRIVE_PTS) assert.ok(NODES[ROADS[0].pts.find((id) => NODES[id][0] === p[0] && NODES[id][1] === p[1])]);
});

test('no orphan nodes: every node is used by an edge and every edge has valid endpoints', () => {
  for (const [id, n] of g.nodes) if (n.junction) assert.ok(n.edges.length >= 1, `orphan junction ${id}`);
  for (const id of Object.keys(NODES)) {
    const used = ROADS.some((r) => r.pts.includes(id));
    assert.ok(used, `unused node ${id} in mapData`);
  }
  for (const e of g.edges) {
    assert.ok(g.nodes.has(e.a) && g.nodes.has(e.b));
    assert.ok(e.len > 5, `edge ${e.id} too short`);
    assert.ok(e.len > e.trimA + e.trimB + 2, `edge ${e.id} trims eat the whole edge`);
  }
});

test('every incoming lane at every junction has at least one outgoing connector', () => {
  for (const n of g.junctions) {
    for (const l of g.lanes.values()) {
      if (l.to !== n.id) continue;
      assert.ok(l.outgoing.length >= 1, `lane ${l.id} into ${n.id} has no connector`);
      for (const c of l.outgoing) {
        assert.equal(c.fromLane, l);
        assert.ok(c.len > 1);
      }
    }
  }
});

test('connectors start/end on their lanes (continuity)', () => {
  const p = {};
  for (const c of g.connectors) {
    g.lanePoint(c.fromLane, c.fromLane.sEnd, p);
    assert.ok(Math.hypot(c.px[0] - p.x, c.pz[0] - p.z) < 1e-6);
    g.lanePoint(c.toLane, c.toLane.sStart, p);
    const n = c.px.length - 1;
    assert.ok(Math.hypot(c.px[n] - p.x, c.pz[n] - p.z) < 1e-6);
  }
});

test('same-edge U-turn connectors only at dead ends', () => {
  for (const c of g.connectors) {
    if (c.turn === 'uturn' && c.fromLane.edge === c.toLane.edge) assert.equal(g.nodes.get(c.node).edges.length, 1, `uturn at non-dead-end ${c.node}`);
  }
});

test('roads only meet at shared nodes (no unintended crossings)', () => {
  const segs = [];
  for (const e of g.edges) for (let i = 0; i < e.px.length - 1; i++) segs.push([e, e.px[i], e.pz[i], e.px[i + 1], e.pz[i + 1]]);
  const cross = (ax, az, bx, bz, cx, cz, dx, dz) => {
    const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    const d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
    const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
    const d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  const bad = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i];
      const b = segs[j];
      if (a[0] === b[0]) continue;
      if (Math.max(a[1], a[3]) < Math.min(b[1], b[3]) || Math.max(b[1], b[3]) < Math.min(a[1], a[3])) continue;
      if (Math.max(a[2], a[4]) < Math.min(b[2], b[4]) || Math.max(b[2], b[4]) < Math.min(a[2], a[4])) continue;
      if (cross(a[1], a[2], a[3], a[4], b[1], b[2], b[3], b[4])) bad.push(`${a[0].roadId}x${b[0].roadId}`);
    }
  }
  assert.deepEqual([...new Set(bad)], []);
});

test('routing: Churchgate stand reaches Gateway, CSMT, hospital, police station, garage', () => {
  const from = POIS.SPAWN;
  for (const to of [POIS.HOSP, POIS.COPS, POIS.GARAGE, { x: 620, z: 640 }, { x: 600, z: -820 }, { x: -780, z: -900 }, { x: -250, z: 915 }]) {
    const r = g.routeTo(from, to);
    assert.ok(r && r.dist > 50, `no route to ${JSON.stringify(to)}`);
    assert.ok(r.pts.length >= 2);
  }
});

test('Regal Circle is one-way and runs clockwise', () => {
  const ring = g.edges.filter((e) => e.roadId === 'regal_circle');
  assert.ok(ring.length >= 4);
  const pts = [];
  for (const e of ring) assert.equal(e.oneway, true);
  // order the ring edges by following lane travel
  let cur = ring[0];
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    for (let i = 0; i < cur.px.length - 1; i++) pts.push({ x: cur.px[i], z: cur.pz[i] });
    cur = ring.find((e) => e.a === cur.b);
  }
  assert.equal(seen.size, ring.length, 'ring edges form one loop in travel direction');
  // shoelace in (x,z): positive == clockwise seen from above with north (-z) up
  assert.ok(polyArea(pts) > 0, 'ring must be clockwise');
  // no reverse lanes exist
  for (const e of ring) assert.ok(!g.lanes.has(`${e.id}:-1:0`));
  // angular check: angle around the centre (north-up) increases
  const c = JUNCTIONS.J_REGAL;
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const a0 = Math.atan2(a.x - c.x, -(a.z - c.z));
    const a1 = Math.atan2(b.x - c.x, -(b.z - c.z));
    let d = a1 - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += d;
  }
  assert.ok(total > 6, `net rotation should be +2pi (clockwise), got ${total}`);
});
