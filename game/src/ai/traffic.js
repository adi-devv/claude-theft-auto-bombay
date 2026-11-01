// Traffic system (Traffic-owned): population management, parked cars, signals, reactions, deadlock recovery, debug.
//   createTraffic(game) -> { update(dt), ... }   (CONTRACT.md "Traffic")
// Files: trafficNet.js (lane network), trafficDriver.js (per-car AI), trafficJunction.js (arbiter), signals.js (lights).
import { TrafficNet, KIND_SPEED, projectOn, pieceSample } from './trafficNet.js';
import { Driver } from './trafficDriver.js';
import { Arbiter } from './trafficJunction.js';
import { createSignals } from './signals.js';
import { bodyBox } from '../vehicles/physics.js';
import { obbOverlap } from '../world/collision.js';
import { SPAWN } from '../world/mapdata.js';

const CELL = 24;
const TARGET_MOVING = 40;
const MAX_BUSES = 4;
const RING_MAX = 255;      // despawn beyond (m) if not visible... hard limit below
const RING_HARD = 300;
const SPAWN_MIN = 120, SPAWN_MAX = 235;
const PARK_SPAWN = 195, PARK_DESPAWN = 250;
const KIND_W = { boulevard: 3.0, arterial: 1.5, street: 0.55, lane: 0.3 };
const TYPE_W = [['taxi', 0.40], ['hatch', 0.14], ['sedan', 0.17], ['suv', 0.10], ['van', 0.08], ['bus', 0.06]];
const PARK_W = [['taxi', 0.28], ['hatch', 0.27], ['sedan', 0.2], ['suv', 0.1], ['van', 0.15]];

