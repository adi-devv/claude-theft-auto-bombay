// Traffic lane network (Traffic-owned). Built once from game.roads:
//  - per-edge AI data: junction trims (stop lines), kerb parking sides, parking-aware lane offsets
//  - per-node AI data: kind (junction / roundabout / corner / through / exit / deadend), movements
//    (approach -> exit), connector paths (Bezier / roundabout ring arcs / dead-end U-turn loops) for every
//    lane pair, and the conflict table between connectors (used by the junction arbiter)
//  - path "pieces": immutable polylines (x,z pairs, cumulative length, curvature) the drivers follow.
// Conventions follow CONTRACT.md: heading h -> forward (sin h, cos h); left of (tx,tz) = (tz,-tx);
// LEFT-hand traffic; roundabouts circulate clockwise seen from above (= polar angle atan2(z,x) increasing).

export const KIND_SPEED = { boulevard: 17.6, arterial: 11.4, street: 8.3, lane: 6.9 };
export const KIND_RANK = { boulevard: 3, arterial: 2, street: 1, lane: 0 };
const PARK_CLEAR = 2.3;        // kerb -> outer edge of a parked car + gap (m)
const PARK_OFF = 1.0;          // kerb -> parked car centre (m)
const CONFLICT_DIST = 2.6;     // two connector paths closer than this conflict
const RING_SPACING = 2.0;

export const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const mod2pi = (a) => { a %= 2 * Math.PI; return a < 0 ? a + 2 * Math.PI : a; };

/** Build an immutable path piece from a flat [x,z,...] array. */
export function makePiece(flat, meta) {
  const xs = [], zs = [];
  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i], z = flat[i + 1];
    if (xs.length) {
      const dx = x - xs[xs.length - 1], dz = z - zs[zs.length - 1];
      if (dx * dx + dz * dz < 0.09) { if (i >= flat.length - 2 && xs.length > 1) { xs[xs.length - 1] = x; zs[zs.length - 1] = z; } continue; }
    }
    xs.push(x); zs.push(z);
  }
  if (xs.length < 2) { xs.push(xs[0] + 0.01); zs.push(zs[0]); }
  const n = xs.length;
  const pts = new Float64Array(n * 2), cum = new Float64Array(n), kap = new Float32Array(n);
  for (let i = 0; i < n; i++) { pts[i * 2] = xs[i]; pts[i * 2 + 1] = zs[i]; if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]); }
  // curvature by circumscribed circle through neighbours ~3 m either side
  for (let i = 0; i < n; i++) {
    let a = i, b = i;
    while (a > 0 && cum[i] - cum[a] < 3) a--;
    while (b < n - 1 && cum[b] - cum[i] < 3) b++;
    if (a === i || b === i) { kap[i] = 0; continue; }
    const ax = xs[a], az = zs[a], bx = xs[i], bz = zs[i], cx = xs[b], cz = zs[b];
    const cr = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    const d = Math.hypot(bx - ax, bz - az) * Math.hypot(cx - bx, cz - bz) * Math.hypot(cx - ax, cz - az);
    kap[i] = d > 1e-6 ? Math.abs(2 * cr / d) : 0;
  }
  if (n > 2) { kap[0] = kap[1]; kap[n - 1] = kap[n - 2]; }
  const k2 = new Float32Array(n);
  for (let i = 0; i < n; i++) k2[i] = Math.max(kap[i], kap[Math.max(0, i - 1)], kap[Math.min(n - 1, i + 1)]);
  return { pts, cum, kap: k2, n, len: cum[n - 1], ...meta };
}

