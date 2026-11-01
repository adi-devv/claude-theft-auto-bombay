// Police navigation: road-graph routing (Dijkstra/A* over roads.nodes/edges) + a car driver that only
// touches vehicle.setControls(). Written to be robust to a real tyre model:
//   - steering is closed-loop on the angle to a look-ahead point (look-ahead grows with speed), with the
//     proportional gain falling with speed, plus counter-steer when the body slip angle grows;
//   - speed is planned from path curvature (v = sqrt(aLat / k)) with a braking envelope ahead;
//   - throttle is cut while steering hard at speed (traction), handbrake only to hold a stop;
//   - raycast feelers against static collision + a corridor check against other vehicles;
//   - stuck detection -> reverse with opposite lock -> caller replans.
// Conventions (CONTRACT): heading h, forward (sin h, cos h); increasing h turns LEFT; steer +1 = RIGHT.

export const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const UTURN_PENALTY = 45;            // metres-equivalent cost of starting a route against the current heading
const KIND_COST = { boulevard: 0.9, arterial: 1.0, street: 1.12, lane: 1.3 };

/**
 * Plan a lane-centre route from (fx,fz) facing `heading` to (tx,tz).
 * Returns { pts:[{x,z,vmax}], tx, tz, length } or null if either end is off the network.
 */
