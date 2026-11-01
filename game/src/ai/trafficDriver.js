// Traffic driver (Traffic-owned): one AI controller per moving car. Drives ONLY through vehicle.setControls.
//   route  : legs[] of immutable path pieces (lane pieces + junction connectors), planned lazily at each junction
//   steer  : pure pursuit on the rear axle (LEFT-hand traffic is baked into the lane geometry of trafficNet)
//   speed  : IDM car-following against the nearest obstacle ahead and a virtual stop-line "leader"; curvature / limit
//            profile; integral throttle + feed-forward brake; handbrake hold when stopped
//   junctions: asks the arbiter (trafficJunction.js) for permission when the stop line is near
import { steerLimit } from '../vehicles/physics.js';
import { TrafficNet, KIND_SPEED, KIND_RANK, pieceSample, projectOn } from './trafficNet.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const G = 9.81;
export const PROFILE = {
  taxi:  { aMax: 1.45, b: 2.0, T: 1.5 },
  hatch: { aMax: 1.7,  b: 2.2, T: 1.4 },
  sedan: { aMax: 2.3,  b: 2.4, T: 1.4 },
  suv:   { aMax: 2.0,  b: 2.3, T: 1.5 },
  van:   { aMax: 1.3,  b: 2.0, T: 1.6 },
  bus:   { aMax: 1.0,  b: 1.7, T: 1.8 },
};
const MAX_SAMPLES = 48;
let driverSeq = 1;

export class Driver {
  constructor(T, veh, piece, s) {
    this.T = T; this.veh = veh; this.net = T.net; this.game = T.game;
    this.kind = 'traffic';
    this.id = driverSeq++;
    const rng = T.game.rng, sp = veh.spec, pr = PROFILE[veh.type] || PROFILE.sedan;
    this.prof = pr;
    this.speedF = 0.88 + rng() * 0.22;
    this.TH = pr.T * (0.85 + rng() * 0.5);
    this.s0 = veh.type === 'bus' ? 3.0 : 2.0;
    this.aLat = veh.type === 'bus' ? 1.5 : veh.type === 'taxi' || veh.type === 'van' ? 2.0 : 2.5;
    this.fR = sp.b + sp.length / 2 + sp.bodyOffset;      // rear axle -> front bumper
    this.rR = sp.length - this.fR;                        // rear axle -> rear bumper
    this.hw = sp.width / 2;
    this.L = sp.wheelbase;
    this.legs = [piece]; this.s = s; this.hint = 0; this.lat = 0; this.dist = 0;
    this.mv = null;                                       // movement planned at the end of the current lane piece
    this.done = false; this.dead = false;
    // perception
    this.gapObs = Infinity; this.vObs = 0; this.obsVeh = null; this.obsKind = 0; this.obsStamp = 0; this.obsTravel = 0;
    this.vProfile = 99; this.perceiveCD = (this.id * 2) % 5;
    this.nSamp = 0; this.sx = new Float32Array(MAX_SAMPLES); this.sz = new Float32Array(MAX_SAMPLES); this.sd = new Float32Array(MAX_SAMPLES);
    this.stx = new Float32Array(MAX_SAMPLES); this.stz = new Float32Array(MAX_SAMPLES);
    // junction
    this.jn = { state: 'none', node: null, conn: null, since: 0, wait: 0, req: false };
    this.occs = [];                                       // junctions we are committed to / still clearing
    // control
    this.thr = 0; this.aMeas = 0; this.vPrev = 0; this.hold = false; this.aCmd = 0;
    this.shift = 0; this.shiftTarget = 0;
    // behaviour
    this.waitReason = ''; this.blockedT = 0; this.stoppedT = 0; this.hornT = 0; this.hornCD = 4 + rng() * 10;
    this.lcCD = 3 + rng() * 6; this.react = null; this.pull = null; this.pass = null; this.reverseT = 0;
    this.lastSpeed = 0; this.age = 0; this.offT = 0; this.cutoff = 0;
    this.ensureLegs();
    this.pickMove();
  }

  // ------------------------------------------------------------------------------------------------ route planning
  get leg() { return this.legs[0]; }

