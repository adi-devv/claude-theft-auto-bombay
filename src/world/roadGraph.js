// Road graph: junction nodes, edges with sampled polylines, lanes (LEFT-hand traffic),
// connectors (junction turn curves), footpaths, nearestLane and routeTo (A*).
// Pure module: no three.js.
import { NODES, ROADS } from './mapData.js';

export const LANE_W = 3.5;
export const MEDIAN_W = 2;
export const FOOT_W = 3;
const CELL = 32;

const hyp = Math.hypot;

// --- sampling ---------------------------------------------------------------
function sampleRoad(road, nodes, spacing) {
  const P = road.pts.map((id) => {
    const n = nodes[id];
    if (!n) throw new Error(`mapData: unknown node ${id} in road ${road.id}`);
    return n;
  });
  const k = P.length - 1;
  const closed = road.pts[0] === road.pts[k];
  const tan = [];
  for (let i = 0; i <= k; i++) {
    let prev = i > 0 ? P[i - 1] : closed ? P[k - 1] : null;
    let next = i < k ? P[i + 1] : closed ? P[1] : null;
    if (closed && i === k) {
      prev = P[k - 1];
      next = P[1];
    }
    const a = prev || P[i];
    const b = next || P[i];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const l = hyp(dx, dz) || 1;
    tan.push([dx / l, dz / l]);
  }
  const px = [];
  const pz = [];
  const nodeIdx = [];
  for (let i = 0; i < k; i++) {
    const p0 = P[i];
    const p1 = P[i + 1];
    const L = hyp(p1[0] - p0[0], p1[1] - p0[1]);
    const n = Math.max(2, Math.ceil(L / spacing));
    const m0x = tan[i][0] * L;
    const m0z = tan[i][1] * L;
    const m1x = tan[i + 1][0] * L;
    const m1z = tan[i + 1][1] * L;
    nodeIdx[i] = px.length;
    for (let j = 0; j < n; j++) {
      const t = j / n;
      if (road.smooth) {
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;
        px.push(h00 * p0[0] + h10 * m0x + h01 * p1[0] + h11 * m1x);
        pz.push(h00 * p0[1] + h10 * m0z + h01 * p1[1] + h11 * m1z);
      } else {
        px.push(p0[0] + (p1[0] - p0[0]) * t);
        pz.push(p0[1] + (p1[1] - p0[1]) * t);
      }
    }
  }
  nodeIdx[k] = px.length;
  px.push(P[k][0]);
  pz.push(P[k][1]);
  return { px, pz, nodeIdx, closed };
}

function finishEdge(e) {
  const n = e.px.length;
  e.cum = new Array(n);
  e.cum[0] = 0;
  for (let i = 1; i < n; i++) e.cum[i] = e.cum[i - 1] + hyp(e.px[i] - e.px[i - 1], e.pz[i] - e.pz[i - 1]);
  e.len = e.cum[n - 1];
  e.tx = new Array(n);
  e.tz = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dx = e.px[b] - e.px[a];
    const dz = e.pz[b] - e.pz[a];
    const l = hyp(dx, dz) || 1;
    e.tx[i] = dx / l;
    e.tz[i] = dz / l;
  }
}