export function planRoute(roads, fx, fz, heading, tx, tz, opts = {}) {
  const ns = roads.nearest(fx, fz, 70);
  const nt = roads.nearest(tx, tz, 160);
  if (!ns || !nt) return null;
  const fwdX = Math.sin(heading), fwdZ = Math.cos(heading);
  const tang = ns.tx * fwdX + ns.tz * fwdZ;
  const pen = (dir) => (dir * tang < -0.25 ? UTURN_PENALTY : 0);
  const se = ns.edge, te = nt.edge;
  const nodes = roads.nodes;

  // Dijkstra from the two ends of the start edge (graph is ~50 nodes; no heap needed).
  const cost = new Map(), prev = new Map(), done = new Set();
  const relax = (id, c, p) => { if (!cost.has(id) || c < cost.get(id)) { cost.set(id, c); prev.set(id, p); } };
  relax(se.b, (se.length - ns.s) * (KIND_COST[se.kind] || 1) + pen(1), { from: null, edge: se, dir: 1 });
  relax(se.a, ns.s * (KIND_COST[se.kind] || 1) + pen(-1), { from: null, edge: se, dir: -1 });

  let best = null; // { cost, viaNode, dir } or direct
  if (se === te) {
    const dir = nt.s >= ns.s ? 1 : -1;
    best = { cost: Math.abs(nt.s - ns.s) + pen(dir), direct: true, dir };
  }
  for (;;) {
    let u = null, uc = Infinity;
    for (const [id, c] of cost) if (!done.has(id) && c < uc) { uc = c; u = id; }
    if (u === null || (best && uc >= best.cost)) break;
    done.add(u);
    const node = nodes.get(u);
    // goal: enter the target edge from this node
    for (const { edge, dir } of node.edges) {
      if (edge !== te) continue;
      const c = uc + (dir > 0 ? nt.s : edge.length - nt.s);
      if (!best || c < best.cost) best = { cost: c, viaNode: u, dir };
    }
    if (node.exit && u !== te.a && u !== te.b) continue; // map-edge dead ends: don't route through
    for (const { edge, dir } of node.edges) {
      const p = prev.get(u);
      if (p && p.edge === edge) continue; // no U-turn back along the edge we came from
      const next = dir > 0 ? edge.b : edge.a;
      if (done.has(next)) continue;
      relax(next, uc + edge.length * (KIND_COST[edge.kind] || 1), { from: u, edge, dir });
    }
  }
  if (!best) return null;

  // Reconstruct steps [{edge, dir, s0, s1, endNode}]
  const steps = [];
  if (best.direct) {
    steps.push({ edge: se, dir: best.dir, s0: ns.s, s1: nt.s, endNode: null });
  } else {
    steps.push({ edge: te, dir: best.dir, s0: best.dir > 0 ? 0 : te.length, s1: nt.s, endNode: null, startNode: best.viaNode });
    let id = best.viaNode;
    let guard = 0;
    while (id != null && guard++ < 200) {
      const p = prev.get(id);
      if (!p) break;
      const e = p.edge;
      const isFirst = p.from == null;
      const s0 = isFirst ? ns.s : (p.dir > 0 ? 0 : e.length);
      const s1 = p.dir > 0 ? e.length : 0;
      steps.unshift({ edge: e, dir: p.dir, s0, s1, endNode: id, startNode: p.from });
      id = p.from;
    }
  }

  // Sample lane centres. Inner (overtaking) lane: lane index lanes-1.
  const pts = [];
  const lane = (e) => (opts.lane === 'kerb' ? 0 : Math.max(0, e.lanes - 1));
  const push = (x, z) => {
    const l = pts[pts.length - 1];
    if (l && (l.x - x) ** 2 + (l.z - z) ** 2 < 1.0) return;
    pts.push({ x, z, vmax: 99 });
  };
  for (let k = 0; k < steps.length; k++) {
    const st = steps[k];
    const e = st.edge, dir = st.dir;
    const startN = st.startNode != null ? nodes.get(st.startNode) : null;
    const endN = st.endNode != null ? nodes.get(st.endNode) : null;
    const trimS = startN && startN.radius > 2 ? startN.radius * 0.85 : 0;
    const trimE = endN && endN.radius > 2 ? endN.radius * 0.85 : 0;
    const len = Math.abs(st.s1 - st.s0);
    const n = Math.max(1, Math.ceil(len / 3));
    for (let i = 0; i <= n; i++) {
      const s = st.s0 + (st.s1 - st.s0) * (i / n);
      const fromStart = Math.abs(s - st.s0), toEnd = Math.abs(st.s1 - s);
      if (k > 0 && fromStart < trimS) continue;
      if (endN && toEnd < trimE) continue;
      const p = roads.lanePoint(e, s, dir, lane(e));
      push(p.x, p.z);
    }
    // roundabout arc at the end node (clockwise seen from above = increasing atan2(z,x))
    if (endN && endN.roundabout && k + 1 < steps.length && pts.length) {
      const nx = steps[k + 1];
      const s0n = nx.s0 + (nx.s1 - nx.s0 > 0 ? 1 : -1) * (endN.radius * 0.85);
      const pOut = roads.lanePoint(nx.edge, clamp(s0n, 0, nx.edge.length), nx.dir, lane(nx.edge));
      const pIn = pts[pts.length - 1];
      const R = endN.roundabout + 4;
      const a0 = Math.atan2(pIn.z - endN.z, pIn.x - endN.x);
      const a1 = Math.atan2(pOut.z - endN.z, pOut.x - endN.x);
      let da = a1 - a0; while (da < 0.15) da += Math.PI * 2;
      const m = Math.max(2, Math.ceil(R * da / 4));
      for (let i = 1; i < m; i++) { const a = a0 + da * (i / m); push(endN.x + Math.cos(a) * R, endN.z + Math.sin(a) * R); }
    }
  }
  if (opts.exact !== false) {
    const d = Math.hypot(tx - nt.x, tz - nt.z);
    if (d < 30) push(tx, tz);
  }
  if (pts.length < 2) { const p = roads.lanePoint(se, ns.s, 1, 0); pts.unshift({ x: fx, z: fz, vmax: 99 }); push(tx, tz); if (pts.length < 2) pts.push({ x: p.x, z: p.z, vmax: 99 }); }
  annotateCurvature(pts);
  let length = 0; for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return { pts, tx, tz, length, idx: 0 };
}

