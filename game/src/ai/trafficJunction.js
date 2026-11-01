// Junction arbiter (Traffic-owned). Cars ask for permission when they are within braking distance of their stop line.
// A request is granted when
//   - the signal (if the node has one) allows it,
//   - the exit lane has room for the car (never block the box),
//   - for every committed car (and every uncommitted car that has priority / cannot stop any more) the time windows in which
//     the two connector paths are occupied do not overlap (gap acceptance; roundabouts: circulating cars are committed, so
//     entering cars yield to them).
// Granted cars may enter; the grant is never revoked, so the plan is collision-free by construction. Drivers still brake for
// anything physically in front of them (OBB look-ahead), which also covers the player and rule-breakers.
import { TrafficNet, KIND_RANK, projectOn } from './trafficNet.js';
import { RED, YELLOW } from './signals.js';

const tAccel = (d, v, a, vm) => {
  if (d <= 0) return 0;
  vm = Math.max(vm, v + 0.5);
  const dAcc = (vm * vm - v * v) / (2 * a);
  if (d <= dAcc) return (-v + Math.sqrt(v * v + 2 * a * d)) / a;
  return (vm - v) / a + (d - dAcc) / vm;
};

export class Arbiter {
  constructor(T) { this.T = T; this.nodes = new Set(); this.grants = 0; this.denials = 0; this._acc = 0; }

  register(drv) {
    const n = drv.jn.node; if (!n) return;
    if (!n.ai.waiters) { n.ai.waiters = new Set(); n.ai.committedMap = new Map(); }
    n.ai.waiters.add(drv); this.nodes.add(n);
  }
  request(drv) { drv.jn.req = true; }

  cancel(drv, final = false) {
    const jn = drv.jn, n = jn.node;
    if (n && n.ai.waiters) n.ai.waiters.delete(drv);
    if (jn.state === 'granted' && jn.conn) this._uncommit(drv, n);
    if (final) for (const o of drv.occs.slice()) this._uncommit(drv, o.node);
    jn.state = 'none'; jn.req = false;
  }
  _uncommit(drv, n) {
    if (n && n.ai.committedMap) n.ai.committedMap.delete(drv);
    drv.occs = drv.occs.filter((o) => o.node !== n);
  }
  leaveCheck(drv) {
    for (let i = drv.occs.length - 1; i >= 0; i--) {
      const o = drv.occs[i];
      const fp = drv.frontProgress(o.conn);
      if (fp === null || fp - drv.length > o.conn.piece.len + 0.4) this._uncommit(drv, o.node);
    }
  }
  _grant(drv) {
    const jn = drv.jn, n = jn.node;
    if (n.ai.waiters) n.ai.waiters.delete(drv);
    n.ai.committedMap.set(drv, jn.conn);
    drv.occs.push({ node: n, conn: jn.conn });
    jn.state = 'granted'; this.grants++;
  }
  forceGrant(drv) { if (drv.jn.state === 'wait') { if (!drv.jn.node.ai.committedMap) this.register(drv); this._grant(drv); } }

  score(d) {
    const c = d.jn.conn;
    return 3 * (KIND_RANK[c.inEdge.kind] || 0) + c.move.rank + Math.min(10, d.jn.wait) * 0.5 + (d.veh.type === 'bus' ? 0.4 : 0);
  }
  forced(d) { const v = d.speedAbs; return d.dStop < v * v / 9 + 1.2; }

  update(dt) {
    this._acc += dt;
    for (const n of this.nodes) {
      const ws = n.ai.waiters;
      if (!ws || !ws.size) { if (!n.ai.committedMap || !n.ai.committedMap.size) this.nodes.delete(n); continue; }
      // waiting time bookkeeping
      for (const d of ws) { if (d.dStop < 7 && d.speedAbs < 1.0) d.jn.wait += dt; }
      const reqs = [];
      for (const d of ws) {
        if (d.dead || d.jn.node !== n || d.jn.state !== 'wait' || !d.jn.conn) { ws.delete(d); continue; }
        if (d.jn.req) reqs.push(d);
      }
      if (!reqs.length) continue;
      if (reqs.length > 1) reqs.sort((a, b) => this.score(b) - this.score(a));
      for (const A of reqs) {
        if (A.jn.state !== 'wait') continue;
        if (this.canEnter(A, n)) this._grant(A); else this.denials++;
      }
    }
  }

  canEnter(A, n) {
    const cA = A.jn.conn, T = this.T;
    // 1. signal
    const sig = T.signals ? T.signals.state(n, TrafficNet.akey(cA.inEdge, cA.inDir)) : null;
    if (sig) {
      if (sig.s === RED) return false;
      if (sig.s === YELLOW) { const v = A.speedAbs; if (A.dStop > v * v / 6.4 + 0.3) return false; }
    }
    // 2. room to leave the box
    if (!this.exitClear(A, cA)) return false;
    // 3. conflicts
    for (const [B, cB] of n.ai.committedMap) { if (B !== A && this.conflict(A, cA, B, cB)) return false; }
    for (const B of n.ai.waiters) {
      if (B === A || !B.jn.conn || B.dStop > 70) continue;
      if (!(this.forced(B) || this.score(B) > this.score(A) || (this.score(B) === this.score(A) && B.jn.since < A.jn.since))) continue;
      if (this.conflict(A, cA, B, B.jn.conn)) return false;
    }
    return true;
  }

  conflict(A, cA, B, cB) {
    const zA = cA.conflicts.get(cB); if (!zA) return false;
    const zB = cB.conflicts.get(cA);
    const fpB = B.frontProgress(cB); if (fpB === null) return false;
    const fpA = -(A.dStop + A.net.stopMargin(cA.inEdge, cA.inDir));
    const par = zA.par;
    const dOutB = (par ? zB.start : zB.end) + B.length - fpB;
    if (dOutB <= 0) return false;
    const dInB = zB.start - fpB;
    const dInA = zA.start - fpA, dOutA = (par ? zA.start : zA.end) + A.length - fpA;
    const vA = A.speedAbs, vBs = B.speedAbs, vB = Math.max(vBs, 1.4);
    const vm = Math.min(cA.piece.limit, 7.5);
    // earliest entry / latest exit for both cars (conservative window overlap)
    const tInA = tAccel(dInA, vA, 1.8, vm), tOutA = tAccel(dOutA, vA, 1.1, vm * 0.8);
    const tInB = tAccel(Math.max(0, dInB), vBs, 1.8, vm), tOutB = dOutB / vB;
    const m = par ? 1.6 : 1.15;
    return tInA < tOutB + m && tInB < tOutA + m;
  }

  exitClear(A, cA) {
    const T = this.T;
    const outP = T.net.lanePiece(cA.outEdge, cA.outDir, cA.outLane);
    const need = A.length + 3.5;
    const nb = T.neighbors(outP.pts[0], outP.pts[1], need + 6, T.nbBuf2);
    for (let i = 0; i < nb.length; i++) {
      const o = nb[i]; if (o === A.veh) continue;
      if (Math.abs(o.speed) > 2.2 && !o.parked) continue;
      const pj = projectOn(outP, o.position.x, o.position.z, 0);
      if (pj.s < need && Math.abs(pj.lat) < 2.1 && pj.dist < 6) return false;
    }
    return true;
  }
}