export function createTraffic(game) {
  const { THREE } = game;
  const rng = game.rng;
  const net = new TrafficNet(game.roads, rng);
  net.collision = game.collision;
  const T = {
    game, net, signals: null, arb: null,
    drivers: [], parked: [], abandoned: [],
    nbBuf: [], nbBuf2: [], grid: new Map(),
    time: 0, tick: 0, foci: [], seeded: false, lastFocus: null,
    stats: { spawned: 0, despawned: 0, recycled: 0, ejected: 0, honks: 0, aiHits: 0, hardHits: 0, perfMs: 0, perfMax: 0, perfN: 0 },
    hitLog: [], overlapPairs: new Set(), stuck: 0, why: {},
  };
  T.arb = new Arbiter(T);
  T.signals = createSignals(game, net);

  // ---------------------------------------------------------------- foci / visibility
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
  let frustumT = -1;
  function updateFoci() {
    const f = T.foci; f.length = 0;
    const p = game.player && game.player.position ? game.player.position : SPAWN;
    f.push({ x: p.x, z: p.z });
    const c = game.camera.position;
    if (Math.hypot(c.x - p.x, c.z - p.z) > 110) f.push({ x: c.x, z: c.z, cam: true });
  }
  T.focusNear = (x, z) => {
    let best = null, bd = Infinity;
    for (const f of T.foci) { const d = (f.x - x) ** 2 + (f.z - z) ** 2; if (d < bd) { bd = d; best = f; } }
    return best;
  };
  const distFocus = (x, z) => { let bd = Infinity; for (const f of T.foci) { const d = (f.x - x) ** 2 + (f.z - z) ** 2; if (d < bd) bd = d; } return Math.sqrt(bd); };
  function updateFrustum() {
    if (T.time - frustumT < 0.2) return; frustumT = T.time;
    const cam = game.camera; cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
  }
  function visible(x, z, r = 6) {
    sph.center.set(x, 1.5, z); sph.radius = r;
    return frustum.intersectsSphere(sph);
  }
  T.visible = visible;

  // ---------------------------------------------------------------- spatial grid of every vehicle
  const key = (gx, gz) => (gx + 1024) * 4096 + (gz + 1024);
  function gridAdd(v) {
    v._tb = bodyBox(v, v._tb || {});
    const k = key(Math.floor(v.position.x / CELL), Math.floor(v.position.z / CELL));
    let a = T.grid.get(k); if (!a) T.grid.set(k, (a = []));
    a.push(v);
  }
  function rebuildGrid() {
    for (const arr of T.grid.values()) arr.length = 0;
    for (const v of game.vehicles) if (!v._removed) gridAdd(v);
  }
  T.neighbors = (x, z, r, out) => {
    out.length = 0;
    const g0x = Math.floor((x - r - 6) / CELL), g1x = Math.floor((x + r + 6) / CELL), g0z = Math.floor((z - r - 6) / CELL), g1z = Math.floor((z + r + 6) / CELL);
    for (let gx = g0x; gx <= g1x; gx++) for (let gz = g0z; gz <= g1z; gz++) {
      const a = T.grid.get(key(gx, gz)); if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const v = a[i], dx = v.position.x - x, dz = v.position.z - z, rr = r + 6;
        if (dx * dx + dz * dz <= rr * rr) out.push(v);
      }
    }
    return out;
  };

  // ---------------------------------------------------------------- spawning
  const edgeW = []; let edgeWTot = 0;
  for (const e of game.roads.edges) { const w = e.length * e.lanes * 2 * (KIND_W[e.kind] || 0.3); edgeW.push(w); edgeWTot += w; }
  const pickWeighted = (list) => { let r = rng() * list.reduce((s, x) => s + x[1], 0); for (const [k, w] of list) { r -= w; if (r <= 0) return k; } return list[0][0]; };
  let busCount = 0;

  function drvCountOnEdge(e, dir) { let n = 0; for (const d of T.drivers) { const l = d.legs[0]; if (l.kind === 'lane' && l.edge === e && l.dir === dir) n++; } return n; }

  function trySpawnMoving(minD, maxD, needHidden) {
    const roads = game.roads;
    // pick an edge by weight
    let r = rng() * edgeWTot, ei = 0;
    for (; ei < edgeW.length - 1; ei++) { r -= edgeW[ei]; if (r <= 0) break; }
    const e = roads.edges[ei];
    const dir = rng() < 0.5 ? 1 : -1, lane = Math.floor(rng() * e.lanes);
    const piece = net.lanePiece(e, dir, lane);
    if (piece.len < 24) return null;
    if (!net.passable(piece)) return null;
    // keep clear of exits and junction ends
    const endNode = net.endNode(e, dir);
    let p0 = 7 + rng() * (piece.len - 14), ex = endNode.ai.kind === 'exit' ? 40 : 14;
    if (p0 > piece.len - ex) return null;
    const S = pieceSample(piece, p0, {});
    const d = distFocus(S.x, S.z);
    if (d < minD || d > maxD) return null;
    if (needHidden && d < 150 && visible(S.x, S.z, 7)) return null;
    // capacity of the lane group
    if (drvCountOnEdge(e, dir) >= Math.ceil(e.length / 20) * e.lanes) return null;
    // type
    let type = pickWeighted(TYPE_W);
    if (type === 'bus') { if (busCount >= MAX_BUSES || !(e.kind === 'boulevard' || e.kind === 'arterial')) type = 'taxi'; }
    const len = type === 'bus' ? 11 : 4.6;
    // space around: nothing within (len + gap) in front / behind, nothing at all within 6 m
    const nb = T.neighbors(S.x, S.z, 30, T.nbBuf2);
    for (let i = 0; i < nb.length; i++) {
      const o = nb[i]; const dx = o.position.x - S.x, dz = o.position.z - S.z, dd = Math.hypot(dx, dz);
      if (dd < len + 5) return null;
      const along = dx * S.tx + dz * S.tz;
      if (dd < 34 && Math.abs(dx * S.tz - dz * S.tx) < 2.4 && Math.abs(along) < 30) return null;
    }
    const heading = Math.atan2(S.tx, S.tz);
    const v = game.createVehicle({ type, x: S.x, z: S.z, heading });
    const drv = new Driver(T, v, piece, p0);
    attach(drv);
    if (type === 'bus') busCount++;
    const v0 = Math.min(piece.limit * drv.speedF * 0.7, 14);
    v.velocity.set(Math.sin(heading) * v0, 0, Math.cos(heading) * v0);
    seedGear(v);
    v.wake();
    T.stats.spawned++;
    return drv;
  }
  function seedGear(v) {
    try {
      const s = v.spec, spd = Math.abs(v.speed), rpmPerMs = 60 / (2 * Math.PI * s.wheelR) * s.final;
      let g = 0; while (g < s.gears.length - 1 && spd * rpmPerMs * s.gears[g] > s.shiftUp * 0.8) g++;
      v.ph.gear = g; v.ph.rpm = Math.max(s.idle, spd * rpmPerMs * s.gears[g]);
    } catch (_) { /* cosmetic */ }
  }
  function attach(drv) {
    drv.veh.ai = drv; drv.veh.driver = drv; gridAdd(drv.veh);
    T.drivers.push(drv);
  }

  // ---------------------------------------------------------------- parked cars
  function parkedUpdate(seed) {
    const spots = net.parkingSpots; let madeP = 0;
    // spawn
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      if (sp.vehicle || !sp.occupied || sp.seed > 0.31) continue;
      if (seed && madeP >= 3) break;
      const d = distFocus(sp.x, sp.z);
      if (d > PARK_SPAWN) continue;
      if (!seed && d < 140 && visible(sp.x, sp.z, 6)) continue;
      // not on top of anything
      const nb = T.neighbors(sp.x, sp.z, 4, T.nbBuf2); let clash = false;
      for (const o of nb) if (Math.hypot(o.position.x - sp.x, o.position.z - sp.z) < 4.5) { clash = true; break; }
      if (clash) continue;
      const k = (sp.seed * 997) % 1; let type = 'sedan'; { let acc = 0; for (const [t, w] of PARK_W) { acc += w; if (k < acc) { type = t; break; } } }
      const v = game.createVehicle({ type, x: sp.x, z: sp.z, heading: sp.heading, parked: true });
      v.driver = null; v._parkSpot = sp; sp.vehicle = v;
      T.parked.push(v); gridAdd(v); madeP++;
    }
    // despawn / release
    for (let i = T.parked.length - 1; i >= 0; i--) {
      const v = T.parked[i], sp = v._parkSpot;
      if (v._removed) { sp.vehicle = null; T.parked.splice(i, 1); continue; }
      const moved = Math.hypot(v.position.x - sp.x, v.position.z - sp.z) > 1.8;
      if (v.driver || moved || v.wrecked || v.onFire) {
        // stolen / bumped away / burning: it is the world's problem now (recycled when far away)
        sp.vehicle = null; sp.occupied = false; T.parked.splice(i, 1);
        if (!v.driver) T.abandoned.push({ veh: v, t: T.time, parkedAway: true });
        continue;
      }
      if (distFocus(v.position.x, v.position.z) > PARK_DESPAWN && !visible(v.position.x, v.position.z, 6)) {
        v.destroy(); sp.vehicle = null; T.parked.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- removal / eject
  function removeDriver(drv, destroy = true, why = 'ring') {
    T.why[why] = (T.why[why] || 0) + 1;
    drv.release();
    const i = T.drivers.indexOf(drv); if (i >= 0) T.drivers.splice(i, 1);
    const v = drv.veh;
    if (v.type === 'bus') busCount = Math.max(0, busCount - 1);
    if (v.driver === drv) v.driver = null;
    if (destroy) { v.destroy(); T.stats.despawned++; }
  }
  T.eject = (drv) => {
    const v = drv.veh;
    if (drv.dead) return;
    const i = T.drivers.indexOf(drv);
    drv.release(); if (i >= 0) T.drivers.splice(i, 1);
    if (v.type === 'bus') busCount = Math.max(0, busCount - 1);
    v.driver = null; v.ai = null;
    v.horn(false);
    const sp = Math.abs(v.speed);
    v.setControls({ throttle: 0, brake: 0, steer: 0, handbrake: sp < 2 });
    T.stats.ejected++;
    T.abandoned.push({ veh: v, t: T.time });
    try {
      const d = v.driverDoor();
      const ped = game.pedSystem && game.pedSystem.spawnPed && game.pedSystem.spawnPed({ x: d.x, z: d.z, heading: v.heading - Math.PI / 2, kind: 'driver' });
      if (ped && ped.panic) ped.panic(v.position.x, v.position.z);
    } catch (e) { console.warn('traffic eject ped', e); }
  };

  function abandonedUpdate() {
    const pv = game.player && game.player.vehicle;
    for (let i = T.abandoned.length - 1; i >= 0; i--) {
      const a = T.abandoned[i], v = a.veh;
      if (v._removed) { T.abandoned.splice(i, 1); continue; }
      if (v.driver || v === pv) { T.abandoned.splice(i, 1); continue; }   // somebody else's car now
      const d = distFocus(v.position.x, v.position.z), age = T.time - a.t;
      if (d > 290 || (d > 200 && !visible(v.position.x, v.position.z, 8)) || (age > 60 && d > 90 && !visible(v.position.x, v.position.z, 8)) || (age > 240 && d > 40)) {
        v.destroy(); T.abandoned.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- reactions
  game.events.on('vehicleCollision', (e) => {
    const A = e.a && e.a.ai instanceof Driver ? e.a.ai : null, B = e.b && e.b.ai instanceof Driver ? e.b.ai : null;
    if (A && B) { T.stats.hardHits++; return; }
    const player = game.player && game.player.vehicle;
    const other = (A ? e.b : e.a), drv = A || B;
    if (drv && e.impulse > 700) {
      const byPlayer = other === player || other.driver === 'player';
      const r = rng();
      drv.react = { type: byPlayer ? (r < 0.35 ? 'flee' : r < 0.6 ? 'stop' : 'angry') : 'angry', until: T.time + (4 + rng() * 4) };
      drv.hornT = 1.2 + rng();
      drv.veh.horn(true);
    }
  });

  function sirenUpdate() {
    const sirens = [];
    for (const v of game.vehicles) if (v.sirenOn && !v.wrecked) sirens.push(v);
    for (const d of T.drivers) {
      const v = d.veh;
      let hit = null;
      for (const s of sirens) {
        if (s === v) continue;
        const dx = s.position.x - v.position.x, dz = s.position.z - v.position.z, dist = Math.hypot(dx, dz);
        if (dist > 48) continue;
        const f = v.forward, along = dx * f.x + dz * f.z;
        const sf = s.forward, same = sf.x * f.x + sf.z * f.z;
        const lat = Math.abs(dx * f.z - dz * f.x);
        if (along < 3 && same > 0.2 && lat < 14) { hit = s; break; }       // behind me going the same way
        if (dist < 22 && same > 0.2) { hit = s; break; }
      }
      if (hit && !d.pull) {
        const l0 = d.legs[0];
        if (l0.kind === 'lane' && d.distToLegEnd() > 22 && d.jn.state !== 'inside') {
          const lw = l0.edge.laneWidth || 3.4;
          d.pull = { s0: d.s, dist: Math.min(d.distToLegEnd() - 12, 10 + Math.abs(v.speed) * 1.6), until: T.time + 3 };
          d.shiftTarget = Math.max(0.15, Math.min(1.2, lw / 2 - d.hw - 0.25));
        }
      } else if (hit && d.pull) d.pull.until = T.time + 2.5;
      else if (d.pull && T.time > d.pull.until) { d.pull = null; d.shiftTarget = 0; }
    }
  }

  // ---------------------------------------------------------------- honking
  let lastHorn = -9;
  function honk(d, dur = 0.35) {
    const cam = game.camera.position, v = d.veh;
    if (Math.hypot(v.position.x - cam.x, v.position.z - cam.z) > 160) return;
    if (T.time - lastHorn < 0.18) return;
    lastHorn = T.time; d.hornT = dur; T.stats.honks++;
    v.horn(true);
  }
  T.honk = honk;
  function hornUpdate(dt) {
    for (const d of T.drivers) {
      if (d.hornT > 0) { d.hornT -= dt; if (d.hornT <= 0) d.veh.horn(false); continue; }
      d.hornCD -= dt;
      if (d.hornCD <= 0) {
        d.hornCD = 6 + rng() * 14;
        // Bombay: honk a lot when close behind someone slow / pedestrians in the road
        if (d.gapObs < 7 && d.obsVeh && (d.waitReason === 'obstacle' || d.waitReason === 'queue') && Math.abs(d.veh.speed) < 3 && rng() < 0.45) honk(d, 0.25 + rng() * 0.3);
        else if (d.obsKind === 2 && d.gapObs < 12 && rng() < 0.5) honk(d, 0.2);
        else if (rng() < 0.03 && Math.abs(d.veh.speed) > 3) honk(d, 0.2);
      }
    }
  }

  // ---------------------------------------------------------------- watchdog: blocked cars, deadlocks, recovery
  function laneClearForPass(d, obs) {
    // oncoming lane must be empty for ~60 m ahead
    const v = d.veh, f = v.forward;
    const nb = T.neighbors(v.position.x + f.x * 25, v.position.z + f.z * 25, 45, T.nbBuf2);
    for (const o of nb) {
      if (o === v || o === obs) continue;
      const dx = o.position.x - v.position.x, dz = o.position.z - v.position.z;
      const along = dx * f.x + dz * f.z, lat = dx * f.z - dz * f.x;
      if (along > -6 && along < 70 && Math.abs(lat) < 9) {
        const of = o.forward; const same = of.x * f.x + of.z * f.z;
        if (Math.abs(o.speed) < 0.5 && Math.abs(lat) > 5.5) continue;      // a parked car on the far kerb
        if (same < -0.3 || Math.abs(o.speed) < 0.5) return false;
      }
    }
    return true;
  }
  function rootOf(d) {
    let cur = d, hops = 0; const seen = new Set();
    while (hops++ < 14) {
      if (seen.has(cur)) return { root: cur, cycle: true };
      seen.add(cur);
      const o = cur.obsVeh;
      if (cur.waitReason === 'queue' && o && o.ai instanceof Driver && o.ai !== cur) { cur = o.ai; continue; }
      break;
    }
    return { root: cur, cycle: false };
  }
  function watchdog() {
    let stuck = 0;
    for (let i = T.drivers.length - 1; i >= 0; i--) {
      const d = T.drivers[i], v = d.veh;
      if (Math.abs(v.speed) < 0.35) d.stoppedT += 1; else { d.stoppedT = 0; d.blockedT = 0; }
      const vis = visible(v.position.x, v.position.z, 8);
      const far = distFocus(v.position.x, v.position.z);
      // lost the road?
      if (d.dist > 5.5 || Math.abs(d.lat) > 5) d.offT++; else d.offT = 0;
      if (d.offT >= 3) { if (!recover(d)) { if (!vis || far > 60) { removeDriver(d, true, 'offroad'); T.stats.recycled++; } } continue; }
      if (v.wrecked || v.health <= 0 || v.onFire) { T.eject(d); continue; }
      if (d.stoppedT > 3) {
        const { root, cycle } = rootOf(d);
        const sig = root.jn.node && root.jn.state === 'wait' && root.jn.conn && T.signals.state(root.jn.node, TrafficNet.akey(root.jn.conn.inEdge, root.jn.conn.inDir));
        const legit = (sig && sig.s !== 0) || (root.waitReason === 'junction' && root.jn.wait < 20 && root.stoppedT < 25) || d.pull || (d.react && d.react.type === 'stop');
        if (cycle) { d.blockedT += 2; }
        else if (!legit) d.blockedT += 1;
        if (d.stoppedT > 20 && !legit) stuck++;
        const bt = d.blockedT;
        if (bt >= 3 && bt < 40 && (d.waitReason === 'obstacle' || d.waitReason === 'queue') && !d.hornT && d.stoppedT % 4 === 0) honk(d, 0.5);
        if (bt >= 6 && d.waitReason === 'obstacle' && d.obsVeh && !d.pass && d.legs[0].kind === 'lane' && Math.abs(d.obsVeh.speed || 0) < 0.4 && d.obsKind === 1) tryPass(d);
        if (bt >= 14 && bt < 17 && !d.reverseT && rearClear(d)) d.reverseT = 1.4;
        if (bt >= 45 && (!vis || far > 80)) { removeDriver(d, true, 'blocked45'); T.stats.recycled++; continue; }
        if (bt >= 100) { removeDriver(d, true, 'blocked100'); T.stats.recycled++; continue; }
        if (root.waitReason === 'junction' && root.jn.state === 'wait' && root.jn.wait > 35) T.arb.forceGrant(root);
      } else d.blockedT = Math.max(0, d.blockedT - 1);
      if (d.react && T.time > d.react.until) d.react = null;
    }
    T.stuck = stuck;
  }
  function rearClear(d) {
    const v = d.veh, f = v.forward;
    const nb = T.neighbors(v.position.x, v.position.z, 14, T.nbBuf2);
    for (let i = 0; i < nb.length; i++) {
      const o = nb[i]; if (o === v) continue;
      const dx = o.position.x - v.position.x, dz = o.position.z - v.position.z;
      const along = dx * f.x + dz * f.z, lat = Math.abs(dx * f.z - dz * f.x);
      const ol = o.spec ? o.spec.length / 2 : 2.3;
      if (along < 0 && along > -(d.rR + ol + 3.5) && lat < 2.4) return false;
    }
    return true;
  }
  function tryPass(d) {
    const l0 = d.legs[0], e = l0.edge, o = d.obsVeh;
    if (d.distToLegEnd() < 30) return;
    if (e.lanes > 1 && lanChange(d, l0.lane > 0 ? l0.lane - 1 : l0.lane + 1)) return;
    if (!laneClearForPass(d, o)) return;
    const need = (o.spec ? o.spec.width / 2 : 0.8) + d.hw + 0.45;
    d.pass = { veh: o, t0: T.time };
    d.shiftTarget = -Math.min(5.2, Math.max(1.4, need));
  }
  function passUpdate() {
    for (const d of T.drivers) {
      if (!d.pass) { if (!d.pull && d.shiftTarget !== 0) d.shiftTarget = 0; continue; }
      const o = d.pass.veh, v = d.veh, f = v.forward;
      const along = (o.position.x - v.position.x) * f.x + (o.position.z - v.position.z) * f.z;
      if (o._removed || along < -(o.spec ? o.spec.length : 4) - 1.5 || T.time - d.pass.t0 > 14) { d.pass = null; d.shiftTarget = 0; }
    }
  }
  function lanChange(d, toLane) {
    const l0 = d.legs[0]; if (l0.kind !== 'lane') return false;
    const e = l0.edge, dir = l0.dir;
    if (toLane < 0 || toLane >= e.lanes || toLane === l0.lane) return false;
    if (d.distToLegEnd() < 42 || Math.abs(d.shift) > 0.05) return false;
    const mv = d.mv; if (!mv) return false;
    const ci = Math.min(toLane, mv.conns.length - 1);
    if (!mv.legal.includes(ci)) return false;
    const conn = mv.conns[ci];
    // target lane clear?
    const tp = net.lanePiece(e, dir, toLane), v = d.veh, rp = d._rp;
    const nb = T.neighbors(v.position.x, v.position.z, 38, T.nbBuf2);
    const mine = projectOn(tp, rp.x, rp.z, -1, {});
    const myS = mine.s, spd = Math.abs(v.speed);
    for (const o of nb) {
      if (o === v) continue;
      const pj = projectOn(tp, o.position.x, o.position.z, -1, {});
      if (Math.abs(pj.lat) > 2.6) continue;
      const rel = pj.s - myS;
      const vo = o.speed;
      if (rel > -(10 + Math.max(0, vo - spd) * 2.2 + d.rR) && rel < 14 + spd * 1.1 + Math.max(0, spd - vo) * 1.5) return false;
    }
    const sNow = l0.s0 + (l0.s1 - l0.s0) * (d.s / l0.len);
    const changeLen = Math.max(20, Math.min(d.distToLegEnd() - 14, 22 + spd * 1.4));
    if (changeLen < 16) return false;
    const np = net.buildLane(e, dir, l0.lane, toLane, sNow, l0.s1, changeLen);
    if (d.jn.state === 'wait' || d.jn.state === 'granted') T.arb.cancel(d);
    d.legs = [np, conn.piece, net.lanePiece(conn.outEdge, conn.outDir, conn.outLane)];
    d.s = 0; d.hint = 0; d.mv = mv;
    d.lcCD = 8; d.jn.conn = null; d.jn.state = 'none';
    return true;
  }
  T.lanChange = lanChange;
  function discretionary(dt) {
    for (const d of T.drivers) {
      d.lcCD -= dt;
      if (d.lcCD > 0) continue;
      d.lcCD = 2 + rng() * 2;
      const l0 = d.legs[0];
      if (l0.kind !== 'lane' || l0.edge.lanes < 2 || d.pull || d.pass || d.reverseT > 0) continue;
      if (d.gapObs < 26 && d.obsVeh && d.obsKind === 1 && d.vObs < Math.min(d.vProfile, 20) * 0.7 && Math.abs(d.veh.speed) > 1) {
        lanChange(d, l0.lane + (l0.lane < l0.edge.lanes - 1 ? 1 : -1));
      } else if (rng() < 0.04) lanChange(d, l0.lane + (rng() < 0.5 ? 1 : -1));
    }
  }
  function recover(d) {
    // re-snap onto the nearest lane going the right way
    const v = d.veh, nr = game.roads.nearest(v.position.x, v.position.z, 25);
    if (!nr || nr.dist > nr.edge.width / 2 + 3) return false;
    const e = nr.edge, f = v.forward;
    const dir = (f.x * nr.tx + f.z * nr.tz) >= 0 ? 1 : -1;
    let lane = 0, bestD = 1e9;
    for (let l = 0; l < e.lanes; l++) { const off = net.laneOff(e, dir, l), dd = Math.abs(nr.lateral - off); if (dd < bestD) { bestD = dd; lane = l; } }
    const p = net.lanePiece(e, dir, lane);
    if (p.len < 12) return false;
    const rp = d.rearPoint(d._rp || (d._rp = {}));
    const pj = projectOn(p, rp.x, rp.z, -1, {});
    if (pj.s > p.len - 15 || pj.dist > 7) return false;
    T.arb.cancel(d, true);
    d.legs = [p]; d.s = pj.s; d.hint = pj.i; d.mv = null; d.jn.state = 'none'; d.jn.conn = null; d.exitConn = null;
    d.pickMove(); d.ensureLegs(); d.shift = 0; d.shiftTarget = 0; d.pass = null; d.offT = 0;
    return true;
  }

  const _sa = {}, _sb = {};
  const info = (d) => { const l = d.legs[0]; return `${d.veh.type} v${d.veh.speed.toFixed(1)} ${l.kind}:${l.kind === 'lane' ? l.edge.name + '/' + l.dir + '/' + l.lane : (l.node && l.node.id) + '/' + l.type + ' ' + (l.conn ? l.conn.inEdge.name.slice(0, 8) + '>' + l.conn.outEdge.name.slice(0, 8) + ' L' + l.conn.inLane + '>' + l.conn.outLane : '')} s${d.s.toFixed(0)}/${l.len.toFixed(0)} jn:${d.jn.state} lat${d.lat.toFixed(1)} why:${d.waitReason} gap${d.gapObs.toFixed(1)} a${d.aCmd.toFixed(1)} thr${d.thr.toFixed(2)} hold${d.hold ? 1 : 0} dS${(d.dStop || 0).toFixed(1)} sd${d.stopDist.toFixed(1)} obs${d.obsVeh ? (d.obsVeh.type || 'ped') + (d.obsVeh.ai && d.obsVeh.ai.id) : '-'} blk${d.blockedT.toFixed(1)} rev${d.reverseT.toFixed(1)} id${d.id}`; };
  // ---------------------------------------------------------------- AI-AI overlap metric (rising edges, ~8 Hz)
  function overlapCheck() {
    const now = new Set();
    const ds = T.drivers;
    for (let i = 0; i < ds.length; i++) {
      const A = ds[i].veh; const ba = A._tb;
      for (let j = i + 1; j < ds.length; j++) {
        const B = ds[j].veh;
        const dx = A.position.x - B.position.x, dz = A.position.z - B.position.z;
        if (dx * dx + dz * dz > 144) continue;
        const bb = B._tb;
        _sa.cx = ba.cx; _sa.cz = ba.cz; _sa.hw = ba.hw - 0.09; _sa.hd = ba.hd - 0.09; _sa.rot = ba.rot;
        _sb.cx = bb.cx; _sb.cz = bb.cz; _sb.hw = bb.hw - 0.09; _sb.hd = bb.hd - 0.09; _sb.rot = bb.rot;
        if (obbOverlap(_sa, _sb)) {
          const k = A.id < B.id ? A.id * 100000 + B.id : B.id * 100000 + A.id;
          now.add(k);
          if (!T.overlapPairs.has(k)) {
            T.hitLog.push(T.time); T.stats.aiHits++;
            if (T.debugHits) { T.hitInfo = T.hitInfo || []; T.hitInfo.push({ t: +T.time.toFixed(1), x: +A.position.x.toFixed(1), z: +A.position.z.toFixed(1), A: info(ds[i]), B: info(ds[j]) }); }
          }
        }
      }
    }
    T.overlapPairs = now;
    while (T.hitLog.length && T.hitLog[0] < T.time - 60) T.hitLog.shift();
  }

  // ---------------------------------------------------------------- population control
  function population(seed) {
    for (let i = T.drivers.length - 1; i >= 0; i--) {
      const d = T.drivers[i], v = d.veh;
      if (d.done) { removeDriver(d, true, 'exit'); continue; }
      const dist = distFocus(v.position.x, v.position.z);
      if (dist > RING_HARD || (dist > RING_MAX && !visible(v.position.x, v.position.z, 8))) removeDriver(d);
    }
    const target = TARGET_MOVING + (T.foci.length > 1 ? 10 : 0);
    let tries = seed ? 160 : 24, made = 0;
    while (T.drivers.length < target && tries-- > 0 && made < (seed ? 4 : 2)) {
      if (trySpawnMoving(seed ? 30 : SPAWN_MIN, seed ? RING_MAX - 20 : SPAWN_MAX, !seed)) made++;
    }
  }

  // ---------------------------------------------------------------- main update
  let focusJump = false;
  function update(dt) {
    const t0 = performance.now();
    T.time += dt; T.tick++;
    updateFoci();
    updateFrustum();
    rebuildGrid();
    const f0 = T.foci[0];
    if (T.lastFocus && Math.hypot(f0.x - T.lastFocus.x, f0.z - T.lastFocus.z) > 120) focusJump = true;
    T.lastFocus = { x: f0.x, z: f0.z };
    // (re)seeding is spread over a few ticks: creating ~65 car meshes in one step would be a visible hitch
    if (!T.seeded) { T.seeded = true; T.seedTicks = 24; rebuildGrid(); }
    else if (focusJump) { focusJump = false; T.seedTicks = 24; rebuildGrid(); }
    if (T.seedTicks > 0) { T.seedTicks--; parkedUpdate(true); population(true); }
    const ds = T.drivers;
    for (let i = 0; i < ds.length; i++) { const d = ds[i]; if (!d.dead) d.update(dt); }
    if ((T.tick & 3) === 0) T.arb.update(dt * 4);
    T.signals.update(dt);
    if ((T.tick & 7) === 0) passUpdate();
    hornUpdate(dt);
    discretionary(dt);
    if (T.tick % 15 === 0) sirenUpdate();
    if (T.tick % 60 === 0) { watchdog(); abandonedUpdate(); }
    if (T.tick % 30 === 15) { population(false); parkedUpdate(false); }
    if (T.tick % 8 === 4) overlapCheck();
    const ms = performance.now() - t0;
    T.stats.perfMs += ms; T.stats.perfN++; if (ms > T.stats.perfMax) T.stats.perfMax = ms;
  }

  // ---------------------------------------------------------------- debug
  game.debug = game.debug || { extra: {} };
  game.debug.extra = game.debug.extra || {};
  game.debug.extra.traffic = () => {
    let sum = 0, n = 0, waiting = 0;
    for (const d of T.drivers) { sum += Math.abs(d.veh.speed); n++; if (Math.abs(d.veh.speed) < 0.5) waiting++; }
    return {
      active: T.drivers.length, parked: T.parked.length, stuck: T.stuck,
      avgSpeedKmh: n ? +(sum / n * 3.6).toFixed(1) : 0, collisionsLastMin: T.hitLog.length,
      aiHitsTotal: T.stats.aiHits, waiting, buses: busCount, abandoned: T.abandoned.length,
      msPerStep: +(T.stats.perfMs / Math.max(1, T.stats.perfN)).toFixed(3), msMax: +T.stats.perfMax.toFixed(2),
      grants: T.arb.grants, forced: T.stats.forced || 0, honks: T.stats.honks, recycled: T.stats.recycled, why: T.why,
    };
  };
  game.debug.traffic = {
    T, net, get sig() { return T.signals; },
    resetPerf() { T.stats.perfMs = 0; T.stats.perfN = 0; T.stats.perfMax = 0; },
    log(on = true) { T.debugHits = on; },
  };

  T.update = update;
  return T;
}