  /** Choose the movement at the end of the current lane piece (stored in this.mv) and make legs[1] its connector. */
  pickMove() {
    const leg = this.legs[0];
    this.mv = null;
    if (leg.kind !== 'lane') return;
    const net = this.net, e = leg.edge, dir = leg.dir, node = net.endNode(e, dir), k = node.ai.kind;
    this.legs.length = 1;
    if (k === 'exit') return;
    if (k === 'through') { const c = net.continuation(e, dir); if (c) this.legs.push(net.lanePiece(c.edge, c.dir, Math.min(leg.lane, c.edge.lanes - 1))); return; }
    const moves = net.movesFrom(e, dir);
    if (!moves.length) return;
    const lane = leg.lane, focus = this.T.focusNear(this.veh.position.x, this.veh.position.z);
    let tot = 0; const w = this._w || (this._w = []);
    const dme = focus ? Math.hypot(this.veh.position.x - focus.x, this.veh.position.z - focus.z) : 0;
    for (let i = 0; i < moves.length; i++) {
      const mv = moves[i];
      let wt = mv.type === 'straight' ? 1.0 : mv.type === 'left' ? 0.55 : mv.type === 'right' ? 0.5 : mv.type === 'uturn' ? 1 : (mv.firstExit ? 0.6 : mv.angle > 4 ? 0.2 : 0.7);
      if (!mv.legal.includes(Math.min(lane, mv.conns.length - 1))) wt *= 0.02;
      const oe = mv.out.edge;
      if (this.veh.type === 'bus' && (KIND_RANK[oe.kind] || 0) < 2) wt *= 0.04;
      if (this.veh.type === 'bus' && mv.type === 'uturn') wt = 1;
      const cn = mv.conns[Math.min(lane, mv.conns.length - 1)];
      if (net.obstructed(cn.piece) || !net.passable(net.lanePiece(oe, mv.out.dir, cn.outLane))) wt *= 0.0004;
      const on = net.endNode(oe, mv.out.dir);
      if (on.ai.kind === 'exit') wt *= 0.5;
      if (focus && dme > 140) { const m = oe.pts[oe.pts.length >> 1]; if (Math.hypot(m.x - focus.x, m.z - focus.z) > dme) wt *= 0.45; }
      w[i] = wt; tot += wt;
    }
    let r = this.game.rng() * tot, pick = moves[0];
    for (let i = 0; i < moves.length; i++) { r -= w[i]; if (r <= 0) { pick = moves[i]; break; } }
    this.mv = pick;
    const conn = pick.conns[Math.min(lane, pick.conns.length - 1)];
    this.legs.push(conn.piece);
  }