// --- graph ------------------------------------------------------------------
export function buildGraph(data = { NODES, ROADS }, opts = {}) {
  const spacing = opts.spacing ?? 4;
  const nodesData = data.NODES;
  const roadsData = data.ROADS;

  const g = {
    nodes: new Map(),
    edges: [],
    edgeById: new Map(),
    lanes: new Map(),
    connectors: [],
    footpaths: [],
    roads: new Map(),
    junctions: [],
  };

  // node bookkeeping
  const info = new Map();
  const touch = (id) => {
    if (!info.has(id)) info.set(id, { deg: 0, roads: new Set() });
    return info.get(id);
  };
  const sampled = [];
  for (const road of roadsData) {
    const s = sampleRoad(road, nodesData, spacing);
    sampled.push(s);
    g.roads.set(road.id, { def: road, px: s.px, pz: s.pz });
    const k = road.pts.length - 1;
    road.pts.forEach((id, i) => {
      const inf = touch(id);
      inf.roads.add(road.id);
      inf.deg += i === 0 || i === k ? 1 : 2;
    });
  }
  for (const [id, inf] of info) {
    const [x, z] = nodesData[id];
    g.nodes.set(id, {
      id, x, z,
      junction: inf.deg !== 2 || inf.roads.size > 1,
      deg: inf.deg,
      edges: [],
      clear: 0,
      ring: false,
    });
  }

  // edges
  let eid = 0;
  roadsData.forEach((road, ri) => {
    const s = sampled[ri];
    const cuts = [];
    road.pts.forEach((id, i) => {
      if (i === 0 || i === road.pts.length - 1 || g.nodes.get(id).junction) cuts.push(i);
    });
    for (let c = 0; c < cuts.length - 1; c++) {
      const i0 = s.nodeIdx[cuts[c]];
      const i1 = s.nodeIdx[cuts[c + 1]];
      const e = {
        id: `e${eid++}`,
        roadId: road.id,
        name: road.name,
        a: road.pts[cuts[c]],
        b: road.pts[cuts[c + 1]],
        px: s.px.slice(i0, i1 + 1),
        pz: s.pz.slice(i0, i1 + 1),
        lanes: road.lanes,
        width: road.width,
        limit: road.limit,
        median: !!road.median,
        oneway: !!road.oneway,
        seaSide: road.seaSide || 0,
        trimA: 0,
        trimB: 0,
      };
      finishEdge(e);
      g.edges.push(e);
      g.edgeById.set(e.id, e);
      g.nodes.get(e.a).edges.push({ edge: e, end: 'a' });
      g.nodes.get(e.b).edges.push({ edge: e, end: 'b' });
      if (road.oneway) {
        g.nodes.get(e.a).ring = true;
        g.nodes.get(e.b).ring = true;
      }
    }
  });
  g.junctions = [...g.nodes.values()].filter((n) => n.junction);

  // clearances & trims
  for (const n of g.nodes.values()) {
    for (const { edge } of n.edges) n.clear = Math.max(n.clear, edge.width / 2);
  }
  for (const e of g.edges) {
    const ca = g.nodes.get(e.a);
    const cb = g.nodes.get(e.b);
    const base = (n) => (n.junction ? n.clear + (n.deg === 1 ? 1 : 2.5) : 0);
    e.trimA = Math.min(base(ca), e.len * 0.35);
    e.trimB = Math.min(base(cb), e.len * 0.35);
  }

  // lanes
  for (const e of g.edges) {
    for (const dir of e.oneway ? [1] : [1, -1]) {
      for (let idx = 0; idx < e.lanes; idx++) {
        const lane = {
          id: `${e.id}:${dir}:${idx}`,
          edge: e, dir, idx,
          from: dir > 0 ? e.a : e.b,
          to: dir > 0 ? e.b : e.a,
          sStart: dir > 0 ? e.trimA : e.trimB,
          sEnd: e.len - (dir > 0 ? e.trimB : e.trimA),
          len: e.len,
          outgoing: [],
          incoming: [],
        };
        g.lanes.set(lane.id, lane);
      }
    }
  }

  // ---- geometry queries ----
  const tmp = {};
  function edgeIndex(e, u) {
    // largest i with cum[i] <= u
    let lo = 0;
    let hi = e.cum.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (e.cum[mid] <= u) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  /** Centre point and tangent at arc position u along the edge (+1 direction). */
  function edgePoint(e, u, out = {}) {
    u = u < 0 ? 0 : u > e.len ? e.len : u;
    const i = edgeIndex(e, u);
    const seg = e.cum[i + 1] - e.cum[i] || 1;
    const t = (u - e.cum[i]) / seg;
    out.x = e.px[i] + (e.px[i + 1] - e.px[i]) * t;
    out.z = e.pz[i] + (e.pz[i + 1] - e.pz[i]) * t;
    let tx = e.tx[i] + (e.tx[i + 1] - e.tx[i]) * t;
    let tz = e.tz[i] + (e.tz[i + 1] - e.tz[i]) * t;
    const l = hyp(tx, tz) || 1;
    out.tx = tx / l;
    out.tz = tz / l;
    return out;
  }
  /** Signed offset of lane centre to the LEFT of travel direction. */
  function laneOffset(e, idx) {
    if (e.oneway) return LANE_W * (idx - (e.lanes - 1) / 2);
    return (e.median ? MEDIAN_W / 2 : 0) + LANE_W * (idx + 0.5);
  }
  /** Lane-centre position/heading at travel distance s (LEFT-hand traffic). */
  function lanePoint(lane, s, out = {}) {
    const e = lane.edge;
    const u = lane.dir > 0 ? s : e.len - s;
    edgePoint(e, u, out);
    const tx = out.tx * lane.dir;
    const tz = out.tz * lane.dir;
    const off = laneOffset(e, lane.idx);
    // left of travel = (tz, -tx)
    out.x += tz * off;
    out.z += -tx * off;
    out.tx = tx;
    out.tz = tz;
    out.h = Math.atan2(tx, tz);
    return out;
  }

  // ---- connectors ----
  const connLists = new Map();
  let cid = 0;
  function makeConnector(node, inL, outL) {
    const P0 = lanePoint(inL, inL.sEnd, {});
    const P2 = lanePoint(outL, outL.sStart, {});
    const t0 = { x: P0.tx, z: P0.tz };
    const t2 = { x: P2.tx, z: P2.tz };
    const dot = t0.x * t2.x + t0.z * t2.z;
    const lx = t0.z;
    const lz = -t0.x;
    const side = lx * t2.x + lz * t2.z;
    let turn = side > 0.5 ? 'left' : side < -0.5 ? 'right' : 'straight';
    const Dx = P2.x - P0.x;
    const Dz = P2.z - P0.z;
    const Dl = hyp(Dx, Dz);
    let cx;
    let cz;
    if (dot < -0.7) {
      turn = 'uturn';
      cx = (P0.x + P2.x) / 2 + t0.x * (1.3 * Dl + 4);
      cz = (P0.z + P2.z) / 2 + t0.z * (1.3 * Dl + 4);
    } else {
      const det = t0.x * t2.z - t0.z * t2.x;
      let ok = false;
      if (Math.abs(det) > 0.15) {
        const a = (Dx * t2.z - Dz * t2.x) / det;
        const b = (t0.x * Dz - t0.z * Dx) / det;
        if (a > 0.1 && b > 0.1 && a < 60 && b < 60) {
          cx = P0.x + t0.x * a;
          cz = P0.z + t0.z * a;
          ok = true;
        }
      }
      if (!ok) {
        cx = (P0.x + P2.x) / 2;
        cz = (P0.z + P2.z) / 2;
      }
    }
    const n = Math.max(4, Math.ceil((Dl * 1.2) / 2));
    const px = [];
    const pz = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      px.push(u * u * P0.x + 2 * u * t * cx + t * t * P2.x);
      pz.push(u * u * P0.z + 2 * u * t * cz + t * t * P2.z);
    }
    const c = {
      id: `c${cid++}`, node: node.id, from: inL.id, to: outL.id, fromLane: inL, toLane: outL, turn,
      px, pz, cum: [0], len: 0, th: [],
    };
    for (let i = 1; i <= n; i++) c.cum.push(c.cum[i - 1] + hyp(px[i] - px[i - 1], pz[i] - pz[i - 1]));
    c.len = c.cum[n];
    return c;
  }
  for (const node of g.junctions) {
    const ins = [];
    const outs = [];
    for (const l of g.lanes.values()) {
      if (l.to === node.id) ins.push(l);
      if (l.from === node.id) outs.push(l);
    }
    const deadEnd = node.edges.length === 1;
    for (const inL of ins) {
      for (const outL of outs) {
        if (outL.edge === inL.edge && outL.dir === -inL.dir) {
          // reverse of same edge: only at dead ends (same idx mirrors across the centreline)
          if (!deadEnd || outL.idx !== inL.idx) continue;
        } else if (outL.edge === inL.edge) continue;
        // choose the target lane per turn type: filter after classifying
        const c = makeConnector(node, inL, outL);
        const outLanes = outL.edge.lanes;
        const want =
          c.turn === 'left' ? outLanes - 1 : c.turn === 'right' ? 0 : c.turn === 'uturn' ? inL.idx : Math.min(inL.idx, outLanes - 1);
        if (outL.idx !== Math.min(want, outLanes - 1)) continue;
        g.connectors.push(c);
        inL.outgoing.push(c);
        outL.incoming.push(c);
        if (!connLists.has(node.id)) connLists.set(node.id, []);
        connLists.get(node.id).push(c);
      }
    }
    node.connectors = connLists.get(node.id) || [];
  }
  /** Position/heading at distance d along a connector. */
  g.connectorPoint = (c, d, out = {}) => {
    d = d < 0 ? 0 : d > c.len ? c.len : d;
    let i = 0;
    while (i < c.cum.length - 2 && c.cum[i + 1] < d) i++;
    const seg = c.cum[i + 1] - c.cum[i] || 1;
    const t = (d - c.cum[i]) / seg;
    out.x = c.px[i] + (c.px[i + 1] - c.px[i]) * t;
    out.z = c.pz[i] + (c.pz[i + 1] - c.pz[i]) * t;
    const dx = c.px[i + 1] - c.px[i];
    const dz = c.pz[i + 1] - c.pz[i];
    out.h = Math.atan2(dx, dz);
    out.tx = dx / (hyp(dx, dz) || 1);
    out.tz = dz / (hyp(dx, dz) || 1);
    return out;
  };

  // ---- spatial hash of edge segments ----
  const segGrid = new Map();
  const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  for (const e of g.edges) {
    for (let i = 0; i < e.px.length - 1; i++) {
      const x0 = Math.min(e.px[i], e.px[i + 1]);
      const x1 = Math.max(e.px[i], e.px[i + 1]);
      const z0 = Math.min(e.pz[i], e.pz[i + 1]);
      const z1 = Math.max(e.pz[i], e.pz[i + 1]);
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
          const k = key(cx, cz);
          let l = segGrid.get(k);
          if (!l) segGrid.set(k, (l = []));
          l.push(e, i);
        }
      }
    }
  }
  function projectSeg(e, i, x, z, o) {
    const ax = e.px[i];
    const az = e.pz[i];
    const dx = e.px[i + 1] - ax;
    const dz = e.pz[i + 1] - az;
    const l2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    o.qx = ax + dx * t;
    o.qz = az + dz * t;
    o.t = t;
    o.d = hyp(x - o.qx, z - o.qz);
    return o;
  }
  /** Nearest road centreline point. {edge,i,u,x,z,dist,tx,tz} or null. */
  function nearestEdge(x, z, maxDist = 80) {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let best = null;
    const o = {};
    const maxR = Math.ceil(maxDist / CELL) + 1;
    for (let r = 0; r <= maxR; r++) {
      for (let ix = cx - r; ix <= cx + r; ix++) {
        for (let iz = cz - r; iz <= cz + r; iz++) {
          if (Math.max(Math.abs(ix - cx), Math.abs(iz - cz)) !== r) continue;
          const l = segGrid.get(key(ix, iz));
          if (!l) continue;
          for (let q = 0; q < l.length; q += 2) {
            const e = l[q];
            const i = l[q + 1];
            projectSeg(e, i, x, z, o);
            if (!best || o.d < best.dist) {
              best = { edge: e, i, dist: o.d, qx: o.qx, qz: o.qz, t: o.t };
            }
          }
        }
      }
      if (best && best.dist <= r * CELL) break;
    }
    if (!best || best.dist > maxDist) return null;
    const e = best.edge;
    best.u = e.cum[best.i] + (e.cum[best.i + 1] - e.cum[best.i]) * best.t;
    best.tx = e.tx[best.i];
    best.tz = e.tz[best.i];
    return best;
  }
  /** Min over nearby segments of (distance - half width). Negative = on a road. */
  function roadClearance(x, z, maxR = 60) {
    let best = Infinity;
    const o = {};
    const c0x = Math.floor((x - maxR) / CELL);
    const c1x = Math.floor((x + maxR) / CELL);
    const c0z = Math.floor((z - maxR) / CELL);
    const c1z = Math.floor((z + maxR) / CELL);
    for (let ix = c0x; ix <= c1x; ix++) {
      for (let iz = c0z; iz <= c1z; iz++) {
        const l = segGrid.get(key(ix, iz));
        if (!l) continue;
        for (let q = 0; q < l.length; q += 2) {
          const e = l[q];
          projectSeg(e, l[q + 1], x, z, o);
          const c = o.d - e.width / 2;
          if (c < best) best = c;
        }
      }
    }
    return best;
  }
  /** Nearest lane to a point. opts.heading picks the travel direction. */
  function nearestLane(x, z, opts = {}) {
    const ne = nearestEdge(x, z, opts.maxDist ?? 80);
    if (!ne) return null;
    const e = ne.edge;
    // offset to the left of the +1 tangent
    const lx = ne.tz;
    const lz = -ne.tx;
    const o = (x - ne.qx) * lx + (z - ne.qz) * lz;
    let dir = o >= 0 ? 1 : -1;
    if (opts.heading !== undefined) {
      const d = Math.sin(opts.heading) * ne.tx + Math.cos(opts.heading) * ne.tz;
      dir = d >= 0 ? 1 : -1;
    }
    if (e.oneway) dir = 1;
    const off = o * dir; // to the left of travel
    let idx;
    if (e.oneway) idx = Math.round(off / LANE_W + (e.lanes - 1) / 2);
    else idx = Math.floor((off - (e.median ? MEDIAN_W / 2 : 0)) / LANE_W);
    idx = idx < 0 ? 0 : idx > e.lanes - 1 ? e.lanes - 1 : idx;
    const lane = g.lanes.get(`${e.id}:${dir}:${idx}`);
    const s = dir > 0 ? ne.u : e.len - ne.u;
    return {
      lane, edge: e, dir, idx, s, dist: Math.abs(off - laneOffset(e, idx)),
      lateral: off, x: ne.qx, z: ne.qz, centreDist: ne.dist,
    };
  }

  // ---- routing ----
  const adj = new Map();
  for (const n of g.nodes.keys()) adj.set(n, []);
  for (const e of g.edges) {
    adj.get(e.a).push({ to: e.b, edge: e, dir: 1 });
    if (!e.oneway) adj.get(e.b).push({ to: e.a, edge: e, dir: -1 });
  }
  /** A* route between two world points over the road centrelines. */
  function routeTo(from, to) {
    const s = nearestEdge(from.x, from.z, 200);
    const t = nearestEdge(to.x, to.z, 200);
    if (!s || !t) return null;
    const open = new Map(); // node -> {g, f, prev}
    const closed = new Set();
    const prev = new Map();
    const gScore = new Map();
    const hx = (id) => hyp(g.nodes.get(id).x - to.x, g.nodes.get(id).z - to.z);
    const startSeeds = [{ node: s.edge.b, cost: s.edge.len - s.u, via: { edge: s.edge, dir: 1, from: s.u, to: s.edge.len } }];
    if (!s.edge.oneway) startSeeds.push({ node: s.edge.a, cost: s.u, via: { edge: s.edge, dir: -1, from: s.u, to: 0 } });
    for (const sd of startSeeds) {
      gScore.set(sd.node, sd.cost);
      prev.set(sd.node, { seg: sd.via, node: null });
      open.set(sd.node, sd.cost + hx(sd.node));
    }
    // same-edge shortcut
    let best = null;
    if (s.edge === t.edge && (!s.edge.oneway || t.u >= s.u)) {
      best = { cost: Math.abs(t.u - s.u), direct: true };
    }
    const endCost = (node) => {
      const out = [];
      if (node === t.edge.a) out.push({ cost: t.u, seg: { edge: t.edge, dir: 1, from: 0, to: t.u } });
      if (node === t.edge.b && !t.edge.oneway) out.push({ cost: t.edge.len - t.u, seg: { edge: t.edge, dir: -1, from: t.edge.len, to: t.u } });
      return out;
    };
    let goal = null;
    while (open.size) {
      let cur = null;
      let cf = Infinity;
      for (const [n, f] of open) if (f < cf) { cf = f; cur = n; }
      if (best && cf >= best.cost) break;
      open.delete(cur);
      closed.add(cur);
      for (const ec of endCost(cur)) {
        const total = gScore.get(cur) + ec.cost;
        if (!best || total < best.cost) {
          best = { cost: total, node: cur, endSeg: ec.seg };
          goal = cur;
        }
      }
      for (const a of adj.get(cur)) {
        if (closed.has(a.to)) continue;
        const ng = gScore.get(cur) + a.edge.len;
        if (ng < (gScore.get(a.to) ?? Infinity)) {
          gScore.set(a.to, ng);
          prev.set(a.to, { seg: { edge: a.edge, dir: a.dir, from: a.dir > 0 ? 0 : a.edge.len, to: a.dir > 0 ? a.edge.len : 0 }, node: cur });
          open.set(a.to, ng + hx(a.to));
        }
      }
    }
    if (!best) return null;
    const segs = [];
    if (best.direct) {
      segs.push({ edge: s.edge, dir: t.u >= s.u ? 1 : -1, from: s.u, to: t.u });
    } else {
      segs.push(best.endSeg);
      let n = goal;
      while (n) {
        const p = prev.get(n);
        segs.push(p.seg);
        n = p.node;
      }
      segs.reverse();
    }
    const pts = [];
    for (const sg of segs) {
      const e = sg.edge;
      const lo = Math.min(sg.from, sg.to);
      const hi = Math.max(sg.from, sg.to);
      const seq = [];
      const p0 = edgePoint(e, lo, {});
      seq.push({ x: p0.x, z: p0.z });
      for (let i = 0; i < e.px.length; i++) if (e.cum[i] > lo + 0.01 && e.cum[i] < hi - 0.01) seq.push({ x: e.px[i], z: e.pz[i] });
      const p1 = edgePoint(e, hi, {});
      seq.push({ x: p1.x, z: p1.z });
      if (sg.from > sg.to) seq.reverse();
      for (const p of seq) pts.push(p);
    }
    return { dist: best.cost, edges: segs.map((q) => ({ edge: q.edge, dir: q.dir })), pts };
  }

  // ---- footpaths ----
  function endDir(e, end) {
    // unit direction pointing OUT of the node along the edge
    if (end === 'a') return { x: e.tx[0], z: e.tz[0] };
    const n = e.tx.length - 1;
    return { x: -e.tx[n], z: -e.tz[n] };
  }
  function footTrim(e, end, side) {
    const node = g.nodes.get(end === 'a' ? e.a : e.b);
    if (!node.junction) return 0;
    const out = endDir(e, end);
    const t = { x: -out.x, z: -out.z }; // into node
    const lx = t.z;
    const lz = -t.x;
    let trim = 0;
    for (const o of node.edges) {
      if (o.edge === e && o.end === end) continue;
      const d = endDir(o.edge, o.end);
      const sd = (d.x * lx + d.z * lz) * side;
      if (sd > 0.25) {
        trim = Math.max(trim, Math.min(16, (o.edge.width / 2 + 1.2) / Math.max(0.5, Math.abs(sd))));
      }
    }
    return trim;
  }
  for (const e of g.edges) {
    if (e.oneway) continue;
    for (const side of [1, -1]) {
      const s0 = footTrim(e, 'a', side);
      const s1 = e.len - footTrim(e, 'b', side);
      if (s1 - s0 < 3) continue;
      const promenade = e.seaSide === side;
      const w = e.width / 2;
      const outer = promenade ? 22 : w + FOOT_W;
      const mid = (w + outer) / 2;
      const pts = [];
      const nseg = Math.max(1, Math.ceil((s1 - s0) / 6));
      for (let i = 0; i <= nseg; i++) {
        const p = edgePoint(e, s0 + ((s1 - s0) * i) / nseg, {});
        pts.push({ x: p.x + p.tz * mid * side, z: p.z - p.tx * mid * side });
      }
      g.footpaths.push({ edgeId: e.id, edge: e, side, s0, s1, inner: w, outer, mid, promenade, pts });
    }
  }

  g.edgePoint = edgePoint;
  g.laneOffset = laneOffset;
  g.lanePoint = lanePoint;
  g.nearestEdge = nearestEdge;
  g.nearestLane = nearestLane;
  g.roadClearance = roadClearance;
  g.routeTo = routeTo;
  g.footTrim = footTrim;
  return g;
}

let _default = null;
/** Shared graph built from mapData (cached). */
export function getGraph() {
  if (!_default) _default = buildGraph();
  return _default;
}
