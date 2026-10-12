// Road network graph built from mapdata.js. Shared by city, traffic, peds, police, player, HUD.
// Conventions (see CONTRACT.md):
//   - edge.pts: dense centreline samples from node a to node b (~2 m spacing), edge.cum: arc length.
//   - "left" of a direction (tx,tz) is (tz,-tx). India drives on the LEFT, so traffic travelling
//     a->b uses the half of the road to the left of the a->b tangent.
//   - laneIndex 0 = kerb-side (slow) lane, lanes-1 = lane next to the centre line / median.
import { NODES, ROADS, PARKS, LANDMARKS, MONUMENTS, COAST, AREA_NAMES } from './mapdata.js';

const SAMPLE_STEP = 2;

function catmullRom(p0, p1, p2, p3, n) {
  // centripetal Catmull-Rom between p1 and p2, n samples (excluding p2)
  const alpha = 0.5;
  const d = (a, b) => Math.max(1e-4, Math.pow(Math.hypot(b.x - a.x, b.z - a.z), alpha));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = t1 + (t2 - t1) * (i / n);
    const lerp = (a, b, ta, tb) => {
      const w = (tb - ta) < 1e-6 ? 0 : (t - ta) / (tb - ta);
      return { x: a.x + (b.x - a.x) * w, z: a.z + (b.z - a.z) * w };
    };
    const A1 = lerp(p0, p1, t0, t1), A2 = lerp(p1, p2, t1, t2), A3 = lerp(p2, p3, t2, t3);
    const B1 = lerp(A1, A2, t0, t2), B2 = lerp(A2, A3, t1, t3);
    out.push(lerp(B1, B2, t1, t2));
  }
  return out;
}