  /** Make sure legs has the current piece, its connector and the lane after it (so the look-ahead can see round the corner). */
  ensureLegs() {
    const net = this.net;
    let guard = 0;
    while (this.legs.length < 3 && guard++ < 4) {
      const last = this.legs[this.legs.length - 1];
      if (last.kind === 'conn') {
        this.legs.push(net.lanePiece(last.conn.outEdge, last.conn.outDir, last.conn.outLane));
      } else {
        if (this.legs.length === 1 && !this.mv) { this.pickMove(); if (this.legs.length === 1) break; continue; }
        break;
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ geometry
  rearPoint(out) {
    const v = this.veh, h = v.heading, b = v.spec.b;
    out.x = v.position.x - Math.sin(h) * b; out.z = v.position.z - Math.cos(h) * b; return out;
  }

  /** Point + tangent at arc distance d ahead of the rear axle (across legs). Returns the piece it lies on via out.leg. */
  pointAhead(d, out) {
    let s = this.s;
    for (let i = 0; i < this.legs.length; i++) {
      const p = this.legs[i], rem = p.len - s;
      if (d <= rem || i === this.legs.length - 1) {
        pieceSample(p, s + d, out, i === 0 ? this.hint : 0); out.leg = p; out.kap = p.kap[out.i];
        if (d > rem) { out.x += out.tx * (d - rem); out.z += out.tz * (d - rem); }
        return out;
      }
      d -= rem; s = 0;
    }
    return out;
  }

  distToLegEnd() { return this.legs[0].len - this.s; }

  /** Front-bumper progress on a connector (negative while still approaching it). */
  frontProgress(conn) {
    const l0 = this.legs[0];
    if (l0 === conn.piece) return this.s + this.fR;
    if (l0.kind === 'lane' && this.legs[1] === conn.piece) return -(l0.len - this.s - this.fR);
    if (this.exitConn === conn.piece) return conn.piece.len + this.s + this.fR;
    return null;
  }

  // ------------------------------------------------------------------------------------------------ tracking
  track() {
    const rp = this._rp || (this._rp = { x: 0, z: 0 });
    this.rearPoint(rp);
    let p = this.legs[0];
    let pj = projectOn(p, rp.x, rp.z, this.hint);
    // advance to the next piece once the rear axle reaches the end
    while (pj.s >= p.len - 0.35 && this.legs.length > 1) {
      if (p.kind === 'conn') this.exitConn = p;
      this.legs.shift(); p = this.legs[0]; this.hint = 0;
      if (p.kind === 'lane') { this.mv = null; this.legs.length = 1; this.pickMove(); this.lcCD = Math.max(this.lcCD, 1.5); this.pass = null; }
      if (this.legs.length < 3) this.ensureLegs();
      pj = projectOn(p, rp.x, rp.z, 0);
      if (p.kind === 'lane') this.onNewLane();
    }
    if (this.legs.length === 1 && p.kind === 'lane' && pj.s + this.fR >= p.len + 2.5 && this.net.endNode(p.edge, p.dir).ai.kind === 'exit') this.done = true;
    this.s = pj.s; this.hint = pj.i; this.lat = pj.lat; this.dist = pj.dist;
  }

  onNewLane() { /* hook: nothing special; junction state released in updateJunction */ }

  // ------------------------------------------------------------------------------------------------ perception
  perceive(dt) {
    const T = this.T, v = this.veh, g = this.game;
    const spd = Math.abs(v.speed);
    const leg = this.legs[0];
    // ---- build look-ahead samples + curvature/limit profile
    const dObs = clamp(9 + spd * 2.7, 14, 52);
    const dCurve = clamp(spd * spd / 3.2 + 14, 20, 75);
    const dMax = Math.max(dObs, dCurve);
    const step = spd > 9 ? 2.2 : 1.6;
    let n = 0;
    let li = 0, ls = this.s + this.fR, hint = this.hint; // start at front bumper
    let leg_ = this.legs[0];
    // walk from the rear axle: front bumper is fR ahead
    const tmp = this._tmp || (this._tmp = { x: 0, z: 0, tx: 0, tz: 0, i: 0 });
    let vProfile = 99;
    const pf = this.speedF;
    let accD = 0;
    // lateral shift (passing / pulling over) applies to the sample corridor
    const shift = this.shift;
    for (let d = 0; d <= dMax && n < MAX_SAMPLES; d += step) {
      // locate piece for arc distance (this.fR + d) from the rear axle
      let rem = this.fR + d, s = this.s, idx = 0;
      while (idx < this.legs.length - 1 && rem > this.legs[idx].len - s) { rem -= this.legs[idx].len - s; s = 0; idx++; }
      const p = this.legs[idx];
      let ss = s + rem, over = 0;
      if (ss > p.len) { over = ss - p.len; ss = p.len; }
      pieceSample(p, ss, tmp, idx === 0 ? this.hint : 0);
      const x = tmp.x + tmp.tx * over, z = tmp.z + tmp.tz * over;
      this.sx[n] = x + tmp.tz * shift; this.sz[n] = z - tmp.tx * shift; this.sd[n] = d; this.stx[n] = tmp.tx; this.stz[n] = tmp.tz;
      n++;
      // speed profile
      const kap = p.kap[tmp.i];
      let vl = p.limit * pf;
      if (p.kind === 'lane') vl *= (p.edge.lanes > 1 ? 0.9 + 0.1 * (p.lane / (p.edge.lanes - 1)) : 1);
      const vk = kap > 1e-3 ? Math.sqrt(this.aLat / kap) : 99;
      if (vk < vl) vl = vk;
      const vReach = Math.sqrt(vl * vl + 2 * 1.9 * d);
      if (vReach < vProfile) vProfile = vReach;
      if (over > 0) break;
    }
    this.nSamp = n; this.vProfile = vProfile;
    // ---- obstacles
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const r = this.hw + 0.32 + Math.min(0.45, spd * 0.028);
    let bestK = -1, bestVeh = null, bestKind = 0, bestPedV = 0;
    const nb = T.neighbors(v.position.x, v.position.z, dObs + 14, T.nbBuf);
    let kLimit = n;
    for (let i = 0; i < nb.length; i++) {
      const o = nb[i]; if (o === v) continue;
      const b = o._tb; if (!b) continue;
      const c = Math.cos(b.rot), sn = Math.sin(b.rot);
      const lim = bestK >= 0 ? bestK : kLimit;
      for (let k = 0; k < lim; k++) {
        const dx = this.sx[k] - b.cx, dz = this.sz[k] - b.cz;
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        const ex = Math.max(Math.abs(lx) - b.hw, 0), ez = Math.max(Math.abs(lz) - b.hd, 0);
        if (ex * ex + ez * ez < r * r) {
          if (this.sd[k] > dObs) break;
          if (this.pass && o === this.pass.veh && this.shift < -0.5) break;      // being passed on purpose
          bestK = k; bestVeh = o; bestKind = 1; break;
        }
      }
    }
    const peds = g.peds;
    if (peds && peds.length) {
      for (let i = 0; i < peds.length; i++) {
        const pd = peds[i]; if (!pd || !pd.position) continue;
        const px = pd.position.x, pz = pd.position.z;
        const ddx = px - v.position.x, ddz = pz - v.position.z;
        if (ddx > dObs + 6 || ddx < -dObs - 6 || ddz > dObs + 6 || ddz < -dObs - 6) continue;
        if (ddx * fx + ddz * fz < -2) continue;
        const rr = r + (pd.radius || 0.35) + 0.15;
        const lim = bestK >= 0 ? bestK : kLimit;
        for (let k = 0; k < lim; k++) {
          const dx = this.sx[k] - px, dz = this.sz[k] - pz;
          if (dx * dx + dz * dz < rr * rr) { if (this.sd[k] > dObs) break; bestK = k; bestVeh = pd; bestKind = 2; break; }
        }
      }
    }
    if (bestK >= 0) {
      const o = bestVeh;
      const vx = o.velocity ? o.velocity.x : 0, vz = o.velocity ? o.velocity.z : 0;
      this.gapObs = Math.max(0, this.sd[bestK] - r * 0.55);
      this.vObs = Math.max(0, vx * this.stx[bestK] + vz * this.stz[bestK]);
      if (bestKind === 2) this.vObs = Math.min(this.vObs, 0.0);
      this.obsVeh = o; this.obsKind = bestKind;
    } else { this.gapObs = Infinity; this.vObs = 0; this.obsVeh = null; this.obsKind = 0; }
    this.obsStamp = g.time; this.obsTravel = 0;
    // ---- junction
    this.updateJunction();
  }

  // ------------------------------------------------------------------------------------------------ junction handling
  updateJunction() {
    const jn = this.jn, l0 = this.legs[0], l1 = this.legs[1];
    this.stopDist = Infinity;
    if (this.occs.length) this.T.arb.leaveCheck(this);
    if (l0.kind === 'conn') {
      if (jn.state === 'wait') this.T.arb.cancel(this);
      jn.state = 'inside'; return;
    }
    if (!(l1 && l1.kind === 'conn')) {
      if (jn.state === 'wait' || jn.state === 'granted') this.T.arb.cancel(this);
      jn.state = 'none'; jn.conn = null;
      return;
    }
    const conn = l1.conn, node = conn.node;
    if (jn.conn !== conn) {
      if (jn.state === 'wait' || jn.state === 'granted') this.T.arb.cancel(this);
      jn.conn = conn; jn.node = node; jn.state = 'wait'; jn.since = this.game.time; jn.req = false; jn.wait = 0;
      this.T.arb.register(this);
    }
    const margin = this.net.stopMargin(l0.edge, l0.dir);
    this.dStop = l0.len - this.s - this.fR - margin;
    if (jn.state === 'granted') return;
    const v = Math.abs(this.veh.speed);
    const reqDist = Math.max(8, v * v / 6 + 8);
    // only the head of the queue asks
    const headOfQueue = !(this.gapObs < this.dStop + 4 && this.obsVeh && this.obsKind === 1);
    jn.req = this.dStop < reqDist && headOfQueue;
    if (jn.req) this.T.arb.request(this);
    if (jn.state !== 'granted') {
      // cannot stop any more -> committed regardless
      if (this.dStop < -0.8 && v > 1.2) { this.T.stats.forced = (this.T.stats.forced || 0) + 1; this.T.arb.forceGrant(this); return; }
      this.stopDist = Math.max(0.05, this.dStop);
    }
  }

  // ------------------------------------------------------------------------------------------------ control
  update(dt) {
    const v = this.veh, T = this.T, g = this.game;
    this.age += dt;
    if (this.done || this.dead) return;
    this.track();
    if (this.perceiveCD-- <= 0) { this.perceive(dt); this.perceiveCD = 3; }
    else this.obsTravel += Math.abs(v.speed) * dt;
    const spd = v.speed, aspd = Math.abs(spd);
    // ---------------- lateral shift (pass / pull-over) ramp
    if (this.shift !== this.shiftTarget) { const d = this.shiftTarget - this.shift, st = 1.3 * dt; this.shift += Math.abs(d) < st ? d : Math.sign(d) * st; }

    // ---------------- longitudinal: IDM
    let v0 = Math.min(this.vProfile, 99);
    const l0 = this.legs[0];
    if (this.react && this.react.type === 'flee') v0 = Math.min(v0 * 1.3, 20);
    let a = Infinity, reason = '';
    const prof = this.prof;
    const vv0 = Math.max(v0, 0.3);
    const aFree = prof.aMax * (1 - Math.pow(aspd / vv0, 4));
    a = aFree;
    const sq = Math.sqrt(prof.aMax * prof.b);
    // obstacle ahead (gap shrinks as we travel between perceptions)
    if (this.gapObs < Infinity) {
      const gap = Math.max(0.15, this.gapObs - this.obsTravel);
      const sStar = this.s0 + Math.max(0, aspd * this.TH + aspd * (aspd - this.vObs) / (2 * sq));
      const ai = prof.aMax * (1 - Math.pow(aspd / vv0, 4) - (sStar / gap) * (sStar / gap));
      if (ai < a) { a = ai; reason = this.obsKind === 1 && this.obsVeh && this.obsVeh.ai ? 'queue' : 'obstacle'; }
    }
    // stop line
    if (this.stopDist < Infinity) {
      const gap = Math.max(0.1, this.stopDist - this.obsTravel * 1.0);
      const sStar = 0.9 + Math.max(0, aspd * 1.0 + aspd * aspd / (2 * sq));
      const ai = prof.aMax * (1 - Math.pow(aspd / vv0, 4) - (sStar / gap) * (sStar / gap));
      if (ai < a) { a = ai; reason = 'junction'; }
    }
    // pull over / reaction stop
    if (this.pull) { const ai = this.pullAccel(aspd); if (ai < a) { a = ai; reason = 'pull'; } }
    if (this.react && this.react.type === 'stop') { const ai = -3.5; if (ai < a) { a = ai; reason = 'react'; } }
    a = clamp(a, -9, prof.aMax);
    this.aCmd = a; this.waitReason = reason;

    // ---------------- throttle / brake
    let thr = 0, brk = 0, hb = false;
    const aMeasRaw = (spd - this.vPrev) / dt; this.vPrev = spd;
    this.aMeas += (aMeasRaw - this.aMeas) * 0.12;
    const wantStop = (reason === 'junction' || reason === 'obstacle' || reason === 'queue' || reason === 'pull' || reason === 'react') && a < 0.15;
    if (this.reverseT > 0) {
      this.reverseT -= dt; thr = 0; brk = 0.55; this.thr = 0;
      this.control(thr, brk, 0, false, spd, true);
      return;
    }
    if (wantStop && aspd < 0.9 && a < 0.05) { hb = true; this.thr = 0; this.hold = true; }
    else {
      this.hold = false;
      if (a < -0.35) {
        brk = clamp((-a - 0.1) / (v.spec.brakeG * G * 0.85), 0, 1); this.thr = 0;
        if (aspd < 0.9) { brk = 0; hb = true; }
      } else {
        this.thr = clamp(this.thr + 1.1 * (a - this.aMeas) * dt + (a > 0.4 && this.thr < 0.12 ? 0.02 : 0), 0, 1);
        if (a < 0.02 && aspd < 0.5) this.thr = 0;
        thr = this.thr;
        // standing start: kick the integrator
        if (a > 0.3 && aspd < 1.5 && thr < 0.25) { this.thr = 0.25; thr = 0.25; }
      }
    }
    // rolling backwards by accident (shunted): the brake pedal would reverse the car further, so use the handbrake
    if (spd < -0.4 && (brk > 0 || hb)) { brk = 0; hb = true; thr = 0; }
    this.control(thr, brk, 0, hb, spd, false);
  }

  pullAccel(aspd) {
    // stop within ~ 18 m of when the pull-over started
    const p = this.pull; const rem = Math.max(0.5, p.dist - (this.s - p.s0));
    const sq = Math.sqrt(this.prof.aMax * this.prof.b);
    const sStar = 1 + aspd * 0.6 + aspd * aspd / (2 * sq);
    return this.prof.aMax * (1 - Math.pow(aspd / 6, 4) - (sStar / rem) * (sStar / rem));
  }

  /** Pure pursuit + write the controls. */
  control(thr, brk, _unused, hb, spd, reversing) {
    const v = this.veh;
    let steer = 0;
    if (!reversing) {
      const aspd = Math.abs(spd);
      const Ld = clamp(2.8 + 0.55 * aspd, Math.max(3.8, this.L * 1.25), 14);
      const T = this._pp || (this._pp = { x: 0, z: 0, tx: 0, tz: 0, i: 0, leg: null, kap: 0 });
      this.pointAhead(Ld, T);
      // tight bends: shorten the look-ahead so the car does not cut the corner
      const l0 = this.legs[0];
      const kap = Math.max(T.kap || 0, l0.kap[Math.min(this.hint, l0.n - 1)] || 0);
      if (kap > 0.025) {
        const Ld2 = Math.max(Ld * (1 - Math.min(0.5, (kap - 0.025) * 7)), Math.max(3.0, this.L * 1.1));
        if (Ld2 < Ld - 0.2) this.pointAhead(Ld2, T);
      }
      let tx = T.x + T.tz * this.shift, tz = T.z - T.tx * this.shift;
      const rp = this._rp;
      const dx = tx - rp.x, dz = tz - rp.z;
      const h = v.heading, sh = Math.sin(h), ch = Math.cos(h);
      const along = dx * sh + dz * ch, left = dx * ch - dz * sh;
      const alpha = Math.atan2(left, along);
      const dist = Math.hypot(dx, dz) || 1;
      const delta = Math.atan2(2 * this.L * Math.sin(alpha), dist);   // wheel angle, left positive
      const lim = steerLimit(v.spec, spd);
      steer = clamp(-delta / lim, -1, 1);
      this.steerCmd = steer;
    }
    v.setControls({ throttle: thr, brake: brk, steer, handbrake: hb });
  }

  // ------------------------------------------------------------------------------------------------ misc
  eject() { this.T.eject(this); }
  /** Approx. bumper-to-bumper stopping state for the arbiter. */
  get speedAbs() { return Math.abs(this.veh.speed); }
  get length() { return this.veh.spec.length; }

  /** Release the AI (recycle, eject, destroy). */
  release() {
    this.dead = true;
    this.T.arb.cancel(this, true);
    if (this.veh.ai === this) this.veh.ai = null;
  }
}