function bezier(P0, C1, C2, P3, step = 1.2) {
  const L = Math.hypot(C1.x - P0.x, C1.z - P0.z) + Math.hypot(C2.x - C1.x, C2.z - C1.z) + Math.hypot(P3.x - C2.x, P3.z - C2.z);
  const n = Math.max(4, Math.ceil(L / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push(a * P0.x + b * C1.x + c * C2.x + d * P3.x, a * P0.z + b * C1.z + c * C2.z + d * P3.z);
  }
  return out;
}

export class TrafficNet {
  constructor(roads, rng) {
    this.roads = roads;
    this.rng = rng;
    this.laneCache = new Map();
    this.nodeList = [...roads.nodes.values()];
    for (const e of roads.edges) e.ai = { parkPos: false, parkNeg: false, sA: 0, sB: e.length };
    for (const n of this.nodeList) this._classifyNode(n);
    this._setupParking();
    for (const e of roads.edges) this._trimEdge(e);
    for (const n of this.nodeList) this._buildMovements(n);
    for (const n of this.nodeList) if (n.ai.kind === 'junction' || n.ai.kind === 'corner' || n.ai.kind === 'deadend') this._buildConflicts(n);
    this.parkingSpots = this._buildParkingSpots();
  }

  // ---------------------------------------------------------------- nodes / edges
  _classifyNode(n) {
    const deg = n.edges.length;
    let kind;
    if (n.exit) kind = 'exit';
    else if (n.roundabout) kind = 'roundabout';
    else if (deg === 1) kind = 'deadend';
    else if (deg === 2) kind = n.edges[0].edge.road === n.edges[1].edge.road ? 'through' : 'corner';
    else kind = 'junction';
    let r = 0;
    for (const { edge } of n.edges) r = Math.max(r, edge.width / 2);
    let trim = 0;
    if (kind === 'junction') trim = n.radius + 0.5;
    else if (kind === 'roundabout') trim = n.radius + 1;
    else if (kind === 'corner') trim = r + 1.5;
    else if (kind === 'deadend') trim = 5;
    n.ai = {
      kind, trim, maxHalf: r, moves: new Map(), byApproach: new Map(), conns: [], committed: new Set(), requests: [], signal: null,
      ringR: n.roundabout ? n.roundabout + (n.radius - n.roundabout) * 0.5 : 0,
    };
  }

  _trimEdge(e) {
    const A = this.roads.nodes.get(e.a), B = this.roads.nodes.get(e.b);
    const ta = A.ai.trim, tb = B.ai.trim;
    let sA = 0, sB = e.length;
    if (ta > 0) for (let i = 0; i < e.pts.length; i++) { if (Math.hypot(e.pts[i].x - A.x, e.pts[i].z - A.z) >= ta) { sA = e.cum[i]; break; } }
    if (tb > 0) for (let i = e.pts.length - 1; i >= 0; i--) { if (Math.hypot(e.pts[i].x - B.x, e.pts[i].z - B.z) >= tb) { sB = e.cum[i]; break; } }
    if (sB - sA < 4) { const m = (sA + sB) / 2; sA = m - 2; sB = m + 2; }
    e.ai.sA = sA; e.ai.sB = sB;
  }

  _setupParking() {
    for (const e of this.roads.edges) {
      if (e.lanes !== 1) continue;
      if (e.kind === 'street') { e.ai.parkPos = true; e.ai.parkNeg = e.width >= 9; }
      else if (e.kind === 'lane') { e.ai.parkPos = true; }
    }
  }

  /** Lateral offset (left of a->b tangent) of a lane centre, aware of kerb parking on 1-lane roads. */
  laneOff(e, dir, lane) {
    if (e.lanes === 1) {
      const half = e.width / 2;
      const lo = -half + (e.ai.parkNeg ? PARK_CLEAR : 0), hi = half - (e.ai.parkPos ? PARK_CLEAR : 0);
      const L = hi - lo;
      return dir > 0 ? lo + 0.75 * L : lo + 0.25 * L;
    }
    return this.roads.laneOffset(e, dir, Math.max(0, Math.min(lane, e.lanes - 1)));
  }

  /** Kerb offset (left of a->b) on the travel-left side of direction dir, and the parking clearance there. */
  kerbOff(e, dir) {
    const parked = dir > 0 ? e.ai.parkPos : e.ai.parkNeg;
    return { off: e.width / 2, parked };
  }

  offPoint(e, s, off) {
    const p = this.roads.sample(e, s);
    return { x: p.x + p.tz * off, z: p.z - p.tx * off, tx: p.tx, tz: p.tz };
  }

  /** Static full-length lane piece (stop line to stop line). */
  lanePiece(e, dir, lane) {
    const key = e.id * 16 + (dir > 0 ? 8 : 0) + lane;
    let p = this.laneCache.get(key);
    if (!p) {
      const s0 = dir > 0 ? e.ai.sA : e.ai.sB, s1 = dir > 0 ? e.ai.sB : e.ai.sA;
      p = this.buildLane(e, dir, lane, lane, s0, s1, 0);
      p.static = true;
      this.laneCache.set(key, p);
    }
    return p;
  }

  /** Lane piece from s0 to s1 (travel order), lateral offset blending from laneFrom (or offFrom) to laneTo over changeLen m. */
  buildLane(e, dir, laneFrom, laneTo, s0, s1, changeLen, offFrom = null) {
    const o0 = offFrom ?? this.laneOff(e, dir, laneFrom), o1 = this.laneOff(e, dir, laneTo);
    const flat = [];
    const total = Math.abs(s1 - s0);
    const offAt = (s) => {
      if (changeLen <= 0) return o1;
      const t = Math.min(1, Math.abs(s - s0) / changeLen);
      return o0 + (o1 - o0) * t * t * (3 - 2 * t);
    };
    const push = (s) => { const p = this.offPoint(e, s, offAt(s)); flat.push(p.x, p.z); };
    if (changeLen > 0) {
      const n = Math.max(2, Math.ceil(total / 2));
      for (let i = 0; i <= n; i++) push(s0 + (s1 - s0) * (i / n));
    } else {
      push(s0);
      const cum = e.cum;
      if (dir > 0) { for (let i = 0; i < cum.length; i++) if (cum[i] > s0 + 0.3 && cum[i] < s1 - 0.3) push(cum[i]); }
      else { for (let i = cum.length - 1; i >= 0; i--) if (cum[i] < s0 - 0.3 && cum[i] > s1 + 0.3) push(cum[i]); }
      push(s1);
    }
    return makePiece(flat, { kind: 'lane', edge: e, dir, lane: laneTo, s0, s1, limit: KIND_SPEED[e.kind] || 10 });
  }

  /** Approach key for travelling along edge e in direction dir. */
  static akey(e, dir) { return e.id * 2 + (dir > 0 ? 1 : 0); }
  endNode(e, dir) { return this.roads.nodes.get(dir > 0 ? e.b : e.a); }
  startNode(e, dir) { return this.roads.nodes.get(dir > 0 ? e.a : e.b); }

  /** Edge arc-length s -> travel progress along a full lane piece (approximate, centreline based). */
  progressOf(e, dir, s) { return dir > 0 ? s - e.ai.sA : e.ai.sB - s; }

  // ---------------------------------------------------------------- movements & connectors
  _buildMovements(n) {
    const ai = n.ai;
    if (ai.kind === 'exit' || ai.kind === 'through') return;
    const incoming = n.edges.map(({ edge, dir }) => ({ edge, dir: -dir }));
    const outgoing = n.edges.map(({ edge, dir }) => ({ edge, dir }));
    for (const inc of incoming) {
      const list = [];
      ai.byApproach.set(TrafficNet.akey(inc.edge, inc.dir), list);
      const inP = this.lanePiece(inc.edge, inc.dir, 0);
      const hin = this._endHeading(inP);
      for (const out of outgoing) {
        const uturn = out.edge === inc.edge;
        if (uturn && ai.kind !== 'deadend') continue;
        const outP = this.lanePiece(out.edge, out.dir, 0);
        const hout = this._startHeading(outP);
        let type;
        if (uturn) type = 'uturn';
        else if (ai.kind === 'roundabout') type = 'ring';
        else if (ai.kind === 'corner') type = 'straight';
        else {
          const dh = wrapPi(Math.atan2(hout.x, hout.z) - Math.atan2(hin.x, hin.z));
          type = dh > 0.55 ? 'left' : dh < -0.55 ? 'right' : 'straight';
        }
        const mv = { node: n, in: inc, out, type, legal: [], conns: [], angle: 0, firstExit: false, rank: 0 };
        if (ai.kind === 'roundabout') {
          const pa = this._piecePolar(n, inP, true), pb = this._piecePolar(n, outP, false);
          mv.angle = mod2pi(pb - pa);
        }
        mv.rank = type === 'right' || type === 'uturn' ? 0 : type === 'left' ? 1.5 : 2;
        const L = inc.edge.lanes, OL = out.edge.lanes;
        for (let i = 0; i < L; i++) {
          let j, legal = true;
          if (type === 'left') { j = 0; legal = i === 0; }
          else if (type === 'right') { j = OL - 1; legal = i === L - 1; }
          else if (type === 'ring') { j = 0; }
          else j = Math.min(i, OL - 1);
          if (L === 1) legal = true;
          const conn = this._makeConn(n, inc, i, out, j, type);
          conn.move = mv; conn.legal = legal; conn.idx = ai.conns.length;
          ai.conns.push(conn);
          mv.conns[i] = conn;
          if (legal) mv.legal.push(i);
        }
        list.push(mv);
        ai.moves.set(TrafficNet.akey(inc.edge, inc.dir) + '>' + TrafficNet.akey(out.edge, out.dir), mv);
      }
      if (ai.kind === 'roundabout' && list.length && inc.edge.lanes > 1) {
        // first exit clockwise = the "left" exit: kerb lane only; other exits from any lane
        let first = list[0];
        for (const mv of list) if (mv.angle < first.angle) first = mv;
        first.firstExit = true;
        for (const mv of list) {
          mv.legal = [];
          mv.conns.forEach((c, i) => { c.legal = mv === first ? i === 0 : true; if (c.legal) mv.legal.push(i); });
        }
      }
    }
  }

  _endHeading(p) { const n = p.n, x = p.pts[n * 2 - 2] - p.pts[n * 2 - 4], z = p.pts[n * 2 - 1] - p.pts[n * 2 - 3], L = Math.hypot(x, z) || 1; return { x: x / L, z: z / L }; }
  _startHeading(p) { const x = p.pts[2] - p.pts[0], z = p.pts[3] - p.pts[1], L = Math.hypot(x, z) || 1; return { x: x / L, z: z / L }; }
  _piecePolar(n, p, atEnd) { const i = atEnd ? p.n - 1 : 0; return Math.atan2(p.pts[i * 2 + 1] - n.z, p.pts[i * 2] - n.x); }

  _makeConn(n, inc, i, out, j, type) {
    const inP = this.lanePiece(inc.edge, inc.dir, i), outP = this.lanePiece(out.edge, out.dir, j);
    const P0 = { x: inP.pts[inP.n * 2 - 2], z: inP.pts[inP.n * 2 - 1] }, h0 = this._endHeading(inP);
    const P3 = { x: outP.pts[0], z: outP.pts[1] }, h3 = this._startHeading(outP);
    let flat, ring = null;
    if (type === 'ring') {
      const R = n.ai.ringR;
      const tan = (phi) => ({ x: -Math.sin(phi), z: Math.cos(phi) });
      const pt = (phi) => ({ x: n.x + Math.cos(phi) * R, z: n.z + Math.sin(phi) * R });
      const d0 = Math.hypot(P0.x - n.x, P0.z - n.z), d3 = Math.hypot(P3.x - n.x, P3.z - n.z);
      const phi0 = Math.atan2(P0.z - n.z, P0.x - n.x), phi3 = Math.atan2(P3.z - n.z, P3.x - n.x);
      const phiM = phi0 + Math.max(7, 1.4 * (d0 - R)) / R;
      let phiX = phi3 - Math.max(7, 1.4 * (d3 - R)) / R;
      while (phiX < phiM + 0.15) phiX += 2 * Math.PI;
      while (phiX > phiM + 2 * Math.PI) phiX -= 2 * Math.PI;
      const M = pt(phiM), X = pt(phiX), tM = tan(phiM), tX = tan(phiX);
      const kIn = Math.hypot(M.x - P0.x, M.z - P0.z) * 0.42, kOut = Math.hypot(P3.x - X.x, P3.z - X.z) * 0.42;
      const entry = bezier(P0, { x: P0.x + h0.x * kIn, z: P0.z + h0.z * kIn }, { x: M.x - tM.x * kIn, z: M.z - tM.z * kIn }, M);
      const arc = [];
      const na = Math.max(2, Math.ceil((phiX - phiM) * R / RING_SPACING));
      for (let k = 1; k < na; k++) { const p = pt(phiM + (phiX - phiM) * k / na); arc.push(p.x, p.z); }
      const exit = bezier(X, { x: X.x + tX.x * kOut, z: X.z + tX.z * kOut }, { x: P3.x - h3.x * kOut, z: P3.z - h3.z * kOut }, P3);
      flat = [...entry, ...arc, ...exit];
      ring = { phiM, phiX, R, cx: n.x, cz: n.z };
    } else if (type === 'uturn') {
      // keyhole loop into the dead-end plaza: run on, swing round to the RIGHT (left-hand traffic), come back.
      const fx = h0.x, fz = h0.z, lx = fz, lz = -fx;
      const A = 16, a = 8, b = 8.5;
      const apex = { x: (P0.x + P3.x) / 2 + fx * A, z: (P0.z + P3.z) / 2 + fz * A };
      const leg1 = bezier(P0, { x: P0.x + fx * a, z: P0.z + fz * a }, { x: apex.x + lx * b, z: apex.z + lz * b }, apex);
      const leg2 = bezier(apex, { x: apex.x - lx * b, z: apex.z - lz * b }, { x: P3.x + fx * a, z: P3.z + fz * a }, P3);
      flat = [...leg1, ...leg2.slice(2)];
    } else {
      const D = Math.hypot(P3.x - P0.x, P3.z - P0.z);
      const dot = h0.x * h3.x + h0.z * h3.z;
      const k = D * (dot > 0.7 ? 0.35 : 0.45);
      flat = bezier(P0, { x: P0.x + h0.x * k, z: P0.z + h0.z * k }, { x: P3.x - h3.x * k, z: P3.z - h3.z * k }, P3);
    }
    const limit = type === 'straight' ? Math.min(KIND_SPEED[inc.edge.kind], KIND_SPEED[out.edge.kind]) : type === 'ring' ? 10 : 8;
    const piece = makePiece(flat, { kind: 'conn', node: n, type, ring, limit, static: true });
    const conn = { node: n, inEdge: inc.edge, inDir: inc.dir, inLane: i, outEdge: out.edge, outDir: out.dir, outLane: j, type, piece, conflicts: new Map() };
    piece.conn = conn;
    return conn;
  }

  _buildConflicts(n) {
    const C = n.ai.conns;
    const TH2 = CONFLICT_DIST * CONFLICT_DIST;
    for (let a = 0; a < C.length; a++) {
      for (let b = a + 1; b < C.length; b++) {
        const A = C[a], B = C[b];
        if (A.inEdge === B.inEdge && A.inDir === B.inDir && A.inLane === B.inLane) continue; // same queue: car-following handles it
        const pa = A.piece, pb = B.piece;
        let aFirst = -1, aLast = -1, bFirst = -1, bLast = -1;
        for (let i = 0; i < pa.n; i++) {
          const x = pa.pts[i * 2], z = pa.pts[i * 2 + 1];
          for (let k = 0; k < pb.n; k++) {
            const dx = pb.pts[k * 2] - x, dz = pb.pts[k * 2 + 1] - z;
            if (dx * dx + dz * dz < TH2) {
              if (aFirst < 0) aFirst = i;
              aLast = i;
              if (bFirst < 0 || k < bFirst) bFirst = k;
              if (k > bLast) bLast = k;
            }
          }
        }
        if (aFirst < 0) continue;
        A.conflicts.set(B, { start: pa.cum[aFirst], end: pa.cum[aLast] });
        B.conflicts.set(A, { start: pb.cum[bFirst], end: pb.cum[bLast] });
      }
    }
  }

  /** Movements available when arriving at the end of (e,dir). */
  movesFrom(e, dir) {
    const n = this.endNode(e, dir);
    return n.ai.byApproach.get(TrafficNet.akey(e, dir)) || [];
  }

  /** For 'through' nodes: the continuing edge/dir. */
  continuation(e, dir) {
    const n = this.endNode(e, dir);
    for (const { edge, dir: d } of n.edges) if (edge !== e) return { edge, dir: d };
    return null;
  }

  // ---------------------------------------------------------------- parking
  _buildParkingSpots() {
    const spots = [];
    const rng = this.rng;
    for (const e of this.roads.edges) {
      for (const side of [1, -1]) {
        if (side > 0 ? !e.ai.parkPos : !e.ai.parkNeg) continue;
        const off = side * (e.width / 2 - PARK_OFF);
        let s = e.ai.sA + 7 + rng() * 4;
        while (s < e.ai.sB - 9) {
          const p = this.offPoint(e, s, off);
          const tx = side > 0 ? p.tx : -p.tx, tz = side > 0 ? p.tz : -p.tz;
          spots.push({ x: p.x, z: p.z, heading: Math.atan2(tx, tz), edge: e, side, s, occupied: rng() < 0.62, vehicle: null, seed: rng() });
          s += 5.8 + rng() * 1.6 + (rng() < 0.12 ? 6 : 0);
        }
      }
    }
    return spots;
  }
}