/** Per-waypoint corner speed limit from local curvature (aLat in m/s^2 applied later). Stores k (1/m). */
function annotateCurvature(pts) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 2)], b = pts[i], c = pts[Math.min(pts.length - 1, i + 2)];
    const d1 = Math.hypot(b.x - a.x, b.z - a.z), d2 = Math.hypot(c.x - b.x, c.z - b.z);
    if (d1 < 0.5 || d2 < 0.5) { b.k = 0; continue; }
    const h1 = Math.atan2(b.x - a.x, b.z - a.z), h2 = Math.atan2(c.x - b.x, c.z - b.z);
    b.k = Math.abs(wrapAngle(h2 - h1)) / ((d1 + d2) * 0.5);
  }
}

/** Advance the path index to the closest waypoint (searching forward) and return the look-ahead point. */
export function pathLookahead(path, x, z, L) {
  const pts = path.pts;
  let best = path.idx, bd = Infinity;
  const lim = Math.min(pts.length - 1, path.idx + 25);
  for (let i = path.idx; i <= lim; i++) {
    const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  path.idx = best;
  path.offDist = Math.sqrt(bd);
  // walk forward L metres
  let rem = L, i = best, px = x, pz = z;
  // start measuring from the closest point
  px = pts[i].x; pz = pts[i].z;
  while (i < pts.length - 1) {
    const nx = pts[i + 1].x, nz = pts[i + 1].z;
    const seg = Math.hypot(nx - px, nz - pz);
    if (seg >= rem) { const w = rem / (seg || 1); return { x: px + (nx - px) * w, z: pz + (nz - pz) * w, end: false }; }
    rem -= seg; px = nx; pz = nz; i++;
  }
  return { x: pts[pts.length - 1].x, z: pts[pts.length - 1].z, end: true };
}

/** Max speed allowed now so we can brake to every corner speed ahead. */
export function pathSpeedLimit(path, speed, aLat, aBrake) {
  const pts = path.pts;
  let d = path.offDist || 0, vlim = 99;
  const horizon = speed * speed / (2 * aBrake) + 20;
  for (let i = path.idx; i < pts.length; i++) {
    if (i > path.idx) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (d > horizon) break;
    const k = pts[i].k || 0;
    if (k > 1e-3) {
      const vc = Math.sqrt(aLat / k);
      const v = Math.sqrt(vc * vc + 2 * aBrake * Math.max(0, d - 2));
      if (v < vlim) vlim = v;
    }
  }
  return vlim;
}

export function remainingLength(path) {
  const pts = path.pts; let d = 0;
  for (let i = path.idx + 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return d;
}

/**
 * Low-level car driver. `ctl` is the per-unit controller state. Call every fixed step.
 *   aim {x,z}: look-ahead point; vTarget: desired forward speed (m/s, 0 = stop and hold);
 *   opts: { game, ignore (vehicle to not avoid, e.g. ram target), aggressive, noAvoid }
 * Returns { blocked, stuck } flags.
 */
export function driveCar(v, ctl, dt, aim, vTarget, opts) {
  const game = opts.game;
  const px = v.position.x, pz = v.position.z;
  const h = v.heading, fx = Math.sin(h), fz = Math.cos(h);
  const rx = -fz, rz = fx; // right
  const speed = v.speed ?? 0;
  const absV = Math.abs(speed);

  // measured yaw rate & slip (don't trust optional fields)
  const yawRate = ctl.lastH == null ? 0 : wrapAngle(h - ctl.lastH) / dt;
  ctl.lastH = h;
  const vx = v.velocity?.x ?? fx * speed, vz = v.velocity?.z ?? fz * speed;
  const vLat = vx * rx + vz * rz;
  const beta = absV > 3 ? Math.atan2(-vLat, Math.max(1, Math.abs(speed))) : 0; // >0: velocity to the LEFT of heading

  // ---- reversing manoeuvre (stuck recovery / K-turn) ----
  if (ctl.reverseT > 0) {
    ctl.reverseT -= dt;
    const want = Math.atan2(aim.x - px, aim.z - pz);
    const err = wrapAngle(want - h);
    // reversing: steer the opposite way to swing the nose towards the aim
    const steer = clamp(Math.sign(err) * 1.0, -1, 1) * (Math.abs(err) > 0.2 ? 1 : 0.3);
    if (speed > 0.6) v.setControls({ throttle: 0, brake: 1, steer: -steer, handbrake: false });
    else v.setControls({ throttle: 0, brake: 0.85, steer, handbrake: false });
    // stop reversing early if something is behind us
    if (ctl.reverseT > 0.2 && game.collision.raycast(px - fx * (v.length / 2), pz - fz * (v.length / 2), -fx, -fz, 1.2, 0.3)) ctl.reverseT = 0.2;
    if (ctl.reverseT <= 0) { ctl.stuckT = 0; ctl.justReversed = true; }
    return { reversing: true };
  }

  // ---- steering: angle to look-ahead point ----
  const want = Math.atan2(aim.x - px, aim.z - pz);
  let err = wrapAngle(want - h); // + = aim is to the LEFT
  const distAim = Math.hypot(aim.x - px, aim.z - pz);

  // ---- feelers (static) every 3rd step ----
  ctl.feelT = (ctl.feelT || 0) - 1;
  if (ctl.feelT <= 0 && !opts.noAvoid) {
    ctl.feelT = 3;
    const L = 5 + absV * 0.9;
    const ox = px + fx * (v.length / 2 - 0.2), oz = pz + fz * (v.length / 2 - 0.2);
    const ray = (ang, len) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      // rotate forward by ang (positive = left)
      const dx = fx * c + (-rx) * s, dz = fz * c + (-rz) * s;
      const hit = game.collision.raycast(ox, oz, dx, dz, len, 0.4);
      return hit ? hit.dist : len;
    };
    ctl.fC = ray(0, L); ctl.fL = ray(0.38, L * 0.8); ctl.fR = ray(-0.38, L * 0.8);
    ctl.fLL = ray(0.9, 4.5); ctl.fRR = ray(-0.9, 4.5);
    ctl.fLen = L;
    // dynamic: vehicles in a corridor ahead
    ctl.dyn = null;
    const look = 8 + absV * 1.4;
    for (const o of game.vehicles) {
      if (o === v || o === opts.ignore || !o.position) continue;
      const dx = o.position.x - px, dz = o.position.z - pz;
      if (dx * dx + dz * dz > (look + 6) ** 2) continue;
      const lz = dx * fx + dz * fz, lx = dx * rx + dz * rz;
      const half = (v.width + (o.width || 1.8)) / 2 + 0.5;
      if (lz < 0 || lz > look || Math.abs(lx) > half + (o.length || 4) * 0.35) continue;
      const of = o.forward || { x: Math.sin(o.heading), z: Math.cos(o.heading) };
      const ovAlong = (o.velocity ? o.velocity.x * fx + o.velocity.z * fz : (o.speed || 0) * (of.x * fx + of.z * fz));
      if (!ctl.dyn || lz < ctl.dyn.lz) ctl.dyn = { lz, lx, v: ovAlong, o };
    }
  }

  let vMax = vTarget;
  let steerBias = 0;
  if (!opts.noAvoid && ctl.fLen) {
    const L = ctl.fLen;
    const dL = 1 - ctl.fL / (L * 0.8), dR = 1 - ctl.fR / (L * 0.8);
    steerBias += (dR - dL) * 0.6;                       // positive -> turn left
    steerBias += ((ctl.fRR < 4.5 ? 1 - ctl.fRR / 4.5 : 0) - (ctl.fLL < 4.5 ? 1 - ctl.fLL / 4.5 : 0)) * 0.35;
    if (ctl.fC < L && distAim > ctl.fC + 1) {
      // wall ahead: limit speed to what we can stop in, and steer to the more open side
      const room = Math.max(0, ctl.fC - 2.5);
      vMax = Math.min(vMax, Math.sqrt(2 * 5 * room) + 1.5);
      if (Math.abs(err) < 0.25) steerBias += (ctl.fL > ctl.fR ? 1 : -1) * 0.35;
    }
    if (ctl.dyn) {
      const d = ctl.dyn;
      const gap = d.lz - (v.length + (d.o.length || 4)) / 2;
      if (d.v < absV - 0.5 || gap < 4) {
        // slower car ahead: pass on the side with more room, and don't rear-end it
        const side = d.lx > 0.3 ? 1 : d.lx < -0.3 ? -1 : (ctl.fL >= ctl.fR ? 1 : -1); // 1 -> pass left
        const pass = clamp(1 - gap / 18, 0, 1);
        steerBias += side * 0.55 * pass * (opts.aggressive ? 1.2 : 1);
        if (gap < 10) vMax = Math.min(vMax, Math.max(0, d.v) + Math.max(0, gap - 2) * 0.9 + (opts.aggressive ? 2 : 0));
      }
    }
  }
  err = wrapAngle(err + clamp(steerBias, -0.8, 0.8));

  // target behind us and we're slow: K-turn (reverse with opposite lock) if there's no room ahead
  if (Math.abs(err) > 2.1 && absV < 4 && vTarget > 0.5 && (ctl.fC ?? 99) < 9) {
    ctl.reverseT = 1.4; return { reversing: true };
  }

  // gain falls with speed (real tyres: steer = wheel angle, yaw rate ~ v * angle)
  const k = 2.4 / (1 + absV / 9);
  let steerLeft = clamp(err * k, -1, 1);
  // counter-steer against slip; damp yaw-rate overshoot at speed
  steerLeft += clamp(beta * 1.4, -0.6, 0.6);
  if (absV > 8) {
    const desiredYaw = clamp(2 * absV * Math.sin(err) / Math.max(4, distAim), -1.5, 1.5);
    steerLeft -= clamp((yawRate - desiredYaw) * 0.12, -0.3, 0.3);
  }
  // steering envelope: don't ask for more lateral g than the tyres have
  const maxSteerAtSpeed = absV > 12 ? clamp(14 / absV, 0.45, 1) : 1;
  steerLeft = clamp(steerLeft, -maxSteerAtSpeed, maxSteerAtSpeed);

  // turning hard: slow down for the turn implied by the aim angle itself
  const turnLimit = 4 + 26 * Math.max(0, Math.cos(Math.min(Math.PI / 2, Math.abs(err) * 1.25)));
  vMax = Math.min(vMax, turnLimit);
  if (Math.abs(err) > 1.4) vMax = Math.min(vMax, 6);

  // ---- longitudinal ----
  let throttle = 0, brake = 0, handbrake = false;
  if (vMax <= 0.3) {
    if (speed > 0.6) brake = 1; else handbrake = true;
  } else {
    const e = vMax - speed;
    if (speed < -0.5) { brake = 0; throttle = 1; }
    else if (e > 0) { throttle = clamp(0.25 + e * 0.35, 0, 1); }
    else if (e < -1.2) { brake = clamp(-e * 0.22, 0, 1); }
    // traction: less throttle when steering hard or sliding at speed
    if (absV > 10) throttle *= 1 - 0.55 * Math.abs(steerLeft);
    if (Math.abs(beta) > 0.2) throttle *= 0.4;
  }
  v.setControls({ throttle, brake, steer: -steerLeft, handbrake });

  // ---- stuck detection ----
  if (vMax > 2 && throttle > 0.3 && absV < 0.8) ctl.stuckT = (ctl.stuckT || 0) + dt; else ctl.stuckT = Math.max(0, (ctl.stuckT || 0) - dt * 0.5);
  if (ctl.stuckT > 1.3) {
    ctl.stuckT = 0; ctl.reverseT = 1.3; ctl.stuckCount = (ctl.stuckCount || 0) + 1; ctl.lastStuck = game.time;
    return { stuck: true };
  }
  return {};
}