function cumulative(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return cum;
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export class RoadNetwork {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
    this.roads = [];
    this.parks = PARKS;
    this.landmarks = LANDMARKS;
    this.monuments = MONUMENTS.map((m) => ({ ...m, x: NODES[m.node].x, z: NODES[m.node].z }));
    this.coast = COAST;
    for (const [id, n] of Object.entries(NODES)) {
      this.nodes.set(id, { id, x: n.x, z: n.z, exit: !!n.exit, roundabout: n.roundabout || 0, edges: [], radius: 0 });
    }
    for (const road of ROADS) this._buildRoad(road);
    // intersection radius: how far the junction surface extends from the node centre
    for (const node of this.nodes.values()) {
      let r = 0;
      for (const { edge } of node.edges) r = Math.max(r, edge.width / 2);
      node.radius = node.roundabout ? node.roundabout + r + 1 : (node.edges.length > 2 ? r + 2 : node.edges.length === 2 ? 0 : r);
    }
    this._buildIndex();
    this._buildLand();
  }

  _buildRoad(def) {
    const ids = def.nodes;
    const P = ids.map((id) => this.nodes.get(id));
    const full = [];
    const road = { name: def.name, def, edges: [], pts: null, lanes: def.lanes, width: def.width, median: def.median, kind: def.kind };
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = i === 0 ? { x: 2 * P[0].x - P[1].x, z: 2 * P[0].z - P[1].z } : P[i - 1];
      const p3 = i + 2 < P.length ? P[i + 2] : { x: 2 * P[i + 1].x - P[i].x, z: 2 * P[i + 1].z - P[i].z };
      const len = Math.hypot(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z);
      const n = Math.max(2, Math.ceil(len / SAMPLE_STEP));
      const pts = catmullRom(p0, P[i], P[i + 1], p3, n);
      pts.push({ x: P[i + 1].x, z: P[i + 1].z });
      const edge = {
        id: this.edges.length, road, name: def.name, a: ids[i], b: ids[i + 1], pts, cum: cumulative(pts),
        width: def.width, lanes: def.lanes, median: def.median, kind: def.kind,
      };
      edge.length = edge.cum[edge.cum.length - 1];
      edge.laneWidth = (def.width - def.median) / 2 / def.lanes;
      this.edges.push(edge);
      road.edges.push(edge);
      this.nodes.get(edge.a).edges.push({ edge, dir: 1 });   // leaving node a travelling a->b
      this.nodes.get(edge.b).edges.push({ edge, dir: -1 });  // leaving node b travelling b->a
      if (i === 0) full.push(...pts); else full.push(...pts.slice(1));
    }
    road.pts = full;
    road.cum = cumulative(full);
    this.roads.push(road);
  }

  // ---- sampling -------------------------------------------------------------------------------
  /** Point + unit tangent (a->b) at arc length s along edge. */
  sample(edge, s) {
    const { pts, cum } = edge;
    s = Math.max(0, Math.min(edge.length, s));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const seg = cum[hi] - cum[lo] || 1;
    const w = (s - cum[lo]) / seg;
    const a = pts[lo], b = pts[hi];
    const tx = (b.x - a.x) / seg, tz = (b.z - a.z) / seg;
    return { x: a.x + (b.x - a.x) * w, z: a.z + (b.z - a.z) * w, tx, tz };
  }

  /** Lateral offset (to the left of the a->b tangent) of the centre of a lane. dir=+1 travels a->b, -1 travels b->a. */
  laneOffset(edge, dir, laneIndex = 0) {
    const off = edge.width / 2 - (laneIndex + 0.5) * edge.laneWidth;
    return dir > 0 ? off : -off;
  }

  /** World point + heading vector of a lane. s is measured from node a regardless of dir. */
  lanePoint(edge, s, dir, laneIndex = 0) {
    const p = this.sample(edge, s);
    const off = this.laneOffset(edge, dir, laneIndex);
    return { x: p.x + p.tz * off, z: p.z - p.tx * off, hx: p.tx * dir, hz: p.tz * dir };
  }

  edgesAt(nodeId) { return this.nodes.get(nodeId).edges; }

  // ---- spatial queries ----------------------------------------------------------------------------
  _buildIndex() {
    this.cell = 24;
    this.grid = new Map();
    for (const e of this.edges) {
      for (let i = 0; i < e.pts.length - 1; i++) {
        const a = e.pts[i], b = e.pts[i + 1];
        const pad = e.width / 2 + 2;
        const x0 = Math.floor((Math.min(a.x, b.x) - pad) / this.cell), x1 = Math.floor((Math.max(a.x, b.x) + pad) / this.cell);
        const z0 = Math.floor((Math.min(a.z, b.z) - pad) / this.cell), z1 = Math.floor((Math.max(a.z, b.z) + pad) / this.cell);
        for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
          const k = gx + ',' + gz;
          let arr = this.grid.get(k); if (!arr) this.grid.set(k, (arr = []));
          arr.push(e.id * 4096 + i);
        }
      }
    }
  }

  /**
   * Nearest centreline point. Returns { edge, s, x, z, tx, tz, dist, lateral } where lateral is the
   * signed offset of the query point to the LEFT of the a->b tangent. Searches within ~maxDist (default 60 m).
   */
  nearest(x, z, maxDist = 60) {
    const c = this.cell;
    const r = Math.ceil(maxDist / c);
    const gx = Math.floor(x / c), gz = Math.floor(z / c);
    let best = null, bestD = maxDist * maxDist;
    const seen = new Set();
    for (let ring = 0; ring <= r; ring++) {
      for (let ix = gx - ring; ix <= gx + ring; ix++) for (let iz = gz - ring; iz <= gz + ring; iz++) {
        if (Math.max(Math.abs(ix - gx), Math.abs(iz - gz)) !== ring) continue;
        const arr = this.grid.get(ix + ',' + iz); if (!arr) continue;
        for (const key of arr) {
          if (seen.has(key)) continue; seen.add(key);
          const e = this.edges[(key / 4096) | 0], i = key % 4096;
          const a = e.pts[i], b = e.pts[i + 1];
          const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
          let t = ((x - a.x) * dx + (z - a.z) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = a.x + dx * t, pz = a.z + dz * t;
          const d2 = (x - px) ** 2 + (z - pz) ** 2;
          if (d2 < bestD) {
            const L = Math.sqrt(L2);
            bestD = d2;
            best = { edge: e, s: e.cum[i] + t * L, x: px, z: pz, tx: dx / L, tz: dz / L, dist: Math.sqrt(d2), lateral: 0 };
          }
        }
      }
      if (best && best.dist < (ring) * c) break;
    }
    if (best) best.lateral = (x - best.x) * best.tz - (z - best.z) * best.tx;
    return best;
  }

  /** Nearest node whose junction area contains the point, or null. */
  junctionAt(x, z) {
    for (const n of this.nodes.values()) {
      if (n.edges.length < 3 && !n.roundabout) continue;
      if ((x - n.x) ** 2 + (z - n.z) ** 2 < n.radius * n.radius) return n;
    }
    return null;
  }

  /** True if the point is on a carriageway (kerb-to-kerb), optionally with a margin (m). */
  isOnRoad(x, z, margin = 0) {
    const n = this.nearest(x, z, 30);
    if (n && n.dist <= n.edge.width / 2 + margin) return true;
    return !!this.junctionAt(x, z);
  }

  roadNameAt(x, z) {
    const n = this.nearest(x, z, 25);
    if (n && n.dist <= n.edge.width / 2 + 6) return n.edge.name;
    return null;
  }

  areaNameAt(x, z) {
    for (const [name, x0, x1, z0, z1] of AREA_NAMES) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return name;
    return 'South Bombay';
  }

  // ---- land / sea -------------------------------------------------------------------------------
  _buildLand() {
    const md = this.roads.find((r) => r.name === 'Marine Drive');
    const off = md.width / 2 + COAST.promenadeWidth;
    const edge = [];
    // sea edge = MD centreline offset to the west (left of NP->north direction)
    for (let i = 0; i < md.pts.length; i++) {
      const a = md.pts[Math.max(0, i - 1)], b = md.pts[Math.min(md.pts.length - 1, i + 1)];
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
      if (i % 3 === 0 || i === md.pts.length - 1) edge.push([md.pts[i].x + tz * off, md.pts[i].z - tx * off]);
    }
    // extend south to the Back Bay south shore, north to the map edge
    const [sx, sz] = edge[0], [sx2, sz2] = edge[1];
    const st = (COAST.southShoreZ - sz) / (sz - sz2);
    edge.unshift([sx + (sx - sx2) * st, COAST.southShoreZ]);
    const [ex, ez] = edge[edge.length - 1], [ex2, ez2] = edge[edge.length - 2];
    const et = (COAST.northEdgeZ - ez) / (ez - ez2);
    edge.push([ex + (ex - ex2) * et, COAST.northEdgeZ]);
    this.seaEdge = edge; // ordered south -> north along the Marine Drive promenade
    this.land = [
      ...edge,
      [COAST.harbourX, COAST.northEdgeZ],
      [COAST.harbourX, COAST.southEdgeZ],
      [COAST.southShoreSplitX, COAST.southEdgeZ],
      [COAST.southShoreSplitX, COAST.southShoreZ],
    ];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of this.land) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  isLand(x, z) { return pointInPoly(x, z, this.land); }

  parkAt(x, z) { return this.parks.find((p) => pointInPoly(x, z, p.poly)) || null; }

  /** Random point on a lane, useful for spawning. rng() -> [0,1). */
  randomLanePoint(rng, filter) {
    for (let k = 0; k < 50; k++) {
      const e = this.edges[Math.floor(rng() * this.edges.length)];
      if (filter && !filter(e)) continue;
      const dir = rng() < 0.5 ? 1 : -1;
      const lane = Math.floor(rng() * e.lanes);
      const s = 8 + rng() * Math.max(1, e.length - 16);
      return { edge: e, dir, lane, s, ...this.lanePoint(e, s, dir, lane) };
    }
    return null;
  }
}
